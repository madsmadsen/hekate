//! `cargo xtask dist`: build everything and assemble `dist/<version>/`.

use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha384};

use crate::bail;
use crate::log;
use crate::manifest;
use crate::util::{Context, Result, repo_root, which};

/// Turn unix seconds into `YYYY.MM.DD-HHMM` in UTC.
pub fn version_from_unix(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}.{m:02}.{d:02}-{:02}{:02}",
        rem / 3600,
        rem % 3600 / 60
    )
}

/// Days since 1970-01-01 to (year, month, day). Proleptic Gregorian calendar.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

/// A version looks like `2026.10.06-1405`.
pub fn validate_version(v: &str) -> Result<()> {
    let b = v.as_bytes();
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    let ok = b.len() == 15
        && digits(0..4)
        && b[4] == b'.'
        && digits(5..7)
        && b[7] == b'.'
        && digits(8..10)
        && b[10] == b'-'
        && digits(11..15);
    if !ok {
        bail!("bad version {v:?}. Use the form YYYY.MM.DD-HHMM, for example 2026.10.06-1405");
    }
    let month: u32 = v[5..7].parse().unwrap_or(0);
    let day: u32 = v[8..10].parse().unwrap_or(0);
    let hour: u32 = v[11..13].parse().unwrap_or(99);
    let minute: u32 = v[13..15].parse().unwrap_or(99);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 {
        bail!("bad version {v:?}. The date or time is out of range");
    }
    Ok(())
}

/// The SRI value of a file: `sha384-<base64 digest>`.
pub fn sri_value(bytes: &[u8]) -> String {
    format!("sha384-{}", STANDARD.encode(Sha384::digest(bytes)))
}

fn version(root: &Path) -> Result<String> {
    if let Some(v) = std::env::var_os("HEKATE_VERSION") {
        let v = v.to_string_lossy().into_owned();
        validate_version(&v)?;
        return Ok(v);
    }
    let out = Command::new("git")
        .current_dir(root)
        .args(["show", "-s", "--format=%ct", "HEAD"])
        .output()
        .context(|| "cannot start git".to_string())?;
    if !out.status.success() {
        bail!(
            "git show failed: {}. Set HEKATE_VERSION to override.",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let text = String::from_utf8(out.stdout)?;
    let secs: u64 = text
        .trim()
        .parse()
        .context(|| format!("bad commit time {:?}", text.trim()))?;
    let v = version_from_unix(secs);
    validate_version(&v)?;
    Ok(v)
}

fn copy(from: &Path, to: &Path) -> Result<()> {
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir).context(|| format!("cannot create {}", dir.display()))?;
    }
    std::fs::copy(from, to).context(|| format!("cannot copy {}", from.display()))?;
    Ok(())
}

