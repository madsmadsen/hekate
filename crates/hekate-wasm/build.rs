// Reads wordlists/hashes.tsv (written by `cargo xtask wasm`) and turns it into
// a Rust table. The hashes end up inside the WASM module (SR-5).
use std::{env, fs, path::Path};

fn main() {
    let tsv = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../wordlists/hashes.tsv");
    println!("cargo:rerun-if-changed={}", tsv.display());
    let text = fs::read_to_string(&tsv).unwrap_or_default();
    let mut out = String::from("pub static HASHES: &[(&str, &str)] = &[\n");
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        let (key, hash) = line.split_once('\t').expect("hashes.tsv: key<TAB>sha256");
        assert!(
            hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()),
            "bad hash for {key}"
        );
        out.push_str(&format!("    ({key:?}, {hash:?}),\n"));
    }
    out.push_str("];\n");
    let dest = Path::new(&env::var("OUT_DIR").unwrap()).join("hashes.rs");
    fs::write(dest, out).unwrap();
}
