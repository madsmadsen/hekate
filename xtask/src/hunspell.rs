//! Expand a Hunspell dictionary (`.dic` and `.aff`) into a list of valid words.
//!
//! The expander knows these `.aff` keywords: `SET`, `FLAG`, `PFX`, `SFX` (with strip,
//! append, condition, cross product and continuation flags), `NEEDAFFIX`,
//! `PSEUDOROOT`, `ONLYINCOMPOUND`, `FORBIDDENWORD` and `NOSUGGEST`. It ignores `MAP`,
//! `REP`, `ICONV`, `OCONV`, compound rules and all other keywords.
//! Words with the flags `ONLYINCOMPOUND`, `FORBIDDENWORD` or `NOSUGGEST` are left out.
//! `NOSUGGEST` marks rude words in the SCOWL dictionaries.

use std::collections::{BTreeSet, HashMap};

use crate::bail;
use crate::util::Result;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum FlagMode {
    Char,
    Long,
    Num,
    Utf8,
}

type Flag = u32;

/// Called for each new word: the word, its continuation flags and the cross product mark.
type Emit<'a> = &'a mut dyn FnMut(Vec<char>, &[Flag], bool);

#[derive(Debug)]
struct Rule {
    strip: String,
    add: String,
    cond: Vec<CondItem>,
    cont: Vec<Flag>,
}

#[derive(Debug)]
struct CondItem {
    negate: bool,
    /// Empty means "any character".
    set: Vec<char>,
}

#[derive(Debug, Default)]
struct Affixes {
    rules: Vec<Rule>,
    cross: bool,
}

#[derive(Debug, Default)]
struct Aff {
    latin1: bool,
    mode: Option<FlagMode>,
    prefixes: HashMap<Flag, Affixes>,
    suffixes: HashMap<Flag, Affixes>,
    need_affix: Vec<Flag>,
    only_in_compound: Option<Flag>,
    forbidden: Option<Flag>,
    no_suggest: Option<Flag>,
}

fn parse_flags(text: &str, mode: FlagMode) -> Result<Vec<Flag>> {
    let mut out = Vec::new();
    match mode {
        FlagMode::Char | FlagMode::Utf8 => out.extend(text.chars().map(|c| c as u32)),
        FlagMode::Long => {
            let chars: Vec<char> = text.chars().collect();
            if !chars.len().is_multiple_of(2) {
                bail!("hunspell: long flags {text:?} need an even number of characters");
            }
            for pair in chars.chunks(2) {
                out.push((pair[0] as u32) << 16 | pair[1] as u32);
            }
        }
        FlagMode::Num => {
            for part in text.split(',').filter(|p| !p.is_empty()) {
                let Ok(n) = part.trim().parse::<u32>() else {
                    bail!("hunspell: bad numeric flag {part:?}");
                };
                out.push(n);
            }
        }
    }
    Ok(out)
}

fn parse_condition(text: &str) -> Vec<CondItem> {
    let mut items = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '.' => items.push(CondItem {
                negate: false,
                set: Vec::new(),
            }),
            '[' => {
                let mut j = i + 1;
                let negate = chars.get(j) == Some(&'^');
                if negate {
                    j += 1;
                }
                let mut set = Vec::new();
                while j < chars.len() && chars[j] != ']' {
                    set.push(chars[j]);
                    j += 1;
                }
                items.push(CondItem { negate, set });
                i = j;
            }
            c => items.push(CondItem {
                negate: false,
                set: vec![c],
            }),
        }
        i += 1;
    }
    items
}

fn cond_item_matches(item: &CondItem, c: char) -> bool {
    if item.set.is_empty() {
        return true;
    }
    item.set.contains(&c) != item.negate
}

fn matches_suffix(word: &[char], cond: &[CondItem]) -> bool {
    if word.len() < cond.len() {
        return false;
    }
    let tail = &word[word.len() - cond.len()..];
    cond.iter()
        .zip(tail)
        .all(|(item, c)| cond_item_matches(item, *c))
}

