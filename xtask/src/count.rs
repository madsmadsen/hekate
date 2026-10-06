//! Count words in frequency sources and read words from lexicon sources.
//!
//! Each file (or each Hunspell pair) is a unit. The result of a unit goes into the cache
//! `target/wordlist-sources/<sha>-<count version>-<options>.tsv` (PRD 7.3, step 4).
//! The `<sha>` is the SHA-256 of the source file. The `<options>` are a short hash of the
//! settings that change the result, so a changed setting never reads an old cache file.

use std::collections::{BTreeSet, HashMap};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde::Serialize;
use unicode_normalization::UnicodeNormalization;

use crate::bail;
use crate::config::{Archive, Column, FileRef, Format, Part, RowFilter, Source};
use crate::fetch::process_file;
use crate::util::{Context, Error, Result, sha256_file, sha256_hex};

/// Change this text when the counting code changes its results. It is part of the cache key.
pub const COUNT_VERSION: &str = "1";

/// The longest token (in bytes) that the counter keeps. Longer tokens are scanning errors.
const MAX_TOKEN_BYTES: usize = 48;

/// Counted words of a frequency source. Keys are lowercase NFC words.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Counts {
    /// Sum of all counts before `min_count` pruning. Used to turn counts into relative frequency.
    pub total: u64,
    pub words: HashMap<String, u64>,
}

impl Counts {
    pub fn add(&mut self, word: &str, n: u64) {
        self.total += n;
        *self.words.entry(word.to_string()).or_insert(0) += n;
    }

    pub fn merge(&mut self, other: Counts) {
        self.total += other.total;
        for (w, n) in other.words {
            *self.words.entry(w).or_insert(0) += n;
        }
    }

    fn prune(&mut self, min_count: u64) {
        if min_count > 1 {
            self.words.retain(|_, n| *n >= min_count);
        }
    }

    /// Cache text: a total line, then `word<TAB>count` lines, most common first.
    pub fn to_cache(&self) -> String {
        let mut rows: Vec<(&String, &u64)> = self.words.iter().collect();
        rows.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
        let mut out = format!("#total\t{}\n", self.total);
        for (w, n) in rows {
            out.push_str(w);
            out.push('\t');
            out.push_str(&n.to_string());
            out.push('\n');
        }
        out
    }

    pub fn from_cache(text: &str) -> Result<Self> {
        let mut lines = text.lines();
        let Some(first) = lines.next().and_then(|l| l.strip_prefix("#total\t")) else {
            bail!("cache file has no total line");
        };
        let total = first
            .parse()
            .map_err(|_| Error("bad total in cache".into()))?;
        let mut words = HashMap::new();
        for line in lines {
            let (w, n) = line
                .split_once('\t')
                .ok_or_else(|| Error("bad cache line".into()))?;
            words.insert(
                w.to_string(),
                n.parse().map_err(|_| Error("bad count in cache".into()))?,
            );
        }
        Ok(Counts { total, words })
    }
}

/// Settings that the loaders need.
pub struct Ctx {
    /// Folder of `config.toml`. Local `path` files are relative to it.
    pub base_dir: PathBuf,
    pub cache_dir: PathBuf,
    /// Trust the observed hashes and report them (`--update-hashes`).
    pub update_hashes: bool,
    pub jobs: usize,
}

/// A hash that the build observed and that differs from `config.toml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HashUpdate {
    pub file_index: usize,
    pub old: Option<String>,
    pub new: String,
}

#[derive(Serialize)]
struct CountParams<'a> {
    format: Format,
    archive: Archive,
    members: Vec<(&'a Option<String>, Option<Part>)>,
    year_min: Option<u32>,
    year_max: Option<u32>,
    min_count: Option<u64>,
    delimiter: &'a Option<String>,
    header: bool,
    word_column: &'a Option<Column>,
    count_column: &'a Option<Column>,
    text_column: &'a Option<Column>,
    filters: &'a [RowFilter],
    strip_xml: bool,
    regex: &'a Option<String>,
    strip_flags: bool,
    language_qid: &'a Option<String>,
    lang_code: &'a Option<String>,
    exclude_categories: &'a [String],
    role: &'static str,
}

