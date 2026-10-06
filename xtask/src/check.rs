//! `cargo xtask check-manifests`: NFR-9 and the content rules of PRD 7.1 and 7.4.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

use crate::bail;
use crate::config::{MAX_LEN_LIMIT, MIN_LEN_LIMIT, MIN_WORDS};
use crate::licenses;
use crate::manifest::{self, CHANGED_NOTE, Manifest};
use crate::util::{Result, repo_root, sha256_hex};

/// Check one list file. `ascii` adds the ASCII rules. Return the problems.
fn check_list(label: &str, text: &str, ascii: bool, problems: &mut Vec<String>) -> Vec<String> {
    let mut p = |msg: String| problems.push(format!("{label}: {msg}"));
    if text.contains('\r') {
        p("has CR characters. Lines must end with LF".into());
    }
    if !text.ends_with('\n') {
        p("does not end with a newline".into());
    }
    let words: Vec<String> = text.lines().map(str::to_string).collect();
    if words.len() < MIN_WORDS {
        p(format!(
            "has {} words. The minimum is {MIN_WORDS}",
            words.len()
        ));
    }
    let mut seen = HashSet::new();
    for (i, w) in words.iter().enumerate() {
        let line = i + 1;
        let len = w.chars().count();
        if !(MIN_LEN_LIMIT..=MAX_LEN_LIMIT).contains(&len) {
            p(format!(
                "line {line}: {w:?} has {len} characters. Allowed: {MIN_LEN_LIMIT} to {MAX_LEN_LIMIT}"
            ));
        }
        if w.nfc().collect::<String>() != *w {
            p(format!("line {line}: {w:?} is not in NFC form"));
        }
        if w.to_lowercase() != *w {
            p(format!("line {line}: {w:?} is not lowercase"));
        }
        if w.chars().any(|c| !c.is_alphabetic()) {
            p(format!(
                "line {line}: {w:?} has a character that is not a letter"
            ));
        }
        if ascii && !w.bytes().all(|b| b.is_ascii_lowercase()) {
            p(format!("line {line}: {w:?} is not made of ASCII letters"));
        }
        if !seen.insert(w.clone()) {
            p(format!("line {line}: {w:?} is a duplicate"));
        }
    }
    words
}

/// Check the manifest and the files of one language. Return all problems found.
pub fn check_language(dir: &Path, m: &Manifest) -> Vec<String> {
    let mut problems = Vec::new();
    let code = &m.code;
    if dir.file_name().and_then(|n| n.to_str()) != Some(code.as_str()) {
        problems.push(format!(
            "{code}: the manifest code does not match the folder name"
        ));
    }
    if m.name.trim().is_empty() {
        problems.push(format!("{code}: name is empty"));
    }
    if m.changed_note != CHANGED_NOTE {
        problems.push(format!(
            "{code}: changed_note is not the text of PRD section 5.3 item 4"
        ));
    }
    if !m.sources.iter().any(|s| s.role == "frequency")
        || !m.sources.iter().any(|s| s.role == "lexicon")
    {
        problems.push(format!(
            "{code}: needs a frequency source and a lexicon source"
        ));
    }
    for s in &m.sources {
        if let Err(why) = licenses::classify(&s.license) {
            problems.push(format!(
                "{code}: source {:?}: license not allowed: {why}",
                s.name
            ));
        }
        for (field, value) in [
            ("name", &s.name),
            ("version", &s.version),
            ("license_url", &s.license_url),
            ("url", &s.url),
            ("credit", &s.credit),
        ] {
            if value.trim().is_empty() {
                problems.push(format!("{code}: source {:?}: {field} is empty", s.name));
            }
        }
        if !["frequency", "lexicon", "extra"].contains(&s.role.as_str()) {
            problems.push(format!(
                "{code}: source {:?}: unknown role {:?}",
                s.name, s.role
            ));
        }
    }
    let read = |name: &str| std::fs::read_to_string(dir.join(name));
    let (words_text, ascii_text) = match (read("words.txt"), read("words-ascii.txt")) {
        (Ok(a), Ok(b)) => (a, b),
        _ => {
            problems.push(format!(
                "{code}: words.txt or words-ascii.txt cannot be read"
            ));
            return problems;
        }
    };
    let words = check_list(
        &format!("{code}/words.txt"),
        &words_text,
        false,
        &mut problems,
    );
    let ascii = check_list(
        &format!("{code}/words-ascii.txt"),
        &ascii_text,
        true,
        &mut problems,
    );
    if words.len() != m.words {
        problems.push(format!(
            "{code}: manifest says {} words, words.txt has {}",
            m.words,
            words.len()
        ));
    }
    if ascii.len() != m.ascii_words {
        problems.push(format!(
            "{code}: manifest says {} ASCII words, words-ascii.txt has {}",
            m.ascii_words,
            ascii.len()
        ));
    }
    if sha256_hex(words_text.as_bytes()) != m.sha256.words {
        problems.push(format!(
            "{code}: SHA-256 of words.txt does not match the manifest"
        ));
    }
    if sha256_hex(ascii_text.as_bytes()) != m.sha256.words_ascii {
        problems.push(format!(
            "{code}: SHA-256 of words-ascii.txt does not match the manifest"
        ));
    }
    if m.ascii_same != (words_text == ascii_text) {
        problems.push(format!(
            "{code}: ascii_same is {} but the files say otherwise",
            m.ascii_same
        ));
    }
    if m.ascii_same && !words.iter().all(|w| w.is_ascii()) {
        problems.push(format!(
            "{code}: ascii_same is true but words.txt has non-ASCII words"
        ));
    }
    for (value, n, what) in [
        (m.entropy_per_word, words.len(), "entropy_per_word"),
        (
            m.entropy_per_word_ascii,
            ascii.len(),
            "entropy_per_word_ascii",
        ),
    ] {
        if (value - (n as f64).log2()).abs() > 1e-9 {
            problems.push(format!("{code}: {what} is not log2 of the list size"));
        }
    }
    problems
}

