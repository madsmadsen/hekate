//! JavaScript API of Hekate (wasm-bindgen).
//!
//! The logic is in `api` and returns plain Rust errors, so native tests can
//! run it. The functions here only map errors to JavaScript.

mod api;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Generated {
    inner: hekate_core::Generated,
}

#[wasm_bindgen]
impl Generated {
    #[wasm_bindgen(getter)]
    pub fn password(&self) -> String {
        self.inner.text.clone()
    }

    /// One letter for each code point of the password (see `hekate_core::Kinds`).
    #[wasm_bindgen(getter)]
    pub fn kinds(&self) -> String {
        self.inner.kinds.clone()
    }

    #[wasm_bindgen(getter, js_name = entropyBits)]
    pub fn entropy_bits(&self) -> f64 {
        self.inner.entropy_bits
    }

    #[wasm_bindgen(getter, js_name = crackSeconds)]
    pub fn crack_seconds(&self) -> f64 {
        self.inner.crack_seconds()
    }

    #[wasm_bindgen(getter)]
    pub fn strength(&self) -> String {
        self.inner.strength().as_str().to_owned()
    }

    /// Entropy in bits for an attacker who knows nothing about the password (FR-24).
    #[wasm_bindgen(getter, js_name = naiveEntropyBits)]
    pub fn naive_entropy_bits(&self) -> f64 {
        self.inner.naive_bits
    }

    #[wasm_bindgen(getter, js_name = naiveCrackSeconds)]
    pub fn naive_crack_seconds(&self) -> f64 {
        self.inner.naive_crack_seconds()
    }

    #[wasm_bindgen(getter, js_name = naiveStrength)]
    pub fn naive_strength(&self) -> String {
        self.inner.naive_strength().as_str().to_owned()
    }
}

/// The random choices of one word password (FR-11). It gives the same words for every style.
#[wasm_bindgen]
pub struct WordDraw {
    inner: hekate_core::WordDraw,
}

#[wasm_bindgen]
impl WordDraw {
    /// Build the password for a style. The words are the same every time.
    pub fn render(
        &self,
        separator: &str,
        capitalization: &str,
        number: bool,
        symbol: bool,
    ) -> Result<Generated, JsError> {
        api::render_words(&self.inner, separator, capitalization, number, symbol)
            .map(|inner| Generated { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }
}

/// Check the SHA-256 hash of a word list and keep the list (SR-5).
#[wasm_bindgen(js_name = loadWordlist)]
pub fn load_wordlist(lang: &str, ascii: bool, bytes: &[u8]) -> Result<(), JsError> {
    api::load_wordlist(lang, ascii, bytes).map_err(|e| JsError::new(&e.to_string()))
}

/// Choose the random values of a word password. Call `render` to get the password.
#[wasm_bindgen(js_name = drawWords)]
pub fn draw_words(
    lang: &str,
    ascii: bool,
    words: usize,
    no_repeat: bool,
) -> Result<WordDraw, JsError> {
    api::draw_words(lang, ascii, words, no_repeat)
        .map(|inner| WordDraw { inner })
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Make a character password. `charsets` is a bit mask:
/// 1 lowercase, 2 capitals, 4 digits, 8 symbols.
#[wasm_bindgen(js_name = generateCharacters)]
pub fn generate_characters(
    length: usize,
    charsets: u8,
    avoid_similar: bool,
    no_repeat: bool,
) -> Result<Generated, JsError> {
    api::generate_characters(length, charsets, avoid_similar, no_repeat)
        .map(|inner| Generated { inner })
        .map_err(|e| JsError::new(&e.to_string()))
}
