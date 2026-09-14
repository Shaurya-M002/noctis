//! # Noctis
//!
//! A tokenized equity trades 24/7. Its primary venue prints a price for 32.5 of the
//! 168 hours in a week. For the other 135.5 — and for the 65.5-hour weekend in
//! particular — there is no price discovery anywhere on earth, yet the token still
//! changes hands.
//!
//! Noctis publishes a mark for those hours *with its own uncertainty attached*, and
//! sells a guarantee priced off that uncertainty: if the official reopening print
//! lands further from your fill than the band you paid to be protected inside, an
//! underwriting vault makes you whole.
//!
//! There is no trading fee and no spread markup anywhere in this program. The only
//! money that moves besides the trade itself is the premium — and the protocol's
//! cut is taken from the vault's *net profit*, so Noctis earns nothing unless its
//! own uncertainty estimates are honest.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod math;
use math::{quote_premium, settlement_payout, Premium, Tier};

declare_id!("NoCTajFqJn1QScfX3KozwSitGzcVf6muHLKXoKQhbhE");

/// A mark older than this is refused for trading. Two minutes of Solana is a long
/// time to be quoting a stale distribution.
pub const MAX_MARK_AGE_SECONDS: i64 = 120;

/// Refuse to quote at all beyond this uncertainty. If we do not know the price to
/// better than 12%, the correct product is silence.
pub const MAX_SIGMA_PPM: u32 = 120_000;

/// Utilisation ceiling. The vault stops writing before it can be wiped out by one bad open.
pub const MAX_UTILISATION_PPM: u64 = 850_000;

#[program]
pub mod noctis {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, protocol_take_bps: u16) -> Result<()> {
        require!(protocol_take_bps <= 2_000, NoctisError::TakeTooHigh);
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.oracle = ctx.accounts.authority.key();
        c.quote_mint = ctx.accounts.quote_mint.key();
        c.protocol_take_bps = protocol_take_bps;
        c.paused = false;
        c.bump = ctx.bumps.config;

