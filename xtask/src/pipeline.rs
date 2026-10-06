//! The filter steps of PRD 7.3 (steps 6 to 16) as small pure functions.
//! They work on data in memory, so the unit tests need no network.

use std::collections::{BTreeMap, HashMap, HashSet};

use unicode_normalization::UnicodeNormalization;

use crate::bail;
use crate::config::{AsciiConfig, Config, LexiconCase};
use crate::count::Counts;
use crate::util::{Error, Result};

/// A set of allowed characters, written like the inside of `[...]` in a regex.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharClass {
    ranges: Vec<(char, char)>,
}

impl CharClass {
    /// Parse `a-zäö`. `a-z` is a range. `\-` and `\\` are plain characters.
    pub fn parse(text: &str) -> Result<Self> {
        let chars: Vec<char> = text.chars().collect();
        let mut ranges = Vec::new();
        let mut i = 0;
        let read = |i: &mut usize| -> Option<(char, bool)> {
            let c = *chars.get(*i)?;
            *i += 1;
            if c == '\\' {
                let n = *chars.get(*i)?;
                *i += 1;
                Some((n, true))
            } else {
                Some((c, false))
            }
        };
        while i < chars.len() {
            let Some((lo, _)) = read(&mut i) else {
                bail!("alphabet ends with a lone backslash");
            };
            if chars.get(i) == Some(&'-') && i + 1 < chars.len() {
                i += 1;
                let Some((hi, _)) = read(&mut i) else {
                    bail!("alphabet ends with a lone backslash");
                };
                if hi < lo {
                    bail!("alphabet range {lo}-{hi} is backwards");
                }
                ranges.push((lo, hi));
            } else {
                ranges.push((lo, lo));
            }
        }
        if ranges.is_empty() {
            bail!("alphabet is empty");
        }
        Ok(CharClass { ranges })
    }

    pub fn contains(&self, c: char) -> bool {
        self.ranges.iter().any(|&(lo, hi)| lo <= c && c <= hi)
    }
}

/// Rules to turn a word into ASCII (PRD 7.4, table 7.1).
#[derive(Debug, Clone, Default)]
pub struct AsciiRules {
    pub strip_accents: bool,
    pub map: HashMap<char, String>,
}

impl AsciiRules {
    pub fn from_config(cfg: &AsciiConfig) -> Result<Self> {
        let mut map = HashMap::new();
        for (k, v) in &cfg.map {
            let mut it = k.chars();
            let (Some(c), None) = (it.next(), it.next()) else {
                bail!("ascii.map key {k:?} must be one character");
            };
            if !v.is_ascii() {
                bail!("ascii.map value {v:?} for {k:?} must be ASCII");
            }
            map.insert(c, v.clone());
        }
        Ok(AsciiRules {
            strip_accents: cfg.strip_accents,
            map,
        })
    }

    /// Convert one word. The explicit map goes first. Then accents come off.
    /// The result can still hold non-ASCII characters.
    pub fn convert(&self, word: &str) -> String {
        let mut mapped = String::with_capacity(word.len());
        for c in word.chars() {
            match self.map.get(&c) {
                Some(r) => mapped.push_str(r),
                None => mapped.push(c),
            }
        }
        if self.strip_accents && !mapped.is_ascii() {
            mapped
                .nfd()
                .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
                .collect()
        } else {
            mapped
        }
    }
}

/// The settings of the filter steps.
#[derive(Debug, Clone)]
pub struct Params {
    pub s: usize,
    pub r: usize,
    pub n: usize,
    pub min_len: usize,
    pub max_len: usize,
    pub alphabet: CharClass,
    pub min_words: usize,
    pub ascii: AsciiRules,
}

impl Params {
    pub fn from_config(cfg: &Config) -> Result<Self> {
        Ok(Params {
            s: cfg.s,
            r: cfg.r,
            n: cfg.n,
            min_len: cfg.min_len,
            max_len: cfg.max_len,
            alphabet: CharClass::parse(&cfg.alphabet)?,
            min_words: cfg.min_words(),
            ascii: AsciiRules::from_config(&cfg.ascii)?,
        })
    }
}

