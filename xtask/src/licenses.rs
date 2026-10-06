//! Classify the license of a word list source (PRD 7.2, NFR-9).

/// What kind of duties a license puts on a word list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// CC0 or public domain. No duties.
    PublicDomain,
    /// MIT, BSD, Apache-2.0. Keep the notice.
    Permissive,
    /// CC BY. Give credit, link the license, say that the work changed.
    Attribution,
    /// GPL, LGPL, MPL, EUPL. The list keeps this license.
    Copyleft,
}

/// Split a license text into words: letters and digits only, uppercase.
fn tokens(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_ascii_uppercase)
        .collect()
}

/// Classify one license name (no `or` or `and` inside).
fn classify_single(text: &str) -> Result<Kind, String> {
    let t = tokens(text);
    let first = t.first().map(String::as_str).unwrap_or("");
    let joined: String = t.concat();
    if joined.contains("PUBLICDOMAIN") || joined.starts_with("CC0") || joined == "UNLICENSE" {
        return Ok(Kind::PublicDomain);
    }
    if first == "CC" {
        // Creative Commons: `CC BY 4.0`, `CC-BY-SA-3.0`, `CC BY-NC`.
        let terms: Vec<&str> = t[1..]
            .iter()
            .map(String::as_str)
            .filter(|x| x.chars().next().is_some_and(|c| c.is_ascii_alphabetic()))
            .collect();
        for bad in ["SA", "NC", "ND"] {
            if terms.contains(&bad) {
                return Err(format!(
                    "{text:?} has the {bad} term (ShareAlike, NonCommercial or NoDerivatives)"
                ));
            }
        }
        return if terms == ["BY"] {
            Ok(Kind::Attribution)
        } else {
            Err(format!("{text:?} is not CC0 or CC BY"))
        };
    }
    for (prefix, kind) in [
        ("MIT", Kind::Permissive),
        ("BSD", Kind::Permissive),
        ("APACHE", Kind::Permissive),
        ("LGPL", Kind::Copyleft),
        ("GPL", Kind::Copyleft),
        ("MPL", Kind::Copyleft),
        ("EUPL", Kind::Copyleft),
    ] {
        if first == prefix {
            return Ok(kind);
        }
    }
    Err(format!(
        "{text:?} is not on the allowed list of PRD section 7.2"
    ))
}

/// Check a license field of a manifest. `A or B` needs one allowed choice.
/// `A and B` needs both. Return the strictest kind, or the reason for the refusal.
pub fn classify(license: &str) -> Result<Kind, String> {
    let lower = license.to_ascii_lowercase();
    // Split on " and " first, because " or " binds weaker (a choice inside a pair).
    if lower.contains(" and ") {
        let mut worst = Kind::PublicDomain;
        let mut start = 0;
        for part in split_keep(&lower, license, " and ", &mut start) {
            worst = stricter(worst, classify(&part)?);
        }
        return Ok(worst);
    }
    if lower.contains(" or ") {
        let mut start = 0;
        let mut best: Option<Kind> = None;
        let mut first_err = None;
        for part in split_keep(&lower, license, " or ", &mut start) {
            match classify(&part) {
                Ok(k) => best = Some(best.map_or(k, |b| easier(b, k))),
                Err(e) => first_err = first_err.or(Some(e)),
            }
        }
        return best.ok_or_else(|| first_err.unwrap_or_default());
    }
    classify_single(license)
}

/// Split `original` at `sep`, matching on the lowercase copy (same byte positions for ASCII).
fn split_keep(lower: &str, original: &str, sep: &str, _start: &mut usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut pos = 0;
    while let Some(i) = lower[pos..].find(sep) {
        out.push(original[pos..pos + i].trim().to_string());
        pos += i + sep.len();
    }
    out.push(original[pos..].trim().to_string());
    out
}

fn rank(k: Kind) -> u8 {
    match k {
        Kind::PublicDomain => 0,
        Kind::Permissive => 1,
        Kind::Attribution => 2,
        Kind::Copyleft => 3,
    }
}

/// The kind with more duties.
pub fn stricter(a: Kind, b: Kind) -> Kind {
    if rank(a) >= rank(b) { a } else { b }
}

fn easier(a: Kind, b: Kind) -> Kind {
    if rank(a) <= rank(b) { a } else { b }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nfr_9_allowed_licenses_pass() {
        for l in [
            "CC0",
            "CC0-1.0",
            "Public domain",
            "public-domain",
            "MIT",
            "MIT-style permission",
            "BSD-3-Clause",
            "Apache-2.0",
            "CC BY 3.0",
            "CC BY 4.0",
            "CC-BY-4.0",
            "GPL-2.0",
            "GPL-3.0-or-later",
            "LGPL-3.0",
            "MPL-2.0",
            "MPL-1.1",
            "EUPL-1.2",
        ] {
            assert!(classify(l).is_ok(), "{l} should pass");
        }
    }

    #[test]
    fn nfr_9_sharealike_noncommercial_noderivatives_fail() {
        for l in [
            "CC BY-SA 4.0",
            "CC-BY-SA-3.0",
            "CC BY-NC 4.0",
            "CC BY-NC-SA 4.0",
            "CC BY-ND 4.0",
            "CC-BY-NC-ND-4.0",
            "CC BY-SA",
        ] {
            assert!(classify(l).is_err(), "{l} should fail");
        }
    }

    #[test]
    fn nfr_9_unknown_or_missing_licenses_fail() {
        for l in ["", "research use only", "custom", "unknown", "ISC", "CC"] {
            assert!(classify(l).is_err(), "{l:?} should fail");
        }
    }

    #[test]
    fn nfr_9_kinds_are_detected() {
        assert_eq!(classify("CC0").unwrap(), Kind::PublicDomain);
        assert_eq!(classify("MIT").unwrap(), Kind::Permissive);
        assert_eq!(classify("CC BY 4.0").unwrap(), Kind::Attribution);
        assert_eq!(classify("MPL-1.1").unwrap(), Kind::Copyleft);
    }

    #[test]
    fn nfr_9_or_needs_one_allowed_choice_and_needs_all() {
        assert_eq!(classify("CC BY-SA 4.0 or MIT").unwrap(), Kind::Permissive);
        assert!(classify("CC BY-SA 4.0 or CC BY-NC 4.0").is_err());
        assert_eq!(classify("CC0 and CC BY 4.0").unwrap(), Kind::Attribution);
        assert!(classify("CC BY 4.0 and CC BY-SA 4.0").is_err());
    }
}