        let v = &mut ctx.accounts.vault;
        v.bump = ctx.bumps.vault;
        v.tvl = 0;
        v.exposure = 0;
        v.long_risk = 0;
        v.short_risk = 0;
        v.premiums_collected = 0;
        v.payouts_paid = 0;
        v.shares = 0;
        v.receipts_opened = 0;
        Ok(())
    }

    pub fn set_oracle(ctx: Context<AdminOnly>, oracle: Pubkey) -> Result<()> {
        ctx.accounts.config.oracle = oracle;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Register an asset the protocol is willing to mark.
    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        last_close: u64,
        depth: u64,
    ) -> Result<()> {
        let a = &mut ctx.accounts.asset;
        a.mint = ctx.accounts.asset_mint.key();
        a.last_close = last_close;
        a.depth = depth;
        a.mid = last_close;
        a.sigma_ppm = 0;
        a.published_at = 0;
        a.open_print = 0;
        a.epoch = 0;
        a.open_print_epoch = 0;
        a.open_receipts = 0;
        a.session = Session::Regular as u8;
        a.bump = ctx.bumps.asset;
        Ok(())
    }

    /// Publish a fair value and its 1-sigma uncertainty.
    ///
    /// The uncertainty is not decoration. It is the input the premium is computed
    /// from, so an oracle that understates sigma is underpricing the vault's own
    /// risk — and the vault is the party that pays for that.
    pub fn publish_mark(
        ctx: Context<PublishMark>,
        mid: u64,
        sigma_ppm: u32,
        session: u8,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, NoctisError::Paused);
        require!(mid > 0, NoctisError::BadMark);
        require!(sigma_ppm <= MAX_SIGMA_PPM, NoctisError::SigmaTooWide);
        require!(session <= Session::Holiday as u8, NoctisError::BadSession);

        let a = &mut ctx.accounts.asset;

        // A mark published after this epoch's auction has printed opens the NEXT
        // dark window. Refuse while receipts from the current one are outstanding,
        // so nothing can be stranded on the wrong side of an epoch boundary. The
        // crank is permissionless, so anyone can clear the queue.
        if a.open_print > 0 && a.open_print_epoch == a.epoch {
            require!(a.open_receipts == 0, NoctisError::SettlementPending);
            a.epoch = a.epoch.checked_add(1).ok_or(NoctisError::MathOverflow)?;
        }

        a.mid = mid;
        a.sigma_ppm = sigma_ppm;
        a.session = session;
        a.published_at = Clock::get()?.unix_timestamp;

        emit!(MarkPublished {
            mint: a.mint, mid, sigma_ppm, session, epoch: a.epoch, ts: a.published_at,
        });
        Ok(())
    }

    /// Underwrite. LPs are short the gap; they are paid for it in premiums.
    pub fn deposit(ctx: Context<VaultFlow>, amount: u64) -> Result<()> {
        require!(amount > 0, NoctisError::ZeroAmount);
        let v = &ctx.accounts.vault;

        // Shares are struck against current TVL so a depositor cannot buy into
        // premiums already earned or dodge payouts already owed.
        let shares = if v.shares == 0 || v.tvl == 0 {
            amount
        } else {
            (amount as u128)
                .checked_mul(v.shares as u128).ok_or(NoctisError::MathOverflow)?
                .checked_div(v.tvl as u128).ok_or(NoctisError::MathOverflow)? as u64
        };

        let decimals = ctx.accounts.quote_mint.decimals;
        token_interface::transfer_checked(
            ctx.accounts.transfer_in_ctx(),
            amount,
            decimals,
        )?;

        let v = &mut ctx.accounts.vault;
        v.tvl = v.tvl.checked_add(amount).ok_or(NoctisError::MathOverflow)?;
        v.shares = v.shares.checked_add(shares).ok_or(NoctisError::MathOverflow)?;

        let p = &mut ctx.accounts.position;
        p.owner = ctx.accounts.lp.key();
        p.shares = p.shares.checked_add(shares).ok_or(NoctisError::MathOverflow)?;
        p.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn withdraw(ctx: Context<VaultFlow>, shares: u64) -> Result<()> {
        require!(
            shares > 0 && shares <= ctx.accounts.position.shares,
            NoctisError::InsufficientShares
        );

        let v = &mut ctx.accounts.vault;
        let amount = (shares as u128)
            .checked_mul(v.tvl as u128).ok_or(NoctisError::MathOverflow)?
            .checked_div(v.shares as u128).ok_or(NoctisError::MathOverflow)? as u64;

        // Capital backing live receipts cannot walk out of the door.
        let free = v.tvl.saturating_sub(v.exposure);
        require!(amount <= free, NoctisError::CapitalLocked);

        v.tvl -= amount;
        v.shares -= shares;
        ctx.accounts.position.shares -= shares;

        let bump = [ctx.accounts.vault.bump];
        let seeds: &[&[u8]] = &[b"vault", &bump];
        let decimals = ctx.accounts.quote_mint.decimals;
        token_interface::transfer_checked(
            ctx.accounts.transfer_out_ctx().with_signer(&[seeds]),
            amount,
            decimals,
        )?;
        Ok(())
    }

    /// Write assurance over an exposure the caller already has.
    ///
    /// Note what this instruction does NOT do: it does not move the equity token.
    /// Noctis is not a venue. You execute wherever you like — Jupiter, Raydium, a
    /// CEX — and this writes **parametric** cover against the mark Noctis published,
    /// settling on the official opening print.
    ///
    /// Parametric matters. The payout is a function of two published numbers, the
    /// mark and the auction print, and of nothing about your actual fill. So there
    /// is no claims adjuster, no proof-of-loss, no oracle for your P&L — settlement
    /// is one permissionless instruction. The cost is basis risk: if you executed
    /// materially away from the mark, you are covered relative to the mark and not
    /// relative to what you paid.
    ///
    /// `qty_micro` is 1e6-scaled units of the tokenized equity. `is_buy` is the
    /// direction of the exposure being covered: a long is hurt when the auction
    /// prints below the mark.
    pub fn open_position(
        ctx: Context<OpenPosition>,
        qty_micro: u64,
        is_buy: bool,
        tier: u8,
        max_premium: u64,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, NoctisError::Paused);

        let tier = Tier::from_u8(tier).ok_or(NoctisError::BadTier)?;
        let a = &ctx.accounts.asset;
        let (asset_key, asset_mint, mid, sigma_ppm) = (a.key(), a.mint, a.mid, a.sigma_ppm);
        let now = Clock::get()?.unix_timestamp;
        require!(now - a.published_at <= MAX_MARK_AGE_SECONDS, NoctisError::StaleMark);
        require!(a.sigma_ppm > 0, NoctisError::NoMark);
        // There is nothing left to insure once this epoch's auction has printed.
        require!(
            !(a.open_print > 0 && a.open_print_epoch == a.epoch),
            NoctisError::AuctionAlreadyPrinted
        );
        let epoch = a.epoch;

        let notional = (mid as u128)
            .checked_mul(qty_micro as u128).ok_or(NoctisError::MathOverflow)?
            .checked_div(math::PPM).ok_or(NoctisError::MathOverflow)? as u64;

        let (tvl, exposure) = (ctx.accounts.vault.tvl, ctx.accounts.vault.exposure);
        // `exposure` here feeds the utilisation load on the QUOTE. The reserve
        // actually locked is recomputed from both legs below.
        let Premium { total: premium, capital_at_risk, .. } = quote_premium(
            notional, sigma_ppm as u64, tier, tvl, exposure, a.depth,
        ).ok_or(NoctisError::MathOverflow)?;

        // Slippage guard on the *premium*, since that is the only price the user pays.
        require!(premium <= max_premium, NoctisError::PremiumAboveLimit);

        if tier != Tier::Raw {
            let (mut nl, mut ns) = (ctx.accounts.vault.long_risk, ctx.accounts.vault.short_risk);
            if is_buy {
                nl = nl.checked_add(capital_at_risk).ok_or(NoctisError::MathOverflow)?;
            } else {
                ns = ns.checked_add(capital_at_risk).ok_or(NoctisError::MathOverflow)?;
            }
            let new_exposure = Vault::reserve(nl, ns);
            let util = if tvl == 0 {
                u64::MAX
            } else {
                ((new_exposure as u128) * math::PPM / (tvl as u128)) as u64
            };
            require!(util <= MAX_UTILISATION_PPM, NoctisError::VaultAtCapacity);

            let decimals = ctx.accounts.quote_mint.decimals;
            token_interface::transfer_checked(
                ctx.accounts.premium_transfer_ctx(),
                premium,
                decimals,
            )?;

            let v = &mut ctx.accounts.vault;
            v.long_risk = nl;
            v.short_risk = ns;
            v.resync();
            v.tvl = v.tvl.checked_add(premium).ok_or(NoctisError::MathOverflow)?;
            v.premiums_collected = v.premiums_collected
                .checked_add(premium).ok_or(NoctisError::MathOverflow)?;
        }

        let sigma_abs = (mid as u128)
            .checked_mul(sigma_ppm as u128).ok_or(NoctisError::MathOverflow)?
            .checked_div(math::PPM).ok_or(NoctisError::MathOverflow)? as u64;

        ctx.accounts.vault.receipts_opened = ctx.accounts.vault.receipts_opened
            .checked_add(1).ok_or(NoctisError::MathOverflow)?;
        ctx.accounts.asset.open_receipts = ctx.accounts.asset.open_receipts
            .checked_add(1).ok_or(NoctisError::MathOverflow)?;

        let r = &mut ctx.accounts.receipt;
        r.owner = ctx.accounts.trader.key();
        r.asset = asset_key;
        r.qty_micro = qty_micro;
        r.is_buy = is_buy;
        r.fill_price = mid;
        r.sigma_abs = sigma_abs;
        r.tier = tier as u8;
        r.premium = premium;
        r.capital_at_risk = capital_at_risk;
        r.epoch = epoch;
        r.opened_at = now;
        r.settled = false;
        r.bump = ctx.bumps.receipt;

        emit!(PositionOpened {
            receipt: r.key(), owner: r.owner, mint: asset_mint,
            qty_micro, is_buy, fill_price: mid, sigma_abs,
            tier: tier as u8, premium,
        });
        Ok(())
    }

    /// The reopening auction happened. Record what it printed.
    pub fn post_open_print(ctx: Context<PostOpenPrint>, open_print: u64) -> Result<()> {
        require!(open_print > 0, NoctisError::BadMark);
        let a = &mut ctx.accounts.asset;
        a.open_print = open_print;
        a.open_print_epoch = a.epoch;
        a.last_close = open_print;
        a.session = Session::Regular as u8;
        emit!(OpenPrintPosted { mint: a.mint, open_print, epoch: a.epoch });
        Ok(())
    }

    /// Settle one receipt against the official print.
    ///
    /// Permissionless: anyone may crank it, the payout only ever goes to the receipt
    /// owner's token account.
    pub fn settle_receipt(ctx: Context<SettleReceipt>) -> Result<()> {
        let a = &ctx.accounts.asset;
        require!(a.open_print > 0, NoctisError::NoOpenPrint);

        let open_print = a.open_print;
        let asset_key = a.key();

        let r = &ctx.accounts.receipt;
        require!(!r.settled, NoctisError::AlreadySettled);
        require_keys_eq!(r.asset, asset_key, NoctisError::WrongAsset);
        // The print on the account must be the one from THIS receipt's window.
        require!(r.epoch == a.open_print_epoch, NoctisError::WrongEpoch);

        let tier = Tier::from_u8(r.tier).ok_or(NoctisError::BadTier)?;
        let payout = settlement_payout(
            r.is_buy, r.fill_price, open_print, r.sigma_abs, r.qty_micro, tier,
        ).ok_or(NoctisError::MathOverflow)?;
        let (receipt_key, receipt_owner, capital_at_risk, was_buy) =
            (r.key(), r.owner, r.capital_at_risk, r.is_buy);

        let v = &mut ctx.accounts.vault;
        if was_buy {
            v.long_risk = v.long_risk.saturating_sub(capital_at_risk);
        } else {
            v.short_risk = v.short_risk.saturating_sub(capital_at_risk);
        }
        v.resync();
        let payable = payout.min(v.tvl);
        let vault_bump = v.bump;

        if payable > 0 {
            // A vault that cannot pay in full pays what it has and says so, rather
            // than reverting and stranding every other receipt behind it.
            v.tvl -= payable;
            v.payouts_paid = v.payouts_paid
                .checked_add(payable).ok_or(NoctisError::MathOverflow)?;

            let decimals = ctx.accounts.quote_mint.decimals;
            let bump = [vault_bump];
            let seeds: &[&[u8]] = &[b"vault", &bump];
            token_interface::transfer_checked(
                ctx.accounts.payout_ctx().with_signer(&[seeds]),
                payable,
                decimals,
            )?;
        }

        emit!(ReceiptSettled {
            receipt: receipt_key,
            owner: receipt_owner,
            open_print,
            payout: payable,
            shortfall: payout - payable,
        });

        ctx.accounts.receipt.settled = true;
        ctx.accounts.asset.open_receipts = ctx.accounts.asset.open_receipts.saturating_sub(1);
        Ok(())
    }
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub quote_mint: Pubkey,
    /// Protocol's share of vault NET PROFIT, in bps. Never a fee on volume.
    pub protocol_take_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub tvl: u64,
    /// Capital reserved against live receipts. Derived from the two legs below,
    /// never accumulated directly — see `Vault::reserve`.
    pub exposure: u64,
    /// Gross reserve owed to receipts that lose when prices GAP DOWN (covered longs).
    pub long_risk: u64,
    /// Gross reserve owed to receipts that lose when prices GAP UP (covered shorts).
    pub short_risk: u64,
    pub premiums_collected: u64,
    pub payouts_paid: u64,
    pub shares: u64,
    /// Monotonic receipt counter. Seeds the receipt PDA, so two fee-free trades by
    /// the same trader on the same asset cannot collide.
    pub receipts_opened: u64,
    pub bump: u8,
}

