//! `cargo xtask wordlists`: build the word lists (PRD 7.3).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::bail;
use crate::config::{Config, Source};
use crate::count::{self, Counts, Ctx, HashUpdate};
use crate::credits;
use crate::manifest::{self, CHANGED_NOTE, Manifest, ManifestBuild, ManifestHashes};
use crate::pipeline::{self, Built, Inputs, Params};
use crate::util::{Context, Result, repo_root, sha256_hex};

#[derive(Debug, Default)]
pub struct Options {
    pub langs: Vec<String>,
    pub fixture_dir: Option<PathBuf>,
    pub update_hashes: bool,
    pub jobs: Option<usize>,
}

pub fn parse_args(args: &[String]) -> Result<Options> {
    let mut o = Options::default();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let (flag, inline) = match a.split_once('=') {
            Some((f, v)) => (f, Some(v.to_string())),
            None => (a.as_str(), None),
        };
        let mut value = || -> Result<String> {
            match inline.clone().or_else(|| it.next().cloned()) {
                Some(v) => Ok(v),
                None => bail!("{flag} needs a value"),
            }
        };
        match flag {
            "--lang" => o.langs.push(value()?),
            "--fixture-dir" => o.fixture_dir = Some(PathBuf::from(value()?)),
            "--update-hashes" => o.update_hashes = true,
            "--jobs" => {
                o.jobs = Some(
                    value()?
                        .parse()
                        .map_err(|_| crate::util::Error("--jobs needs a number".into()))?,
                )
            }
            other => bail!("unknown option {other:?} for wordlists"),
        }
    }
    Ok(o)
}

pub fn wordlists_dir(opts: &Options) -> PathBuf {
    opts.fixture_dir
        .clone()
        .unwrap_or_else(|| repo_root().join("wordlists"))
}

pub fn cache_dir() -> PathBuf {
    repo_root().join("target").join("wordlist-sources")
}

pub fn default_jobs() -> usize {
    std::thread::available_parallelism()
        .map_or(2, |n| n.get())
        .min(4)
}

/// Everything that a build needs, read from disk and from the sources.
pub struct Loaded {
    pub cfg: Config,
    pub params: Params,
    pub freq: Vec<(u64, Counts)>,
    pub lexicon: HashSet<String>,
    pub blocklist: HashSet<String>,
    pub extras: Vec<String>,
    /// Hash updates: (index of the source, update).
    pub updates: Vec<(usize, HashUpdate)>,
}

impl Loaded {
    pub fn inputs(&self) -> Inputs<'_> {
        Inputs {
            freq: self.freq.iter().map(|(w, c)| (*w, c)).collect(),
            lexicon: self.lexicon.clone(),
            blocklist: self.blocklist.clone(),
            extras: self.extras.clone(),
        }
    }
}

/// Steps 1 to 5 of PRD 7.3: read the config, the block list, the extra words and the sources.
pub fn load(root: &Path, code: &str, opts: &Options) -> Result<Loaded> {
    let dir = root.join(code);
    let cfg = Config::load(&dir)?;
    cfg.validate(code, opts.fixture_dir.is_some())?;
    let params = Params::from_config(&cfg)?;
    let blocklist_path = dir.join("blocklist.txt");
    let blocklist: HashSet<String> =
        pipeline::parse_word_lines(&std::fs::read_to_string(&blocklist_path).context(|| {
            format!(
                "{code}: cannot read {} (an empty file is fine)",
                blocklist_path.display()
            )
        })?)
        .into_iter()
        .collect();
    let extras_path = dir.join("extra-words.txt");
    let extras = if extras_path.is_file() {
        pipeline::parse_word_lines(&std::fs::read_to_string(&extras_path)?)
    } else {
        Vec::new()
    };
    if !extras.is_empty() && cfg.extra.is_none() {
        bail!(
            "{code}: extra-words.txt exists, but config.toml has no [extra] table with the credit"
        );
    }
    let ctx = Ctx {
        base_dir: dir.clone(),
        cache_dir: cache_dir(),
        update_hashes: opts.update_hashes,
        jobs: opts.jobs.unwrap_or_else(default_jobs),
    };
    let mut freq = Vec::new();
    let mut lexicons = Vec::new();
    let mut updates = Vec::new();
    for (i, src) in cfg.sources.iter().enumerate() {
        crate::log!("{code}: source {}", src.label());
        match src.role {
            crate::config::Role::Frequency => {
                let (c, u) = count::load_frequency(src, &ctx)
                    .context(|| format!("{code}: {}", src.label()))?;
                crate::log!(
                    "{code}: {} distinct words, total count {}",
                    c.words.len(),
                    c.total
                );
                freq.push((src.weight, c));
                updates.extend(u.into_iter().map(|u| (i, u)));
            }
            crate::config::Role::Lexicon => {
                let (w, u) = count::load_lexicon(src, &ctx)
                    .context(|| format!("{code}: {}", src.label()))?;
                crate::log!("{code}: {} lexicon words", w.len());
                lexicons.push(w);
                updates.extend(u.into_iter().map(|u| (i, u)));
            }
        }
    }
    let lexicon = pipeline::prepare_lexicon(&lexicons, cfg.lexicon_case);
    Ok(Loaded {
        cfg,
        params,
        freq,
        lexicon,
        blocklist,
        extras,
        updates,
    })
}

