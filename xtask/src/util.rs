//! Small shared helpers: errors, paths, hashing and running commands.

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

/// The one error type of xtask. It holds a message for a person to read.
#[derive(Debug)]
pub struct Error(pub String);

pub type Result<T> = std::result::Result<T, Error>;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error(format!("I/O error: {e}"))
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error(format!("JSON error: {e}"))
    }
}

impl From<toml::de::Error> for Error {
    fn from(e: toml::de::Error) -> Self {
        Error(format!("TOML error: {e}"))
    }
}

impl From<std::string::FromUtf8Error> for Error {
    fn from(e: std::string::FromUtf8Error) -> Self {
        Error(format!("text is not valid UTF-8: {e}"))
    }
}

/// Make an `Err(Error)` from a format string.
#[macro_export]
macro_rules! bail {
    ($($arg:tt)*) => {
        return Err($crate::util::Error(format!($($arg)*)))
    };
}

/// Add a sentence of context to an error.
pub trait Context<T> {
    fn context(self, msg: impl FnOnce() -> String) -> Result<T>;
}

impl<T, E: fmt::Display> Context<T> for std::result::Result<T, E> {
    fn context(self, msg: impl FnOnce() -> String) -> Result<T> {
        self.map_err(|e| Error(format!("{}: {e}", msg())))
    }
}

/// Print a progress line to stderr.
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {
        eprintln!("xtask: {}", format!($($arg)*))
    };
}

/// The root folder of the repository.
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask lives in a folder of the repository")
        .to_path_buf()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

pub fn sha256_file(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path).context(|| format!("cannot read {}", path.display()))?;
    Ok(sha256_hex(&bytes))
}

/// Run a command in `cwd`. Fail with a clear message if it fails or is missing.
pub fn run(cmd: &mut Command, what: &str) -> Result<()> {
    log!("{what}: {cmd:?}");
    let status = cmd.status().map_err(|e| {
        Error(format!(
            "cannot start {:?} ({what}): {e}. Is it installed and on PATH?",
            cmd.get_program()
        ))
    })?;
    if !status.success() {
        bail!("{what} failed with {status}");
    }
    Ok(())
}

/// Find a program on PATH.
pub fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|p| p.is_file())
}

impl From<csv::Error> for Error {
    fn from(e: csv::Error) -> Self {
        Error(format!("CSV error: {e}"))
    }
}
