//! `cargo xtask benchmark`: measure the S and R combinations (PRD 7.6).
//!
//! Results go to `wordlists/benchmark/<code>.json`. The 200-word samples for the native
//! speakers go to `wordlists/benchmark/<code>/`. Ratings from the speakers are read from
//! `wordlists/benchmark/<code>-ratings.json`.

use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::bail;
use crate::pipeline;
use crate::util::{Context, Result};
use crate::wordlists::{self, Options};

/// Values of S (PRD 7.6).
pub const S_VALUES: [usize; 4] = [0, 500, 1000, 2000];
/// Values of R (PRD 7.6).
pub const R_VALUES: [usize; 3] = [20_000, 30_000, 50_000];
/// The proposed values (PRD 7.1). Used when no ratings exist.
pub const PROPOSED: (usize, usize) = (1000, 30_000);
/// Size of the sample that the speakers rate.
pub const SAMPLE_SIZE: usize = 200;
/// Number of top words that the speakers check for grammar words.
pub const TOP_SIZE: usize = 100;
/// Fixed seed of the sample. The text "HEKATE" as a number.
const SEED: u64 = 0x4845_4B41_5445;
const TARGET_SIZE: usize = 7776;
const MIN_SIZE: usize = 4096;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Row {
    pub s: usize,
    pub r: usize,
    pub list_size: usize,
    pub avg_length: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Selection {
    pub s: usize,
    pub r: usize,
    pub ratings_used: bool,
    pub note: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct BenchFile {
    pub code: String,
    pub rows: Vec<Row>,
    pub selection: Option<Selection>,
}

/// The mean of the two native speakers (PRD 7.6).
#[derive(Deserialize, Debug, Clone, Copy)]
pub struct Rating {
    /// Mean percent of known words in the 200-word sample.
    pub known_pct: f64,
    /// Mean number of grammar words among the 100 top words.
    pub grammar_words: f64,
}

/// Keys look like `S1000-R30000`.
pub type Ratings = BTreeMap<String, Rating>;

pub fn key(s: usize, r: usize) -> String {
    format!("S{s}-R{r}")
}

/// A simple LCG (Knuth MMIX). It is not a secure random generator. The sample only
/// needs to be the same on every run.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }
}

/// Pick `k` different indexes below `len`, in a fixed random order.
pub fn sample_indices(len: usize, k: usize, seed: u64) -> Vec<usize> {
    let k = k.min(len);
    let mut idx: Vec<usize> = (0..len).collect();
    let mut rng = Lcg(seed);
    for i in 0..k {
        let j = i + (rng.next() as usize) % (len - i);
        idx.swap(i, j);
    }
    idx.truncate(k);
    idx
}

fn sample_seed(s: usize, r: usize) -> u64 {
    SEED.wrapping_add((s as u64).wrapping_mul(1_000_003))
        .wrapping_add(r as u64)
}

/// The list for one combination: the window of ranks, without blocked words and duplicates.
pub fn combination(
    ranked: &[String],
    s: usize,
    r: usize,
    blocklist: &HashSet<String>,
    extras: &HashSet<String>,
) -> Vec<String> {
    let window = pipeline::rank_window(ranked, s, r);
    pipeline::remove_blocked_and_duplicates(window, blocklist, extras)
}

fn avg_length(words: &[String]) -> f64 {
    if words.is_empty() {
        return 0.0;
    }
    let total: usize = words.iter().map(|w| w.chars().count()).sum();
    // Round to three decimals, so the JSON text is short and stable.
    ((total as f64 / words.len() as f64) * 1000.0).round() / 1000.0
}

/// Apply the selection rules of PRD 7.6.
pub fn select(rows: &[Row], ratings: Option<&Ratings>) -> Option<Selection> {
    let Some(ratings) = ratings else {
        let size = rows
            .iter()
            .find(|r| (r.s, r.r) == PROPOSED)
            .map(|r| r.list_size);
        return Some(Selection {
            s: PROPOSED.0,
            r: PROPOSED.1,
            ratings_used: false,
            note: format!(
                "No ratings file. Using the proposed S = {} and R = {}. List size there: {}.",
                PROPOSED.0,
                PROPOSED.1,
                size.map_or("unknown".to_string(), |n| n.to_string())
            ),
        });
    };
    // Rule 1: size.
    let mut eligible: Vec<&Row> = rows.iter().filter(|r| r.list_size >= TARGET_SIZE).collect();
    let mut size_note = "size >= 7776";
    if eligible.is_empty() {
        let max = rows.iter().map(|r| r.list_size).max().unwrap_or(0);
        if max < MIN_SIZE {
            return None;
        }
        eligible = rows.iter().filter(|r| r.list_size == max).collect();
        size_note = "largest list (no combination reaches 7776)";
    }
    // Rules 2 and 3: ratings. A combination without ratings does not qualify.
    eligible.retain(|r| {
        ratings
            .get(&key(r.s, r.r))
            .is_some_and(|x| x.known_pct >= 95.0 && x.grammar_words <= 2.0)
    });
    // Rule 4: smallest S, then smallest R.
    eligible.sort_by_key(|r| (r.s, r.r));
    eligible.first().map(|r| Selection {
        s: r.s,
        r: r.r,
        ratings_used: true,
        note: format!("Rules of PRD 7.6: {size_note}, known >= 95%, grammar words <= 2, smallest S then smallest R."),
    })
}

fn read_ratings(dir: &Path, code: &str) -> Result<Option<Ratings>> {
    let path = dir.join(format!("{code}-ratings.json"));
    if !path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path)?;
    Ok(Some(
        serde_json::from_str(&text).context(|| format!("bad {}", path.display()))?,
    ))
}

