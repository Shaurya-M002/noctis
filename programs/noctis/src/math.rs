//! Fixed-point premium math, mirrored bit-for-bit by `app/src/lib/pricing.ts`.
//!
//! Everything is unsigned integer arithmetic in one of two scales:
//!   * PPM  (1e6) for ratios, sigma, coefficients, utilisation
//!   * micro-USDC (1e6) for money
//!
//! No floats: a validator must reproduce the same premium the client was shown,
//! and floats do not agree across targets.

pub const PPM: u128 = 1_000_000;

/// E[(Z - k)^+] in PPM, under a Student-t with 4 degrees of freedom standardised
/// to unit variance.
///
/// Not the Gaussian, and not a guess. `engine/backtest.ts` measures 76.1% of
/// opening prints inside +/-1 sigma and 95.8% inside +/-2, against 68.3% / 95.4%
/// for a normal and 76.98% / 95.26% for a standardised t(4). The overnight gap
/// distribution is peaked and fat-tailed and this is the shape it has.
///
/// At these strikes the taller peak beats the fatter tail, so the honest price is
/// LOWER than the Gaussian one:
///   k = 0  -> 0.353549   (Gaussian 0.398942, 0.886x)
///   k = 1  -> 0.077346   (Gaussian 0.083315, 0.928x)
///
/// The tier set is fixed, so these stay constants rather than an on-chain erf.
/// Mirrored by `PE_T4` in `app/src/lib/pricing.ts`.
pub const COEF_PIN: u128 = 353_549; // k = 0
pub const COEF_BAND: u128 = 77_346; // k = 1

/// The three assurance tiers. `k` is the deductible in whole sigma.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Tier {
    /// No cover. Never costs anything.
    Raw = 0,
    /// User absorbs the first 1 sigma.
    Band = 1,
    /// User is made whole to the official opening print.
    Pin = 2,
}

impl Tier {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Tier::Raw),
            1 => Some(Tier::Band),
            2 => Some(Tier::Pin),
            _ => None,
        }
    }

    /// Partial-expectation coefficient in PPM.
    pub fn coef(self) -> u128 {
        match self {
            Tier::Raw => 0,
            Tier::Band => COEF_BAND,
            Tier::Pin => COEF_PIN,
        }
    }

    /// Deductible in whole sigma.
    pub fn k(self) -> u128 {
        match self {
            Tier::Raw => u128::MAX,
            Tier::Band => 1,
            Tier::Pin => 0,
        }
    }
}

/// Itemised so the client can show the user exactly what they are paying for.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Premium {
    pub fair: u64,
    pub util_load: u64,
    pub size_load: u64,
    pub total: u64,
    pub capital_at_risk: u64,
}

/// Minimum chargeable premium, 1 cent, so dust trades cannot mint free optionality.
pub const PREMIUM_FLOOR: u64 = 10_000; // micro-USDC

/// Quote a premium.
///
/// * `notional`   micro-USDC
/// * `sigma_ppm`  fractional 1-sigma of the reopening gap, PPM (18_000 = 1.8%)
/// * `tvl`        vault underwriting capital, micro-USDC
/// * `exposure`   capital already committed, micro-USDC
/// * `depth`      on-chain depth for the asset, micro-USDC
///
/// premium = N·σ·E[(Z−k)⁺] · (1 + u² + min(1.5, 1.2·N/depth))
pub fn quote_premium(
    notional: u64,
    sigma_ppm: u64,
    tier: Tier,
    tvl: u64,
    exposure: u64,
    depth: u64,
) -> Option<Premium> {
    let n = notional as u128;
    let sigma = sigma_ppm as u128;

    // 4-sigma tail beyond the user's own deductible is what the vault must reserve.
    let k = tier.k();
    let reserve_sigmas = if k >= 4 { 0u128 } else { 4 - k };
    // Downcasts are checked: silently truncating a u128 here would hand out
    // free optionality on an absurdly large ticket.
    let capital_at_risk = u64::try_from(
        n.checked_mul(sigma)?
            .checked_mul(reserve_sigmas)?
            .checked_div(PPM)?,
    ).ok()?;

    if tier == Tier::Raw {
        return Some(Premium { capital_at_risk: 0, ..Default::default() });
    }

    // fair = N * sigma * coef
    let fair = n
        .checked_mul(sigma)?
        .checked_div(PPM)?
        .checked_mul(tier.coef())?
        .checked_div(PPM)?;

    // u = min(1, exposure / tvl), in PPM
    let u_ppm = if tvl == 0 {
        PPM
    } else {
        core::cmp::min(PPM, (exposure as u128).checked_mul(PPM)?.checked_div(tvl as u128)?)
    };
    // util_load = fair * u^2
    let util_load = fair
        .checked_mul(u_ppm)?
        .checked_div(PPM)?
        .checked_mul(u_ppm)?
        .checked_div(PPM)?;

    // conc = min(1.5, 1.2 * notional / depth), in PPM
    let conc_ppm = if depth == 0 {
        1_500_000
    } else {
        core::cmp::min(
            1_500_000u128,
            n.checked_mul(1_200_000)?.checked_div(depth as u128)?,
        )
    };
    let size_load = fair.checked_mul(conc_ppm)?.checked_div(PPM)?;

    let total = core::cmp::max(
        PREMIUM_FLOOR as u128,
        fair.checked_add(util_load)?.checked_add(size_load)?,
    );

    Some(Premium {
        fair: u64::try_from(fair).ok()?,
        util_load: u64::try_from(util_load).ok()?,
        size_load: u64::try_from(size_load).ok()?,
        total: u64::try_from(total).ok()?,
        capital_at_risk,
    })
}