fn lines_file(words: &[String]) -> String {
    let mut s = words.join("\n");
    s.push('\n');
    s
}

/// Step 17: make the manifest and write all output files of a language.
pub fn write_outputs(
    dir: &Path,
    cfg: &Config,
    built: &Built,
    has_extras: bool,
) -> Result<Manifest> {
    let words_txt = lines_file(&built.words);
    let ascii_txt = lines_file(&built.ascii);
    let extra = if has_extras { cfg.extra.as_ref() } else { None };
    let manifest = Manifest {
        code: cfg.code.clone(),
        name: cfg.name.clone(),
        words: built.words.len(),
        ascii_words: built.ascii.len(),
        ascii_same: built.ascii_same,
        entropy_per_word: pipeline::entropy_per_word(built.words.len()),
        entropy_per_word_ascii: pipeline::entropy_per_word(built.ascii.len()),
        s: cfg.s,
        r: cfg.r,
        sources: credits::manifest_sources(&cfg.sources, extra),
        changed_note: CHANGED_NOTE.to_string(),
        sha256: ManifestHashes {
            words: sha256_hex(words_txt.as_bytes()),
            words_ascii: sha256_hex(ascii_txt.as_bytes()),
        },
        build: ManifestBuild {
            xtask_version: env!("CARGO_PKG_VERSION").to_string(),
            built_on: cfg.built_on.clone(),
        },
    };
    let mut texts: Vec<Option<&str>> = cfg
        .sources
        .iter()
        .map(|s| s.license_text.as_deref())
        .collect();
    if extra.is_some() {
        texts.push(None);
    }
    std::fs::write(dir.join("words.txt"), words_txt)?;
    std::fs::write(dir.join("words-ascii.txt"), ascii_txt)?;
    std::fs::write(dir.join("manifest.json"), manifest.to_json())?;
    std::fs::write(
        dir.join("LICENSE"),
        credits::render_license(&manifest, &texts),
    )?;
    std::fs::write(dir.join("CREDITS.md"), credits::render_credits(&manifest))?;
    Ok(manifest)
}

/// Write the new hashes into `config.toml`. The comments of the file stay.
pub fn apply_hash_updates(
    config_path: &Path,
    sources: &[Source],
    updates: &[(usize, HashUpdate)],
) -> Result<()> {
    let text = std::fs::read_to_string(config_path)?;
    let mut doc: toml_edit::DocumentMut = text
        .parse()
        .context(|| format!("cannot parse {}", config_path.display()))?;
    for (si, u) in updates {
        let Some(sources_item) = doc
            .get_mut("sources")
            .and_then(|i| i.as_array_of_tables_mut())
        else {
            bail!("config.toml has no [[sources]]");
        };
        let src_table = sources_item.get_mut(*si).expect("source index is valid");
        let files = src_table.get_mut("files").expect("source has files");
        let new = toml_edit::value(u.new.clone());
        if let Some(tables) = files.as_array_of_tables_mut() {
            tables
                .get_mut(u.file_index)
                .expect("file index is valid")
                .insert("sha256", new);
        } else if let Some(arr) = files.as_array_mut() {
            let t = arr
                .get_mut(u.file_index)
                .and_then(|v| v.as_inline_table_mut())
                .expect("file entry is an inline table");
            t.insert("sha256", new.into_value().expect("a string value"));
        } else {
            bail!("source files must be [[sources.files]] tables or an array of inline tables");
        }
        crate::log!(
            "hash of {}\n  old: {}\n  new: {}",
            sources[*si].files[u.file_index].describe(),
            u.old.as_deref().unwrap_or("(none)"),
            u.new
        );
    }
    std::fs::write(config_path, doc.to_string())?;
    Ok(())
}

