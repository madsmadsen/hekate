//! Tests that run inside a real WebAssembly host (NFR-5).
//!
//! CI runs them in headless Chrome and Firefox. To run them in Node on a
//! developer machine, add `--cfg hekate_node` to RUSTFLAGS.
#![cfg(target_arch = "wasm32")]

use hekate_wasm::{generate_characters, generate_words, load_wordlist};
use wasm_bindgen_test::*;

#[cfg(not(hekate_node))]
wasm_bindgen_test_configure!(run_in_browser);

const EN_US: &[u8] = include_bytes!("../../../wordlists/en-US/words.txt");

#[wasm_bindgen_test]
fn nfr_5_fr_1_word_password_comes_from_the_loaded_list() {
    load_wordlist("en-US", false, EN_US).unwrap_or_else(|_| panic!("load failed"));
    let text = core::str::from_utf8(EN_US).unwrap();
    let g = generate_words("en-US", false, 5, "-", "lower", false, false)
        .unwrap_or_else(|_| panic!("generate failed"));
    let password = g.password();
    assert_eq!(password.split('-').count(), 5);
    for word in password.split('-') {
        assert!(text.lines().any(|l| l == word), "{word}");
    }
    assert!(g.entropy_bits() > 64.0);
}

#[wasm_bindgen_test]
fn nfr_5_sr_1_two_passwords_differ() {
    load_wordlist("en-US", false, EN_US).unwrap_or_else(|_| panic!("load failed"));
    let a = generate_characters(20, 15, false).unwrap_or_else(|_| panic!("generate failed"));
    let b = generate_characters(20, 15, false).unwrap_or_else(|_| panic!("generate failed"));
    assert_ne!(a.password(), b.password());
}

#[wasm_bindgen_test]
fn nfr_5_sr_5_changed_byte_is_refused() {
    let mut bad = EN_US.to_vec();
    bad[0] ^= 1;
    assert!(load_wordlist("en-US", false, &bad).is_err());
}

#[wasm_bindgen_test]
fn nfr_5_fr_63_character_password_has_each_selected_set() {
    let g = generate_characters(8, 15, false).unwrap_or_else(|_| panic!("generate failed"));
    let kinds = g.kinds();
    for k in ['l', 'u', 'd', 'y'] {
        assert!(kinds.contains(k), "{kinds}");
    }
}