/// A word and its merged relative frequency (fixed point, so sums are exact).
pub type Scored = (String, u128);

const SCALE: u128 = 1_000_000_000_000_000_000;

/// Merge frequency sources. Each source gives `weight * count / total`. The sources add up.
/// Step 4 and 5 of the PRD produce the counts. This is the "sum of relative frequency" rule.
pub fn merge_frequencies(sources: &[(u64, &Counts)]) -> Vec<Scored> {
    let mut map: HashMap<&str, u128> = HashMap::new();
    for (weight, counts) in sources {
        if counts.total == 0 {
            continue;
        }
        for (w, &n) in &counts.words {
            let rel = u128::from(n) * SCALE / u128::from(counts.total);
            *map.entry(w.as_str()).or_insert(0) += rel * u128::from(*weight);
        }
    }
    map.into_iter().map(|(w, s)| (w.to_string(), s)).collect()
}

/// Step 6: convert words to NFC. Words that become equal add their scores.
pub fn nfc_merge(items: Vec<Scored>) -> Vec<Scored> {
    let mut map: HashMap<String, u128> = HashMap::with_capacity(items.len());
    for (w, s) in items {
        let w = if w.is_ascii() { w } else { w.nfc().collect() };
        *map.entry(w).or_insert(0) += s;
    }
    map.into_iter().collect()
}

/// Step 7: keep words that use only the allowed characters, are lowercase and have the right length.
pub fn filter_script_length(items: Vec<Scored>, p: &Params) -> Vec<Scored> {
    items
        .into_iter()
        .filter(|(w, _)| word_is_valid(w, p))
        .collect()
}

/// Rules 3 of PRD 7.1: lowercase, normal script, length limits.
pub fn word_is_valid(w: &str, p: &Params) -> bool {
    let len = w.chars().count();
    len >= p.min_len
        && len <= p.max_len
        && w.chars().all(|c| p.alphabet.contains(c))
        && w.to_lowercase() == w
}

/// Step 8: keep words that are in the lexicon.
pub fn filter_lexicon(items: Vec<Scored>, lexicon: &HashSet<String>) -> Vec<Scored> {
    items
        .into_iter()
        .filter(|(w, _)| lexicon.contains(w))
        .collect()
}

/// Prepare the lexicon: NFC words, lowercased when `lexicon_case` is `fold`.
pub fn prepare_lexicon(words: &[Vec<String>], case: LexiconCase) -> HashSet<String> {
    let mut set = HashSet::new();
    for list in words {
        for w in list {
            let w: String = w.nfc().collect();
            match case {
                LexiconCase::Exact => {
                    set.insert(w);
                }
                LexiconCase::Fold => {
                    set.insert(w.to_lowercase().nfc().collect());
                }
            }
        }
    }
    set
}

/// Sort by score, most common first. Words with equal scores go in byte order.
pub fn rank(mut items: Vec<Scored>) -> Vec<String> {
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.into_iter().map(|(w, _)| w).collect()
}

/// Steps 6 to 8 and the sort: the ranked candidates. Rank 1 is index 0.
pub fn ranked_candidates(
    p: &Params,
    freq: &[(u64, &Counts)],
    lexicon: &HashSet<String>,
) -> Vec<String> {
    let items = nfc_merge(merge_frequencies(freq));
    let items = filter_script_length(items, p);
    let items = filter_lexicon(items, lexicon);
    rank(items)
}

/// Step 9: the words from rank `s + 1` to rank `r`.
pub fn rank_window(ranked: &[String], s: usize, r: usize) -> &[String] {
    let end = r.min(ranked.len());
    let start = s.min(end);
    &ranked[start..end]
}