/// Build one language. Return its manifest.
pub fn build_language(root: &Path, code: &str, opts: &Options) -> Result<Manifest> {
    let start = Instant::now();
    let loaded = load(root, code, opts)?;
    if opts.update_hashes {
        apply_hash_updates(
            &root.join(code).join("config.toml"),
            &loaded.cfg.sources,
            &loaded.updates,
        )?;
    }
    let built = pipeline::build_list(&loaded.params, &loaded.inputs())
        .map_err(|e| pipeline::lang_err(code, e))?;
    let manifest = write_outputs(
        &root.join(code),
        &loaded.cfg,
        &built,
        !loaded.extras.is_empty(),
    )?;
    crate::log!(
        "{code}: {} words ({:.2} bits per word), {} ASCII words ({:.2} bits), ascii_same = {}, {:.1}s",
        manifest.words,
        manifest.entropy_per_word,
        manifest.ascii_words,
        manifest.entropy_per_word_ascii,
        manifest.ascii_same,
        start.elapsed().as_secs_f64()
    );
    Ok(manifest)
}

/// Languages that have a `config.toml`, sorted.
pub fn configured_languages(root: &Path) -> Result<Vec<String>> {
    Ok(manifest::language_dirs(root)?
        .into_iter()
        .filter(|l| root.join(l).join("config.toml").is_file())
        .collect())
}

/// Write `NOTICE` at the root of the repository from all manifests.
pub fn write_notice() -> Result<()> {
    let manifests = manifest::read_all(&repo_root().join("wordlists"))?;
    let text = credits::render_notice(&manifests);
    std::fs::write(repo_root().join("NOTICE"), text)?;
    crate::log!("wrote NOTICE ({} languages)", manifests.len());
    Ok(())
}

pub fn run(args: &[String]) -> Result<()> {
    let opts = parse_args(args)?;
    let root = wordlists_dir(&opts);
    let langs = if opts.langs.is_empty() {
        configured_languages(&root)?
    } else {
        opts.langs.clone()
    };
    if langs.is_empty() {
        bail!("no language has a config.toml in {}", root.display());
    }
    for code in &langs {
        build_language(&root, code, &opts)?;
    }
    if opts.fixture_dir.is_none() {
        write_notice()?;
    }
    Ok(())
}

/// For `cargo xtask dist`: build only the languages that have no built files yet.
/// A language with `words.txt` and `manifest.json` is never rebuilt here.
pub fn ensure_built() -> Result<()> {
    let root = repo_root().join("wordlists");
    let missing: Vec<String> = configured_languages(&root)?
        .into_iter()
        .filter(|l| {
            !root.join(l).join("words.txt").is_file()
                || !root.join(l).join("manifest.json").is_file()
        })
        .collect();
    if missing.is_empty() {
        crate::log!("all word lists are built; no rebuild");
        return Ok(());
    }
    let opts = Options::default();
    for code in &missing {
        build_language(&root, code, &opts)?;
    }
    write_notice()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_args_reads_all_options() {
        let args: Vec<String> = [
            "--lang",
            "en-US",
            "--lang=de",
            "--update-hashes",
            "--jobs",
            "3",
            "--fixture-dir",
            "/x",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let o = parse_args(&args).unwrap();
        assert_eq!(o.langs, ["en-US", "de"]);
        assert!(o.update_hashes);
        assert_eq!(o.jobs, Some(3));
        assert_eq!(o.fixture_dir, Some(PathBuf::from("/x")));
        assert!(parse_args(&["--nope".to_string()]).is_err());
        assert!(parse_args(&["--lang".to_string()]).is_err());
    }
}
