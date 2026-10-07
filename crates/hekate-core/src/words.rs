use std::collections::BTreeMap;

use rand_core::Rng;

use crate::chars::SYMBOLS;
use crate::sample::uniform_below;
use crate::{Error, Generated};

/// The symbols that no-repeat allows (FR-12): `SYMBOLS` without `-` and `_`.
/// A separator can have the same character as these two symbols.
const NO_REPEAT_SYMBOLS: [char; 14] = [
    '!', '#', '$', '%', '&', '*', '+', '=', '?', '@', '^', '~', ':', ';',
];

/// The numbers that no-repeat allows (FR-12): 0 to 99 without 11, 22, ..., 99.
const NO_REPEAT_NUMBERS: [u32; 91] = {
    let mut numbers = [0; 91];
    let mut count = 0;
    let mut n = 0;
    while n < 100 {
        if n % 11 != 0 || n < 10 {
            numbers[count] = n;
            count += 1;
        }
        n += 1;
    }
    numbers
};

/// A list of words. One word for each line of the source text.
#[derive(Debug, Clone)]
pub struct WordList {
    words: Vec<String>,
    /// Indexes of the clean words: no letter twice in a row, case ignored (FR-12).
    clean: Vec<u32>,
    /// First and last character of each clean word, in lower case. Parallel to `clean`.
    ends: Vec<(char, char)>,
    /// `log2(W_k)` for `k` in 0..=10 (Appendix A.1). `NEG_INFINITY` when `W_k` is 0.
    no_repeat_bits: [f64; 11],
}

impl WordList {
    /// Parse a list with one word on each line. Empty lines are skipped.
    pub fn parse(text: &str) -> Result<Self, Error> {
        let words: Vec<String> = text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_owned)
            .collect();
        if words.len() < 2 {
            return Err(Error::WordListTooSmall);
        }
        let mut clean = Vec::new();
        let mut ends = Vec::new();
        for (i, word) in words.iter().enumerate() {
            let low = word.to_lowercase();
            // The capital form must have the same letters. A word such as
            // "ßa" does not, because its capital form is "SSa".
            let mut title = String::new();
            title_case(word, &mut title);
            if has_repeat(&low) || title.to_lowercase() != low {
                continue;
            }
            if let (Some(first), Some(last)) = (low.chars().next(), low.chars().next_back()) {
                clean.push(i as u32);
                ends.push((first, last));
            }
        }
        let no_repeat_bits = no_repeat_bits(&ends);
        Ok(Self {
            words,
            clean,
            ends,
            no_repeat_bits,
        })
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn is_empty(&self) -> bool {
        self.words.is_empty()
    }

    pub fn get(&self, i: usize) -> &str {
        &self.words[i]
    }
}

/// True if two neighboring characters of `text` are the same, case ignored (FR-12).
fn has_repeat(text: &str) -> bool {
    let low: Vec<char> = text.to_lowercase().chars().collect();
    low.windows(2).any(|pair| pair[0] == pair[1])
}

