//! `cargo xtask wasm`: build the WASM module and write it into the component package.

use std::path::Path;
use std::process::Command;

use crate::bail;
use crate::log;
use crate::manifest::{self, Manifest};
use crate::util::{Context, Result, repo_root, which};

/// The text of `wordlists/hashes.tsv`. One line per key, sorted by key.
/// Each language has two keys, `<code>` and `<code>:ascii`.
pub fn render_hashes(manifests: &[Manifest]) -> String {
    let mut rows: Vec<(String, &str)> = Vec::new();
    for m in manifests {
        rows.push((m.code.clone(), &m.sha256.words));
        rows.push((format!("{}:ascii", m.code), &m.sha256.words_ascii));
    }
    rows.sort();
    let mut out = String::new();
    for (key, hash) in rows {
        out.push_str(&key);
        out.push('\t');
        out.push_str(hash);
        out.push('\n');
    }
    out
}

pub fn run(_args: &[String]) -> Result<()> {
    let root = repo_root();

    // (a) hashes.tsv
    let manifests = manifest::read_all(&root.join("wordlists"))?;
    let tsv_path = root.join("wordlists").join("hashes.tsv");
    let tsv = render_hashes(&manifests);
    if std::fs::read_to_string(&tsv_path).ok().as_deref() != Some(tsv.as_str()) {
        std::fs::write(&tsv_path, &tsv)
            .context(|| format!("cannot write {}", tsv_path.display()))?;
        log!("wrote {}", tsv_path.display());
    }

    // (b) cargo build
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    crate::util::run(
        Command::new(&cargo)
            .current_dir(&root)
            .args(["build", "-p", "hekate-wasm", "--release"])
            .args(["--target", "wasm32-unknown-unknown"]),
        "build the WASM module",
    )?;

    // (c) wasm-bindgen
    if which("wasm-bindgen").is_none() {
        bail!(
            "wasm-bindgen is not on PATH. Install it with: \
             cargo install wasm-bindgen-cli --version 0.2.129"
        );
    }
    let out_dir = root.join("packages/component/wasm");
    clean_dir(&out_dir)?;
    crate::util::run(
        Command::new("wasm-bindgen")
            .current_dir(&root)
            .arg("target/wasm32-unknown-unknown/release/hekate_wasm.wasm")
            .args(["--target", "web"])
            .args(["--out-dir", "packages/component/wasm"])
            .args(["--out-name", "hekate_wasm"]),
        "run wasm-bindgen",
    )?;

    // (d) copy
    let bg = out_dir.join("hekate_wasm_bg.wasm");
    let final_wasm = out_dir.join("hekate.wasm");
    std::fs::copy(&bg, &final_wasm).context(|| format!("cannot copy {}", bg.display()))?;

    // (e) wasm-opt
    if which("wasm-opt").is_some() {
        crate::util::run(
            Command::new("wasm-opt")
                .current_dir(&root)
                .args(["-Oz", "--all-features"])
                .arg(&final_wasm)
                .arg("-o")
                .arg(&final_wasm),
            "shrink the WASM module",
        )?;
    } else {
        log!("wasm-opt is not on PATH. Skipped the size step.");
    }
    let size = std::fs::metadata(&final_wasm)?.len();
    log!("wrote {} ({size} bytes)", final_wasm.display());
    Ok(())
}

/// Make `dir` exist and be empty.
fn clean_dir(dir: &Path) -> Result<()> {
    if dir.exists() {
        std::fs::remove_dir_all(dir).context(|| format!("cannot remove {}", dir.display()))?;
    }
    std::fs::create_dir_all(dir).context(|| format!("cannot create {}", dir.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{ManifestBuild, ManifestHashes};

    fn m(code: &str, w: &str, a: &str) -> Manifest {
        Manifest {
            code: code.into(),
            name: code.into(),
            words: 1,
            ascii_words: 1,
            ascii_same: true,
            entropy_per_word: 1.0,
            entropy_per_word_ascii: 1.0,
            s: 1,
            r: 1,
            sources: vec![],
            changed_note: String::new(),
            sha256: ManifestHashes {
                words: w.into(),
                words_ascii: a.into(),
            },
            build: ManifestBuild {
                xtask_version: "0".into(),
                built_on: "x".into(),
            },
        }
    }

    #[test]
    fn hashes_have_both_keys_and_are_sorted() {
        let tsv = render_hashes(&[m("sv", "aa", "bb"), m("en", "cc", "dd")]);
        assert_eq!(tsv, "en\tcc\nen:ascii\tdd\nsv\taa\nsv:ascii\tbb\n");
    }

    #[test]
    fn hashes_empty_is_empty() {
        assert_eq!(render_hashes(&[]), "");
    }
}
