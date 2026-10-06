//! Text files made from source metadata: the list `LICENSE`, `CREDITS.md` and the root `NOTICE`.
//! All output is deterministic: no dates, sorted where order is free.

use std::collections::BTreeMap;
use std::fmt::Write;

use crate::config::Source;
use crate::licenses::{self, Kind};
use crate::manifest::{CHANGED_NOTE, Manifest, ManifestSource};

fn kind_of(license: &str) -> Option<Kind> {
    licenses::classify(license).ok()
}

/// One sentence on the terms of the whole list.
fn list_terms(sources: &[ManifestSource]) -> String {
    let kinds: Vec<Kind> = sources.iter().filter_map(|s| kind_of(&s.license)).collect();
    let copyleft: Vec<&ManifestSource> = sources
        .iter()
        .filter(|s| kind_of(&s.license) == Some(Kind::Copyleft))
        .collect();
    if let Some(first) = copyleft.first() {
        format!(
            "This list is a copyleft work. It keeps the license of {} ({}). \
             Every changed copy of the list must use that license too.",
            first.name, first.license
        )
    } else if kinds.contains(&Kind::Attribution) {
        "You may use this list for any purpose, including commercial use. \
         You must give the credit of CREDITS.md, link the licenses, and say that the list was changed."
            .to_string()
    } else if kinds.contains(&Kind::Permissive) {
        "You may use this list for any purpose. Keep the notices below.".to_string()
    } else {
        "This list is free of copyright duties.".to_string()
    }
}

/// The `LICENSE` file of a word list. `texts` holds the optional license text of each source.
pub fn render_license(m: &Manifest, texts: &[Option<&str>]) -> String {
    let mut out = String::new();
    let title = format!("Word list license: {} ({})", m.code, m.name);
    let _ = writeln!(out, "{title}\n{}\n", "=".repeat(title.chars().count()));
    let _ = writeln!(
        out,
        "The files words.txt and words-ascii.txt in this folder are made from the sources below.\n\
         {CHANGED_NOTE}\n\
         The license of each source applies to the words that come from that source.\n"
    );
    let _ = writeln!(out, "{}\n", list_terms(&m.sources));
    let _ = writeln!(out, "Sources\n-------\n");
    for (i, s) in m.sources.iter().enumerate() {
        let _ = writeln!(
            out,
            "{}. {} (version: {}, role: {})",
            i + 1,
            s.name,
            s.version,
            s.role
        );
        let _ = writeln!(out, "   License: {}", s.license);
        let _ = writeln!(out, "   License text: {}", s.license_url);
        let _ = writeln!(out, "   Home page: {}", s.url);
        if let Some(Some(t)) = texts.get(i) {
            let _ = writeln!(out, "\n   Notice of this source:\n");
            for line in t.trim_end().lines() {
                if line.is_empty() {
                    out.push('\n');
                } else {
                    let _ = writeln!(out, "   {line}");
                }
            }
        }
        out.push('\n');
    }
    out
}

/// `CREDITS.md` of a word list.
pub fn render_credits(m: &Manifest) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "# Credits for the {} word list ({})\n", m.name, m.code);
    let _ = writeln!(out, "{CHANGED_NOTE}\n");
    let _ = writeln!(out, "## Sources\n");
    for s in &m.sources {
        let _ = writeln!(out, "### {}\n", s.name);
        let _ = writeln!(out, "- Version: {}", s.version);
        let _ = writeln!(out, "- Role: {}", s.role);
        let _ = writeln!(out, "- License: [{}]({})", s.license, s.license_url);
        let _ = writeln!(out, "- Home page: <{}>", s.url);
        let _ = writeln!(out, "- Credit: {}\n", s.credit);
    }
    let _ = writeln!(out, "## Lists\n");
    let _ = writeln!(
        out,
        "- `words.txt`: {} words, {:.2} bits per word, SHA-256 `{}`",
        m.words, m.entropy_per_word, m.sha256.words
    );
    let _ = writeln!(
        out,
        "- `words-ascii.txt`: {} words, {:.2} bits per word, SHA-256 `{}`",
        m.ascii_words, m.entropy_per_word_ascii, m.sha256.words_ascii
    );
    out
}

