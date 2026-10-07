use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;

use hekate_core::{
    Capitalization, CharOptions, Generated, Separator, WordDraw, WordList, WordStyle,
};
use rand_core::{Infallible, TryRng, utils};
use sha2::{Digest, Sha256};

mod generated {
    include!(concat!(env!("OUT_DIR"), "/hashes.rs"));
}

#[derive(Debug, PartialEq, Eq)]
pub enum ApiError {
    UnknownList(String),
    HashMismatch(String),
    NotLoaded(String),
    BadOption(&'static str),
    Core(hekate_core::Error),
    /// Web Crypto is missing or failed (SR-3).
    NoRandom,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiError::UnknownList(k) => write!(f, "no known hash for word list {k}"),
            ApiError::HashMismatch(k) => write!(f, "hash of word list {k} does not match"),
            ApiError::NotLoaded(k) => write!(f, "word list {k} is not loaded"),
            ApiError::BadOption(o) => write!(f, "bad value for option {o}"),
            ApiError::Core(e) => write!(f, "{e}"),
            ApiError::NoRandom => f.write_str("secure random numbers are not available"),
        }
    }
}

impl From<hekate_core::Error> for ApiError {
    fn from(e: hekate_core::Error) -> Self {
        ApiError::Core(e)
    }
}

/// Random generator that reads the secure generator of the system.
/// On wasm32 this is `crypto.getRandomValues()` (SR-1).
struct SystemRng {
    buf: [u8; 256],
    pos: usize,
}

impl SystemRng {
    /// Fails closed: no password if the system gives no random bytes (SR-3).
    fn new() -> Result<Self, ApiError> {
        let mut rng = SystemRng {
            buf: [0; 256],
            pos: 256,
        };
        getrandom::fill(&mut rng.buf).map_err(|_| ApiError::NoRandom)?;
        rng.pos = 0;
        Ok(rng)
    }
}

// Infallible: a failure after the first fill panics. `new` already checked
// that the system gives random bytes (SR-3).
impl TryRng for SystemRng {
    type Error = Infallible;

    fn try_next_u32(&mut self) -> Result<u32, Infallible> {
        if self.pos + 4 > self.buf.len() {
            getrandom::fill(&mut self.buf).expect("secure random numbers failed");
            self.pos = 0;
        }
        let b = &self.buf[self.pos..self.pos + 4];
        self.pos += 4;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn try_next_u64(&mut self) -> Result<u64, Infallible> {
        utils::next_u64_via_u32(self)
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), Infallible> {
        utils::fill_bytes_via_next_word(dest, || self.try_next_u32())
    }
}

thread_local! {
    static LISTS: RefCell<HashMap<String, WordList>> = RefCell::new(HashMap::new());
}

fn key(lang: &str, ascii: bool) -> String {
    if ascii {
        format!("{lang}:ascii")
    } else {
        lang.to_owned()
    }
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn load_wordlist(lang: &str, ascii: bool, bytes: &[u8]) -> Result<(), ApiError> {
    let key = key(lang, ascii);
    let expected = generated::HASHES
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, h)| *h);
    load_checked(key, bytes, expected)
}

fn load_checked(key: String, bytes: &[u8], expected: Option<&str>) -> Result<(), ApiError> {
    let expected = expected.ok_or_else(|| ApiError::UnknownList(key.clone()))?;
    if to_hex(&Sha256::digest(bytes)) != expected {
        return Err(ApiError::HashMismatch(key));
    }
    let text = core::str::from_utf8(bytes).map_err(|_| ApiError::HashMismatch(key.clone()))?;
    let list = WordList::parse(text)?;
    LISTS.with(|l| l.borrow_mut().insert(key, list));
    Ok(())
}

/// Choose the random values of a word password (FR-11).
pub fn draw_words(
    lang: &str,
    ascii: bool,
    words: usize,
    no_repeat: bool,
) -> Result<WordDraw, ApiError> {
    let mut rng = SystemRng::new()?;
    let key = key(lang, ascii);
    LISTS.with(|l| {
        let lists = l.borrow();
        let list = lists.get(&key).ok_or(ApiError::NotLoaded(key))?;
        Ok(hekate_core::draw_words(&mut rng, list, words, no_repeat)?)
    })
}

/// Build the password of a draw for a style. The words are always the same.
pub fn render_words(
    draw: &WordDraw,
    separator: &str,
    capitalization: &str,
    number: bool,
    symbol: bool,
) -> Result<Generated, ApiError> {
    let separator = match separator {
        "none" => Separator::None,
        "-" => Separator::Dash,
        "." => Separator::Dot,
        "_" => Separator::Underscore,
        "space" => Separator::Space,
        _ => return Err(ApiError::BadOption("separator")),
    };
    let capitalization = match capitalization {
        "lower" => Capitalization::Lower,
        "title" => Capitalization::Title,
        "random" => Capitalization::Random,
        _ => return Err(ApiError::BadOption("capitalization")),
    };
    Ok(draw.render(&WordStyle {
        separator,
        capitalization,
        number,
        symbol,
    }))
}

