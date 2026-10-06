//! The `wordlists/<lang>/config.toml` schema (PRD section 7.3, step 1).
//!
//! See `wordlists/README.md` for an annotated example.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::bail;
use crate::util::{Context, Result};

/// Hard lower limit of the list size (PRD 7.1 rule 2). Only fixtures may lower it.
pub const MIN_WORDS: usize = 4096;
/// Shortest word and longest word the PRD allows (PRD 7.1 rule 3).
pub const MIN_LEN_LIMIT: usize = 3;
pub const MAX_LEN_LIMIT: usize = 9;

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Language code, for example `en-US`. Must match the folder name.
    pub code: String,
    /// Name of the language in that language, for example `Svenska`.
    pub name: String,
    /// Date (YYYY-MM-DD) when a person last reviewed and rebuilt this list.
    /// It goes into the manifest. It is not a clock, so the build stays reproducible.
    pub built_on: String,
    /// Skip the top `s` ranks.
    pub s: usize,
    /// Do not take words past rank `r`.
    pub r: usize,
    /// Target size of the list.
    pub n: usize,
    #[serde(default = "default_min_len")]
    pub min_len: usize,
    #[serde(default = "default_max_len")]
    pub max_len: usize,
    /// Allowed characters, as a small character class body, for example `a-zäöü`.
    /// A `-` between two characters is a range. Write `\-` for a plain hyphen.
    pub alphabet: String,
    /// `exact`: the lexicon must hold the lowercase word itself.
    /// `fold`: the lexicon is lowercased first (use for languages with capital nouns).
    #[serde(default)]
    pub lexicon_case: LexiconCase,
    /// Only for test fixtures. Real languages always need 4,096 words.
    #[serde(default)]
    pub min_words: Option<usize>,
    pub ascii: AsciiConfig,
    /// Source that credits `extra-words.txt`. Needed when that file exists.
    #[serde(default)]
    pub extra: Option<ExtraSource>,
    #[serde(default)]
    pub sources: Vec<Source>,
}

fn default_min_len() -> usize {
    MIN_LEN_LIMIT
}

fn default_max_len() -> usize {
    MAX_LEN_LIMIT
}

#[derive(Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LexiconCase {
    #[default]
    Exact,
    Fold,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(deny_unknown_fields)]
pub struct AsciiConfig {
    /// Replace letters with an accent by the letter without it (`é` to `e`).
    #[serde(default)]
    pub strip_accents: bool,
    /// Explicit replacements, applied before `strip_accents`. Example: `"ä" = "ae"`.
    #[serde(default)]
    pub map: BTreeMap<String, String>,
}

/// Credit data for `extra-words.txt`.
#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct ExtraSource {
    pub name: String,
    pub version: String,
    pub license: String,
    pub license_url: String,
    pub url: String,
    pub credit: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    Frequency,
    Lexicon,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Frequency => "frequency",
            Role::Lexicon => "lexicon",
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Format {
    // Frequency formats. They count how often each word occurs.
    /// Google Books Ngram v3 1-gram files.
    #[serde(rename = "ngram-1gram-tsv")]
    Ngram1gramTsv,
    /// A table with a word column and an optional count column (TSV or CSV).
    FreqTable,
    /// One word per line, most common word first.
    RankedList,
    /// Running text. Every word occurrence counts once.
    Text,
    /// A CSV file with a text column. Every word occurrence counts once.
    CsvText,
    /// Lines of text. A regular expression picks the words. Each match counts once.
    LineRegex,
    // Lexicon formats. They list correctly spelled words.
    /// One word per line.
    Wordlist,
    /// Hunspell `.dic` and `.aff` pair. The build expands the affixes.
    Hunspell,
    /// Wikidata Lexemes JSON dump (one JSON object per line).
    WikidataLexemes,
    /// A table with a word column (TSV or CSV).
    TableWords,
}

impl Format {
    pub fn role(self) -> Role {
        match self {
            Format::Ngram1gramTsv
            | Format::FreqTable
            | Format::RankedList
            | Format::Text
            | Format::CsvText => Role::Frequency,
            Format::Wordlist | Format::Hunspell | Format::WikidataLexemes | Format::TableWords => {
                Role::Lexicon
            }
            // `line-regex` works for both roles; the role of the source decides.
            Format::LineRegex => Role::Frequency,
        }
    }