pub fn run(_args: &[String]) -> Result<()> {
    let root = repo_root();

    crate::wordlists::ensure_built()?;
    crate::check::run(&[])?;
    crate::wasm::run(&[])?;

    if which("pnpm").is_none() {
        bail!("pnpm is not on PATH. Install pnpm, then run pnpm install.");
    }
    crate::util::run(
        Command::new("pnpm")
            .current_dir(&root)
            .args(["--filter", "@hekate/component", "build"]),
        "build the component",
    )?;

    let version = version(&root)?;
    log!("version {version}");
    let out = root.join("dist").join(&version);
    if out.exists() {
        std::fs::remove_dir_all(&out).context(|| format!("cannot remove {}", out.display()))?;
    }
    std::fs::create_dir_all(&out).context(|| format!("cannot create {}", out.display()))?;

    // Component files.
    let built = root.join("packages/component/dist");
    let js = built.join("hekate.js");
    copy(&js, &out.join("hekate.js"))?;
    copy(&built.join("hekate.wasm"), &out.join("hekate.wasm"))?;
    let locales = built.join("locales");
    if locales.is_dir() {
        let mut files: Vec<PathBuf> = std::fs::read_dir(&locales)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|x| x == "json"))
            .collect();
        files.sort();
        for f in files {
            copy(
                &f,
                &out.join("locales")
                    .join(f.file_name().expect("file has a name")),
            )?;
        }
    } else {
        log!("no locales folder in the component build. Skipped locales.");
    }

    // Word lists and their licenses.
    let wl = root.join("wordlists");
    let manifests = manifest::read_all(&wl)?;
    for m in &manifests {
        let dir = wl.join(&m.code);
        let to = out.join("wordlists").join(&m.code);
        copy(&dir.join("words.txt"), &to.join("words.txt"))?;
        copy(&dir.join("words-ascii.txt"), &to.join("words-ascii.txt"))?;
        copy(
            &dir.join("LICENSE"),
            &out.join("LICENSES").join(format!("{}.txt", m.code)),
        )?;
    }
    copy(&root.join("LICENSE"), &out.join("LICENSES/MIT.txt"))?;
    let notice = root.join("NOTICE");
    if notice.is_file() {
        copy(&notice, &out.join("NOTICE"))?;
    } else {
        log!("no NOTICE file in the repository. Skipped it.");
    }

    let html = crate::licenses_html::render(&root)?;
    std::fs::write(out.join("THIRD-PARTY-LICENSES.html"), html)?;

    let js_bytes = std::fs::read(&js).context(|| format!("cannot read {}", js.display()))?;
    std::fs::write(out.join("sri.txt"), format!("{}\n", sri_value(&js_bytes)))?;

    println!("{}", out.strip_prefix(&root).unwrap_or(&out).display());
    let mut files = Vec::new();
    list_files(&out, &mut files)?;
    for f in files {
        let size = std::fs::metadata(&f)?.len();
        let rel = f.strip_prefix(&out).unwrap_or(&f);
        println!("  {:>10}  {}", size, rel.display());
    }
    Ok(())
}

/// All files below `dir`, in sorted order.
fn list_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?
        .map(|e| e.map(|e| e.path()))
        .collect::<std::io::Result<_>>()?;
    entries.sort();
    for p in entries {
        if p.is_dir() {
            list_files(&p, out)?;
        } else {
            out.push(p);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_is_1970() {
        assert_eq!(version_from_unix(0), "1970.01.01-0000");
    }

    #[test]
    fn fr_51_version_is_utc_commit_time() {
        // 2026-10-06 12:00:00 UTC
        assert_eq!(version_from_unix(1_791_288_000), "2026.10.06-1200");
        assert_eq!(version_from_unix(1_791_316_800), "2026.10.06-2000");
    }

    #[test]
    fn leap_days_and_month_ends() {
        // 2024-02-29 23:59:59, 2024-03-01 00:00:00
        assert_eq!(version_from_unix(1_709_251_199), "2024.02.29-2359");
        assert_eq!(version_from_unix(1_709_251_200), "2024.03.01-0000");
        // 2000-02-29 (leap century), 2100-03-01 (not leap)
        assert_eq!(version_from_unix(951_782_400), "2000.02.29-0000");
        assert_eq!(version_from_unix(4_107_542_400), "2100.03.01-0000");
        // 1999-12-31 23:59
        assert_eq!(version_from_unix(946_684_740), "1999.12.31-2359");
    }

    #[test]
    fn version_validation() {
        assert!(validate_version("2026.10.06-1405").is_ok());
        for bad in [
            "",
            "2026.10.06",
            "2026-10-06-1405",
            "2026.13.06-1405",
            "2026.10.32-1405",
            "2026.10.06-2405",
            "2026.10.06-1460",
            "../../x/y/z/abc",
            "2026.10.06-14a5",
            "2026.00.06-1405",
        ] {
            assert!(validate_version(bad).is_err(), "{bad:?} must fail");
        }
    }

    #[test]
    fn generated_versions_validate() {
        for secs in [0, 86_399, 1_709_251_200, 1_791_316_800, 4_107_542_400] {
            assert!(validate_version(&version_from_unix(secs)).is_ok());
        }
    }

    #[test]
    fn fr_46_sri_value_format() {
        assert_eq!(
            sri_value(b""),
            "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb"
        );
    }
}