fn params_digest(src: &Source) -> String {
    let p = CountParams {
        format: src.format,
        archive: src.archive,
        members: src.files.iter().map(|f| (&f.member, f.part)).collect(),
        year_min: src.year_min,
        year_max: src.year_max,
        min_count: src.min_count,
        delimiter: &src.delimiter,
        header: src.header,
        word_column: &src.word_column,
        count_column: &src.count_column,
        text_column: &src.text_column,
        filters: &src.filters,
        strip_xml: src.strip_xml,
        regex: &src.regex,
        strip_flags: src.strip_flags,
        language_qid: &src.language_qid,
        lang_code: &src.lang_code,
        exclude_categories: &src.exclude_categories,
        role: src.role.as_str(),
    };
    let json = serde_json::to_string(&p).expect("params serialize");
    sha256_hex(json.as_bytes())[..12].to_string()
}

/// The hash that is known before the download: from the config, or from a local file.
fn expected_sha(file: &FileRef, base: &Path) -> Result<Option<String>> {
    if let Some(h) = &file.sha256 {
        return Ok(Some(h.to_ascii_lowercase()));
    }
    let local = match (&file.url, &file.path) {
        (Some(u), _) => u.strip_prefix("file://").map(PathBuf::from),
        (None, Some(p)) => Some(base.join(p)),
        _ => None,
    };
    match local {
        Some(p) => Ok(Some(sha256_file(&p)?)),
        None => Ok(None),
    }
}

fn atomic_write(path: &Path, text: &str) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Run one unit with the cache. `files` are indexes into `src.files`.
/// `compute` streams the files and returns the result plus the observed hashes.
fn cached_unit<T: Send>(
    src: &Source,
    files: &[usize],
    ctx: &Ctx,
    to_cache: &dyn Fn(&T) -> String,
    from_cache: &dyn Fn(&str) -> Result<T>,
    compute: &dyn Fn() -> Result<(T, Vec<String>)>,
) -> Result<(T, Vec<HashUpdate>)> {
    let expected: Vec<Option<String>> = files
        .iter()
        .map(|&i| expected_sha(&src.files[i], &ctx.base_dir))
        .collect::<Result<_>>()?;
    let digest = params_digest(src);
    let cache_path = |shas: &[String]| {
        let key = if shas.len() == 1 {
            shas[0].clone()
        } else {
            sha256_hex(shas.join("-").as_bytes())
        };
        ctx.cache_dir
            .join(format!("{key}-{COUNT_VERSION}-{digest}.tsv"))
    };
    if !ctx.update_hashes && expected.iter().all(Option::is_some) {
        let shas: Vec<String> = expected.iter().map(|e| e.clone().unwrap()).collect();
        let path = cache_path(&shas);
        if let Ok(text) = std::fs::read_to_string(&path) {
            crate::log!("cache hit: {}", path.display());
            let value = from_cache(&text).context(|| format!("bad cache {}", path.display()))?;
            return Ok((value, Vec::new()));
        }
    }
    if !ctx.update_hashes
        && let Some(i) = expected.iter().position(Option::is_none)
    {
        bail!(
            "{}: {} has no sha256 in config.toml. Run `cargo xtask wordlists --update-hashes --lang <code>`, \
             review the new hash, and commit it",
            src.label(),
            src.files[files[i]].describe()
        );
    }
    let mut last_err = None;
    let mut result = None;
    for attempt in 1..=3 {
        match compute() {
            Ok(r) => {
                result = Some(r);
                break;
            }
            Err(e) => {
                crate::log!("attempt {attempt} failed: {e}");
                last_err = Some(e);
            }
        }
    }
    let Some((value, observed)) = result else {
        return Err(last_err.expect("an attempt failed"));
    };
    let mut updates = Vec::new();
    for (k, &i) in files.iter().enumerate() {
        let same = expected[k].as_deref() == Some(observed[k].as_str());
        if same {
            continue;
        }
        if ctx.update_hashes {
            updates.push(HashUpdate {
                file_index: i,
                old: src.files[i].sha256.clone(),
                new: observed[k].clone(),
            });
        } else {
            bail!(
                "{}: SHA-256 mismatch for {}\n  expected {}\n  got      {}\n\
                 The source file changed. Review the new file. Then run \
                 `cargo xtask wordlists --update-hashes --lang <code>` to record the new hash",
                src.label(),
                src.files[i].describe(),
                expected[k].as_deref().unwrap_or("-"),
                observed[k]
            );
        }
    }
    atomic_write(&cache_path(&observed), &to_cache(&value))?;
    Ok((value, updates))
}