pub fn generate_characters(
    length: usize,
    charsets: u8,
    avoid_similar: bool,
    no_repeat: bool,
) -> Result<Generated, ApiError> {
    let opts = CharOptions {
        length,
        lower: charsets & 1 != 0,
        upper: charsets & 2 != 0,
        digits: charsets & 4 != 0,
        symbols: charsets & 8 != 0,
        avoid_similar,
        no_repeat,
    };
    let mut rng = SystemRng::new()?;
    Ok(hekate_core::generate_characters(&mut rng, &opts)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = "alpha\nbravo\ncharlie\ndelta\necho\n";

    fn hash(s: &str) -> String {
        to_hex(&Sha256::digest(s.as_bytes()))
    }

    #[test]
    fn sr_5_wrong_hash_is_refused() {
        let err = load_checked("t".into(), LIST.as_bytes(), Some(&hash("other"))).unwrap_err();
        assert_eq!(err, ApiError::HashMismatch("t".into()));
        assert_eq!(
            draw_words("t", false, 5, false).unwrap_err(),
            ApiError::NotLoaded("t".into())
        );
    }

    #[test]
    fn sr_5_changed_byte_is_refused() {
        let good = hash(LIST);
        let bad = LIST.replacen("alpha", "alphb", 1);
        assert!(load_checked("t2".into(), bad.as_bytes(), Some(&good)).is_err());
        assert!(load_checked("t2".into(), LIST.as_bytes(), Some(&good)).is_ok());
    }

    #[test]
    fn sr_5_list_without_known_hash_is_refused() {
        assert_eq!(
            load_checked("t3".into(), LIST.as_bytes(), None).unwrap_err(),
            ApiError::UnknownList("t3".into())
        );
    }

    #[test]
    fn fr_1_generate_uses_the_loaded_list() {
        load_checked("t4".into(), LIST.as_bytes(), Some(&hash(LIST))).unwrap();
        let draw = draw_words("t4", false, 4, false).unwrap();
        let g = render_words(&draw, "-", "lower", false, false).unwrap();
        for w in g.text.split('-') {
            assert!(LIST.lines().any(|l| l == w), "{w}");
        }
    }

    #[test]
    fn fr_42_bad_option_names_are_errors() {
        load_checked("t7".into(), LIST.as_bytes(), Some(&hash(LIST))).unwrap();
        let draw = draw_words("t7", false, 4, false).unwrap();
        assert!(matches!(
            render_words(&draw, "x", "lower", false, false),
            Err(ApiError::BadOption("separator"))
        ));
        assert!(matches!(
            render_words(&draw, "-", "x", false, false),
            Err(ApiError::BadOption("capitalization"))
        ));
    }

    #[test]
    fn fr_62_charset_mask_selects_sets() {
        let g = generate_characters(30, 4, false, false).unwrap();
        assert!(g.text.chars().all(|c| c.is_ascii_digit()));
        assert!(generate_characters(30, 0, false, false).is_err());
    }

    #[test]
    fn fr_11_render_keeps_the_words_of_the_draw() {
        load_checked("t5".into(), LIST.as_bytes(), Some(&hash(LIST))).unwrap();
        let draw = draw_words("t5", false, 4, false).unwrap();
        let words = |g: &Generated| g.text.replace('-', "").to_lowercase();
        let a = render_words(&draw, "-", "lower", false, false).unwrap();
        let b = render_words(&draw, "-", "title", false, false).unwrap();
        assert_eq!(words(&a), words(&b));
        assert_ne!(a.text, b.text);
    }

    #[test]
    fn fr_66_no_repeat_applies_to_characters() {
        for _ in 0..200 {
            let g = generate_characters(30, 4, false, true).unwrap();
            let digits: Vec<char> = g.text.chars().collect();
            assert!(digits.windows(2).all(|p| p[0] != p[1]), "{}", g.text);
        }
    }

    #[test]
    fn fr_12_no_repeat_applies_to_words() {
        load_checked("t6".into(), LIST.as_bytes(), Some(&hash(LIST))).unwrap();
        let draw = draw_words("t6", false, 4, true).unwrap();
        let g = render_words(&draw, "none", "lower", true, true).unwrap();
        let chars: Vec<char> = g.text.chars().collect();
        assert!(chars.windows(2).all(|p| p[0] != p[1]), "{}", g.text);
    }
}
