use std::collections::BTreeMap;

use rand_core::RngCore;

use crate::sample::uniform_below;
use crate::{Error, Generated};

/// The 16 symbols (FR-7).
pub const SYMBOLS: [char; 16] = [
    '!', '#', '$', '%', '&', '*', '+', '-', '=', '?', '@', '^', '_', '~', ':', ';',
];

const LOWER: &str = "abcdefghijklmnopqrstuvwxyz";
const UPPER: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &str = "0123456789";
// Without the look-alike characters 0 O 1 l I (FR-64).
const LOWER_CLEAR: &str = "abcdefghijkmnopqrstuvwxyz";
const UPPER_CLEAR: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS_CLEAR: &str = "23456789";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CharOptions {
    pub length: usize,
    pub lower: bool,
    pub upper: bool,
    pub digits: bool,
    pub symbols: bool,
    pub avoid_similar: bool,
    /// No same character twice in a row, case ignored (FR-66).
    pub no_repeat: bool,
}

impl Default for CharOptions {
    fn default() -> Self {
        Self {
            length: 20,
            lower: true,
            upper: true,
            digits: true,
            symbols: true,
            avoid_similar: false,
            no_repeat: false,
        }
    }
}

struct Set {
    chars: Vec<char>,
    kind: char,
}

fn selected_sets(o: &CharOptions) -> Vec<Set> {
    let pick = |on: bool, normal: &str, clear: &str, kind: char| {
        on.then(|| Set {
            chars: if o.avoid_similar { clear } else { normal }
                .chars()
                .collect(),
            kind,
        })
    };
    [
        pick(o.lower, LOWER, LOWER_CLEAR, 'l'),
        pick(o.upper, UPPER, UPPER_CLEAR, 'u'),
        pick(o.digits, DIGITS, DIGITS_CLEAR, 'd'),
        o.symbols.then(|| Set {
            chars: SYMBOLS.to_vec(),
            kind: 'y',
        }),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// Make a character password (FR-60 to FR-66).
///
/// The password must contain a character from each selected set. Hekate
/// draws a new password until this is true. It never edits single
/// characters, because that would add bias (FR-63).
pub fn generate_characters<R: RngCore + ?Sized>(
    rng: &mut R,
    opts: &CharOptions,
) -> Result<Generated, Error> {
    if !(8..=64).contains(&opts.length) {
        return Err(Error::Length);
    }
    let sets = selected_sets(opts);
    if sets.is_empty() {
        return Err(Error::NoCharset);
    }
    let picked = pick(rng, &sets, opts.length, opts.no_repeat);
    Ok(Generated::new(
        picked.iter().map(|&(c, _)| c).collect(),
        picked.iter().map(|&(_, k)| k).collect(),
        char_entropy(opts),
    ))
}

/// Pick `length` characters, each as (character, kind letter).
///
/// With `no_repeat`, two neighbors never have the same case group (FR-66).
/// The sets must have at least two case groups.
fn pick<R: RngCore + ?Sized>(
    rng: &mut R,
    sets: &[Set],
    length: usize,
    no_repeat: bool,
) -> Vec<(char, char)> {
    let all: Vec<(char, char)> = sets
        .iter()
        .flat_map(|s| s.chars.iter().map(|&c| (c, s.kind)))
        .collect();
    // The size of the case group of each character.
    let group_size: Vec<usize> = all
        .iter()
        .map(|&(c, _)| {
            all.iter()
                .filter(|&&(d, _)| d.eq_ignore_ascii_case(&c))
                .count()
        })
        .collect();
    let smallest = group_size.iter().copied().min().unwrap_or(0);

    loop {
        let picked = if no_repeat {
            match pick_no_repeat(rng, &all, &group_size, smallest, length) {
                Some(picked) => picked,
                None => continue,
            }
        } else {
            (0..length)
                .map(|_| all[uniform_below(rng, all.len() as u32) as usize])
                .collect()
        };
        if sets
            .iter()
            .all(|s| picked.iter().any(|&(_, kind)| kind == s.kind))
        {
            return picked;
        }
    }
}

/// One try of a password without a repeat. Returns `None` if the try is rejected.
///
/// Every next character has a chance of exactly `1 / (C - smallest)`, where
/// `C` is the number of characters and `smallest` is the smallest case group.
/// A try is rejected if the draw is beyond the characters that can follow.
/// So every valid password has the same chance `1 / (C * (C - smallest)^(L - 1))` (SR-2).
fn pick_no_repeat<R: RngCore + ?Sized>(
    rng: &mut R,
    all: &[(char, char)],
    group_size: &[usize],
    smallest: usize,
    length: usize,
) -> Option<Vec<(char, char)>> {
    let total = all.len();
    let mut previous = uniform_below(rng, total as u32) as usize;
    let mut picked = Vec::with_capacity(length);
    picked.push(all[previous]);
    for _ in 1..length {
        let allowed = total - group_size[previous];
        let draw = uniform_below(rng, (total - smallest) as u32) as usize;
        if draw >= allowed {
            return None;
        }
        previous = (0..total)
            .filter(|&i| !all[i].0.eq_ignore_ascii_case(&all[previous].0))
            .nth(draw)
            .expect("the draw is below the number of allowed characters");
        picked.push(all[previous]);
    }
    Some(picked)
}

/// Entropy of a character password in bits (Appendix A.2).
///
/// Counts the valid passwords with the inclusion-exclusion rule.
pub(crate) fn char_entropy(opts: &CharOptions) -> f64 {
    let sets = selected_sets(opts);
    if opts.no_repeat {
        let sets: Vec<Vec<char>> = sets.into_iter().map(|s| s.chars).collect();
        no_repeat_entropy(&sets, opts.length)
    } else {
        let sizes: Vec<usize> = sets.iter().map(|s| s.chars.len()).collect();
        set_entropy(&sizes, opts.length)
    }
}

/// The sum over all subsets `T` of `(-1)^|T| * term(T)`. `T` is a bit mask of sets.
fn inclusion_exclusion(sets: usize, term: impl Fn(u32) -> f64) -> f64 {
    let mut valid = 0f64;
    for mask in 0u32..(1 << sets) {
        if mask.count_ones() % 2 == 0 {
            valid += term(mask);
        } else {
            valid -= term(mask);
        }
    }
    valid
}

fn set_entropy(sizes: &[usize], length: usize) -> f64 {
    let total: usize = sizes.iter().sum();
    inclusion_exclusion(sizes.len(), |mask| {
        let removed: usize = (0..sizes.len())
            .filter(|i| mask & (1 << i) != 0)
            .map(|i| sizes[i])
            .sum();
        ((total - removed) as f64).powi(length as i32)
    })
    .log2()
}

/// Entropy with no-repeat on (Appendix A.2): each term counts the passwords
/// of the left-over characters with no repeat.
fn no_repeat_entropy(sets: &[Vec<char>], length: usize) -> f64 {
    inclusion_exclusion(sets.len(), |mask| {
        let left: Vec<char> = sets
            .iter()
            .enumerate()
            .filter(|(i, _)| mask & (1 << i) == 0)
            .flat_map(|(_, chars)| chars.iter().copied())
            .collect();
        no_repeat_count(&left, length)
    })
    .log2()
}

/// The number of strings of `length` characters from `alphabet` in which no
/// two neighbors are in the same case group (Appendix A.2).
///
/// `e_1(j) = s_j`, where `s_j` is the size of group `j`.
/// `e_{n+1}(j) = s_j * (T_n - e_n(j))`, and `T_n` is the sum of `e_n`.
/// The result is `T_length`.
fn no_repeat_count(alphabet: &[char], length: usize) -> f64 {
    let mut groups: BTreeMap<char, f64> = BTreeMap::new();
    for c in alphabet {
        *groups.entry(c.to_ascii_lowercase()).or_insert(0.0) += 1.0;
    }
    let sizes: Vec<f64> = groups.into_values().collect();
    let mut e = sizes.clone();
    for _ in 1..length {
        let total: f64 = e.iter().sum();
        e = sizes
            .iter()
            .zip(&e)
            .map(|(size, before)| size * (total - before))
            .collect();
    }
    e.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample::test_util::*;

    #[test]
    fn fr_20_character_entropy_examples() {
        let h = |sizes: &[usize], l| set_entropy(sizes, l);
        assert!((h(&[26, 10], 8) - 41.2).abs() < 0.05);
        assert!((h(&[26, 26, 10, 16], 12) - 75.0).abs() < 0.05);
        assert!((h(&[26, 26, 10, 16], 20) - 125.6).abs() < 0.05);
    }

    #[test]
    fn fr_64_avoid_similar_uses_sizes_25_24_8_16() {
        let o = CharOptions {
            avoid_similar: true,
            ..Default::default()
        };
        let expected = set_entropy(&[25, 24, 8, 16], 20);
        assert!((char_entropy(&o) - expected).abs() < 0.05);
        let sets = selected_sets(&o);
        let sizes: Vec<usize> = sets.iter().map(|s| s.chars.len()).collect();
        assert_eq!(sizes, [25, 24, 8, 16]);
    }

    #[test]
    fn fr_64_no_similar_characters() {
        let o = CharOptions {
            avoid_similar: true,
            ..Default::default()
        };
        let mut rng = rng(11);
        for _ in 0..10_000 {
            let g = generate_characters(&mut rng, &o).unwrap();
            assert!(!g.text.contains(['0', 'O', '1', 'l', 'I']), "{}", g.text);
        }
    }

    #[test]
    fn fr_63_each_selected_set_is_present() {
        let o = CharOptions {
            length: 8,
            ..Default::default()
        };
        let mut rng = rng(13);
        for _ in 0..100_000 {
            let g = generate_characters(&mut rng, &o).unwrap();
            for kind in ['l', 'u', 'd', 'y'] {
                assert!(g.kinds.contains(kind), "{} {}", g.text, g.kinds);
            }
        }
    }

    #[test]
    fn fr_63_entropy_counts_the_valid_passwords() {
        // Sets {a, b} and {1}, length 3: 3^3 - 1^3 (no letter) - 2^3 (no digit) = 18.
        assert!((set_entropy(&[2, 1], 3) - 18f64.log2()).abs() < 1e-9);
    }

    #[test]
    fn fr_62_only_selected_sets_are_used() {
        let o = CharOptions {
            upper: false,
            symbols: false,
            ..Default::default()
        };
        let g = generate_characters(&mut rng(1), &o).unwrap();
        assert!(
            g.text
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        );
        let none = CharOptions {
            lower: false,
            upper: false,
            digits: false,
            symbols: false,
            ..Default::default()
        };
        assert_eq!(
            generate_characters(&mut rng(1), &none),
            Err(Error::NoCharset)
        );
    }

    #[test]
    fn fr_61_length_limits() {
        for length in [7, 65] {
            let o = CharOptions {
                length,
                ..Default::default()
            };
            assert_eq!(generate_characters(&mut rng(1), &o), Err(Error::Length));
        }
        for length in [8, 64] {
            let o = CharOptions {
                length,
                ..Default::default()
            };
            let g = generate_characters(&mut rng(1), &o).unwrap();
            assert_eq!(g.text.chars().count(), length);
        }
    }

    #[test]
    fn fr_20_character_entropy_with_an_odd_number_of_sets() {
        // Appendix A.2: V is the sum over all subsets T of (-1)^|T| (C - size of T)^L.
        // Sets of 26, 26, and 10 characters, length 8. Written out by hand:
        let l = 8;
        let v = 62f64.powi(l) - (36f64.powi(l) + 36f64.powi(l) + 52f64.powi(l))
            + (26f64.powi(l) + 26f64.powi(l) + 10f64.powi(l));
        assert!((set_entropy(&[26, 26, 10], 8) - v.log2()).abs() < 1e-9);
        // One set: all L characters come from it.
        assert!((set_entropy(&[26], 8) - 8.0 * 26f64.log2()).abs() < 1e-9);
    }

    /// True if two neighbors are the same character, case ignored.
    fn has_repeat(text: &str) -> bool {
        let low: Vec<char> = text.chars().map(|c| c.to_ascii_lowercase()).collect();
        low.windows(2).any(|pair| pair[0] == pair[1])
    }

    #[test]
    fn fr_66_no_password_has_a_character_twice_in_a_row() {
        let mut rng = rng(41);
        let digits = CharOptions {
            length: 64,
            lower: false,
            upper: false,
            symbols: false,
            avoid_similar: true,
            no_repeat: true,
            ..Default::default()
        };
        for _ in 0..100_000 {
            let g = generate_characters(&mut rng, &digits).unwrap();
            assert!(!has_repeat(&g.text), "{}", g.text);
            assert!(g.text.chars().all(|c| c.is_ascii_digit()));
        }
        let all = CharOptions {
            length: 8,
            no_repeat: true,
            ..Default::default()
        };
        for _ in 0..100_000 {
            let g = generate_characters(&mut rng, &all).unwrap();
            assert!(!has_repeat(&g.text), "{}", g.text);
            for kind in ['l', 'u', 'd', 'y'] {
                assert!(g.kinds.contains(kind), "{} {}", g.text, g.kinds);
            }
        }
    }

    fn small_sets() -> Vec<Set> {
        vec![
            Set {
                chars: vec!['a', 'b'],
                kind: 'l',
            },
            Set {
                chars: vec!['A'],
                kind: 'u',
            },
            Set {
                chars: vec!['1'],
                kind: 'd',
            },
        ]
    }

    /// Every string of length 4 from the small sets that is valid, counted one by one.
    fn small_valid_strings() -> Vec<String> {
        let alphabet = ['a', 'b', 'A', '1'];
        let mut valid = Vec::new();
        for n in 0..4usize.pow(4) {
            let s: String = (0..4).map(|i| alphabet[n / 4usize.pow(i) % 4]).collect();
            let has_all = s.contains(['a', 'b']) && s.contains('A') && s.contains('1');
            if has_all && !has_repeat(&s) {
                valid.push(s);
            }
        }
        valid
    }

    #[test]
    fn fr_66_passwords_are_uniform() {
        let valid = small_valid_strings();
        assert_eq!(valid.len(), 34);
        let sets = small_sets();
        let mut counts = [0u64; 34];
        let mut rng = rng(42);
        for _ in 0..340_000 {
            let picked = pick(&mut rng, &sets, 4, true);
            let text: String = picked.iter().map(|&(c, _)| c).collect();
            counts[valid.iter().position(|v| *v == text).unwrap()] += 1;
        }
        assert!(chi_square(&counts) < critical_001(33));
    }

    #[test]
    fn fr_66_entropy_examples() {
        let h = |lower, upper, digits, symbols, length| {
            char_entropy(&CharOptions {
                length,
                lower,
                upper,
                digits,
                symbols,
                avoid_similar: false,
                no_repeat: true,
            })
        };
        assert!((h(true, false, true, false, 8) - 40.97).abs() < 0.05);
        assert!((h(true, true, true, true, 12) - 74.67).abs() < 0.05);
        assert!((h(true, true, true, true, 20) - 125.02).abs() < 0.05);
        assert!((h(false, false, true, false, 8) - 25.51).abs() < 0.05);
        // Sets {a, b}, {A} and {1}, length 4: 34 valid passwords, counted one by one.
        let sets = [vec!['a', 'b'], vec!['A'], vec!['1']];
        assert!((no_repeat_entropy(&sets, 4) - 34f64.log2()).abs() < 1e-9);
    }

    #[test]
    fn fr_66_entropy_is_lower_than_without_no_repeat() {
        let on = CharOptions {
            no_repeat: true,
            ..Default::default()
        };
        assert!(char_entropy(&on) < char_entropy(&CharOptions::default()));
    }

    #[test]
    fn fr_66_case_groups_count_a_and_capital_a_as_one_character() {
        // Only a, A and b: the strings of length 3 with no repeat, case ignored, are aba, Aba, abA, AbA, bab, bAb.
        assert!((no_repeat_count(&['a', 'A', 'b'], 3) - 6.0).abs() < 1e-9);
        assert!((no_repeat_count(&['a', 'b'], 3) - 2.0).abs() < 1e-9);
        assert_eq!(no_repeat_count(&[], 3), 0.0);
    }
}
