//! Mark-to-market kernels: `unrealized[i] = qty[i] * price[i] - cost[i]`.
//!
//! The scalar loop is the reference. The AVX2 version processes 8 lanes
//! per iteration with one fused multiply-subtract and is used only when
//! the CPU reports `avx2` and `fma` at runtime. A test asserts the two
//! agree within float tolerance, including non-multiple-of-8 lengths.
//!
//! f32 is used for the streamed display totals only; the app's own
//! bookkeeping stays in exact decimals.

pub fn mark_scalar(qty: &[f32], price: &[f32], cost: &[f32], out: &mut [f32]) {
    let n = qty.len();
    for i in 0..n {
        out[i] = qty[i] * price[i] - cost[i];
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
pub unsafe fn mark_avx2(qty: &[f32], price: &[f32], cost: &[f32], out: &mut [f32]) {
    use std::arch::x86_64::*;
    let n = qty.len();
    let chunks = n / 8;
    for c in 0..chunks {
        let o = c * 8;
        let q = _mm256_loadu_ps(qty.as_ptr().add(o));
        let p = _mm256_loadu_ps(price.as_ptr().add(o));
        let k = _mm256_loadu_ps(cost.as_ptr().add(o));
        // q*p - k in one rounding step.
        let r = _mm256_fmsub_ps(q, p, k);
        _mm256_storeu_ps(out.as_mut_ptr().add(o), r);
    }
    let tail = chunks * 8;
    mark_scalar(&qty[tail..], &price[tail..], &cost[tail..], &mut out[tail..]);
}

pub fn avx2_available() -> bool {
    #[cfg(target_arch = "x86_64")]
    { std::is_x86_feature_detected!("avx2") && std::is_x86_feature_detected!("fma") }
    #[cfg(not(target_arch = "x86_64"))]
    { false }
}

/// Runtime dispatch.
pub fn mark(qty: &[f32], price: &[f32], cost: &[f32], out: &mut [f32]) {
    debug_assert!(price.len() >= qty.len() && cost.len() >= qty.len() && out.len() >= qty.len());
    #[cfg(target_arch = "x86_64")]
    {
        if avx2_available() {
            // SAFETY: feature check passed; slice lengths asserted above.
            unsafe { mark_avx2(qty, price, cost, out) };
            return;
        }
    }
    mark_scalar(qty, price, cost, out);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avx2_matches_scalar() {
        if !avx2_available() { eprintln!("no AVX2 on this machine; skipping"); return; }
        for n in [0usize, 1, 7, 8, 9, 100, 1001] {
            let qty: Vec<f32> = (0..n).map(|i| (i % 50) as f32 + 0.5).collect();
            let price: Vec<f32> = (0..n).map(|i| 100.0 + (i % 97) as f32 * 1.25).collect();
            let cost: Vec<f32> = (0..n).map(|i| 90.0 * ((i % 50) as f32 + 0.5)).collect();
            let mut a = vec![0.0f32; n];
            let mut b = vec![0.0f32; n];
            mark_scalar(&qty, &price, &cost, &mut a);
            unsafe { mark_avx2(&qty, &price, &cost, &mut b) };
            for i in 0..n {
                assert!((a[i] - b[i]).abs() <= 1e-3 * (1.0 + a[i].abs()), "n={n} i={i}: {} vs {}", a[i], b[i]);
            }
        }
    }

    #[test]
    fn values_are_right() {
        let mut out = [0.0f32; 2];
        mark(&[10.0, 5.0], &[150.0, 20.0], &[1000.0, 150.0], &mut out);
        assert_eq!(out, [500.0, -50.0]);
    }
}