/// The root `NOTICE` file: credits for the sources of all word lists.
pub fn render_notice(manifests: &[Manifest]) -> String {
    // Key: (name, version). Value: the source and the language codes that use it.
    let mut by_source: BTreeMap<(String, String), (ManifestSource, Vec<String>)> = BTreeMap::new();
    for m in manifests {
        for s in &m.sources {
            let entry = by_source
                .entry((s.name.clone(), s.version.clone()))
                .or_insert_with(|| (s.clone(), Vec::new()));
            if !entry.1.contains(&m.code) {
                entry.1.push(m.code.clone());
            }
        }
    }
    let mut out = String::from(
        "Hekate word list credits\n\
         ========================\n\n\
         The code of Hekate uses the MIT license (see LICENSE).\n\
         The word lists in wordlists/ are made from the sources below.\n\
         Each list has its own LICENSE and CREDITS.md file.\n",
    );
    let _ = writeln!(out, "{CHANGED_NOTE}\n");
    for ((name, version), (s, mut codes)) in by_source {
        codes.sort();
        let _ = writeln!(out, "* {name} (version: {version})");
        let _ = writeln!(out, "  License: {} ({})", s.license, s.license_url);
        let _ = writeln!(out, "  Home page: {}", s.url);
        let _ = writeln!(out, "  Credit: {}", s.credit);
        let _ = writeln!(out, "  Used for: {}\n", codes.join(", "));
    }
    out
}

/// Convert config sources to manifest sources (the order of the config is kept).
pub fn manifest_sources(
    sources: &[Source],
    extra: Option<&crate::config::ExtraSource>,
) -> Vec<ManifestSource> {
    let mut out: Vec<ManifestSource> = sources
        .iter()
        .map(|s| ManifestSource {
            name: s.name.clone(),
            role: s.role.as_str().to_string(),
            version: s.version.clone(),
            license: s.license.clone(),
            license_url: s.license_url.clone(),
            url: s.url.clone(),
            credit: s.credit.clone(),
        })
        .collect();
    if let Some(e) = extra {
        out.push(ManifestSource {
            name: e.name.clone(),
            role: "extra".into(),
            version: e.version.clone(),
            license: e.license.clone(),
            license_url: e.license_url.clone(),
            url: e.url.clone(),
            credit: e.credit.clone(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{ManifestBuild, ManifestHashes};

    fn src(name: &str, license: &str) -> ManifestSource {
        ManifestSource {
            name: name.into(),
            role: "frequency".into(),
            version: "1".into(),
            license: license.into(),
            license_url: "https://example.org/l".into(),
            url: "https://example.org".into(),
            credit: "Credit text".into(),
        }
    }

    fn manifest(code: &str, sources: Vec<ManifestSource>) -> Manifest {
        Manifest {
            code: code.into(),
            name: "Test".into(),
            words: 4,
            ascii_words: 4,
            ascii_same: true,
            entropy_per_word: 2.0,
            entropy_per_word_ascii: 2.0,
            s: 0,
            r: 10,
            sources,
            changed_note: CHANGED_NOTE.into(),
            sha256: ManifestHashes {
                words: "a".repeat(64),
                words_ascii: "b".repeat(64),
            },
            build: ManifestBuild {
                xtask_version: "0".into(),
                built_on: "2026-01-01".into(),
            },
        }
    }

    #[test]
    fn license_file_names_every_source_and_the_changed_note() {
        let m = manifest("xx", vec![src("A", "CC BY 4.0"), src("B", "MPL-2.0")]);
        let text = render_license(&m, &[None, Some("Copyright X\n\nMore")]);
        assert!(text.contains("A (version: 1"));
        assert!(text.contains("B (version: 1"));
        assert!(text.contains(CHANGED_NOTE));
        assert!(text.contains("copyleft"), "MPL makes the list copyleft");
        assert!(text.contains("   Copyright X\n\n   More"));
    }

    #[test]
    fn credits_file_has_hashes_and_credit_text() {
        let m = manifest("xx", vec![src("A", "CC BY 4.0")]);
        let text = render_credits(&m);
        assert!(text.contains("Credit text"));
        assert!(text.contains(&"a".repeat(64)));
    }

    #[test]
    fn notice_is_sorted_and_merges_equal_sources() {
        let m1 = manifest("bb", vec![src("Zed", "MIT"), src("Alpha", "CC0")]);
        let m2 = manifest("aa", vec![src("Alpha", "CC0")]);
        let text = render_notice(&[m1.clone(), m2.clone()]);
        let a = text.find("* Alpha").unwrap();
        let z = text.find("* Zed").unwrap();
        assert!(a < z);
        assert_eq!(text.matches("* Alpha").count(), 1);
        assert!(text.contains("Used for: aa, bb"));
        assert_eq!(
            text,
            render_notice(&[m2, m1]),
            "input order does not matter"
        );
    }
}