/// What the vault owes on one receipt once the official opening print is known.
///
/// Deliberately asymmetric: a gap in the holder's favour is theirs to keep. This
/// is insurance, not a swap, and pricing it as a swap would halve the premium and
/// double the vault's variance.
///
/// * `is_buy`      side of the original fill
/// * `fill_price`  micro-USD per unit
/// * `open_price`  micro-USD per unit, from the reopening auction
/// * `sigma_abs`   1 sigma in micro-USD per unit, frozen at trade time
/// * `qty_micro`   quantity, 1e6 scale
pub fn settlement_payout(
    is_buy: bool,
    fill_price: u64,
    open_price: u64,
    sigma_abs: u64,
    qty_micro: u64,
    tier: Tier,
) -> Option<u64> {
    if tier == Tier::Raw {
        return Some(0);
    }
    // A buyer is hurt when the auction prints below the fill.
    let adverse = if is_buy {
        fill_price.saturating_sub(open_price)
    } else {
        open_price.saturating_sub(fill_price)
    } as u128;

    let deductible = (sigma_abs as u128).checked_mul(tier.k())?;
    let excess = adverse.saturating_sub(deductible);

    u64::try_from(excess.checked_mul(qty_micro as u128)?.checked_div(PPM)?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const M: u64 = 1_000_000;

    #[test]
    fn pin_prices_the_measured_distribution_not_a_gaussian() {
        // $100k notional, sigma 2%, empty vault, deep book.
        let p = quote_premium(100_000 * M, 20_000, Tier::Pin, 10_000_000 * M, 0, 10_000_000 * M)
            .unwrap();
        // fair = 100_000 * 0.02 * 0.353549 = 707.098
        assert_eq!(p.fair, 707_098_000);
        // Materially cheaper than the Gaussian half-straddle (797.884) it replaced.
        assert!(p.fair < 797_884_000);
        // No utilisation, negligible concentration.
        assert!(p.total >= p.fair);
        assert!(p.total < p.fair * 2);
    }

    #[test]
    fn band_is_much_cheaper_than_pin() {
        let args = (100_000 * M, 20_000, 10_000_000 * M, 0u64, 10_000_000 * M);
        let pin = quote_premium(args.0, args.1, Tier::Pin, args.2, args.3, args.4).unwrap();
        let band = quote_premium(args.0, args.1, Tier::Band, args.2, args.3, args.4).unwrap();
        // 0.077346 / 0.353549 ~= 0.2188
        assert!(band.total * 4 < pin.total);
        assert!(band.total * 5 > pin.total);
    }

    #[test]
    fn raw_is_always_free() {
        let p = quote_premium(1_000_000 * M, 90_000, Tier::Raw, 1 * M, 1 * M, 1 * M).unwrap();
        assert_eq!(p.total, 0);
        assert_eq!(p.capital_at_risk, 0);
    }

    #[test]
    fn premium_rises_with_utilisation() {
        let q = |exp| quote_premium(50_000 * M, 25_000, Tier::Band, 1_000_000 * M, exp, 1_000_000 * M).unwrap().total;
        let empty = q(0);
        let half = q(500_000 * M);
        let full = q(1_000_000 * M);
        assert!(empty < half, "{empty} !< {half}");
        assert!(half < full, "{half} !< {full}");
        // Quadratic: the first half of capacity costs far less than the second.
        assert!(full - half > half - empty);
    }

    #[test]
    fn premium_rises_with_concentration() {
        let q = |depth| quote_premium(50_000 * M, 25_000, Tier::Band, 1_000_000 * M, 0, depth).unwrap().total;
        assert!(q(1_000_000 * M) < q(100_000 * M));
    }

    #[test]
    fn dust_still_pays_the_floor() {
        let p = quote_premium(1_000, 10_000, Tier::Band, 1_000_000 * M, 0, 1_000_000 * M).unwrap();
        assert_eq!(p.total, PREMIUM_FLOOR);
    }

    #[test]
    fn pin_makes_a_buyer_whole() {
        // Bought at 231.00, auction printed 226.00. Sigma 2.00. Qty 50.
        let payout = settlement_payout(true, 231_000_000, 226_000_000, 2_000_000, 50 * M, Tier::Pin).unwrap();
        assert_eq!(payout, 250_000_000); // $250.00 = 5.00 * 50
    }

    #[test]
    fn band_absorbs_one_sigma_first() {
        let payout = settlement_payout(true, 231_000_000, 226_000_000, 2_000_000, 50 * M, Tier::Band).unwrap();
        // (5.00 - 2.00) * 50 = 150.00
        assert_eq!(payout, 150_000_000);
    }

    #[test]
    fn a_favourable_gap_pays_nothing() {
        let payout = settlement_payout(true, 231_000_000, 240_000_000, 2_000_000, 50 * M, Tier::Pin).unwrap();
        assert_eq!(payout, 0);
    }

    #[test]
    fn sellers_are_hurt_by_the_other_direction() {
        let up = settlement_payout(false, 231_000_000, 240_000_000, 2_000_000, 50 * M, Tier::Pin).unwrap();
        let down = settlement_payout(false, 231_000_000, 226_000_000, 2_000_000, 50 * M, Tier::Pin).unwrap();
        assert_eq!(up, 450_000_000);
        assert_eq!(down, 0);
    }

    #[test]
    fn absurd_inputs_refuse_rather_than_wrap() {
        // A notional this large cannot produce a representable premium; the
        // instruction must fail rather than quietly truncate to something cheap.
        assert!(quote_premium(u64::MAX, 1_000_000, Tier::Pin, 1, 1, 1).is_none());
        assert!(settlement_payout(true, u64::MAX, 0, 0, u64::MAX, Tier::Pin).is_none());
    }
}
