/// Attacker speed in guesses per second (FR-21).
pub const GUESSES_PER_SECOND: f64 = 1e10;

/// Average time in seconds to guess a password with `bits` of entropy.
pub fn crack_seconds(bits: f64) -> f64 {
    (bits - 1.0).exp2() / GUESSES_PER_SECOND
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
        let g = crate::Generated {
            text: String::new(),
            kinds: String::new(),
            entropy_bits: 41.0,
        };
        // 2^(41 - 1) / 10^10 seconds.
        let expected = 2f64.powi(40) / 1e10;
        assert!((g.crack_seconds() - expected).abs() < 1e-9 * expected);
        assert_eq!(g.crack_seconds(), crack_seconds(41.0));
    }
}
