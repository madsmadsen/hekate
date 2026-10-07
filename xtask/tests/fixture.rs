//! NFR-10: add a language from a fixture with `cargo xtask wordlists`, with no code change.
//! The test runs the real `xtask` binary on a copy of `tests/fixtures/xx`.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use hekate_core::{WordList, WordStyle, draw_words};
use rand_core::{Infallible, TryRng, utils};

fn xtask(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_xtask"))
        .args(args)
        .output()
        .expect("the xtask binary starts")
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// A fresh copy of the fixture in a temp folder. Returns the wordlists root.
fn fixture_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("hekate-fixture-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/xx");
    copy_dir(&src, &root.join("xx"));
    root
}

fn build(root: &Path) -> Output {
    xtask(&[
        "wordlists",
        "--fixture-dir",
        root.to_str().unwrap(),
        "--lang",
        "xx",
    ])
}

fn stderr(o: &Output) -> String {
    String::from_utf8_lossy(&o.stderr).into_owned()
}

fn read(root: &Path, file: &str) -> String {
    std::fs::read_to_string(root.join("xx").join(file)).unwrap()
}

#[test]
fn nfr_10_fixture_language_builds() {
    let root = fixture_root("builds");
    let out = build(&root);
    assert!(out.status.success(), "{}", stderr(&out));
    for f in [
        "words.txt",
        "words-ascii.txt",
        "manifest.json",
        "LICENSE",
        "CREDITS.md",
    ] {
        assert!(root.join("xx").join(f).is_file(), "missing {f}");
    }
    let words: Vec<String> = read(&root, "words.txt").lines().map(String::from).collect();
    assert_eq!(words.len(), 40, "n = 40");
    // s = 5 skips the 5 most common words. "bad" is on the block list. The two extra words come last.
    assert_eq!(&words[38..], ["zazu", "xoxo"]);
    assert!(!words.contains(&"bad".to_string()));
    for kept in ["zorbo", "café", "cafe"] {
        assert!(
            words.contains(&kept.to_string()),
            "{kept} is a valid word in the window"
        );
    }
    for dropped in ["notinlex", "tiny12", "xylophonexyz", "ab"] {
        assert!(
            !words.contains(&dropped.to_string()),
            "{dropped} fails a filter"
        );
    }
    // "café" and "cafe" both become "cafe" in ASCII. The build removes both (PRD 7.4 rule 3).
    let ascii = read(&root, "words-ascii.txt");
    assert!(ascii.lines().all(|w| w != "cafe" && w != "café"));
    assert_eq!(ascii.lines().count(), 38);
    let manifest: serde_json::Value = serde_json::from_str(&read(&root, "manifest.json")).unwrap();
    assert_eq!(manifest["code"], "xx");
    assert_eq!(manifest["words"], 40);
    assert_eq!(
        manifest["sources"].as_array().unwrap().len(),
        3,
        "two sources and the extra list"
    );
    assert_eq!(manifest["sources"][2]["role"], "extra");
    assert_eq!(manifest["ascii_same"], false);
    assert_eq!(manifest["ascii_words"], 38);
}

#[test]
fn nfr_10_fixture_build_is_reproducible() {
    let root = fixture_root("repro");
    assert!(build(&root).status.success());
    let first: Vec<String> = [
        "words.txt",
        "words-ascii.txt",
        "manifest.json",
        "LICENSE",
        "CREDITS.md",
    ]
    .iter()
    .map(|f| read(&root, f))
    .collect();
    assert!(build(&root).status.success());
    for (f, before) in [
        "words.txt",
        "words-ascii.txt",
        "manifest.json",
        "LICENSE",
        "CREDITS.md",
    ]
    .iter()
    .zip(first)
    {
        assert_eq!(read(&root, f), before, "{f} changed between two builds");
    }
}

/// A tiny deterministic generator for the test. The real component uses Web Crypto.
struct TestRng(u64);

impl TryRng for TestRng {
    type Error = Infallible;
    fn try_next_u32(&mut self) -> Result<u32, Infallible> {
        Ok(self.try_next_u64()? as u32)
    }
    fn try_next_u64(&mut self) -> Result<u64, Infallible> {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1);
        Ok(self.0 >> 11 ^ self.0)
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Infallible> {
        utils::fill_bytes_via_next_word(dest, || self.try_next_u64())
    }
}

#[test]
fn nfr_10_fixture_language_makes_passwords() {
    let root = fixture_root("passwords");
    assert!(build(&root).status.success());
    let text = read(&root, "words.txt");
    let list = WordList::parse(&text).unwrap();
    let words: Vec<&str> = text.lines().collect();
    let mut rng = TestRng(7);
    for _ in 0..200 {
        let pw = draw_words(&mut rng, &list, 5, false)
            .unwrap()
            .render(&WordStyle::default());
        // The password has 5 words in PascalCase. Each part must come from the list.
        let lower = pw.text.to_lowercase();
        let mut rest = lower.as_str();
        let mut found = 0;
        while !rest.is_empty() {
            let w = words
                .iter()
                .find(|w| rest.starts_with(**w))
                .expect("part of the password is a list word");
            rest = &rest[w.len()..];
            found += 1;
        }
        assert!(found >= 5);
    }
}

#[test]
fn nfr_10_real_rules_reject_the_small_fixture() {
    // `check-manifests` always demands 4,096 words, even for a fixture.
    let root = fixture_root("check");
    assert!(build(&root).status.success());
    let out = xtask(&["check-manifests", "--dir", root.to_str().unwrap()]);
    assert!(!out.status.success());
    assert!(stderr(&out).contains("minimum is 4096"), "{}", stderr(&out));
}

#[test]
fn nfr_10_min_words_override_is_not_allowed_outside_fixtures() {
    // Without --fixture-dir the build reads the real `wordlists/` folder, where `xx` does not exist.
    let out = xtask(&["wordlists", "--lang", "xx"]);
    assert!(!out.status.success());
}
