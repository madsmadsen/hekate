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

/// Make a character password (FR-60 to FR-65).
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
    let all: Vec<(char, char)> = sets
        .iter()
        .flat_map(|s| s.chars.iter().map(|&c| (c, s.kind)))
        .collect();

    loop {
        let picked: Vec<(char, char)> = (0..opts.length)
            .map(|_| all[uniform_below(rng, all.len() as u32) as usize])
            .collect();
        if sets
            .iter()
            .all(|s| picked.iter().any(|&(_, kind)| kind == s.kind))
        {
            return Ok(Generated {
                text: picked.iter().map(|&(c, _)| c).collect(),
                kinds: picked.iter().map(|&(_, k)| k).collect(),
                entropy_bits: char_entropy(opts),
            });
        }
    }
}

/// Entropy of a character password in bits (Appendix A.2).
///
/// Counts the valid passwords with the inclusion-exclusion rule.
pub(crate) fn char_entropy(opts: &CharOptions) -> f64 {
    let sizes: Vec<usize> = selected_sets(opts).iter().map(|s| s.chars.len()).collect();
    set_entropy(&sizes, opts.length)
}

fn set_entropy(sizes: &[usize], length: usize) -> f64 {
    let total: usize = sizes.iter().sum();
    let mut valid = 0f64;
    for mask in 0u32..(1 << sizes.len()) {
        let removed: usize = (0..sizes.len())
            .filter(|i| mask & (1 << i) != 0)
            .map(|i| sizes[i])
            .sum();
        let term = ((total - removed) as f64).powi(length as i32);
        if mask.count_ones() % 2 == 0 {
            valid += term;
        } else {
            valid -= term;
        }
    }
    valid.log2()
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
}
