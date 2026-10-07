use rand_core::RngCore;

/// Return a uniform random number in `0..n` with rejection sampling.
///
/// Values below `2^32 mod n` are discarded. The remaining count is a
/// multiple of `n`, so every result has the same chance (SR-2).
///
/// # Panics
/// Panics if `n` is 0.
pub fn uniform_below<R: RngCore + ?Sized>(rng: &mut R, n: u32) -> u32 {
    assert!(n > 0, "n must be greater than 0");
    let reject_below = n.wrapping_neg() % n;
    loop {
        let v = rng.next_u32();
        if v >= reject_below {
            return v % n;
        }
    }
}

#[cfg(test)]
pub(crate) mod test_util {
    use rand::SeedableRng;
    use rand::rngs::StdRng;

    /// Fixed-seed generator that only tests use.
    pub fn rng(seed: u64) -> StdRng {
        StdRng::seed_from_u64(seed)
    }

    /// Chi-square statistic for observed counts and equal expected chances.
    pub fn chi_square(counts: &[u64]) -> f64 {
        let total: u64 = counts.iter().sum();
        let expected = total as f64 / counts.len() as f64;
        counts
            .iter()
            .map(|&c| (c as f64 - expected).powi(2) / expected)
            .sum()
    }

    /// Critical chi-square value for p = 0.001, by degrees of freedom.
    pub fn critical_001(df: usize) -> f64 {
        match df {
            1 => 10.828,
            5 => 20.515,
            15 => 37.697,
            16 => 39.252,
            17 => 40.790,
            33 => 63.870,
            99 => 148.230,
            _ => panic!("no critical value for df {df}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand_core::{RngCore, impls};

    struct Fixed(Vec<u32>, usize);
    impl RngCore for Fixed {
        fn next_u32(&mut self) -> u32 {
            let v = self.0[self.1];
            self.1 += 1;
            v
        }
        fn next_u64(&mut self) -> u64 {
            impls::next_u64_via_u32(self)
        }
        fn fill_bytes(&mut self, dest: &mut [u8]) {
            impls::fill_bytes_via_next(self, dest)
        }
    }

    #[test]
    fn sr_2_discards_values_below_rejection_limit() {
        // 2^32 mod 3 = 1, so only the value 0 is rejected.
        let mut rng = Fixed(vec![0, 0, 5], 0);
        assert_eq!(uniform_below(&mut rng, 3), 2);
        assert_eq!(rng.1, 3);
    }

    #[test]
    fn sr_2_power_of_two_never_rejects() {
        let mut rng = Fixed(vec![0, 1], 0);
        assert_eq!(uniform_below(&mut rng, 4), 0);
        assert_eq!(rng.1, 1);
    }

    #[test]
    fn sr_2_n_of_one_is_always_zero() {
        let mut rng = test_util::rng(1);
        assert_eq!(uniform_below(&mut rng, 1), 0);
    }

    #[test]
    fn sr_2_uniform_over_100_values() {
        let mut rng = test_util::rng(7);
        let mut counts = [0u64; 100];
        for _ in 0..200_000 {
            counts[uniform_below(&mut rng, 100) as usize] += 1;
        }
        assert!(test_util::chi_square(&counts) < test_util::critical_001(99));
    }
}