/// A word token: only letters (and combining marks), lowercase, NFC. Return `None` otherwise.
fn fold_token(token: &str) -> Option<String> {
    if token.is_empty() || token.len() > MAX_TOKEN_BYTES {
        return None;
    }
    if token.is_ascii() {
        if !token.bytes().all(|b| b.is_ascii_alphabetic()) {
            return None;
        }
        return Some(token.to_ascii_lowercase());
    }
    if !token.chars().all(is_word_char) {
        return None;
    }
    Some(
        token
            .nfc()
            .collect::<String>()
            .to_lowercase()
            .nfc()
            .collect(),
    )
}

fn is_word_char(c: char) -> bool {
    c.is_alphabetic() || ('\u{300}'..='\u{36f}').contains(&c)
}

/// Split running text into word tokens and call `f(lowercase NFC word)` for each.
fn for_each_token(text: &str, f: &mut dyn FnMut(&str)) {
    let owned;
    let text = if text.is_ascii() {
        text
    } else {
        owned = text.nfc().collect::<String>();
        &owned
    };
    for token in text.split(|c: char| !is_word_char(c)) {
        if let Some(w) = fold_token(token) {
            f(&w);
        }
    }
}

fn strip_xml_tags(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut in_tag = false;
    for c in line.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

fn read_lines(reader: &mut dyn Read, f: &mut dyn FnMut(&str) -> Result<()>) -> Result<()> {
    let mut r = BufReader::with_capacity(256 * 1024, reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        if r.read_until(b'\n', &mut buf)? == 0 {
            return Ok(());
        }
        let line = String::from_utf8_lossy(&buf);
        f(line.trim_end_matches(['\n', '\r']))?;
    }
}

fn delimiter_of(src: &Source) -> u8 {
    src.delimiter
        .as_deref()
        .and_then(|d| d.chars().next())
        .map_or(b'\t', |c| c as u8)
}

fn resolve_column(col: &Column, headers: Option<&csv::StringRecord>) -> Result<usize> {
    match col {
        Column::Index(i) => Ok(*i),
        Column::Name(n) => {
            let Some(h) = headers else {
                bail!(
                    "column {n:?} is a name, but the source has no header row (set header = true)"
                );
            };
            h.iter()
                .position(|x| x == n)
                .ok_or_else(|| Error(format!("no column named {n:?} in the header row")))
        }
    }
}

fn filter_matches(f: &RowFilter, idx: usize, row: &csv::StringRecord) -> bool {
    let v = row.get(idx).unwrap_or("").trim();
    let cmp = |a: &str, b: &str| -> std::cmp::Ordering {
        match (a.parse::<f64>(), b.parse::<f64>()) {
            (Ok(x), Ok(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
            _ => a.cmp(b),
        }
    };
    if let Some(e) = &f.equals
        && v != e.trim()
    {
        return false;
    }
    if let Some(m) = &f.min
        && cmp(v, m.trim()).is_lt()
    {
        return false;
    }
    if let Some(m) = &f.max
        && cmp(v, m.trim()).is_gt()
    {
        return false;
    }
    true
}

/// Read a table. Call `f(row, columns)` for each row that passes the filters.
fn for_each_row(
    src: &Source,
    reader: &mut dyn Read,
    wanted: &[&Column],
    f: &mut dyn FnMut(&csv::StringRecord, &[usize]) -> Result<()>,
) -> Result<()> {
    let delim = delimiter_of(src);
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(src.header)
        .flexible(true)
        .quoting(delim != b'\t')
        .from_reader(reader);
    let headers = if src.header {
        Some(rdr.headers()?.clone())
    } else {
        None
    };
    let cols: Vec<usize> = wanted
        .iter()
        .map(|c| resolve_column(c, headers.as_ref()))
        .collect::<Result<_>>()?;
    let filters: Vec<(usize, &RowFilter)> = src
        .filters
        .iter()
        .map(|flt| Ok((resolve_column(&flt.column, headers.as_ref())?, flt)))
        .collect::<Result<_>>()?;
    for row in rdr.records() {
        let row = row?;
        if filters.iter().all(|(i, flt)| filter_matches(flt, *i, &row)) {
            f(&row, &cols)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------- frequency

fn count_ngram(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    let year_min = src.year_min.unwrap_or(0);
    let year_max = src.year_max.unwrap_or(u32::MAX);
    let mut r = BufReader::with_capacity(1 << 20, reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        if r.read_until(b'\n', &mut buf)? == 0 {
            return Ok(());
        }
        let mut fields = buf.split(|&b| b == b'\t');
        let Some(token) = fields.next() else { continue };
        // A token with `_` carries a part-of-speech tag. The plain token already has the total.
        if token.contains(&b'_') || token.is_empty() || token.len() > MAX_TOKEN_BYTES {
            continue;
        }
        let Ok(token) = std::str::from_utf8(token) else {
            continue;
        };
        let mut sum = 0u64;
        for field in fields {
            let field = field.strip_suffix(b"\n").unwrap_or(field);
            let mut parts = field.split(|&b| b == b',');
            let (Some(y), Some(m)) = (parts.next(), parts.next()) else {
                continue;
            };
            let (Some(year), Some(matches)) = (parse_u64(y), parse_u64(m)) else {
                continue;
            };
            if year >= u64::from(year_min) && year <= u64::from(year_max) {
                sum += matches;
            }
        }
        if sum > 0
            && let Some(w) = fold_token(token)
        {
            counts.add(&w, sum);
        }
    }
}

fn parse_u64(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() {
        return None;
    }
    let mut n = 0u64;
    for &b in bytes {
        if !b.is_ascii_digit() {
            return None;
        }
        n = n.checked_mul(10)?.checked_add(u64::from(b - b'0'))?;
    }
    Some(n)
}

fn count_freq_table(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    let word_col = src.word_column.as_ref().expect("validated");
    let mut wanted = vec![word_col];
    if let Some(c) = &src.count_column {
        wanted.push(c);
    }
    for_each_row(src, reader, &wanted, &mut |row, cols| {
        let Some(word) = row.get(cols[0]).and_then(|w| fold_token(w.trim())) else {
            return Ok(());
        };
        let n = match cols.get(1) {
            Some(&c) => row
                .get(c)
                .and_then(|v| v.trim().parse::<f64>().ok())
                .map_or(0, |v| v as u64),
            None => 1,
        };
        if n > 0 {
            counts.add(&word, n);
        }
        Ok(())
    })
}

fn count_ranked(reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    // The first word gets the biggest count. The step between ranks is 1.
    let base: u64 = 1 << 40;
    let mut rank = 0u64;
    read_lines(reader, &mut |line| {
        let word = line.split_whitespace().next().unwrap_or("");
        if let Some(w) = fold_token(word) {
            rank += 1;
            counts.add(&w, base.saturating_sub(rank).max(1));
        }
        Ok(())
    })
}

fn count_text(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    read_lines(reader, &mut |line| {
        if src.strip_xml {
            for_each_token(&strip_xml_tags(line), &mut |w| counts.add(w, 1));
        } else {
            for_each_token(line, &mut |w| counts.add(w, 1));
        }
        Ok(())
    })
}

fn count_csv_text(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    let col = src.text_column.as_ref().expect("validated");
    for_each_row(src, reader, &[col], &mut |row, cols| {
        if let Some(text) = row.get(cols[0]) {
            for_each_token(text, &mut |w| counts.add(w, 1));
        }
        Ok(())
    })
}

fn count_regex(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    let re = regex::Regex::new(src.regex.as_deref().expect("validated"))
        .context(|| "bad regex".to_string())?;
    read_lines(reader, &mut |line| {
        for cap in re.captures_iter(line) {
            if let Some(w) = cap.get(1).and_then(|m| fold_token(m.as_str())) {
                counts.add(&w, 1);
            }
        }
        Ok(())
    })
}

fn count_stream(src: &Source, reader: &mut dyn Read, counts: &mut Counts) -> Result<()> {
    match src.format {
        Format::Ngram1gramTsv => count_ngram(src, reader, counts),
        Format::FreqTable => count_freq_table(src, reader, counts),
        Format::RankedList => count_ranked(reader, counts),
        Format::Text => count_text(src, reader, counts),
        Format::CsvText => count_csv_text(src, reader, counts),
        Format::LineRegex => count_regex(src, reader, counts),
        other => bail!("format {other:?} is not a frequency format"),
    }
}

/// Count one file of a frequency source.
fn count_file(src: &Source, idx: usize, ctx: &Ctx) -> Result<(Counts, Vec<HashUpdate>)> {
    let file = &src.files[idx];
    cached_unit(
        src,
        &[idx],
        ctx,
        &|c: &Counts| c.to_cache(),
        &Counts::from_cache,
        &|| {
            crate::log!("counting {} ...", file.describe());
            let mut counts = Counts::default();
            let sha = process_file(file, src.archive, &ctx.base_dir, &mut |_, r| {
                count_stream(src, r, &mut counts)
            })?;
            if let Some(m) = src.min_count {
                counts.prune(m);
            }
            Ok((counts, vec![sha]))
        },
    )
}

type FileResult = Result<(Counts, Vec<HashUpdate>)>;

/// Count all files of a frequency source and add the counts.
pub fn load_frequency(src: &Source, ctx: &Ctx) -> Result<(Counts, Vec<HashUpdate>)> {
    let n = src.files.len();
    let results: Vec<Mutex<Option<FileResult>>> = (0..n).map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    let workers = ctx.jobs.clamp(1, n.max(1));
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= n {
                        break;
                    }
                    let r = count_file(src, i, ctx);
                    *results[i].lock().expect("no panic while locked") = Some(r);
                }
            });
        }
    });
    let mut total = Counts::default();
    let mut updates = Vec::new();
    for slot in results {
        let (counts, u) = slot
            .into_inner()
            .expect("no panic while locked")
            .expect("every file was processed")?;
        total.merge(counts);
        updates.extend(u);
    }
    Ok((total, updates))
}