pub fn run(args: &[String]) -> Result<()> {
    let mut dir: PathBuf = repo_root().join("wordlists");
    let mut langs: Vec<String> = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--dir" => dir = PathBuf::from(it.next().cloned().unwrap_or_default()),
            "--lang" => langs.push(it.next().cloned().unwrap_or_default()),
            other => bail!("unknown option {other:?} for check-manifests"),
        }
    }
    let mut problems = Vec::new();
    let mut checked = 0;
    for code in manifest::language_dirs(&dir)? {
        if !langs.is_empty() && !langs.contains(&code) {
            continue;
        }
        let ldir = dir.join(&code);
        let path = ldir.join("manifest.json");
        if !path.is_file() {
            problems.push(format!(
                "{code}: no manifest.json. Run `cargo xtask wordlists --lang {code}`"
            ));
            continue;
        }
        match Manifest::read(&path) {
            Ok(m) => problems.extend(check_language(&ldir, &m)),
            Err(e) => problems.push(format!("{code}: {e}")),
        }
        checked += 1;
    }
    if checked == 0 && problems.is_empty() {
        problems.push(format!("no manifests found in {}", dir.display()));
    }
    if problems.is_empty() {
        crate::log!("check-manifests: {checked} word list(s) are fine");
        return Ok(());
    }
    for p in problems.iter().take(50) {
        eprintln!("  - {p}");
    }
    if problems.len() > 50 {
        eprintln!("  ... and {} more problems", problems.len() - 50);
    }
    bail!("check-manifests found {} problem(s)", problems.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{ManifestBuild, ManifestHashes, ManifestSource};

    fn words(n: usize) -> Vec<String> {
        (0..n)
            .map(|i| {
                let mut s = String::from("w");
                let mut x = i;
                for _ in 0..4 {
                    s.push((b'a' + (x % 26) as u8) as char);
                    x /= 26;
                }
                s
            })
            .collect()
    }

    fn write_fixture(dir: &Path, list: &[String], license: &str) -> Manifest {
        std::fs::create_dir_all(dir).unwrap();
        let text = format!("{}\n", list.join("\n"));
        std::fs::write(dir.join("words.txt"), &text).unwrap();
        std::fs::write(dir.join("words-ascii.txt"), &text).unwrap();
        let src = |role: &str, license: &str| ManifestSource {
            name: "S".into(),
            role: role.into(),
            version: "1".into(),
            license: license.into(),
            license_url: "https://x".into(),
            url: "https://x".into(),
            credit: "c".into(),
        };
        let h = sha256_hex(text.as_bytes());
        Manifest {
            code: dir.file_name().unwrap().to_string_lossy().into_owned(),
            name: "Test".into(),
            words: list.len(),
            ascii_words: list.len(),
            ascii_same: true,
            entropy_per_word: (list.len() as f64).log2(),
            entropy_per_word_ascii: (list.len() as f64).log2(),
            s: 0,
            r: 1,
            sources: vec![src("frequency", license), src("lexicon", "MIT")],
            changed_note: CHANGED_NOTE.into(),
            sha256: ManifestHashes {
                words: h.clone(),
                words_ascii: h,
            },
            build: ManifestBuild {
                xtask_version: "0".into(),
                built_on: "2026-01-01".into(),
            },
        }
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hekate-check-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d.join("xx")
    }

    #[test]
    fn nfr_9_good_list_passes() {
        let dir = tmp("good");
        let m = write_fixture(&dir, &words(4096), "CC BY 4.0");
        assert_eq!(check_language(&dir, &m), Vec::<String>::new());
    }

    #[test]
    fn nfr_9_sharealike_source_fails() {
        let dir = tmp("sa");
        let m = write_fixture(&dir, &words(4096), "CC BY-SA 4.0");
        let problems = check_language(&dir, &m);
        assert!(
            problems.iter().any(|p| p.contains("license not allowed")),
            "{problems:?}"
        );
    }

    #[test]
    fn nfr_9_small_list_fails() {
        let dir = tmp("small");
        let m = write_fixture(&dir, &words(4095), "CC0");
        assert!(
            check_language(&dir, &m)
                .iter()
                .any(|p| p.contains("minimum is 4096"))
        );
    }

    #[test]
    fn nfr_6_non_nfc_duplicate_and_length_problems_are_found() {
        let dir = tmp("bad");
        let mut list = words(4096);
        list[0] = "cafe\u{301}".to_string(); // NFD
        list[1] = list[2].clone(); // duplicate
        list[3] = "ab".to_string(); // too short
        let m = write_fixture(&dir, &list, "CC0");
        let problems = check_language(&dir, &m).join("\n");
        assert!(problems.contains("not in NFC"));
        assert!(problems.contains("duplicate"));
        assert!(problems.contains("2 characters"));
    }

    #[test]
    fn nfr_9_changed_file_fails_the_hash_check() {
        let dir = tmp("hash");
        let mut m = write_fixture(&dir, &words(4096), "CC0");
        m.sha256.words = "0".repeat(64);
        assert!(
            check_language(&dir, &m)
                .iter()
                .any(|p| p.contains("SHA-256 of words.txt"))
        );
    }
}