    pub fn allowed_for(self, role: Role) -> bool {
        self == Format::LineRegex || self.role() == role
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Archive {
    /// The download is the data file itself (it may be gzip or bzip2 compressed).
    #[default]
    None,
    /// A zip file. The build reads it into memory.
    Zip,
    /// A tar file (it may be gzip or bzip2 compressed).
    Tar,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Part {
    Dic,
    Aff,
}

/// A column of a table: a number (first column is 0) or a header name.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(untagged)]
pub enum Column {
    Index(usize),
    Name(String),
}

/// Keep only rows that match. Use `equals`, `not_equals`, `min` or `max`. Numbers compare as numbers.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RowFilter {
    pub column: Column,
    #[serde(default)]
    pub equals: Option<String>,
    /// Drop rows whose value is this text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub not_equals: Option<String>,
    #[serde(default)]
    pub min: Option<String>,
    #[serde(default)]
    pub max: Option<String>,
}

/// One downloaded file of a source.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct FileRef {
    /// Download link. `file:///abs/path` also works.
    #[serde(default)]
    pub url: Option<String>,
    /// A local file, relative to the folder of `config.toml`. Used by fixtures.
    #[serde(default)]
    pub path: Option<String>,
    /// SHA-256 of the file as downloaded (before decompression). Required for links.
    /// Run `cargo xtask wordlists --update-hashes` to fill it in, then review it.
    #[serde(default)]
    pub sha256: Option<String>,
    /// For `archive = "zip"` or `"tar"`: a member matches when its path ends with this text.
    #[serde(default)]
    pub member: Option<String>,
    /// For `format = "hunspell"`: whether this file is the `.dic` or the `.aff` file.
    #[serde(default)]
    pub part: Option<Part>,
}

impl FileRef {
    pub fn describe(&self) -> String {
        match (&self.url, &self.path) {
            (Some(u), _) => u.clone(),
            (None, Some(p)) => format!("path:{p}"),
            _ => "(no location)".into(),
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub name: String,
    pub role: Role,
    pub format: Format,
    /// Version, tag, commit or copy date of the source.
    pub version: String,
    pub license: String,
    pub license_url: String,
    /// Home page of the source (not the download link).
    pub url: String,
    /// The credit text the license requires.
    pub credit: String,
    /// Full license text or copyright notice to copy into the list `LICENSE` file.
    #[serde(default)]
    pub license_text: Option<String>,
    /// Weight of a frequency source when sources are merged. A whole number, default 1.
    #[serde(default = "default_weight")]
    pub weight: u64,
    #[serde(default)]
    pub archive: Archive,
    #[serde(default)]
    pub files: Vec<FileRef>,

    // ---- Format options. Each format reads only the options it needs. ----
    /// `ngram-1gram-tsv`: first year to count.
    #[serde(default)]
    pub year_min: Option<u32>,
    /// `ngram-1gram-tsv`: last year to count.
    #[serde(default)]
    pub year_max: Option<u32>,
    /// Frequency sources: drop words with a total count below this value while counting.
    /// This keeps memory small. Choose a value far below the count at rank `r`.
    #[serde(default)]
    pub min_count: Option<u64>,
    /// Tables: field separator, one character. Default is a tab.
    #[serde(default)]
    pub delimiter: Option<String>,
    /// Tables: the first row holds column names.
    #[serde(default)]
    pub header: bool,
    #[serde(default)]
    pub word_column: Option<Column>,
    #[serde(default)]
    pub count_column: Option<Column>,
    #[serde(default)]
    pub text_column: Option<Column>,
    #[serde(default)]
    pub filters: Vec<RowFilter>,
    /// `freq-table`: skip rows whose word starts with a capital letter (names, places, foreign words).
    #[serde(default)]
    pub skip_capitalized: bool,
    /// `text`: remove XML tags before counting.
    #[serde(default)]
    pub strip_xml: bool,
    /// `line-regex`: regular expression. Group 1 is the word.
    #[serde(default)]
    pub regex: Option<String>,
    /// `wordlist`: remove everything from `/` on (Hunspell style flags).
    #[serde(default)]
    pub strip_flags: bool,
    /// The file is ISO-8859-1 (Latin-1) text, not UTF-8. The build converts it while it reads.
    /// Not for `hunspell`: that format reads the `SET` line of the `.aff` file.
    #[serde(default)]
    pub latin1: bool,
    /// `freq-table`: fields are separated by runs of spaces or tabs, and leading spaces do not count.
    /// The columns must be numbers. No header row, no filters.
    #[serde(default)]
    pub whitespace: bool,
    /// `wikidata-lexemes`: item number of the language, for example `Q188`.
    #[serde(default)]
    pub language_qid: Option<String>,
    /// `wikidata-lexemes`: language code of the representations, for example `de`.
    #[serde(default)]
    pub lang_code: Option<String>,
    /// `wikidata-lexemes`: lexical categories to leave out (for example proper nouns).
    #[serde(default)]
    pub exclude_categories: Vec<String>,
}

fn default_weight() -> u64 {
    1
}

impl Config {
    pub fn load(dir: &Path) -> Result<Self> {
        let path = dir.join("config.toml");
        let text =
            std::fs::read_to_string(&path).context(|| format!("cannot read {}", path.display()))?;
        let cfg: Config = toml::from_str(&text).context(|| format!("bad {}", path.display()))?;
        Ok(cfg)
    }

    /// Check the config. `fixture` allows the `min_words` override.
    pub fn validate(&self, dir_name: &str, fixture: bool) -> Result<()> {
        if self.code != dir_name {
            bail!(
                "config code {:?} does not match the folder name {:?}",
                self.code,
                dir_name
            );
        }
        if self.min_len < MIN_LEN_LIMIT
            || self.max_len > MAX_LEN_LIMIT
            || self.min_len > self.max_len
        {
            bail!(
                "{}: min_len and max_len must satisfy {MIN_LEN_LIMIT} <= min_len <= max_len <= {MAX_LEN_LIMIT}",
                self.code
            );
        }
        if self.min_words.is_some() && !fixture {
            bail!(
                "{}: min_words is only allowed for fixtures. Real languages need {MIN_WORDS} words",
                self.code
            );
        }
        if self.n < self.min_words() {
            bail!(
                "{}: n = {} is below the minimum of {} words",
                self.code,
                self.n,
                self.min_words()
            );
        }
        if self.s >= self.r {
            bail!("{}: s must be smaller than r", self.code);
        }
        if self.r - self.s < self.n {
            bail!(
                "{}: r - s = {} is smaller than n = {}",
                self.code,
                self.r - self.s,
                self.n
            );
        }
        crate::pipeline::CharClass::parse(&self.alphabet)
            .context(|| format!("{}: bad alphabet", self.code))?;
        let mut has_freq = false;
        let mut has_lex = false;
        for src in &self.sources {
            src.validate()
                .context(|| format!("{}: source {:?}", self.code, src.name))?;
            match src.role {
                Role::Frequency => has_freq = true,
                Role::Lexicon => has_lex = true,
            }
        }
        if !has_freq {
            bail!("{}: needs at least one frequency source", self.code);
        }
        if !has_lex {
            bail!("{}: needs at least one lexicon source", self.code);
        }
        Ok(())
    }

    /// The smallest allowed list size (4,096 unless a fixture lowers it).
    pub fn min_words(&self) -> usize {
        self.min_words.unwrap_or(MIN_WORDS)
    }
}

impl Source {
    pub fn validate(&self) -> Result<()> {
        if !self.format.allowed_for(self.role) {
            bail!(
                "format {:?} cannot be used for role {:?}",
                self.format,
                self.role
            );
        }
        if self.files.is_empty() {
            bail!("no files");
        }
        if self.weight == 0 {
            bail!("weight must be at least 1");
        }
        for f in &self.files {
            if f.url.is_some() == f.path.is_some() {
                bail!("each file needs exactly one of url or path");
            }
            if let Some(h) = &f.sha256
                && (h.len() != 64 || !h.bytes().all(|b| b.is_ascii_hexdigit()))
            {
                bail!("sha256 {h:?} is not 64 hex digits");
            }
        }
        match self.format {
            Format::Hunspell => {
                let dic = self
                    .files
                    .iter()
                    .filter(|f| f.part == Some(Part::Dic))
                    .count();
                let aff = self
                    .files
                    .iter()
                    .filter(|f| f.part == Some(Part::Aff))
                    .count();
                if dic != 1 || aff != 1 || self.files.len() != 2 {
                    bail!(
                        "hunspell needs exactly two files: one part = \"dic\" and one part = \"aff\""
                    );
                }
            }
            Format::FreqTable => {
                if self.word_column.is_none() {
                    bail!("freq-table needs word_column");
                }
            }
            Format::TableWords => {
                if self.word_column.is_none() {
                    bail!("table-words needs word_column");
                }
            }
            Format::CsvText => {
                if self.text_column.is_none() {
                    bail!("csv-text needs text_column");
                }
            }
            Format::Text => {
                if let Some(re) = &self.regex {
                    let re = regex::Regex::new(re).context(|| "bad regex".to_string())?;
                    if re.captures_len() < 2 {
                        bail!("regex needs a capture group for the text");
                    }
                }
            }
            Format::LineRegex => {
                let Some(re) = &self.regex else {
                    bail!("line-regex needs regex");
                };
                let re = regex::Regex::new(re).context(|| "bad regex".to_string())?;
                if re.captures_len() < 2 {
                    bail!("regex needs a capture group for the word");
                }
            }
            Format::WikidataLexemes if self.language_qid.is_none() || self.lang_code.is_none() => {
                bail!("wikidata-lexemes needs language_qid and lang_code");
            }
            _ => {}
        }
        if let Some(d) = &self.delimiter
            && d.chars().count() != 1
        {
            bail!("delimiter must be one character");
        }
        if let (Some(a), Some(b)) = (self.year_min, self.year_max)
            && a > b
        {
            bail!("year_min is after year_max");
        }
        Ok(())
    }

    /// The label of the source in the logs.
    pub fn label(&self) -> String {
        format!("{} ({})", self.name, self.version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = r#"
code = "xx"
name = "Test"
built_on = "2026-01-01"
s = 10
r = 9000
n = 5000
alphabet = "a-z"
[ascii]
[[sources]]
name = "f"
role = "frequency"
format = "ranked-list"
version = "1"
license = "CC0"
license_url = "u"
url = "u"
credit = "c"
[[sources.files]]
path = "f.txt"
[[sources]]
name = "l"
role = "lexicon"
format = "wordlist"
version = "1"
license = "CC0"
license_url = "u"
url = "u"
credit = "c"
[[sources.files]]
path = "l.txt"
"#;

    fn parse(extra: &str) -> Config {
        toml::from_str(&format!("{extra}\n{BASE}")).unwrap()
    }

    #[test]
    fn nfr_10_valid_config_passes() {
        parse("").validate("xx", false).unwrap();
    }

    #[test]
    fn nfr_10_min_words_is_only_allowed_for_fixtures() {
        let cfg = parse("min_words = 10");
        let err = cfg.validate("xx", false).unwrap_err();
        assert!(err.0.contains("only allowed for fixtures"), "{err}");
        cfg.validate("xx", true).unwrap();
    }

    #[test]
    fn nfr_10_real_languages_need_4096_words() {
        let text = BASE.replace("n = 5000", "n = 4095");
        let cfg: Config = toml::from_str(&text).unwrap();
        assert!(
            cfg.validate("xx", false)
                .unwrap_err()
                .0
                .contains("below the minimum")
        );
    }

    #[test]
    fn nfr_10_bad_configs_are_refused() {
        let wrong_dir = parse("").validate("yy", false);
        assert!(wrong_dir.is_err(), "code must match the folder");
        let cases = [("min_len = 2\n", "min_len"), ("max_len = 10\n", "max_len")];
        for (extra, what) in cases {
            let cfg = parse(extra);
            assert!(cfg.validate("xx", false).is_err(), "{what} should fail");
        }
        let text = BASE.replace("s = 10", "s = 8999");
        let cfg: Config = toml::from_str(&text).unwrap();
        assert!(cfg.validate("xx", false).unwrap_err().0.contains("r - s"));
        let unknown = toml::from_str::<Config>(&format!("surprise = 1\n{BASE}"));
        assert!(unknown.is_err(), "unknown keys are errors");
    }

    #[test]
    fn nfr_10_each_role_needs_a_matching_format() {
        let text = BASE.replace("format = \"wordlist\"", "format = \"ranked-list\"");
        let cfg: Config = toml::from_str(&text).unwrap();
        assert!(cfg.validate("xx", false).is_err());
    }

    #[test]
    fn nfr_10_links_need_a_valid_hash_format() {
        let text = BASE.replace(
            "path = \"f.txt\"",
            "url = \"https://x/f\"\nsha256 = \"abc\"",
        );
        let cfg: Config = toml::from_str(&text).unwrap();
        assert!(cfg.validate("xx", false).unwrap_err().0.contains("sha256"));
    }
}
