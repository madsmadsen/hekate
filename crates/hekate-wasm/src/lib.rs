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
}

/// Check the SHA-256 hash of a word list and keep the list (SR-5).
#[wasm_bindgen(js_name = loadWordlist)]
pub fn load_wordlist(lang: &str, ascii: bool, bytes: &[u8]) -> Result<(), JsError> {
    api::load_wordlist(lang, ascii, bytes).map_err(|e| JsError::new(&e.to_string()))
}

/// Make a word password.
#[wasm_bindgen(js_name = generateWords)]
pub fn generate_words(
    lang: &str,
    ascii: bool,
    words: usize,
    separator: &str,
    capitalization: &str,
    number: bool,
    symbol: bool,
) -> Result<Generated, JsError> {
    api::generate_words(
        lang,
        ascii,
        words,
        separator,
        capitalization,
        number,
        symbol,
    )
    .map(|inner| Generated { inner })
    .map_err(|e| JsError::new(&e.to_string()))
}

/// Make a character password. `charsets` is a bit mask:
/// 1 lowercase, 2 capitals, 4 digits, 8 symbols.
#[wasm_bindgen(js_name = generateCharacters)]
pub fn generate_characters(
    length: usize,
    charsets: u8,
    avoid_similar: bool,
) -> Result<Generated, JsError> {
    api::generate_characters(length, charsets, avoid_similar)
        .map(|inner| Generated { inner })
        .map_err(|e| JsError::new(&e.to_string()))
}