/// `log2(W_k)` for `k` in 0..=10 (Appendix A.1).
///
/// `W_k` is the number of sequences of `k` clean words in which no word ends
/// with the first letter of the next word. `f_1(c)` is the number of words
/// that end with `c`. `f_{i+1}(c)` is the sum, over the words `w` that end
/// with `c`, of `T_i - f_i(first letter of w)`. `T_i` is the sum of `f_i`,
/// and `W_k = T_k`. Ordered maps keep the order of the sums the same.
fn no_repeat_bits(ends: &[(char, char)]) -> [f64; 11] {
    let mut pairs: BTreeMap<(char, char), f64> = BTreeMap::new();
    for &pair in ends {
        *pairs.entry(pair).or_insert(0.0) += 1.0;
    }
    let mut f: BTreeMap<char, f64> = BTreeMap::new();
    for (&(_, last), &count) in &pairs {
        *f.entry(last).or_insert(0.0) += count;
    }
    let mut bits = [0.0; 11];
    for bit in bits.iter_mut().skip(1) {
        let total: f64 = f.values().sum();
        *bit = total.log2();
        let mut next: BTreeMap<char, f64> = BTreeMap::new();
        for (&(first, last), &count) in &pairs {
            let before = f.get(&first).copied().unwrap_or(0.0);
            *next.entry(last).or_insert(0.0) += count * (total - before);
        }
        f = next;
    }
    bits
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Separator {
    None,
    Dash,
    Dot,
    Underscore,
    Space,
}

impl Separator {
    fn as_char(self) -> Option<char> {
        match self {
            Separator::None => None,
            Separator::Dash => Some('-'),
            Separator::Dot => Some('.'),
            Separator::Underscore => Some('_'),
            Separator::Space => Some(' '),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capitalization {
    Lower,
    Title,
    Random,
}

/// The style of a word password. A style change keeps the words (FR-11).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WordStyle {
    pub separator: Separator,
    pub capitalization: Capitalization,
    pub number: bool,
    pub symbol: bool,
}

impl Default for WordStyle {
    fn default() -> Self {
        Self {
            separator: Separator::None,
            capitalization: Capitalization::Title,
            number: false,
            symbol: false,
        }
    }
}

fn title_case(word: &str, out: &mut String) {
    let mut chars = word.chars();
    if let Some(first) = chars.next() {
        out.extend(first.to_uppercase());
        out.push_str(chars.as_str());
    }
}

/// The random choices of one word password (FR-11).
///
/// One draw gives the same words for every style. The number, the symbol and
/// their places also stay the same, so that a style change never needs new
/// random values.
#[derive(Debug, Clone, PartialEq)]
pub struct WordDraw {
    /// Words copied from the list.
    words: Vec<String>,
    /// One style bit for each word, used by the random style.
    title: Vec<bool>,
    /// The number, 0 to 99.
    number: u32,
    /// The number goes before the word with this index. `words.len()` means after the last word.
    number_slot: usize,
    symbol: char,
    /// The symbol goes before the word with this index. `words.len()` means after the last word.
    symbol_slot: usize,
    /// The order of the symbol and the number if both have the same slot.
    symbol_first: bool,
    no_repeat: bool,
    /// `k * log2(N)`, or `log2(W_k)` with no-repeat.
    word_bits: f64,
}

/// Choose the random values of a word password (FR-1 to FR-7, FR-11, FR-12).
///
/// The values come from the generator in a fixed order: the word indexes,
/// one style bit for each word, the number, its slot, the symbol, its slot,
/// and the order of the number and the symbol.
pub fn draw_words<R: Rng + ?Sized>(
    rng: &mut R,
    list: &WordList,
    words: usize,
    no_repeat: bool,
) -> Result<WordDraw, Error> {
    if !(3..=10).contains(&words) {
        return Err(Error::WordCount);
    }

    let (picked, word_bits): (Vec<String>, f64) = if no_repeat {
        let bits = list.no_repeat_bits[words];
        if list.clean.len() < 2 || !bits.is_finite() {
            return Err(Error::WordListTooSmall);
        }
        let n = list.clean.len() as u32;
        let mut indexes: Vec<usize> = Vec::with_capacity(words);
        // Draw the whole set again on a conflict. Every valid set has the same
        // chance, because every set has the same chance to be drawn (SR-2).
        // The check does not depend on the separator, so no style needs new words.
        loop {
            indexes.clear();
            indexes.extend((0..words).map(|_| uniform_below(rng, n) as usize));
            if indexes
                .windows(2)
                .all(|pair| list.ends[pair[0]].1 != list.ends[pair[1]].0)
            {
                break;
            }
        }
        let picked = indexes
            .iter()
            .map(|&i| list.words[list.clean[i] as usize].clone())
            .collect();
        (picked, bits)
    } else {
        let n = list.len() as u32;
        let picked = (0..words)
            .map(|_| list.words[uniform_below(rng, n) as usize].clone())
            .collect();
        (picked, words as f64 * (list.len() as f64).log2())
    };

    let title = (0..words).map(|_| uniform_below(rng, 2) == 1).collect();
    let number = if no_repeat {
        NO_REPEAT_NUMBERS[uniform_below(rng, NO_REPEAT_NUMBERS.len() as u32) as usize]
    } else {
        uniform_below(rng, 100)
    };
    let number_slot = uniform_below(rng, words as u32 + 1) as usize;
    let symbols: &[char] = if no_repeat {
        &NO_REPEAT_SYMBOLS
    } else {
        &SYMBOLS
    };
    let symbol = symbols[uniform_below(rng, symbols.len() as u32) as usize];
    let symbol_slot = uniform_below(rng, words as u32 + 1) as usize;
    let symbol_first = uniform_below(rng, 2) == 1;

    Ok(WordDraw {
        words: picked,
        title,
        number,
        number_slot,
        symbol,
        symbol_slot,
        symbol_first,
        no_repeat,
        word_bits,
    })
}

impl WordDraw {
    /// Build the password for a style. The words are the same for every style (FR-11).
    pub fn render(&self, style: &WordStyle) -> Generated {
        let k = self.words.len();

        // Each token is (text, kind letter).
        let mut tokens: Vec<(String, char)> = Vec::with_capacity(k + 2);
        for slot in 0..=k {
            let number =
                (style.number && self.number_slot == slot).then(|| (self.number.to_string(), 'n'));
            let symbol =
                (style.symbol && self.symbol_slot == slot).then(|| (self.symbol.to_string(), 'y'));
            let (first, second) = if self.symbol_first {
                (symbol, number)
            } else {
                (number, symbol)
            };
            tokens.extend(first);
            tokens.extend(second);
            if slot < k {
                let word = &self.words[slot];
                let title = match style.capitalization {
                    Capitalization::Lower => false,
                    Capitalization::Title => true,
                    Capitalization::Random => self.title[slot],
                };
                let mut s = String::with_capacity(word.len());
                if title {
                    title_case(word, &mut s);
                } else {
                    s.push_str(word);
                }
                tokens.push((s, 'w'));
            }
        }

        let sep = style.separator.as_char();
        let mut text = String::new();
        let mut kinds = String::new();
        for (i, (t, kind)) in tokens.iter().enumerate() {
            if i > 0
                && let Some(c) = sep
            {
                text.push(c);
                kinds.push('s');
            }
            text.push_str(t);
            kinds.extend(core::iter::repeat_n(*kind, t.chars().count()));
        }

        Generated::new(text, kinds, self.entropy(style))
    }

    /// Entropy of the password in bits (Appendix A.1).
    fn entropy(&self, style: &WordStyle) -> f64 {
        let mut bits = self.word_bits;
        if style.capitalization == Capitalization::Random {
            bits += self.words.len() as f64;
        }
        if style.number {
            bits += if self.no_repeat {
                (NO_REPEAT_NUMBERS.len() as f64).log2()
            } else {
                100f64.log2()
            };
        }
        if style.symbol {
            bits += if self.no_repeat {
                (NO_REPEAT_SYMBOLS.len() as f64).log2()
            } else {
                (SYMBOLS.len() as f64).log2()
            };
        }
        bits
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample::test_util::*;
    use std::collections::HashMap;

    fn list(n: usize) -> WordList {
        let text: String = (0..n).map(|i| format!("w{}\n", letters(i))).collect();
        WordList::parse(&text).unwrap()
    }

    fn letters(mut i: usize) -> String {
        let mut s = String::new();
        loop {
            s.push((b'a' + (i % 26) as u8) as char);
            i /= 26;
            if i == 0 {
                return s;
            }
        }
    }

    /// One draw and one render, as the old single call did.
    fn one_password<R: Rng + ?Sized>(
        rng: &mut R,
        list: &WordList,
        words: usize,
        style: WordStyle,
    ) -> Generated {
        draw_words(rng, list, words, false).unwrap().render(&style)
    }

    const SEPARATORS: [Separator; 5] = [
        Separator::None,
        Separator::Dash,
        Separator::Dot,
        Separator::Underscore,
        Separator::Space,
    ];

    #[test]
    fn fr_4_default_options_give_pascal_case() {
        let l = WordList::parse("brave\nmaple\nriver\ncloud\nstone\n").unwrap();
        let g = one_password(&mut rng(1), &l, 5, WordStyle::default());
        // Each word starts with a capital, and nothing separates the words.
        assert!(g.text.chars().next().unwrap().is_uppercase());
        assert_eq!(g.text.chars().filter(|c| c.is_uppercase()).count(), 5);
        assert!(g.text.chars().all(|c| c.is_alphabetic()));
    }

    #[test]
    fn fr_4_separator_between_all_tokens() {
        let l = list(100);
        for (sep, ch) in [
            (Separator::Dash, '-'),
            (Separator::Dot, '.'),
            (Separator::Underscore, '_'),
            (Separator::Space, ' '),
        ] {
            let style = WordStyle {
                separator: sep,
                number: true,
                ..Default::default()
            };
            let g = one_password(&mut rng(2), &l, 5, style);
            // 5 words + number = 6 tokens = 5 separators.
            assert_eq!(g.text.matches(ch).count(), 5, "{}", g.text);
        }
    }

    #[test]
    fn fr_5_lower_style_has_no_capitals() {
        let l = list(50);
        let style = WordStyle {
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let g = one_password(&mut rng(3), &l, 5, style);
        assert!(!g.text.chars().any(char::is_uppercase));
    }

    #[test]
    fn fr_5_random_style_is_uniform() {
        let l = WordList::parse("alpha\nbravo\n").unwrap();
        let style = WordStyle {
            capitalization: Capitalization::Random,
            separator: Separator::Space,
            ..Default::default()
        };
        let mut rng = rng(4);
        let mut counts = [0u64; 2];
        for _ in 0..10_000 {
            let g = one_password(&mut rng, &l, 10, style);
            for w in g.text.split(' ') {
                counts[usize::from(w.chars().next().unwrap().is_uppercase())] += 1;
            }
        }
        assert!(chi_square(&counts) < critical_001(1));
    }

    #[test]
    fn fr_6_number_value_and_position_are_uniform() {
        let l = list(100);
        let style = WordStyle {
            number: true,
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(5);
        let mut values = [0u64; 100];
        let mut positions = [0u64; 6];
        for _ in 0..100_000 {
            let g = one_password(&mut rng, &l, 5, style);
            let toks: Vec<&str> = g.text.split(' ').collect();
            let pos = toks
                .iter()
                .position(|t| t.chars().all(|c| c.is_ascii_digit()))
                .unwrap();
            positions[pos] += 1;
            values[toks[pos].parse::<usize>().unwrap()] += 1;
        }
        assert!(chi_square(&values) < critical_001(99));
        assert!(chi_square(&positions) < critical_001(5));
    }

    #[test]
    fn fr_7_symbol_value_and_position_are_uniform() {
        let l = list(100);
        let style = WordStyle {
            symbol: true,
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(6);
        let mut values = [0u64; 16];
        let mut positions = [0u64; 6];
        for _ in 0..100_000 {
            let g = one_password(&mut rng, &l, 5, style);
            let toks: Vec<&str> = g.text.split(' ').collect();
            let pos = toks
                .iter()
                .position(|t| t.chars().count() == 1 && !t.starts_with('w'))
                .unwrap();
            positions[pos] += 1;
            let c = toks[pos].chars().next().unwrap();
            values[SYMBOLS.iter().position(|&s| s == c).unwrap()] += 1;
        }
        assert!(chi_square(&values) < critical_001(15));
        assert!(chi_square(&positions) < critical_001(5));
    }

    #[test]
    fn fr_7_symbol_set_has_16_members() {
        assert_eq!(SYMBOLS.len(), 16);
    }

    #[test]
    fn fr_20_word_entropy_examples() {
        let l = list(7776);
        let h = |words, cap, number, symbol| {
            let style = WordStyle {
                separator: Separator::None,
                capitalization: cap,
                number,
                symbol,
            };
            one_password(&mut rng(1), &l, words, style).entropy_bits
        };
        assert!((h(4, Capitalization::Title, false, false) - 51.7).abs() < 0.05);
        assert!((h(5, Capitalization::Title, false, false) - 64.6).abs() < 0.05);
        assert!((h(5, Capitalization::Title, true, true) - 75.3).abs() < 0.05);
        assert!((h(6, Capitalization::Random, true, false) - 90.2).abs() < 0.05);
    }

    #[test]
    fn fr_20_entropy_rows_add_up() {
        let l = list(4096);
        let draw = draw_words(&mut rng(1), &l, 5, false).unwrap();
        let h = |style: WordStyle| draw.render(&style).entropy_bits;
        let base = h(WordStyle::default());
        assert!((base - 60.0).abs() < 1e-9);
        let lower = WordStyle {
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        assert!((h(lower) - base).abs() < 1e-9);
        let random = WordStyle {
            capitalization: Capitalization::Random,
            ..Default::default()
        };
        assert!((h(random) - base - 5.0).abs() < 1e-9);
        let symbol = WordStyle {
            symbol: true,
            ..Default::default()
        };
        assert!((h(symbol) - base - 4.0).abs() < 1e-9);
        let number = WordStyle {
            number: true,
            ..Default::default()
        };
        assert!((h(number) - base - 100f64.log2()).abs() < 1e-9);
    }

    #[test]
    fn fr_3_word_count_limits() {
        let l = list(10);
        for words in [2, 11] {
            assert_eq!(
                draw_words(&mut rng(1), &l, words, false),
                Err(Error::WordCount)
            );
            assert_eq!(
                draw_words(&mut rng(1), &l, words, true),
                Err(Error::WordCount)
            );
        }
        for words in [3, 10] {
            assert!(draw_words(&mut rng(1), &l, words, false).is_ok());
        }
    }

    #[test]
    fn fr_1_all_words_come_from_the_list() {
        let l = list(30);
        let style = WordStyle {
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(9);
        for _ in 0..1000 {
            let g = one_password(&mut rng, &l, 5, style);
            for w in g.text.split(' ') {
                assert!((0..l.len()).any(|i| l.get(i) == w), "{w}");
            }
        }
    }

    #[test]
    fn fr_23_kinds_match_code_points() {
        let l = WordList::parse("år\nüber\nstraße\n").unwrap();
        let style = WordStyle {
            separator: Separator::Dash,
            number: true,
            symbol: true,
            ..Default::default()
        };
        let g = one_password(&mut rng(1), &l, 5, style);
        assert_eq!(g.kinds.chars().count(), g.text.chars().count());
        assert_eq!(g.kinds.chars().filter(|&c| c == 's').count(), 6);
        assert_eq!(g.kinds.chars().filter(|&c| c == 'y').count(), 1);
    }

    #[test]
    fn fr_1_word_list_needs_two_words() {
        assert!(WordList::parse("one\n").is_err());
        assert!(WordList::parse("").is_err());
        assert_eq!(WordList::parse("a\n\nb\n").unwrap().len(), 2);
    }

    #[test]
    fn fr_1_get_returns_the_word_at_the_index() {
        let l = WordList::parse("brave\nmaple\nriver\n").unwrap();
        assert_eq!(l.get(0), "brave");
        assert_eq!(l.get(2), "river");
    }

    #[test]
    fn fr_1_is_empty_matches_the_word_count() {
        let l = WordList::parse("brave\nmaple\n").unwrap();
        assert!(!l.is_empty());
        let empty = WordList {
            words: Vec::new(),
            clean: Vec::new(),
            ends: Vec::new(),
            no_repeat_bits: [0.0; 11],
        };
        assert!(empty.is_empty());
    }

    /// A generator that returns fixed values. A test uses it to pick exact words and styles.
    struct Fixed(Vec<u32>, usize);

    impl rand_core::TryRng for Fixed {
        type Error = rand_core::Infallible;
        fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
            let v = self.0[self.1];
            self.1 += 1;
            Ok(v)
        }
        fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
            rand_core::utils::next_u64_via_u32(self)
        }
        fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Self::Error> {
            rand_core::utils::fill_bytes_via_next_word(dest, || self.try_next_u32())
        }
    }

    #[test]
    fn fr_5_random_style_value_one_means_title_case() {
        // The list has 8 words, so no word index is rejected. The values are, in order:
        // 3 word indexes, 3 style bits (1 = title case, 0 = lower case), the number,
        // the slot of the number, the symbol, the slot of the symbol, and the order of both.
        // The number uses 96, because a value below 96 is rejected for 100 numbers.
        let l = list(8);
        let style = WordStyle {
            separator: Separator::Dash,
            capitalization: Capitalization::Random,
            ..Default::default()
        };
        let mut rng = Fixed(vec![0, 1, 2, 1, 0, 1, 96, 0, 0, 0, 0], 0);
        let g = draw_words(&mut rng, &l, 3, false).unwrap().render(&style);
        assert_eq!(g.text, "Wa-wb-Wc");
    }

    #[test]
    fn fr_11_render_keeps_the_words() {
        let l = list(100);
        let draw = draw_words(&mut rng(21), &l, 5, false).unwrap();
        let mut seen: Option<String> = None;
        let mut count = 0;
        for separator in SEPARATORS {
            for capitalization in [
                Capitalization::Lower,
                Capitalization::Title,
                Capitalization::Random,
            ] {
                for number in [false, true] {
                    for symbol in [false, true] {
                        let style = WordStyle {
                            separator,
                            capitalization,
                            number,
                            symbol,
                        };
                        let g = draw.render(&style);
                        assert_eq!(g, draw.render(&style));
                        let words: String = g
                            .text
                            .chars()
                            .zip(g.kinds.chars())
                            .filter(|&(_, kind)| kind == 'w')
                            .map(|(c, _)| c)
                            .collect::<String>()
                            .to_lowercase();
                        assert_eq!(seen.get_or_insert_with(|| words.clone()), &words);
                        count += 1;
                    }
                }
            }
        }
        assert_eq!(count, 60);
    }

    #[test]
    fn fr_11_number_comes_back_in_the_same_place() {
        let l = list(100);
        for seed in 0..50 {
            let draw = draw_words(&mut rng(seed), &l, 5, false).unwrap();
            for symbol in [false, true] {
                let on = WordStyle {
                    separator: Separator::Dash,
                    number: true,
                    symbol,
                    ..Default::default()
                };
                let off = WordStyle {
                    number: false,
                    ..on
                };
                let first = draw.render(&on);
                let without = draw.render(&off);
                assert_ne!(first.text, without.text);
                assert_eq!(draw.render(&on), first);
            }
        }
    }

    #[test]
    fn fr_11_number_and_symbol_keep_their_order_in_one_slot() {
        // All slot values are 0, so the number and the symbol share the slot before word 0.
        let l = list(8);
        let style = WordStyle {
            capitalization: Capitalization::Lower,
            number: true,
            symbol: true,
            ..Default::default()
        };
        let mut first = Fixed(vec![0, 1, 2, 0, 0, 0, 96, 0, 0, 0, 0], 0);
        let g = draw_words(&mut first, &l, 3, false).unwrap().render(&style);
        assert_eq!(g.text, "96!wawbwc");
        let mut second = Fixed(vec![0, 1, 2, 0, 0, 0, 96, 0, 0, 0, 1], 0);
        let g = draw_words(&mut second, &l, 3, false)
            .unwrap()
            .render(&style);
        assert_eq!(g.text, "!96wawbwc");
    }

    #[test]
    fn fr_12_has_repeat_ignores_case() {
        assert!(has_repeat("aa"));
        assert!(has_repeat("aA"));
        assert!(has_repeat("Moon"));
        assert!(has_repeat("a11b"));
        assert!(has_repeat("a--b"));
        assert!(!has_repeat("abab"));
        assert!(!has_repeat(""));
        assert!(!has_repeat("a"));
    }

    #[test]
    fn fr_12_list_marks_the_clean_words() {
        let l = WordList::parse("alpha\nmoon\nLetter\nßa\nbravo\n").unwrap();
        // "moon" and "Letter" have a letter twice. "ßa" has the capital form "SSa".
        let clean: Vec<&str> = l.clean.iter().map(|&i| l.get(i as usize)).collect();
        assert_eq!(clean, ["alpha", "bravo"]);
        assert_eq!(l.ends, [('a', 'a'), ('b', 'o')]);
    }

    /// The number of valid sequences, counted one by one.
    fn brute_force(ends: &[(char, char)], k: usize) -> usize {
        fn count(ends: &[(char, char)], left: usize, last: Option<char>) -> usize {
            if left == 0 {
                return 1;
            }
            ends.iter()
                .filter(|&&(first, _)| Some(first) != last)
                .map(|&(_, end)| count(ends, left - 1, Some(end)))
                .sum()
        }
        count(ends, k, None)
    }

    #[test]
    fn fr_12_entropy_counts_the_valid_sequences() {
        for text in ["ab\nba\ncd\n", "ab\nbc\nca\nxy\nmoon\n"] {
            let l = WordList::parse(text).unwrap();
            for k in 3..=4 {
                let expected = (brute_force(&l.ends, k) as f64).log2();
                assert!((l.no_repeat_bits[k] - expected).abs() < 1e-9, "{text} {k}");
            }
        }
        let l = WordList::parse("ab\nba\ncd\n").unwrap();
        assert_eq!(brute_force(&l.ends, 3), 17);
        assert!((l.no_repeat_bits[3] - 17f64.log2()).abs() < 1e-9);
        assert!((l.no_repeat_bits[3] - 4.09).abs() < 0.005);
    }

    #[test]
    fn fr_12_no_password_has_a_character_twice_in_a_row() {
        let l = WordList::parse(
            "alpha\nbravo\nmoon\nLetter\ntree\negg\nnote\nelk\nkite\ndelta\nsun\nnova\nanna\n",
        )
        .unwrap();
        let mut rng = rng(31);
        for _ in 0..100_000 {
            let draw = draw_words(&mut rng, &l, 5, true).unwrap();
            for separator in SEPARATORS {
                for capitalization in [Capitalization::Title, Capitalization::Random] {
                    let style = WordStyle {
                        separator,
                        capitalization,
                        number: true,
                        symbol: true,
                    };
                    let g = draw.render(&style);
                    assert!(!has_repeat(&g.text), "{}", g.text);
                }
            }
        }
    }

    #[test]
    fn fr_12_draws_are_uniform() {
        let l = WordList::parse("ab\nba\ncd\n").unwrap();
        let style = WordStyle {
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let words = ["ab", "ba", "cd"];
        let mut index: HashMap<String, usize> = HashMap::new();
        for a in words {
            for b in words {
                for c in words {
                    let valid = [(a, b), (b, c)]
                        .iter()
                        .all(|(x, y)| x.chars().last() != y.chars().next());
                    if valid {
                        let next = index.len();
                        index.insert(format!("{a} {b} {c}"), next);
                    }
                }
            }
        }
        assert_eq!(index.len(), 17);
        let mut counts = [0u64; 17];
        let mut rng = rng(32);
        for _ in 0..170_000 {
            let g = draw_words(&mut rng, &l, 3, true).unwrap().render(&style);
            counts[index[&g.text]] += 1;
        }
        assert!(chi_square(&counts) < critical_001(16));
    }

    #[test]
    fn fr_12_numbers_and_symbols() {
        let l = list(100);
        let style = WordStyle {
            capitalization: Capitalization::Lower,
            number: true,
            symbol: true,
            ..Default::default()
        };
        let mut rng = rng(33);
        let mut numbers = std::collections::BTreeSet::new();
        let mut symbols = std::collections::BTreeSet::new();
        for _ in 0..10_000 {
            let draw = draw_words(&mut rng, &l, 4, true).unwrap();
            assert!(
                !draw.number.is_multiple_of(11) || draw.number < 10,
                "{}",
                draw.number
            );
            assert!(!['-', '_'].contains(&draw.symbol));
            numbers.insert(draw.number);
            symbols.insert(draw.symbol);
            let g = draw.render(&style);
            let expected = draw.word_bits + 91f64.log2() + 14f64.log2();
            assert!((g.entropy_bits - expected).abs() < 1e-9);
        }
        assert_eq!(numbers.len(), 91);
        assert_eq!(symbols.len(), 14);
        assert!(numbers.contains(&0));
    }

    #[test]
    fn fr_12_the_allowed_symbols_are_the_symbols_without_dash_and_underscore() {
        let expected: Vec<char> = SYMBOLS
            .iter()
            .copied()
            .filter(|c| !['-', '_'].contains(c))
            .collect();
        assert_eq!(NO_REPEAT_SYMBOLS.to_vec(), expected);
        let expected: Vec<u32> = (0..100).filter(|n| n % 11 != 0 || *n < 10).collect();
        assert_eq!(NO_REPEAT_NUMBERS.to_vec(), expected);
    }

    #[test]
    fn fr_12_a_list_without_enough_clean_words_is_refused() {
        // No clean word.
        let none = WordList::parse("moon\nsee\n").unwrap();
        assert_eq!(
            draw_words(&mut rng(1), &none, 3, true),
            Err(Error::WordListTooSmall)
        );
        // Every sequence has a conflict, because each word ends with the first letter of the next.
        let conflict = WordList::parse("a\nA\n").unwrap();
        assert_eq!(
            draw_words(&mut rng(1), &conflict, 3, true),
            Err(Error::WordListTooSmall)
        );
        // The same list works without no-repeat.
        assert!(draw_words(&mut rng(1), &conflict, 3, false).is_ok());
    }

    #[test]
    fn fr_12_the_option_is_off_by_default_in_entropy() {
        let l = list(100);
        let draw = draw_words(&mut rng(1), &l, 5, false).unwrap();
        let g = draw.render(&WordStyle::default());
        assert!((g.entropy_bits - 5.0 * 100f64.log2()).abs() < 1e-9);
    }

    #[test]
    fn sr_3_error_messages_say_what_is_wrong() {
        assert_eq!(
            Error::WordListTooSmall.to_string(),
            "word list is too small"
        );
        assert_eq!(
            Error::WordCount.to_string(),
            "number of words must be from 3 to 10"
        );
        assert_eq!(Error::Length.to_string(), "length must be from 8 to 64");
        assert_eq!(
            Error::NoCharset.to_string(),
            "select at least one character set"
        );
    }
}