impl Vault {
    /// Portfolio reserve, not a sum of per-receipt reserves.
    ///
    /// Summing every receipt's 4-sigma tail is the *perfectly correlated, all one
    /// direction* worst case. It is safe, and it is also wrong in a way that costs
    /// LPs money: a book that is long AAPLx cover and short SPYx cover locks the
    /// same capital as one that is long both, even though a Monday gap cannot hurt
    /// both sides at once.
    ///
    ///     reserve = max(long, short)  +  RESIDUAL · min(long, short)
    ///
    /// Why that shape. For a SINGLE name the two legs are mutually exclusive — one
    /// gap cannot be both up and down — so the worst case is `max`, not the sum.
    /// Across DIFFERENT names both can pay at once (AAPLx gaps down while TSLAx
    /// gaps up), so some of the smaller leg has to stay reserved. RESIDUAL is the
    /// fraction that can land simultaneously: 0 would assume one name, 1 would
    /// assume full independence, and 0.5 is the damped middle that a weekend gap
    /// correlation around 0.7 across large-cap US equities implies.
    ///
    /// The obvious formula, `|long − short| + RESIDUAL · min`, is wrong and a test
    /// caught it: its derivative in the smaller leg is negative, so adding cover on
    /// the other side *reduced* the reserve. Monotonicity in each leg is a safety
    /// property, not a nicety — writing risk must never free capital.
    ///
    /// Deliberately not a covariance matrix. On-chain that is an N×N of estimated
    /// correlations, maintained every block, for a second-order refinement of a
    /// number whose first-order driver is sigma.
    pub fn reserve(long_risk: u64, short_risk: u64) -> u64 {
        const RESIDUAL_BPS: u128 = 5_000; // 0.50

        let hi = core::cmp::max(long_risk, short_risk) as u128;
        let lo = core::cmp::min(long_risk, short_risk) as u128;
        let residual = lo.saturating_mul(RESIDUAL_BPS) / 10_000;
        u64::try_from(hi.saturating_add(residual)).unwrap_or(u64::MAX)
    }