fn write_json(path: &Path, f: &BenchFile) -> Result<()> {
    let mut text = serde_json::to_string_pretty(f)?;
    text.push('\n');
    std::fs::write(path, text)?;
    Ok(())
}

fn lines(words: &[String]) -> String {
    let mut s = words.join("\n");
    s.push('\n');
    s
}

fn report(code: &str, sel: &Option<Selection>) {
    match sel {
        Some(s) => crate::log!("{code}: selected S = {}, R = {}. {}", s.s, s.r, s.note),
        None => crate::log!(
            "{code}: no combination meets the rules of PRD 7.6. The language does not ship in v1.0"
        ),
    }
}

/// Run the grid for one language and write the files.
fn run_language(root: &Path, code: &str, opts: &Options) -> Result<()> {
    let loaded = wordlists::load(root, code, opts)?;
    let ranked = pipeline::ranked_candidates(
        &loaded.params,
        &loaded.freq.iter().map(|(w, c)| (*w, c)).collect::<Vec<_>>(),
        &loaded.lexicon,
    );
    crate::log!("{code}: {} ranked candidates", ranked.len());
    let extras: HashSet<String> = loaded.extras.iter().cloned().collect();
    let out = root.join("benchmark");
    let sample_dir = out.join(code);
    std::fs::create_dir_all(&sample_dir)?;
    let max_r = *R_VALUES.last().expect("R_VALUES is not empty");
    let mut rows = Vec::new();
    for &s in &S_VALUES {
        for &r in &R_VALUES {
            let list = combination(&ranked, s, r, &loaded.blocklist, &extras);
            rows.push(Row {
                s,
                r,
                list_size: list.len(),
                avg_length: avg_length(&list),
            });
            let idx = sample_indices(list.len(), SAMPLE_SIZE, sample_seed(s, r));
            let sample: Vec<String> = idx.iter().map(|&i| list[i].clone()).collect();
            std::fs::write(
                sample_dir.join(format!("{}.sample.txt", key(s, r))),
                lines(&sample),
            )?;
            if r == max_r {
                let top: Vec<String> = list.iter().take(TOP_SIZE).cloned().collect();
                std::fs::write(sample_dir.join(format!("S{s}.top100.txt")), lines(&top))?;
            }
        }
    }
    let ratings = read_ratings(&out, code)?;
    let selection = select(&rows, ratings.as_ref());
    report(code, &selection);
    write_json(
        &out.join(format!("{code}.json")),
        &BenchFile {
            code: code.to_string(),
            rows,
            selection,
        },
    )
}

/// Run only the selection step from existing results and ratings.
fn select_language(root: &Path, code: &str) -> Result<()> {
    let out = root.join("benchmark");
    let path = out.join(format!("{code}.json"));
    let text = std::fs::read_to_string(&path).context(|| {
        format!("no benchmark results for {code}. Run `cargo xtask benchmark --lang {code}` first")
    })?;
    let mut file: BenchFile = serde_json::from_str(&text)?;
    let ratings = read_ratings(&out, code)?;
    file.selection = select(&file.rows, ratings.as_ref());
    report(code, &file.selection);
    write_json(&path, &file)
}

