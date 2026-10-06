//! Hekate core: random selection, password assembly and entropy.
//!
//! This crate does no I/O. The caller gives the random generator as a
//! parameter, so tests can use fixed bytes (see SR-2).

mod chars;
mod entropy;
mod sample;
mod words;

pub use chars::{CharOptions, SYMBOLS, generate_characters};
pub use entropy::{Strength, crack_seconds};
pub use sample::uniform_below;
pub use words::{Capitalization, Separator, WordList, WordOptions, generate_words};

/// Kind letters, one per Unicode code point of the password.
///
/// Word mode: `w` word letter, `s` separator, `n` number digit, `y` symbol.
/// Character mode: `l` lowercase, `u` capital, `d` digit, `y` symbol.
pub type Kinds = String;

/// A finished password with its strength data.
#[derive(Debug, Clone, PartialEq)]
pub struct Generated {
    pub text: String,
    pub kinds: Kinds,
    pub entropy_bits: f64,
}

impl Generated {
    pub fn crack_seconds(&self) -> f64 {
        crack_seconds(self.entropy_bits)
    }

    pub fn strength(&self) -> Strength {
        Strength::from_bits(self.entropy_bits)
    }
}

/// Errors that stop password generation (fail closed, SR-3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The word list has fewer than two words.
    WordListTooSmall,
    /// The number of words is not from 3 to 10.
    WordCount,
    /// The length is not from 8 to 64.
    Length,
    /// No character set is selected.
    NoCharset,
}

impl core::fmt::Display for Error {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(match self {
            Error::WordListTooSmall => "word list is too small",
            Error::WordCount => "number of words must be from 3 to 10",
            Error::Length => "length must be from 8 to 64",
            Error::NoCharset => "select at least one character set",
        })
    }
}

impl std::error::Error for Error {}
