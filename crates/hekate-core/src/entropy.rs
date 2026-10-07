/// Attacker speed in guesses per second (FR-21).
pub const GUESSES_PER_SECOND: f64 = 1e10;

/// Average time in seconds to guess a password with `bits` of entropy.
pub fn crack_seconds(bits: f64) -> f64 {
    (bits - 1.0).exp2() / GUESSES_PER_SECOND
}

/// Entropy in bits for an attacker who knows nothing about the password (FR-24).
///
/// The attacker tries every password of the same length that uses only the
/// character groups in the password (Appendix A.3).
pub fn naive_entropy(text: &str) -> f64 {
    // Group sizes: lowercase, capitals, digits, other printable ASCII, all others.
    let mut present = [false; 5];
    let mut length = 0usize;
    for c in text.chars() {
        length += 1;
        let group = match c {
            'a'..='z' => 0,
            'A'..='Z' => 1,
            '0'..='9' => 2,
            ' '..='~' => 3,
            _ => 4,
        };
        present[group] = true;
    }
    const SIZES: [u32; 5] = [26, 26, 10, 33, 190];
    let pool: u32 = present
        .iter()
        .zip(SIZES)
        .filter(|(on, _)| **on)
        .map(|(_, size)| size)
        .sum();
    if length == 0 {
        return 0.0;
    }
    length as f64 * f64::from(pool).log2()
}

/// Strength label (FR-22).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Strength {
    Weak,
    Fair,
    Strong,
    VeryStrong,
}

impl Strength {
    pub fn from_bits(bits: f64) -> Self {
        if bits < 45.0 {
            Strength::Weak
        } else if bits < 60.0 {
            Strength::Fair
        } else if bits < 80.0 {
            Strength::Strong
        } else {
            Strength::VeryStrong
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Strength::Weak => "weak",
            Strength::Fair => "fair",
            Strength::Strong => "strong",
            Strength::VeryStrong => "very-strong",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fr_22_label_boundaries() {
        assert_eq!(Strength::from_bits(44.99), Strength::Weak);
        assert_eq!(Strength::from_bits(45.00), Strength::Fair);
        assert_eq!(Strength::from_bits(59.99), Strength::Fair);
        assert_eq!(Strength::from_bits(60.00), Strength::Strong);
        assert_eq!(Strength::from_bits(79.99), Strength::Strong);
        assert_eq!(Strength::from_bits(80.00), Strength::VeryStrong);
    }

    #[test]
    fn fr_21_five_words_take_about_45_years() {
        let bits = 5.0 * 7776f64.log2();
        let years = crack_seconds(bits) / (365.25 * 86_400.0);
        assert!((44.5..45.5).contains(&years), "{years}");
    }

    #[test]
    fn fr_21_thirty_bits_is_under_one_second() {
        assert!(crack_seconds(30.0) < 1.0);
    }

    #[test]
    fn fr_22_strength_names() {
        assert_eq!(Strength::Weak.as_str(), "weak");
        assert_eq!(Strength::Fair.as_str(), "fair");
        assert_eq!(Strength::Strong.as_str(), "strong");
        assert_eq!(Strength::VeryStrong.as_str(), "very-strong");
    }

    #[test]
    fn fr_21_generated_reports_the_crack_time_of_its_entropy() {
        let g = crate::Generated::new(String::new(), String::new(), 41.0);
        // 2^(41 - 1) / 10^10 seconds.
        let expected = 2f64.powi(40) / 1e10;
        assert!((g.crack_seconds() - expected).abs() < 1e-9 * expected);
        assert_eq!(g.crack_seconds(), crack_seconds(41.0));
    }

    #[test]
    fn fr_24_naive_entropy_examples() {
        let h = |t: &str| naive_entropy(t);
        assert!((h("BraveMapleRiverCloudStone") - 142.5).abs() < 0.05);
        assert!((h("Brave-Maple-42-River!") - 138.0).abs() < 0.05);
        assert!((h("aB3!efgh") - 52.6).abs() < 0.05);
        assert!((h("smörgås-tårta-fika") - 143.3).abs() < 0.05);
    }

    #[test]
    fn fr_24_naive_entropy_of_an_empty_text_is_zero() {
        assert_eq!(naive_entropy(""), 0.0);
    }

    #[test]
    fn fr_24_naive_entropy_counts_each_group_once() {
        // One lowercase group of 26: 3 * log2(26), however often the group repeats.
        assert!((naive_entropy("abc") - 3.0 * 26f64.log2()).abs() < 1e-9);
        // Space is in the group of 33 other printable ASCII characters.
        assert!((naive_entropy(" ") - 33f64.log2()).abs() < 1e-9);
        // A character outside printable ASCII uses the group of 190.
        assert!((naive_entropy("é") - 190f64.log2()).abs() < 1e-9);
    }
}