fn matches_prefix(word: &[char], cond: &[CondItem]) -> bool {
    if word.len() < cond.len() {
        return false;
    }
    cond.iter()
        .zip(word)
        .all(|(item, c)| cond_item_matches(item, *c))
}

fn decode(bytes: &[u8], latin1: bool) -> Result<String> {
    if latin1 {
        Ok(bytes.iter().map(|&b| b as char).collect())
    } else {
        Ok(String::from_utf8(bytes.to_vec())?)
    }
}

fn parse_aff(bytes: &[u8]) -> Result<Aff> {
    let mut aff = Aff::default();
    // Find SET first: it decides how to read the rest.
    for line in bytes.split(|&b| b == b'\n') {
        let line = String::from_utf8_lossy(line);
        let mut it = line.split_whitespace();
        if it.next() == Some("SET") {
            match it.next().map(|s| s.to_ascii_uppercase()).as_deref() {
                Some("UTF-8") | Some("UTF8") => {}
                Some("ISO8859-1") | Some("ISO-8859-1") | Some("LATIN1") => aff.latin1 = true,
                other => bail!("hunspell: unsupported SET {other:?}. Use UTF-8 or ISO8859-1"),
            }
            break;
        }
    }
    let text = decode(bytes, aff.latin1)?;
    // FLAG decides how to read flags: find it before the rules.
    for line in text.lines() {
        let mut it = line.split_whitespace();
        if it.next() == Some("FLAG") {
            aff.mode = Some(match it.next() {
                Some("long") => FlagMode::Long,
                Some("num") => FlagMode::Num,
                Some("UTF-8") => FlagMode::Utf8,
                other => bail!("hunspell: unsupported FLAG {other:?}"),
            });
            break;
        }
    }
    let mode = aff.mode.unwrap_or(FlagMode::Char);
    let single = |s: Option<&str>| -> Result<Option<Flag>> {
        Ok(match s {
            Some(s) => parse_flags(s, mode)?.first().copied(),
            None => None,
        })
    };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let tokens: Vec<&str> = line.split_whitespace().collect();
        match tokens[0] {
            "NEEDAFFIX" | "PSEUDOROOT" => {
                if let Some(f) = single(tokens.get(1).copied())? {
                    aff.need_affix.push(f);
                }
            }
            "ONLYINCOMPOUND" => aff.only_in_compound = single(tokens.get(1).copied())?,
            "FORBIDDENWORD" => aff.forbidden = single(tokens.get(1).copied())?,
            "NOSUGGEST" => aff.no_suggest = single(tokens.get(1).copied())?,
            kw @ ("PFX" | "SFX") => {
                if tokens.len() < 4 {
                    continue;
                }
                let flag = match parse_flags(tokens[1], mode)?.first() {
                    Some(f) => *f,
                    None => continue,
                };
                let table = if kw == "PFX" {
                    &mut aff.prefixes
                } else {
                    &mut aff.suffixes
                };
                let is_header = tokens.len() == 4
                    && matches!(tokens[2], "Y" | "N")
                    && tokens[3].parse::<usize>().is_ok();
                if is_header {
                    table.entry(flag).or_default().cross = tokens[2] == "Y";
                    continue;
                }
                let strip = if tokens[2] == "0" { "" } else { tokens[2] };
                let (add_text, cont_text) = match tokens[3].split_once('/') {
                    Some((a, c)) => (a, c),
                    None => (tokens[3], ""),
                };
                let add = if add_text == "0" { "" } else { add_text };
                let cond = parse_condition(tokens.get(4).copied().unwrap_or("."));
                table.entry(flag).or_default().rules.push(Rule {
                    strip: strip.to_string(),
                    add: add.to_string(),
                    cond,
                    cont: parse_flags(cont_text, mode)?,
                });
            }
            _ => {}
        }
    }
    Ok(aff)
}

/// Apply one suffix rule set to `word`. Call `emit(new_word, continuation_flags)`.
fn apply_suffixes(aff: &Aff, word: &[char], flags: &[Flag], emit: Emit<'_>) {
    for flag in flags {
        let Some(set) = aff.suffixes.get(flag) else {
            continue;
        };
        for rule in &set.rules {
            let strip: Vec<char> = rule.strip.chars().collect();
            if !word.ends_with(&strip) || !matches_suffix(word, &rule.cond) {
                continue;
            }
            let mut new: Vec<char> = word[..word.len() - strip.len()].to_vec();
            new.extend(rule.add.chars());
            emit(new, &rule.cont, set.cross);
        }
    }
}