    fn resync(&mut self) {
        self.exposure = Vault::reserve(self.long_risk, self.short_risk);
    }
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AssetMark {
    pub mint: Pubkey,
    /// Last official regular-session close, micro-USD.
    pub last_close: u64,
    /// Fair value for right now, micro-USD.
    pub mid: u64,
    /// 1-sigma uncertainty of the reopening gap, PPM.
    pub sigma_ppm: u32,
    /// On-chain depth used for the concentration load, micro-USDC.
    pub depth: u64,
    pub published_at: i64,
    /// Set once the reopening auction prints. Zero while dark.
    pub open_print: u64,
    /// Monotonic counter for the dark window a receipt belongs to.
    ///
    /// Without this, `open_print` from one Monday stays on the account forever and
    /// the NEXT weekend's receipts settle instantly against a week-old auction —
    /// pick whichever direction it pays and drain the vault. Receipts carry the
    /// epoch they were written in and only settle against that epoch's print.
    pub epoch: u64,
    /// The epoch `open_print` belongs to.
    pub open_print_epoch: u64,
    /// Receipts written in the current epoch that have not settled yet.
    pub open_receipts: u64,
    pub session: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub owner: Pubkey,
    pub asset: Pubkey,
    pub qty_micro: u64,
    pub is_buy: bool,
    pub fill_price: u64,
    /// Frozen at trade time — the band the user was quoted is the band they get.
    pub sigma_abs: u64,
    pub tier: u8,
    pub premium: u64,
    pub capital_at_risk: u64,
    /// The dark window this receipt was written in. Must match the epoch the
    /// opening print belongs to, or settlement is refused.
    pub epoch: u64,
    pub opened_at: i64,
    pub settled: bool,
    pub bump: u8,
}

#[repr(u8)]
pub enum Session {
    Regular = 0,
    PreMarket = 1,
    AfterHours = 2,
    Overnight = 3,
    Weekend = 4,
    Holiday = 5,
}

#[cfg(test)]
mod vault_tests {
    use super::Vault;