// ------------------------------------------------------------------ lexicon

fn lexicon_from_stream(
    src: &Source,
    reader: &mut dyn Read,
    out: &mut BTreeSet<String>,
) -> Result<()> {
    let mut add = |w: &str| {
        let w: String = w.nfc().collect();
        if !w.is_empty() {
            out.insert(w);
        }
    };
    match src.format {
        Format::Wordlist => read_lines(reader, &mut |line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return Ok(());
            }
            let mut word = line.split_whitespace().next().unwrap_or("");
            if src.strip_flags
                && let Some((w, _)) = word.split_once('/')
            {
                word = w;
            }
            add(word);
            Ok(())
        }),
        Format::TableWords => {
            let col = src.word_column.as_ref().expect("validated");
            for_each_row(src, reader, &[col], &mut |row, cols| {
                if let Some(w) = row.get(cols[0]) {
                    add(w.trim());
                }
                Ok(())
            })
        }
        Format::LineRegex => {
            let re = regex::Regex::new(src.regex.as_deref().expect("validated"))
                .context(|| "bad regex".to_string())?;
            read_lines(reader, &mut |line| {
                for cap in re.captures_iter(line) {
                    if let Some(m) = cap.get(1) {
                        add(m.as_str());
                    }
                }
                Ok(())
            })
        }
        Format::WikidataLexemes => {
            let qid = src.language_qid.as_deref().expect("validated");
            let lang = src.lang_code.as_deref().expect("validated");
            let needle = format!("\"language\":\"{qid}\"");
            read_lines(reader, &mut |line| {
                if !line.contains(&needle) {
                    return Ok(());
                }
                let line = line.trim_end_matches(',');
                let v: serde_json::Value = serde_json::from_str(line)?;
                if v["language"] != qid {
                    return Ok(());
                }
                if let Some(cat) = v["lexicalCategory"].as_str()
                    && src.exclude_categories.iter().any(|c| c == cat)
                {
                    return Ok(());
                }
                if let Some(w) = v["lemmas"][lang]["value"].as_str() {
                    add(w);
                }
                if let Some(forms) = v["forms"].as_array() {
                    for form in forms {
                        if let Some(w) = form["representations"][lang]["value"].as_str() {
                            add(w);
                        }
                    }
                }
                Ok(())
            })
        }
        other => bail!("format {other:?} is not a lexicon format"),
    }
}

