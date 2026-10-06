use rand_core::RngCore;

use crate::chars::SYMBOLS;
use crate::sample::uniform_below;
use crate::{Error, Generated};

/// A list of words. One word for each line of the source text.
#[derive(Debug, Clone)]
pub struct WordList {
    words: Vec<String>,
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
        Ok(Self { words })
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WordOptions {
    pub words: usize,
    pub separator: Separator,
    pub capitalization: Capitalization,
    pub number: bool,
    pub symbol: bool,
}

impl Default for WordOptions {
    fn default() -> Self {
        Self {
            words: 5,
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

/// Make a word password (FR-1 to FR-7, FR-20).
pub fn generate_words<R: RngCore + ?Sized>(
    rng: &mut R,
    list: &WordList,
    opts: &WordOptions,
) -> Result<Generated, Error> {
    if !(3..=10).contains(&opts.words) {
        return Err(Error::WordCount);
    }
    let n = list.len() as u32;

    // Each token is (text, kind letter).
    let mut tokens: Vec<(String, char)> = Vec::with_capacity(opts.words + 2);
    for _ in 0..opts.words {
        let word = list.get(uniform_below(rng, n) as usize);
        let title = match opts.capitalization {
            Capitalization::Lower => false,
            Capitalization::Title => true,
            Capitalization::Random => uniform_below(rng, 2) == 1,
        };
        let mut s = String::with_capacity(word.len());
        if title {
            title_case(word, &mut s);
        } else {
            s.push_str(word);
        }
        tokens.push((s, 'w'));
    }
    if opts.number {
        let value = uniform_below(rng, 100);
        let pos = uniform_below(rng, tokens.len() as u32 + 1) as usize;
        tokens.insert(pos, (value.to_string(), 'n'));
    }
    if opts.symbol {
        let sym = SYMBOLS[uniform_below(rng, SYMBOLS.len() as u32) as usize];
        let pos = uniform_below(rng, tokens.len() as u32 + 1) as usize;
        tokens.insert(pos, (sym.to_string(), 'y'));
    }

    let sep = opts.separator.as_char();
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

    Ok(Generated {
        text,
        kinds,
        entropy_bits: word_entropy(list.len(), opts),
    })
}

/// Entropy of a word password in bits (Appendix A.1).
pub(crate) fn word_entropy(list_len: usize, opts: &WordOptions) -> f64 {
    let k = opts.words as f64;
    let mut bits = k * (list_len as f64).log2();
    if opts.capitalization == Capitalization::Random {
        bits += k;
    }
    if opts.number {
        bits += 100f64.log2();
    }
    if opts.symbol {
        bits += (SYMBOLS.len() as f64).log2();
    }
    bits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample::test_util::*;

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

    #[test]
    fn fr_4_default_options_give_pascal_case() {
        let l = WordList::parse("brave\nmaple\nriver\ncloud\nstone\n").unwrap();
        let g = generate_words(&mut rng(1), &l, &WordOptions::default()).unwrap();
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
            let opts = WordOptions {
                separator: sep,
                number: true,
                ..Default::default()
            };
            let g = generate_words(&mut rng(2), &l, &opts).unwrap();
            // 5 words + number = 6 tokens = 5 separators.
            assert_eq!(g.text.matches(ch).count(), 5, "{}", g.text);
        }
    }

    #[test]
    fn fr_5_lower_style_has_no_capitals() {
        let l = list(50);
        let opts = WordOptions {
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let g = generate_words(&mut rng(3), &l, &opts).unwrap();
        assert!(!g.text.chars().any(char::is_uppercase));
    }

    #[test]
    fn fr_5_random_style_is_uniform() {
        let l = WordList::parse("alpha\nbravo\n").unwrap();
        let opts = WordOptions {
            words: 10,
            capitalization: Capitalization::Random,
            separator: Separator::Space,
            ..Default::default()
        };
        let mut rng = rng(4);
        let mut counts = [0u64; 2];
        for _ in 0..10_000 {
            let g = generate_words(&mut rng, &l, &opts).unwrap();
            for w in g.text.split(' ') {
                counts[usize::from(w.chars().next().unwrap().is_uppercase())] += 1;
            }
        }
        assert!(chi_square(&counts) < critical_001(1));
    }

    #[test]
    fn fr_6_number_value_and_position_are_uniform() {
        let l = list(100);
        let opts = WordOptions {
            number: true,
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(5);
        let mut values = [0u64; 100];
        let mut positions = [0u64; 6];
        for _ in 0..100_000 {
            let g = generate_words(&mut rng, &l, &opts).unwrap();
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
        let opts = WordOptions {
            symbol: true,
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(6);
        let mut values = [0u64; 16];
        let mut positions = [0u64; 6];
        for _ in 0..100_000 {
            let g = generate_words(&mut rng, &l, &opts).unwrap();
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
        let n = 7776;
        let o = |words, cap, number, symbol| WordOptions {
            words,
            capitalization: cap,
            number,
            symbol,
            separator: Separator::None,
        };
        let h = |opts: WordOptions| word_entropy(n, &opts);
        assert!((h(o(4, Capitalization::Title, false, false)) - 51.7).abs() < 0.05);
        assert!((h(o(5, Capitalization::Title, false, false)) - 64.6).abs() < 0.05);
        assert!((h(o(5, Capitalization::Title, true, true)) - 75.3).abs() < 0.05);
        assert!((h(o(6, Capitalization::Random, true, false)) - 90.2).abs() < 0.05);
    }

    #[test]
    fn fr_20_entropy_rows_add_up() {
        let base = word_entropy(4096, &WordOptions::default());
        assert!((base - 60.0).abs() < 1e-9);
        let lower = WordOptions {
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        assert!((word_entropy(4096, &lower) - base).abs() < 1e-9);
        let rnd = WordOptions {
            capitalization: Capitalization::Random,
            ..Default::default()
        };
        assert!((word_entropy(4096, &rnd) - base - 5.0).abs() < 1e-9);
        let sym = WordOptions {
            symbol: true,
            ..Default::default()
        };
        assert!((word_entropy(4096, &sym) - base - 4.0).abs() < 1e-9);
    }

    #[test]
    fn fr_3_word_count_limits() {
        let l = list(10);
        for words in [2, 11] {
            let o = WordOptions {
                words,
                ..Default::default()
            };
            assert_eq!(generate_words(&mut rng(1), &l, &o), Err(Error::WordCount));
        }
        for words in [3, 10] {
            let o = WordOptions {
                words,
                ..Default::default()
            };
            assert!(generate_words(&mut rng(1), &l, &o).is_ok());
        }
    }

    #[test]
    fn fr_1_all_words_come_from_the_list() {
        let l = list(30);
        let o = WordOptions {
            separator: Separator::Space,
            capitalization: Capitalization::Lower,
            ..Default::default()
        };
        let mut rng = rng(9);
        for _ in 0..1000 {
            let g = generate_words(&mut rng, &l, &o).unwrap();
            for w in g.text.split(' ') {
                assert!((0..l.len()).any(|i| l.get(i) == w), "{w}");
            }
        }
    }

    #[test]
    fn fr_23_kinds_match_code_points() {
        let l = WordList::parse("år\nüber\nstraße\n").unwrap();
        let o = WordOptions {
            separator: Separator::Dash,
            number: true,
            symbol: true,
            ..Default::default()
        };
        let g = generate_words(&mut rng(1), &l, &o).unwrap();
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
        let empty = WordList { words: Vec::new() };
        assert!(empty.is_empty());
    }

    /// A generator that returns fixed values. A test uses it to pick exact words and styles.
    struct Fixed(Vec<u32>, usize);

    impl RngCore for Fixed {
        fn next_u32(&mut self) -> u32 {
            let v = self.0[self.1];
            self.1 += 1;
            v
        }
        fn next_u64(&mut self) -> u64 {
            rand_core::impls::next_u64_via_u32(self)
        }
        fn fill_bytes(&mut self, dest: &mut [u8]) {
            rand_core::impls::fill_bytes_via_next(self, dest)
        }
    }

    #[test]
    fn fr_5_random_style_value_one_means_title_case() {
        // The list has 8 words, so no value is rejected. Each word uses two values:
        // the index of the word and the style bit (1 = title case, 0 = lower case).
        let l = list(8);
        let o = WordOptions {
            words: 3,
            separator: Separator::Dash,
            capitalization: Capitalization::Random,
            ..Default::default()
        };
        let mut rng = Fixed(vec![0, 1, 1, 0, 2, 1], 0);
        let g = generate_words(&mut rng, &l, &o).unwrap();
        assert_eq!(g.text, "Wa-wb-Wc");
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