    const M: u64 = 1_000_000;

    #[test]
    fn a_one_sided_book_reserves_the_whole_gross() {
        assert_eq!(Vault::reserve(100_000 * M, 0), 100_000 * M);
        assert_eq!(Vault::reserve(0, 100_000 * M), 100_000 * M);
    }

    #[test]
    fn offsetting_directions_free_capital_but_not_all_of_it() {
        // Balanced book: one gap cannot pay both sides for the same name, but these
        // are different names, so half the smaller leg stays reserved.
        let r = Vault::reserve(100_000 * M, 100_000 * M);
        assert_eq!(r, 150_000 * M);
        // Strictly better than summing, strictly worse than assuming a perfect hedge.
        assert!(r < 200_000 * M);
        assert!(r > 100_000 * M);
    }

    #[test]
    fn reserve_is_monotone_in_each_leg() {
        // Writing risk must NEVER free capital. The first version of this formula
        // failed exactly here: `|l − s| + 0.5·min` fell from 80k to 70k when the
        // smaller leg grew from 40k to 60k, so an attacker could unlock reserve by
        // piling on the opposite side.
        let base = Vault::reserve(100_000 * M, 40_000 * M);
        assert!(Vault::reserve(120_000 * M, 40_000 * M) > base);
        assert!(Vault::reserve(100_000 * M, 60_000 * M) > base);

        // Exhaustive on a grid, both directions.
        for l in (0..=200u64).step_by(7) {
            for s in (0..=200u64).step_by(11) {
                let r = Vault::reserve(l * M, s * M);
                assert!(Vault::reserve((l + 1) * M, s * M) >= r);
                assert!(Vault::reserve(l * M, (s + 1) * M) >= r);
            }
        }
    }

