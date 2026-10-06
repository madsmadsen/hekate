//! `cargo xtask`: the build tool of Hekate. See `wordlists/README.md`.

mod benchmark;
mod check;
mod config;
mod count;
mod credits;
mod dist;
mod fetch;
mod hunspell;
mod licenses;
mod licenses_html;
mod manifest;
mod pipeline;
mod util;
mod wasm;
mod wordlists;

use util::{Error, Result};

const USAGE: &str = "\
Usage: cargo xtask <command> [options]

Commands:
  wordlists [--lang CODE]... [--fixture-dir DIR] [--update-hashes] [--jobs N]
      Build the word lists from config.toml files (PRD 7.3).
  benchmark [select] [--lang CODE]...
      Measure S and R combinations and pick one (PRD 7.6).
  wasm
      Write wordlists/hashes.tsv and build the WASM module.
  dist
      Build everything into dist/<version>/.
  check-manifests [--dir DIR] [--lang CODE]...
      Check licenses, sizes, NFC and hashes of the word lists (NFR-9).
  notice
      Write NOTICE from the manifests.
";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Err(e) = run(&args) {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

fn run(args: &[String]) -> Result<()> {
    let Some((cmd, rest)) = args.split_first() else {
        print!("{USAGE}");
        return Ok(());
    };
    match cmd.as_str() {
        "wordlists" => wordlists::run(rest),
        "benchmark" => benchmark::run(rest),
        "check-manifests" => check::run(rest),
        "notice" => wordlists::write_notice(),
        "wasm" => wasm::run(rest),
        "dist" => dist::run(rest),
        "help" | "--help" | "-h" => {
            print!("{USAGE}");
            Ok(())
        }
        other => Err(Error(format!("unknown command {other:?}\n{USAGE}"))),
    }
}