/// Steps 10 and 11: remove blocked words, remove duplicates, and remove words
/// that the extra list adds anyway.
pub fn remove_blocked_and_duplicates(
    window: &[String],
    blocklist: &HashSet<String>,
    extras: &HashSet<String>,
) -> Vec<String> {
    let mut seen: HashSet<&str> = HashSet::new();
    window
        .iter()
        .filter(|w| !blocklist.contains(*w) && !extras.contains(*w) && seen.insert(w.as_str()))
        .cloned()
        .collect()
}

/// Read a line list (blocklist or extra words): NFC, skip blank and `#` lines.
pub fn parse_word_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.nfc().collect())
        .collect()
}

pub struct Inputs<'a> {
    pub freq: Vec<(u64, &'a Counts)>,
    pub lexicon: HashSet<String>,
    pub blocklist: HashSet<String>,
    pub extras: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Built {
    pub words: Vec<String>,
    pub ascii: Vec<String>,
    pub ascii_same: bool,
}

/// Steps 12 to 15: take the words and add the extra words.
pub fn assemble(
    p: &Params,
    available: Vec<String>,
    extras: &[String],
    blocklist: &HashSet<String>,
) -> Result<Vec<String>> {
    let e = extras.len();
    if e * 10 > p.n {
        bail!(
            "the extra word list has {e} words. That is more than 10% of n = {}",
            p.n
        );
    }
    let mut seen = HashSet::new();
    for w in extras {
        if !word_is_valid(w, p) {
            bail!("extra word {w:?} breaks the alphabet, case or length rules");
        }
        if blocklist.contains(w) {
            bail!("extra word {w:?} is also in the block list");
        }
        if !seen.insert(w.as_str()) {
            bail!("extra word {w:?} is listed twice");
        }
    }
    let take = p.n - e;
    if available.len() < take {
        bail!(
            "only {} words are left between rank {} and rank {}. The list needs {take}. \
             Change s, r or n, or add sources",
            available.len(),
            p.s,
            p.r
        );
    }
    let mut words: Vec<String> = available.into_iter().take(take).collect();
    words.extend(extras.iter().cloned());
    if words.len() != p.n {
        bail!(
            "the list has {} words, not exactly n = {}",
            words.len(),
            p.n
        );
    }
    if p.n < p.min_words {
        bail!("n = {} is below the minimum of {} words", p.n, p.min_words);
    }
    Ok(words)
}

/// Step 16: the ASCII list (PRD 7.4).
pub fn ascii_list(p: &Params, words: &[String]) -> Result<(Vec<String>, bool)> {
    if words.iter().all(|w| w.is_ascii()) {
        return Ok((words.to_vec(), true));
    }
    let mut converted: Vec<String> = Vec::new();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for w in words {
        let c = p.ascii.convert(w);
        let len = c.chars().count();
        if !c.is_ascii() || len < p.min_len || len > p.max_len {
            continue;
        }
        *counts.entry(c.clone()).or_insert(0) += 1;
        converted.push(c);
    }
    // If two words become the same, remove both.
    let out: Vec<String> = converted.into_iter().filter(|c| counts[c] == 1).collect();
    if out.len() < p.min_words {
        bail!(
            "the ASCII list has only {} words. It needs at least {}. Check the ascii rules",
            out.len(),
            p.min_words
        );
    }
    Ok((out, false))
}

/// Run all steps for one language, from counted sources to the two lists.
pub fn build_list(p: &Params, inputs: &Inputs) -> Result<Built> {
    let ranked = ranked_candidates(p, &inputs.freq, &inputs.lexicon);
    crate::log!(
        "{} candidates after script, length and lexicon filters",
        ranked.len()
    );
    let extras: HashSet<String> = inputs.extras.iter().cloned().collect();
    let window = rank_window(&ranked, p.s, p.r);
    let available = remove_blocked_and_duplicates(window, &inputs.blocklist, &extras);
    let words = assemble(p, available, &inputs.extras, &inputs.blocklist)?;
    let (ascii, ascii_same) = ascii_list(p, &words)?;
    Ok(Built {
        words,
        ascii,
        ascii_same,
    })
}

/// Entropy of one word drawn at random from a list of `n` words, in bits.
pub fn entropy_per_word(n: usize) -> f64 {
    (n as f64).log2()
}

/// Make an error that names the language.
pub fn lang_err(code: &str, e: Error) -> Error {
    Error(format!("{code}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> Params {
        Params {
            s: 0,
            r: 1000,
            n: 4,
            min_len: 3,
            max_len: 9,
            alphabet: CharClass::parse("a-zäöüß").unwrap(),
            min_words: 2,
            ascii: AsciiRules::from_config(&AsciiConfig {
                strip_accents: true,
                map: [("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")]
                    .into_iter()
                    .map(|(a, b)| (a.to_string(), b.to_string()))
                    .collect(),
            })
            .unwrap(),
        }
    }

    fn scored(words: &[&str]) -> Vec<Scored> {
        words
            .iter()
            .enumerate()
            .map(|(i, w)| (w.to_string(), 1000 - i as u128))
            .collect()
    }

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn fr_1_char_class_parses_ranges_literals_and_escapes() {
        let c = CharClass::parse("a-cx\\-").unwrap();
        assert!(c.contains('a') && c.contains('b') && c.contains('c'));
        assert!(c.contains('x') && c.contains('-'));
        assert!(!c.contains('d') && !c.contains('y'));
        assert!(CharClass::parse("").is_err());
        assert!(CharClass::parse("z-a").is_err());
    }

    #[test]
    fn fr_1_nfc_step_joins_equal_words_and_adds_scores() {
        let items = vec![("cafe\u{301}".to_string(), 5), ("caf\u{e9}".to_string(), 7)];
        let out = nfc_merge(items);
        assert_eq!(out, vec![("caf\u{e9}".to_string(), 12)]);
    }

    #[test]
    fn nfr_6_list_words_are_in_nfc_form() {
        let p = Params {
            alphabet: CharClass::parse("a-zé\u{301}").unwrap(),
            ..params()
        };
        let items = nfc_merge(vec![("cafe\u{301}".to_string(), 1)]);
        let items = filter_script_length(items, &p);
        assert_eq!(items[0].0, "caf\u{e9}");
        assert!(items.iter().all(|(w, _)| w.nfc().collect::<String>() == *w));
    }

    #[test]
    fn fr_1_length_step_keeps_only_3_to_9_characters() {
        let p = params();
        let items = scored(&["ab", "abc", "abcdefghi", "abcdefghij"]);
        let out: Vec<String> = filter_script_length(items, &p)
            .into_iter()
            .map(|x| x.0)
            .collect();
        assert_eq!(out, ["abc", "abcdefghi"]);
    }

    #[test]
    fn fr_1_script_step_drops_digits_capitals_and_foreign_letters() {
        let p = params();
        let items = scored(&["abc", "ab1", "Abc", "abç", "a-b", "äöü"]);
        let out: Vec<String> = filter_script_length(items, &p)
            .into_iter()
            .map(|x| x.0)
            .collect();
        assert_eq!(out, ["abc", "äöü"]);
    }

    #[test]
    fn fr_1_lexicon_step_drops_words_that_are_not_in_the_lexicon() {
        let lex = prepare_lexicon(&[strings(&["abc", "Paris"])], LexiconCase::Exact);
        let out: Vec<String> = filter_lexicon(scored(&["abc", "xyz", "paris"]), &lex)
            .into_iter()
            .map(|x| x.0)
            .collect();
        assert_eq!(out, ["abc"]);
    }

    #[test]
    fn fr_1_lexicon_fold_lowercases_capital_nouns() {
        let lex = prepare_lexicon(&[strings(&["Haus"])], LexiconCase::Fold);
        assert!(lex.contains("haus"));
        let exact = prepare_lexicon(&[strings(&["Haus"])], LexiconCase::Exact);
        assert!(!exact.contains("haus"));
    }

    #[test]
    fn fr_1_frequency_sources_add_relative_frequency() {
        let mut a = Counts::default();
        a.add("one", 90);
        a.add("two", 10);
        let mut b = Counts::default();
        b.add("two", 5);
        b.add("three", 95);
        let merged = rank(merge_frequencies(&[(1, &a), (1, &b)]));
        // one = 0.90, two = 0.10 + 0.05 = 0.15, three = 0.95
        assert_eq!(merged, ["three", "one", "two"]);
        let weighted = rank(merge_frequencies(&[(3, &a), (1, &b)]));
        assert_eq!(weighted, ["one", "three", "two"]);
    }

    #[test]
    fn fr_1_ranking_breaks_ties_in_byte_order() {
        let out = rank(vec![("b".into(), 1), ("a".into(), 1), ("c".into(), 2)]);
        assert_eq!(out, ["c", "a", "b"]);
    }

    #[test]
    fn fr_1_sr_window_skips_top_s_and_stops_at_r() {
        let ranked: Vec<String> = (1..=10).map(|i| format!("w{i}")).collect();
        assert_eq!(rank_window(&ranked, 2, 5), ["w3", "w4", "w5"]);
        assert_eq!(rank_window(&ranked, 0, 3), ["w1", "w2", "w3"]);
        assert_eq!(rank_window(&ranked, 8, 100), ["w9", "w10"]);
        assert!(rank_window(&ranked, 50, 100).is_empty());
    }

    #[test]
    fn fr_1_block_list_and_duplicates_are_removed_after_the_window() {
        let window = strings(&["aaa", "bad", "bbb", "aaa", "ccc", "extra"]);
        let block: HashSet<String> = ["bad".to_string()].into();
        let extras: HashSet<String> = ["extra".to_string()].into();
        assert_eq!(
            remove_blocked_and_duplicates(&window, &block, &extras),
            ["aaa", "bbb", "ccc"]
        );
    }

    #[test]
    fn fr_1_too_few_words_in_the_window_is_an_error() {
        let p = Params { n: 5, ..params() };
        let err = assemble(&p, strings(&["aaa", "bbb"]), &[], &HashSet::new());
        assert!(err.unwrap_err().0.contains("only 2 words"));
    }

    #[test]
    fn fr_1_extra_words_over_10_percent_is_an_error() {
        let p = Params { n: 20, ..params() };
        let extras = strings(&["aaa", "bbb", "ccc"]);
        let err = assemble(&p, strings(&["ddd"; 30]), &extras, &HashSet::new()).unwrap_err();
        assert!(err.0.contains("10%"), "{err}");
    }

    #[test]
    fn fr_1_extra_words_exactly_10_percent_are_added_at_the_end() {
        let p = Params { n: 20, ..params() };
        let extras = strings(&["xxa", "xxb"]);
        let avail: Vec<String> = (0..30)
            .map(|i| format!("w{}", (b'a' + i as u8 % 26) as char))
            .collect();
        let avail: Vec<String> = avail
            .into_iter()
            .enumerate()
            .map(|(i, w)| format!("{w}{i}"))
            .collect();
        let p = Params {
            alphabet: CharClass::parse("a-z0-9").unwrap(),
            ..p
        };
        let words = assemble(&p, avail, &extras, &HashSet::new()).unwrap();
        assert_eq!(words.len(), 20);
        assert_eq!(&words[18..], ["xxa", "xxb"]);
    }

    #[test]
    fn fr_1_extra_words_follow_the_content_rules() {
        let p = Params { n: 20, ..params() };
        let bad_len = assemble(
            &p,
            strings(&["ddd"; 30]),
            &strings(&["ab"]),
            &HashSet::new(),
        );
        assert!(bad_len.is_err());
        let blocked: HashSet<String> = ["aaa".to_string()].into();
        assert!(assemble(&p, strings(&["ddd"; 30]), &strings(&["aaa"]), &blocked).is_err());
        assert!(
            assemble(
                &p,
                strings(&["ddd"; 30]),
                &strings(&["aaa", "aaa"]),
                &HashSet::new()
            )
            .is_err()
        );
    }

    #[test]
    fn fr_1_list_below_the_minimum_size_is_an_error() {
        let p = Params {
            n: 4,
            min_words: 5,
            ..params()
        };
        let err = assemble(
            &p,
            strings(&["aaa", "bbb", "ccc", "ddd"]),
            &[],
            &HashSet::new(),
        );
        assert!(err.unwrap_err().0.contains("below the minimum"));
    }

    #[test]
    fn fr_10_ascii_conversion_uses_the_language_rules() {
        let p = params();
        assert_eq!(p.ascii.convert("über"), "ueber");
        assert_eq!(p.ascii.convert("straße"), "strasse");
        assert_eq!(p.ascii.convert("café"), "cafe");
    }

    #[test]
    fn fr_10_ascii_collision_removes_both() {
        let p = Params {
            min_words: 1,
            ..params()
        };
        // "cafe" is ASCII already. "café" becomes "cafe". Both go.
        let words = strings(&["cafe", "café", "tree"]);
        let (ascii, same) = ascii_list(&p, &words).unwrap();
        assert_eq!(ascii, ["tree"]);
        assert!(!same);
    }

    #[test]
    fn fr_10_ascii_leftover_non_ascii_words_are_dropped() {
        let p = Params {
            min_words: 1,
            ..params()
        };
        let words = strings(&["tree", "naïve", "ça\u{3b1}"]);
        let mut rules = p.ascii.clone();
        rules.strip_accents = false;
        let p2 = Params { ascii: rules, ..p };
        let (ascii, _) = ascii_list(&p2, &words).unwrap();
        assert_eq!(ascii, ["tree"]);
    }

    #[test]
    fn fr_10_ascii_same_when_all_words_are_ascii() {
        let p = Params {
            min_words: 1,
            ..params()
        };
        let words = strings(&["tree", "moon"]);
        let (ascii, same) = ascii_list(&p, &words).unwrap();
        assert_eq!(ascii, words);
        assert!(same);
    }

    #[test]
    fn fr_10_ascii_list_needs_the_minimum_size() {
        let p = Params {
            min_words: 4,
            ..params()
        };
        let words = strings(&["tree", "moon", "café"]);
        let err = ascii_list(&p, &words).unwrap_err();
        assert!(err.0.contains("only 3 words"), "{err}");
    }

    #[test]
    fn fr_10_ascii_words_longer_than_the_limit_after_conversion_are_dropped() {
        let p = Params {
            min_words: 1,
            max_len: 9,
            ..params()
        };
        let words = strings(&["tree", "grüßeabcd"]);
        let p = Params {
            alphabet: CharClass::parse("a-zäöüß").unwrap(),
            ..p
        };
        let (ascii, _) = ascii_list(&p, &words).unwrap();
        assert_eq!(ascii, ["tree"]);
    }

    #[test]
    fn nfr_10_build_list_is_deterministic() {
        let mut counts = Counts::default();
        for (i, w) in ["alpha", "bravo", "delta", "gamma", "omega", "sigma"]
            .iter()
            .enumerate()
        {
            counts.add(w, 100 - i as u64);
        }
        let lex = prepare_lexicon(
            &[strings(&[
                "alpha", "bravo", "delta", "gamma", "omega", "sigma",
            ])],
            LexiconCase::Exact,
        );
        let p = Params {
            n: 4,
            s: 1,
            r: 6,
            min_words: 4,
            ..params()
        };
        let inputs = Inputs {
            freq: vec![(1, &counts)],
            lexicon: lex,
            blocklist: HashSet::new(),
            extras: vec![],
        };
        let a = build_list(&p, &inputs).unwrap();
        for _ in 0..5 {
            assert_eq!(build_list(&p, &inputs).unwrap(), a);
        }
        // s = 1 skips "alpha". r = 6 allows up to rank 6.
        assert_eq!(a.words, ["bravo", "delta", "gamma", "omega"]);
    }
}