    #[test]
    fn reserve_never_exceeds_the_gross_sum() {
        for (l, s) in [(1u64, 0u64), (7, 3), (100, 100), (1_000_000, 999_999)] {
            assert!(Vault::reserve(l * M, s * M) <= (l + s) * M);
        }
    }

    #[test]
    fn reserve_does_not_wrap_at_the_top() {
        assert_eq!(Vault::reserve(u64::MAX, 0), u64::MAX);
        assert!(Vault::reserve(u64::MAX, u64::MAX) <= u64::MAX);
    }
}

// ---------------------------------------------------------------- contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + Config::INIT_SPACE,
        seeds = [b"config"], bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = authority, space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault"], bump
    )]
    pub vault: Account<'info, Vault>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterAsset<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = authority, space = 8 + AssetMark::INIT_SPACE,
        seeds = [b"asset", asset_mint.key().as_ref()], bump
    )]
    pub asset: Account<'info, AssetMark>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PublishMark<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle)]
    pub config: Account<'info, Config>,
    pub oracle: Signer<'info>,
    #[account(mut)]
    pub asset: Account<'info, AssetMark>,
}

#[derive(Accounts)]
pub struct PostOpenPrint<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle)]
    pub config: Account<'info, Config>,
    pub oracle: Signer<'info>,
    #[account(mut)]
    pub asset: Account<'info, AssetMark>,
}