fn read_all_bytes(src: &Source, idx: usize, ctx: &Ctx) -> Result<(Vec<u8>, String)> {
    let mut bytes = Vec::new();
    let sha = process_file(&src.files[idx], src.archive, &ctx.base_dir, &mut |_, r| {
        r.read_to_end(&mut bytes)?;
        Ok(())
    })?;
    Ok((bytes, sha))
}

/// Read a lexicon source. Return the sorted NFC words.
pub fn load_lexicon(src: &Source, ctx: &Ctx) -> Result<(Vec<String>, Vec<HashUpdate>)> {
    let to_cache = |words: &Vec<String>| {
        let mut s = words.join("\n");
        s.push('\n');
        s
    };
    let from_cache =
        |text: &str| -> Result<Vec<String>> { Ok(text.lines().map(str::to_string).collect()) };
    if src.format == Format::Hunspell {
        let dic = src
            .files
            .iter()
            .position(|f| f.part == Some(Part::Dic))
            .expect("validated");
        let aff = src
            .files
            .iter()
            .position(|f| f.part == Some(Part::Aff))
            .expect("validated");
        return cached_unit(src, &[dic, aff], ctx, &to_cache, &from_cache, &|| {
            crate::log!("expanding Hunspell {} ...", src.label());
            let (dic_bytes, dic_sha) = read_all_bytes(src, dic, ctx)?;
            let (aff_bytes, aff_sha) = read_all_bytes(src, aff, ctx)?;
            let words = crate::hunspell::expand(&dic_bytes, &aff_bytes)?
                .into_iter()
                .map(|w| w.nfc().collect::<String>())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect();
            Ok((words, vec![dic_sha, aff_sha]))
        });
    }
    let mut all: BTreeSet<String> = BTreeSet::new();
    let mut updates = Vec::new();
    for idx in 0..src.files.len() {
        let file = &src.files[idx];
        let (words, u) = cached_unit(src, &[idx], ctx, &to_cache, &from_cache, &|| {
            crate::log!("reading {} ...", file.describe());
            let mut set = BTreeSet::new();
            let sha = process_file(file, src.archive, &ctx.base_dir, &mut |_, r| {
                lexicon_from_stream(src, r, &mut set)
            })?;
            Ok((set.into_iter().collect::<Vec<_>>(), vec![sha]))
        })?;
        all.extend(words);
        updates.extend(u);
    }
    Ok((all.into_iter().collect(), updates))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Format, Role};

    pub(super) fn src_for_cache(format: Format, role: Role) -> Source {
        src(format, role)
    }

    fn src(format: Format, role: Role) -> Source {
        Source {
            name: "t".into(),
            role,
            format,
            version: "1".into(),
            license: "CC0".into(),
            license_url: "u".into(),
            url: "u".into(),
            credit: "c".into(),
            license_text: None,
            weight: 1,
            archive: Archive::None,
            files: vec![],
            year_min: None,
            year_max: None,
            min_count: None,
            delimiter: None,
            header: false,
            word_column: None,
            count_column: None,
            text_column: None,
            filters: vec![],
            strip_xml: false,
            regex: None,
            strip_flags: false,
            language_qid: None,
            lang_code: None,
            exclude_categories: vec![],
        }
    }

    #[test]
    fn ngram_counts_years_in_range_and_skips_tagged_tokens() {
        let mut s = src(Format::Ngram1gramTsv, Role::Frequency);
        s.year_min = Some(1950);
        s.year_max = Some(2019);
        let data = "The\t1949,100,5\t1950,10,2\t2019,5,1\t2020,99,9\n\
                    the\t1960,7,1\n\
                    the_DET\t1960,1000,1\n\
                    x1\t1960,5,1\n\
                    colour\t1900,5,1\n";
        let mut c = Counts::default();
        count_ngram(&s, &mut data.as_bytes(), &mut c).unwrap();
        assert_eq!(c.words.get("the"), Some(&22));
        assert!(!c.words.contains_key("x1"));
        assert!(
            !c.words.contains_key("colour"),
            "all years are out of range"
        );
        assert_eq!(c.total, 22);
    }

    #[test]
    fn min_count_prunes_but_keeps_the_total() {
        let mut c = Counts::default();
        c.add("big", 100);
        c.add("tiny", 2);
        c.prune(10);
        assert_eq!(c.total, 102);
        assert_eq!(c.words.len(), 1);
    }

    #[test]
    fn cache_text_round_trips_and_is_sorted() {
        let mut c = Counts::default();
        c.add("beta", 5);
        c.add("alpha", 5);
        c.add("gamma", 9);
        let text = c.to_cache();
        assert_eq!(text, "#total\t19\ngamma\t9\nalpha\t5\nbeta\t5\n");
        assert_eq!(Counts::from_cache(&text).unwrap(), c);
    }

    #[test]
    fn text_tokens_are_lowercase_nfc_words() {
        let mut c = Counts::default();
        for_each_token("Café, café! l'été 42 e\u{301}te\u{301}", &mut |w| {
            c.add(w, 1)
        });
        assert_eq!(c.words.get("café"), Some(&2));
        assert_eq!(c.words.get("été"), Some(&2), "NFD input is joined");
        assert!(!c.words.contains_key("42"));
    }

    #[test]
    fn freq_table_reads_columns_by_name_with_filters() {
        let mut s = src(Format::FreqTable, Role::Frequency);
        s.header = true;
        s.word_column = Some(Column::Name("word".into()));
        s.count_column = Some(Column::Name("n".into()));
        s.filters = vec![RowFilter {
            column: Column::Name("year".into()),
            equals: None,
            min: Some("2009".into()),
            max: None,
        }];
        let data = "word\tn\tyear\nhello\t5\t2010\nold\t9\t1999\nhello\t3\t2020\n";
        let mut c = Counts::default();
        count_freq_table(&s, &mut data.as_bytes(), &mut c).unwrap();
        assert_eq!(c.words.get("hello"), Some(&8));
        assert!(!c.words.contains_key("old"));
    }

    #[test]
    fn ranked_list_gives_bigger_counts_to_earlier_words() {
        let mut c = Counts::default();
        count_ranked(&mut "first\nsecond\n".as_bytes(), &mut c).unwrap();
        assert!(c.words["first"] > c.words["second"]);
    }

    #[test]
    fn wordlist_strips_flags_and_comments() {
        let mut s = src(Format::Wordlist, Role::Lexicon);
        s.strip_flags = true;
        let mut set = BTreeSet::new();
        lexicon_from_stream(&s, &mut "# c\nhello/SM\nworld\n".as_bytes(), &mut set).unwrap();
        assert_eq!(set.into_iter().collect::<Vec<_>>(), ["hello", "world"]);
    }

    #[test]
    fn wikidata_lexemes_reads_lemmas_and_forms_of_one_language() {
        let mut s = src(Format::WikidataLexemes, Role::Lexicon);
        s.language_qid = Some("Q188".into());
        s.lang_code = Some("de".into());
        s.exclude_categories = vec!["Q147276".into()];
        let data = "[\n\
            {\"language\":\"Q188\",\"lexicalCategory\":\"Q1084\",\"lemmas\":{\"de\":{\"language\":\"de\",\"value\":\"Haus\"}},\"forms\":[{\"representations\":{\"de\":{\"language\":\"de\",\"value\":\"Häuser\"}}}]},\n\
            {\"language\":\"Q188\",\"lexicalCategory\":\"Q147276\",\"lemmas\":{\"de\":{\"value\":\"Anna\"}},\"forms\":[]},\n\
            {\"language\":\"Q1860\",\"lemmas\":{\"en\":{\"value\":\"house\"}},\"forms\":[]}\n]\n";
        let mut set = BTreeSet::new();
        lexicon_from_stream(&s, &mut data.as_bytes(), &mut set).unwrap();
        assert_eq!(set.into_iter().collect::<Vec<_>>(), ["Haus", "Häuser"]);
    }

    #[test]
    fn line_regex_picks_group_one() {
        let mut s = src(Format::LineRegex, Role::Lexicon);
        s.regex = Some(r#"writtenForm" val="([^"]+)""#.into());
        let mut set = BTreeSet::new();
        let data = "<feat att=\"writtenForm\" val=\"hund\"/>\n<feat att=\"x\" val=\"no\"/>\n";
        lexicon_from_stream(&s, &mut data.as_bytes(), &mut set).unwrap();
        assert_eq!(set.into_iter().collect::<Vec<_>>(), ["hund"]);
    }

    #[test]
    fn xml_tags_are_removed() {
        assert_eq!(
            strip_xml_tags("<w>he</w> said <b/>yes")
                .split_whitespace()
                .collect::<Vec<_>>(),
            ["he", "said", "yes"]
        );
    }
}