fn apply_prefixes(aff: &Aff, word: &[char], flags: &[Flag], emit: Emit<'_>) {
    for flag in flags {
        let Some(set) = aff.prefixes.get(flag) else {
            continue;
        };
        for rule in &set.rules {
            let strip: Vec<char> = rule.strip.chars().collect();
            if !word.starts_with(&strip) || !matches_prefix(word, &rule.cond) {
                continue;
            }
            let mut new: Vec<char> = rule.add.chars().collect();
            new.extend_from_slice(&word[strip.len()..]);
            emit(new, &rule.cont, set.cross);
        }
    }
}

fn split_dic_line(line: &str) -> Option<(String, &str)> {
    let word_part = line.split([' ', '\t']).next().unwrap_or("");
    if word_part.is_empty() {
        return None;
    }
    // Find the first `/` that is not escaped.
    let mut word = String::new();
    let mut flags = "";
    let mut chars = word_part.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        match c {
            '\\' => {
                if let Some((_, n)) = chars.next() {
                    word.push(n);
                }
            }
            '/' => {
                flags = &word_part[i + 1..];
                break;
            }
            c => word.push(c),
        }
    }
    Some((word, flags))
}

/// Expand `dic` with the rules of `aff`. Return the valid surface words, sorted.
pub fn expand(dic: &[u8], aff: &[u8]) -> Result<Vec<String>> {
    let aff = parse_aff(aff)?;
    let mode = aff.mode.unwrap_or(FlagMode::Char);
    let dic_text = decode(dic, aff.latin1)?;
    let mut out: BTreeSet<String> = BTreeSet::new();
    let mut lines = dic_text.lines();
    // The first line is the number of entries.
    let first = lines.next().unwrap_or("");
    let mut pending = Vec::new();
    if first.trim().parse::<usize>().is_err() {
        pending.push(first);
    }
    for line in pending.into_iter().chain(lines) {
        if line.is_empty() || line.starts_with('\t') || line.starts_with('#') {
            continue;
        }
        let Some((word, flag_text)) = split_dic_line(line) else {
            continue;
        };
        let flags = parse_flags(flag_text, mode)?;
        let has = |f: Option<Flag>| f.is_some_and(|f| flags.contains(&f));
        if has(aff.only_in_compound) || has(aff.forbidden) || has(aff.no_suggest) {
            continue;
        }
        let need_affix = aff.need_affix.iter().any(|f| flags.contains(f));
        let stem: Vec<char> = word.chars().collect();
        if !need_affix {
            out.insert(word.clone());
        }
        let mut emit_word = |w: &[char], cont: &[Flag]| {
            let blocked = aff.need_affix.iter().any(|f| cont.contains(f))
                || aff.only_in_compound.is_some_and(|f| cont.contains(&f))
                || aff.forbidden.is_some_and(|f| cont.contains(&f))
                || aff.no_suggest.is_some_and(|f| cont.contains(&f));
            if !blocked {
                out.insert(w.iter().collect());
            }
        };
        // Suffixes, then prefixes (also on the suffixed word when both allow cross product).
        let mut suffixed: Vec<(Vec<char>, Vec<Flag>, bool)> = Vec::new();
        apply_suffixes(&aff, &stem, &flags, &mut |w, cont, cross| {
            suffixed.push((w, cont.to_vec(), cross));
        });
        // One more level: continuation flags of a suffix can name other suffixes.
        let mut level2 = Vec::new();
        for (w, cont, cross) in &suffixed {
            apply_suffixes(&aff, w, cont, &mut |w2, cont2, c2| {
                level2.push((w2, cont2.to_vec(), *cross && c2));
            });
        }
        suffixed.extend(level2);
        let mut prefixed: Vec<(Vec<char>, Vec<Flag>, bool)> = Vec::new();
        apply_prefixes(&aff, &stem, &flags, &mut |w, cont, cross| {
            prefixed.push((w, cont.to_vec(), cross));
        });
        let mut level2 = Vec::new();
        for (w, cont, _) in &prefixed {
            apply_prefixes(&aff, w, cont, &mut |w2, cont2, c2| {
                level2.push((w2, cont2.to_vec(), c2));
            });
        }
        prefixed.extend(level2);
        for (w, cont, _) in &suffixed {
            emit_word(w, cont);
        }
        for (w, cont, _) in &prefixed {
            emit_word(w, cont);
        }
        // Cross product: a prefix on top of a suffixed word.
        for (w, _, cross) in &suffixed {
            if !*cross {
                continue;
            }
            // Only the prefix flags of the original entry count here.
            apply_prefixes(&aff, w, &flags, &mut |w2, cont2, pcross| {
                if pcross {
                    emit_word(&w2, cont2);
                }
            });
        }
    }
    Ok(out.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const AFF: &str = "SET UTF-8\n\
        NEEDAFFIX n\n\
        NOSUGGEST !\n\
        PFX A Y 1\n\
        PFX A 0 re .\n\
        PFX B N 1\n\
        PFX B 0 un .\n\
        SFX D Y 3\n\
        SFX D 0 d e\n\
        SFX D y ied [^aeiou]y\n\
        SFX D 0 ed [^ey]\n\
        SFX G Y 2\n\
        SFX G e ing e\n\
        SFX G 0 ing [^e]\n";

    fn words(dic: &str) -> Vec<String> {
        expand(dic.as_bytes(), AFF.as_bytes()).unwrap()
    }

    #[test]
    fn suffix_conditions_and_strip_work() {
        let w = words("3\nlove/DG\ncry/D\nwalk/DG\n");
        for expected in ["loved", "loving", "cried", "walked", "walking"] {
            assert!(
                w.contains(&expected.to_string()),
                "missing {expected}: {w:?}"
            );
        }
        assert!(!w.contains(&"lovered".to_string()));
        assert!(!w.contains(&"cryed".to_string()));
    }

    #[test]
    fn cross_product_applies_prefix_to_suffixed_words() {
        let w = words("1\nwalk/ADG\n");
        assert!(w.contains(&"rewalk".to_string()));
        assert!(w.contains(&"rewalked".to_string()));
        assert!(w.contains(&"rewalking".to_string()));
    }

    #[test]
    fn prefix_without_cross_product_stays_on_the_stem() {
        let w = words("1\nwalk/BD\n");
        assert!(w.contains(&"unwalk".to_string()));
        assert!(!w.contains(&"unwalked".to_string()));
    }

    #[test]
    fn nosuggest_and_needaffix_words_are_left_out() {
        let w = words("3\nrude/!\nstem/nD\nplain\n");
        assert!(!w.contains(&"rude".to_string()));
        assert!(!w.contains(&"stem".to_string()));
        assert!(w.contains(&"stemed".to_string()));
        assert!(w.contains(&"plain".to_string()));
    }

    #[test]
    fn morphological_fields_and_escaped_slash_are_handled() {
        let w = words("2\nword po:noun\na\\/b/D\n");
        assert!(w.contains(&"word".to_string()));
        assert!(w.contains(&"a/b".to_string()));
    }

    #[test]
    fn long_and_numeric_flags_work() {
        let aff_long = "FLAG long\nSFX Zz Y 1\nSFX Zz 0 s .\n";
        let w = expand(b"1\ncat/Zz\n", aff_long.as_bytes()).unwrap();
        assert_eq!(w, ["cat", "cats"]);
        let aff_num = "FLAG num\nSFX 101 Y 1\nSFX 101 0 s .\n";
        let w = expand(b"1\ncat/101\n", aff_num.as_bytes()).unwrap();
        assert_eq!(w, ["cat", "cats"]);
    }

    #[test]
    fn unsupported_encoding_is_an_error() {
        assert!(expand(b"1\na\n", b"SET ISO8859-2\n").is_err());
    }
}
