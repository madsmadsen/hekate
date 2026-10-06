//! The `manifest.json` file of a word list. Every other tool reads this schema.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::util::{Context, Result};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Manifest {
    pub code: String,
    /// Name of the language in that language, for example "Svenska".
    pub name: String,
    pub words: usize,
    pub ascii_words: usize,
    pub ascii_same: bool,
    pub entropy_per_word: f64,
    pub entropy_per_word_ascii: f64,
    pub s: usize,
    pub r: usize,
    pub sources: Vec<ManifestSource>,
    pub changed_note: String,
    pub sha256: ManifestHashes,
    pub build: ManifestBuild,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ManifestSource {
    pub name: String,
    /// `frequency`, `lexicon` or `extra`.
    pub role: String,
    pub version: String,
    pub license: String,
    pub license_url: String,
    pub url: String,
    pub credit: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ManifestHashes {
    pub words: String,
    pub words_ascii: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ManifestBuild {
    pub xtask_version: String,
    pub built_on: String,
}

/// The note that CC BY requires (PRD section 5.3, item 4).
pub const CHANGED_NOTE: &str =
    "Hekate changed this source. Hekate filtered the words and shortened the list.";

impl Manifest {
    pub fn read(path: &Path) -> Result<Self> {
        let text =
            std::fs::read_to_string(path).context(|| format!("cannot read {}", path.display()))?;
        serde_json::from_str(&text).context(|| format!("bad manifest {}", path.display()))
    }

    /// Pretty JSON with a final newline. The bytes are the same on every run.
    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("manifest serializes");
        s.push('\n');
        s
    }
}

/// Folder names inside `wordlists_dir` that hold a language (they have a `config.toml`
/// or a `manifest.json`), sorted.
pub fn language_dirs(wordlists_dir: &Path) -> Result<Vec<String>> {
    let mut out = Vec::new();
    let rd = std::fs::read_dir(wordlists_dir)
        .context(|| format!("cannot read {}", wordlists_dir.display()))?;
    for entry in rd {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let dir = entry.path();
        if dir.join("config.toml").is_file() || dir.join("manifest.json").is_file() {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

/// All manifests in `wordlists_dir`, sorted by language code.
pub fn read_all(wordlists_dir: &Path) -> Result<Vec<Manifest>> {
    let mut out = Vec::new();
    for lang in language_dirs(wordlists_dir)? {
        let path = wordlists_dir.join(&lang).join("manifest.json");
        if path.is_file() {
            out.push(Manifest::read(&path)?);
        }
    }
    Ok(out)
}