#[cfg(test)]
mod cache_tests {
    use super::*;
    use crate::config::{FileRef, Format, Role};
    fn setup(name: &str, sha: Option<&str>, url: bool) -> (Source, Ctx) {
        let dir = std::env::temp_dir().join(format!("hekate-count-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("words.txt"), "alpha\nbeta\n").unwrap();
        let mut s = tests_src();
        s.files = vec![FileRef {
            url: url.then(|| "https://example.invalid/words.txt".to_string()),
            path: (!url).then(|| "words.txt".to_string()),
            sha256: sha.map(String::from),
            member: None,
            part: None,
        }];
        let ctx = Ctx {
            base_dir: dir.clone(),
            cache_dir: dir.join("cache"),
            update_hashes: false,
            jobs: 1,
        };
        (s, ctx)
    }

    fn tests_src() -> Source {
        let mut s = super::tests::src_for_cache(Format::Wordlist, Role::Lexicon);
        s.name = "cache test".into();
        s
    }

    #[test]
    fn nfr_9_wrong_hash_stops_the_build_and_writes_no_cache() {
        let (s, ctx) = setup("wrong", Some(&"0".repeat(64)), false);
        let err = load_lexicon(&s, &ctx).unwrap_err();
        assert!(err.0.contains("SHA-256 mismatch"), "{err}");
        assert!(!ctx.cache_dir.exists() || std::fs::read_dir(&ctx.cache_dir).unwrap().count() == 0);
    }

    #[test]
    fn nfr_9_link_without_hash_is_refused() {
        let (s, ctx) = setup("nohash", None, true);
        let err = load_lexicon(&s, &ctx).unwrap_err();
        assert!(err.0.contains("no sha256"), "{err}");
    }

    #[test]
    fn nfr_10_result_comes_from_the_cache_the_second_time() {
        let (s, ctx) = setup("cache", None, false);
        let (words, _) = load_lexicon(&s, &ctx).unwrap();
        assert_eq!(words, ["alpha", "beta"]);
        // Remove the source file. The cache must answer.
        std::fs::remove_file(ctx.base_dir.join("words.txt")).unwrap();
        // The local file hash cannot be computed now, so give it from the cache key instead.
        let sha = crate::util::sha256_hex(b"alpha\nbeta\n");
        let mut s2 = s.clone();
        s2.files[0].sha256 = Some(sha);
        let (again, updates) = load_lexicon(&s2, &ctx).unwrap();
        assert_eq!(again, words);
        assert!(updates.is_empty());
    }

    #[test]
    fn nfr_9_update_mode_reports_a_new_hash() {
        let (s, mut ctx) = setup("update", Some(&"0".repeat(64)), false);
        ctx.update_hashes = true;
        let (_, updates) = load_lexicon(&s, &ctx).unwrap();
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].new, crate::util::sha256_hex(b"alpha\nbeta\n"));
        assert_eq!(updates[0].old.as_deref(), Some("0".repeat(64).as_str()));
    }

    #[test]
    fn nfr_10_changed_settings_use_another_cache_file() {
        let (mut s, _) = setup("digest", None, false);
        let a = params_digest(&s);
        s.strip_flags = true;
        assert_ne!(a, params_digest(&s));
    }
}