#[derive(Accounts)]
pub struct VaultFlow<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = quote_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        init_if_needed, payer = lp, space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", lp.key().as_ref()], bump
    )]
    pub position: Account<'info, LpPosition>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = quote_mint, token::authority = lp)]
    pub lp_quote: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = quote_mint, token::authority = vault)]
    pub vault_quote: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> VaultFlow<'info> {
    fn transfer_in_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.lp_quote.to_account_info(),
                mint: self.quote_mint.to_account_info(),
                to: self.vault_quote.to_account_info(),
                authority: self.lp.to_account_info(),
            },
        )
    }
    fn transfer_out_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.vault_quote.to_account_info(),
                mint: self.quote_mint.to_account_info(),
                to: self.lp_quote.to_account_info(),
                authority: self.vault.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = quote_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub asset: Account<'info, AssetMark>,
    #[account(
        init, payer = trader, space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", trader.key().as_ref(), asset.key().as_ref(), &vault.receipts_opened.to_le_bytes()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = quote_mint, token::authority = trader)]
    pub trader_quote: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = quote_mint, token::authority = vault)]
    pub vault_quote: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> OpenPosition<'info> {
    fn premium_transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.trader_quote.to_account_info(),
                mint: self.quote_mint.to_account_info(),
                to: self.vault_quote.to_account_info(),
                authority: self.trader.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct SettleReceipt<'info> {
    /// Permissionless crank.
    pub cranker: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = quote_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub asset: Account<'info, AssetMark>,
    #[account(mut, has_one = owner)]
    pub receipt: Account<'info, Receipt>,
    /// CHECK: only used to key the payout token account.
    pub owner: UncheckedAccount<'info>,
    pub quote_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = quote_mint, token::authority = owner)]
    pub owner_quote: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = quote_mint, token::authority = vault)]
    pub vault_quote: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> SettleReceipt<'info> {
    fn payout_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            TransferChecked {
                from: self.vault_quote.to_account_info(),
                mint: self.quote_mint.to_account_info(),
                to: self.owner_quote.to_account_info(),
                authority: self.vault.to_account_info(),
            },
        )
    }
}

// ---------------------------------------------------------------- events

#[event]
pub struct MarkPublished {
    pub mint: Pubkey,
    pub mid: u64,
    pub sigma_ppm: u32,
    pub session: u8,
    pub epoch: u64,
    pub ts: i64,
}

#[event]
pub struct PositionOpened {
    pub receipt: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub qty_micro: u64,
    pub is_buy: bool,
    pub fill_price: u64,
    pub sigma_abs: u64,
    pub tier: u8,
    pub premium: u64,
}

#[event]
pub struct OpenPrintPosted {
    pub mint: Pubkey,
    pub open_print: u64,
    pub epoch: u64,
}

#[event]
pub struct ReceiptSettled {
    pub receipt: Pubkey,
    pub owner: Pubkey,
    pub open_print: u64,
    pub payout: u64,
    pub shortfall: u64,
}

// ---------------------------------------------------------------- errors

#[error_code]
pub enum NoctisError {
    #[msg("Protocol take is capped at 20% of net profit")]
    TakeTooHigh,
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Mark must be positive")]
    BadMark,
    #[msg("Uncertainty exceeds the ceiling — refusing to quote")]
    SigmaTooWide,
    #[msg("Unknown session code")]
    BadSession,
    #[msg("No mark has been published for this asset")]
    NoMark,
    #[msg("Mark is stale")]
    StaleMark,
    #[msg("Unknown assurance tier")]
    BadTier,
    #[msg("Premium exceeds the caller's limit")]
    PremiumAboveLimit,
    #[msg("Vault is at its utilisation ceiling")]
    VaultAtCapacity,
    #[msg("Amount must be non-zero")]
    ZeroAmount,
    #[msg("Not enough LP shares")]
    InsufficientShares,
    #[msg("Capital is backing live receipts and cannot be withdrawn")]
    CapitalLocked,
    #[msg("Receipt already settled")]
    AlreadySettled,
    #[msg("Reopening auction has not printed yet")]
    NoOpenPrint,
    #[msg("Receipt belongs to a different dark window than the posted opening print")]
    WrongEpoch,
    #[msg("This window's auction has already printed; there is nothing left to insure")]
    AuctionAlreadyPrinted,
    #[msg("Receipts from the current window are still unsettled")]
    SettlementPending,
    #[msg("Receipt does not belong to this asset")]
    WrongAsset,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