pub fn run(args: &[String]) -> Result<()> {
    let (only_select, rest) = match args.split_first() {
        Some((first, rest)) if first == "select" => (true, rest),
        _ => (false, args),
    };
    let opts = wordlists::parse_args(rest)?;
    if opts.update_hashes {
        bail!("benchmark does not accept --update-hashes. Use `wordlists` for that");
    }
    let root = wordlists::wordlists_dir(&opts);
    let langs = if opts.langs.is_empty() {
        wordlists::configured_languages(&root)?
    } else {
        opts.langs.clone()
    };
    if langs.is_empty() {
        bail!("no language has a config.toml in {}", root.display());
    }
    for code in &langs {
        if only_select {
            select_language(&root, code)?;
        } else {
            run_language(&root, code, &opts)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(s: usize, r: usize, size: usize) -> Row {
        Row {
            s,
            r,
            list_size: size,
            avg_length: 5.0,
        }
    }

    fn good() -> Rating {
        Rating {
            known_pct: 97.0,
            grammar_words: 1.0,
        }
    }

    #[test]
    fn sample_is_the_same_on_every_run_and_has_no_duplicates() {
        let a = sample_indices(5000, 200, 42);
        assert_eq!(a, sample_indices(5000, 200, 42));
        assert_eq!(a.len(), 200);
        let set: HashSet<_> = a.iter().collect();
        assert_eq!(set.len(), 200);
        assert!(a.iter().all(|&i| i < 5000));
        assert_ne!(a, sample_indices(5000, 200, 43));
    }

    #[test]
    fn sample_of_a_small_list_is_the_whole_list() {
        assert_eq!(sample_indices(5, 200, 1).len(), 5);
    }

    #[test]
    fn combination_uses_the_rank_window_and_removes_blocked_words() {
        let ranked: Vec<String> = (1..=10).map(|i| format!("w{i}")).collect();
        let block: HashSet<String> = ["w4".to_string()].into();
        let list = combination(&ranked, 2, 6, &block, &HashSet::new());
        assert_eq!(list, ["w3", "w5", "w6"]);
    }

    #[test]
    fn average_length_counts_characters() {
        assert_eq!(avg_length(&["abc".to_string(), "äbcde".to_string()]), 4.0);
        assert_eq!(avg_length(&[]), 0.0);
    }

    #[test]
    fn select_without_ratings_uses_the_proposed_values_and_says_so() {
        let rows = vec![row(1000, 30_000, 8000)];
        let sel = select(&rows, None).unwrap();
        assert_eq!((sel.s, sel.r), PROPOSED);
        assert!(!sel.ratings_used);
        assert!(sel.note.contains("No ratings file"));
    }

    #[test]
    fn select_takes_smallest_s_then_smallest_r_among_good_combinations() {
        let rows = vec![
            row(0, 20_000, 9000),
            row(0, 30_000, 9000),
            row(500, 20_000, 9000),
        ];
        let mut ratings = Ratings::new();
        ratings.insert(
            key(0, 20_000),
            Rating {
                known_pct: 90.0,
                grammar_words: 0.0,
            },
        );
        ratings.insert(key(0, 30_000), good());
        ratings.insert(key(500, 20_000), good());
        let sel = select(&rows, Some(&ratings)).unwrap();
        assert_eq!((sel.s, sel.r), (0, 30_000));
        assert!(sel.ratings_used);
    }

    #[test]
    fn select_rejects_too_many_grammar_words() {
        let rows = vec![row(0, 20_000, 9000)];
        let mut ratings = Ratings::new();
        ratings.insert(
            key(0, 20_000),
            Rating {
                known_pct: 99.0,
                grammar_words: 3.0,
            },
        );
        assert!(select(&rows, Some(&ratings)).is_none());
    }

    #[test]
    fn select_ignores_small_lists_when_a_big_one_exists() {
        let rows = vec![row(0, 20_000, 5000), row(2000, 50_000, 8000)];
        let mut ratings = Ratings::new();
        ratings.insert(key(0, 20_000), good());
        ratings.insert(key(2000, 50_000), good());
        let sel = select(&rows, Some(&ratings)).unwrap();
        assert_eq!((sel.s, sel.r), (2000, 50_000));
    }

    #[test]
    fn select_uses_the_largest_list_when_none_reaches_7776() {
        let rows = vec![
            row(0, 20_000, 5000),
            row(0, 30_000, 6000),
            row(0, 50_000, 6000),
        ];
        let mut ratings = Ratings::new();
        for r in &rows {
            ratings.insert(key(r.s, r.r), good());
        }
        let sel = select(&rows, Some(&ratings)).unwrap();
        assert_eq!((sel.s, sel.r), (0, 30_000));
        assert!(sel.note.contains("largest list"));
    }

    #[test]
    fn select_gives_none_when_every_list_is_below_4096() {
        let rows = vec![row(0, 20_000, 4000)];
        let mut ratings = Ratings::new();
        ratings.insert(key(0, 20_000), good());
        assert!(select(&rows, Some(&ratings)).is_none());
    }
}
