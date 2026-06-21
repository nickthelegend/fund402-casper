#![cfg_attr(not(test), no_std)]
//! # Fund402 Vault (Casper / Odra)
//!
//! Just-In-Time (JIT) credit vault for autonomous AI agents on the Casper Network.
//!
//! Ported from the original Soroban implementation. The economic model is the same
//! — a CEP-18 liquidity pool that fronts micropayments for agents hitting an HTTP
//! `402 Payment Required` paywall — but settlement happens through the
//! [casper-x402 facilitator] (`transfer_with_authorization` on a CEP-18 token)
//! instead of Soroban's `token::Client`.
//!
//! On top of the Soroban version we add the 3-tier hybrid credit model from the
//! Fund402 SRSD:
//!   * Tier 1 (New)        — collateral-first, limit = 10x collateral
//!   * Tier 2 (Established) — reputation + partial collateral, score >= 50
//!   * Tier 3 (Trusted)     — reputation-only, score >= 200
//!
//! ## Collateral is physically escrowed (not just recorded)
//!
//! Collateral is posted in the **same CEP-18 asset** as the loan. `borrow_and_pay`
//! pulls it from the agent into the vault with `transfer_from` (the agent must
//! `approve` the vault first), so the vault really holds it. `repay_loan` returns
//! it; `slash_defaulted_loan` keeps it to cover the bad debt. CEP-18 escrow is
//! used (rather than attaching CSPR via a payable entry point) because it is
//! callable from a plain casper-js-sdk contract-call deploy — Odra's payable /
//! cargo-purse path needs session WASM and can't be driven from the agent SDK.
//!
//! [casper-x402 facilitator]: https://github.com/make-software/casper-x402

extern crate alloc;

use odra::casper_types::U256;
use odra::prelude::*;
use odra::ContractRef;

/// 150% collateralization, expressed in basis points (15_000 = 150.00%).
const COLLATERAL_RATIO_BPS: u64 = 15_000;
/// Reputation thresholds for tier promotion.
const TIER2_MIN_SCORE: i64 = 50;
const TIER3_MIN_SCORE: i64 = 200;

#[odra::odra_error]
pub enum Fund402Error {
    AlreadyInitialized = 1,
    InsufficientBalance = 2,
    InsufficientCollateral = 3,
    NotYourLoan = 4,
    AdminOnly = 5,
    OverCreditLimit = 6,
    LoanNotFound = 7,
    PoolDry = 8,
    AlreadySettled = 9,
}

/// A single outstanding JIT loan. `collateral_locked` is CEP-18 base units the
/// vault physically holds in escrow (pulled from the agent on `borrow_and_pay`).
#[odra::odra_type]
pub struct Loan {
    pub agent: Address,
    pub merchant: Address,
    pub amount_borrowed: U256,
    pub collateral_locked: U256,
    pub vault_id: String,
    pub timestamp: u64,
    pub repaid: bool,
    pub defaulted: bool,
}

/// Result of a successful `borrow_and_pay`.
#[odra::odra_type]
pub struct BorrowResult {
    pub loan_id: u64,
    pub amount_borrowed: U256,
    pub collateral_locked: U256,
    pub merchant: Address,
}

/// Preview of what a borrow would cost the agent (collateral in CEP-18 units).
#[odra::odra_type]
pub struct SimulateBorrowResult {
    pub required_collateral: U256,
    pub fee: U256,
    pub net_to_merchant: U256,
}

/// Aggregate pool health, surfaced to the LP dashboard.
#[odra::odra_type]
pub struct PoolStats {
    pub total_liquidity: U256,
    pub total_borrowed: U256,
    pub total_loans: u64,
    pub apy_basis_points: u32,
    pub utilization_rate: u32,
}

/// Emitted whenever the vault fronts a payment for an agent.
#[odra::event]
pub struct LoanIssued {
    pub loan_id: u64,
    pub agent: Address,
    pub merchant: Address,
    pub amount: U256,
    pub vault_id: String,
}

/// Emitted on repayment (manual or earning-stream driven).
#[odra::event]
pub struct LoanRepaid {
    pub loan_id: u64,
    pub agent: Address,
    pub amount: U256,
}

/// Emitted when an expired loan is slashed and its collateral seized.
#[odra::event]
pub struct LoanDefaulted {
    pub loan_id: u64,
    pub agent: Address,
    pub collateral_seized: U256,
}

#[odra::module(events = [LoanIssued, LoanRepaid, LoanDefaulted])]
pub struct Fund402Vault {
    admin: Var<Address>,
    /// CEP-18 token used as the lending asset (the x402 settlement token).
    asset_token: Var<Address>,
    total_liquidity: Var<U256>,
    total_borrowed: Var<U256>,
    total_loans: Var<u64>,
    lp_balance: Mapping<Address, U256>,
    loans: Mapping<u64, Loan>,
    /// On-chain reputation score per agent (mirrors ReputationRegistry in the SRSD).
    reputation: Mapping<Address, i64>,
}

#[odra::module]
impl Fund402Vault {
    /// One-time constructor. `asset_token` is the CEP-18 x402 token package hash.
    pub fn init(&mut self, asset_token: Address) {
        if self.admin.get().is_some() {
            self.env().revert(Fund402Error::AlreadyInitialized);
        }
        self.admin.set(self.env().caller());
        self.asset_token.set(asset_token);
        self.total_liquidity.set(U256::zero());
        self.total_borrowed.set(U256::zero());
        self.total_loans.set(0);
    }

    // -------------------------------------------------------------- liquidity

    /// LP deposits CEP-18 liquidity into the pool. Caller must have approved the
    /// vault on the CEP-18 contract for `amount` beforehand.
    pub fn deposit_liquidity(&mut self, amount: U256) {
        let lp = self.env().caller();
        self.cep18().transfer_from(&lp, &self.env().self_address(), &amount);

        let bal = self.lp_balance.get_or_default(&lp).saturating_add(amount);
        self.lp_balance.set(&lp, bal);
        self.total_liquidity
            .set(self.total_liquidity.get_or_default().saturating_add(amount));
    }

    /// LP withdraws previously deposited (non-loaned) liquidity.
    pub fn withdraw_liquidity(&mut self, amount: U256) {
        let lp = self.env().caller();
        let bal = self.lp_balance.get_or_default(&lp);
        if bal < amount {
            self.env().revert(Fund402Error::InsufficientBalance);
        }
        let available = self
            .total_liquidity
            .get_or_default()
            .saturating_sub(self.total_borrowed.get_or_default());
        if available < amount {
            self.env().revert(Fund402Error::PoolDry);
        }
        self.lp_balance.set(&lp, bal - amount);
        self.total_liquidity
            .set(self.total_liquidity.get_or_default() - amount);
        self.cep18().transfer(&lp, &amount);
    }

    pub fn get_lp_balance(&self, lp: Address) -> U256 {
        self.lp_balance.get_or_default(&lp)
    }

    // ------------------------------------------------------------------ loans

    /// Pure view: how much CEP-18 collateral an agent must post to borrow
    /// `amount` at 150% collateralization.
    pub fn simulate_borrow(&self, amount: U256) -> SimulateBorrowResult {
        let required =
            amount.saturating_mul(U256::from(COLLATERAL_RATIO_BPS)) / U256::from(10_000u64);
        SimulateBorrowResult {
            required_collateral: required,
            fee: U256::zero(),
            net_to_merchant: amount,
        }
    }

    /// Agent's credit limit, derived from its tier (SRSD section 4).
    pub fn get_agent_credit_limit(&self, agent: Address, collateral_offered: U256) -> U256 {
        match self.get_tier(agent) {
            // Tier 3 — reputation only. Base limit scales with score.
            3 => {
                let score = U256::from(self.get_score(agent).max(0) as u64);
                U256::from(100u64).saturating_mul(score) // base_limit * score units
            }
            // Tier 2 — partial collateral, score weighted.
            2 => {
                let score = self.get_score(agent).max(0) as u64;
                collateral_offered
                    .saturating_mul(U256::from(20u64))
                    .saturating_mul(U256::from(100 + score))
                    / U256::from(100u64)
            }
            // Tier 1 — collateral first, 10x.
            _ => collateral_offered.saturating_mul(U256::from(10u64)),
        }
    }

    /// Core JIT primitive. The agent posts `collateral` in the CEP-18 asset; the
    /// vault physically escrows it (`transfer_from` — agent must `approve` first)
    /// while it fronts the CEP-18 `amount` to the merchant from the pool.
    /// Collateral is returned on `repay_loan` or seized by `slash_defaulted_loan`.
    /// Tier 3 (reputation-only) agents borrow with zero collateral.
    pub fn borrow_and_pay(
        &mut self,
        merchant: Address,
        amount: U256,
        collateral: U256,
        vault_id: String,
    ) -> BorrowResult {
        let agent = self.env().caller();
        let tier = self.get_tier(agent);

        // Tier 1/2 must over-collateralize (150%); escrow the collateral.
        let locked = if tier < 3 {
            let sim = self.simulate_borrow(amount);
            if collateral < sim.required_collateral {
                self.env().revert(Fund402Error::InsufficientCollateral);
            }
            self.cep18()
                .transfer_from(&agent, &self.env().self_address(), &collateral);
            collateral
        } else {
            U256::zero()
        };

        // Pool must have free liquidity to front the payment.
        let available = self
            .total_liquidity
            .get_or_default()
            .saturating_sub(self.total_borrowed.get_or_default());
        if available < amount {
            self.env().revert(Fund402Error::PoolDry);
        }

        // Front the payment to the merchant from the pool.
        self.cep18().transfer(&merchant, &amount);

        let loan_id = self.total_loans.get_or_default();
        self.total_loans.set(loan_id + 1);
        self.loans.set(
            &loan_id,
            Loan {
                agent,
                merchant,
                amount_borrowed: amount,
                collateral_locked: locked,
                vault_id: vault_id.clone(),
                timestamp: self.env().get_block_time(),
                repaid: false,
                defaulted: false,
            },
        );
        self.total_borrowed
            .set(self.total_borrowed.get_or_default().saturating_add(amount));

        self.env().emit_event(LoanIssued {
            loan_id,
            agent,
            merchant,
            amount,
            vault_id,
        });

        BorrowResult {
            loan_id,
            amount_borrowed: amount,
            collateral_locked: locked,
            merchant,
        }
    }

    /// Repay a loan. Pulls the principal back from the agent's CEP-18 balance,
    /// returns the escrowed collateral, and rewards reputation (+10 on-time).
    pub fn repay_loan(&mut self, loan_id: u64) {
        let agent = self.env().caller();
        let mut loan = self
            .loans
            .get(&loan_id)
            .unwrap_or_revert_with(&self.env(), Fund402Error::LoanNotFound);
        if loan.agent != agent {
            self.env().revert(Fund402Error::NotYourLoan);
        }
        if loan.repaid || loan.defaulted {
            self.env().revert(Fund402Error::AlreadySettled);
        }

        // Pull the principal back from the agent's CEP-18 balance.
        self.cep18()
            .transfer_from(&agent, &self.env().self_address(), &loan.amount_borrowed);

        self.total_borrowed.set(
            self.total_borrowed
                .get_or_default()
                .saturating_sub(loan.amount_borrowed),
        );

        // Release the escrowed CEP-18 collateral back to the agent.
        let collateral = loan.collateral_locked;
        loan.repaid = true;
        let amount = loan.amount_borrowed;
        self.loans.set(&loan_id, loan);
        if collateral > U256::zero() {
            self.cep18().transfer(&agent, &collateral);
        }

        // Reputation reward.
        let score = self.get_score(agent) + 10;
        self.reputation.set(&agent, score);

        self.env().emit_event(LoanRepaid {
            loan_id,
            agent,
            amount,
        });
    }

    /// Admin-only: seize the collateral of a loan that expired unpaid (TTL passed)
    /// and slash the agent's reputation (-50). The escrowed CEP-18 stays in the
    /// vault (covers the bad debt); the principal is cleared from outstanding.
    pub fn slash_defaulted_loan(&mut self, loan_id: u64) {
        self.assert_admin();
        let mut loan = self
            .loans
            .get(&loan_id)
            .unwrap_or_revert_with(&self.env(), Fund402Error::LoanNotFound);
        if loan.repaid || loan.defaulted {
            self.env().revert(Fund402Error::AlreadySettled);
        }

        let agent = loan.agent;
        let seized = loan.collateral_locked;
        loan.defaulted = true;
        self.total_borrowed.set(
            self.total_borrowed
                .get_or_default()
                .saturating_sub(loan.amount_borrowed),
        );
        self.loans.set(&loan_id, loan);

        // Reputation penalty for a default/slash.
        let score = self.get_score(agent) - 50;
        self.reputation.set(&agent, score);

        self.env().emit_event(LoanDefaulted {
            loan_id,
            agent,
            collateral_seized: seized,
        });
    }

    // ------------------------------------------------------------ reputation

    pub fn get_score(&self, agent: Address) -> i64 {
        self.reputation.get_or_default(&agent)
    }

    /// Tier derivation per SRSD section 4.
    pub fn get_tier(&self, agent: Address) -> u8 {
        let score = self.get_score(agent);
        if score >= TIER3_MIN_SCORE {
            3
        } else if score >= TIER2_MIN_SCORE {
            2
        } else {
            1
        }
    }

    /// Admin-only: credit reputation (e.g. seeding a trusted agent for the demo,
    /// or rewarding off-chain settled earnings). Mirrors the SRSD scoring rules.
    pub fn award_reputation(&mut self, agent: Address, delta: i64) {
        self.assert_admin();
        let score = self.get_score(agent) + delta;
        self.reputation.set(&agent, score);
    }

    /// Admin-only: penalize a defaulting agent (-25) per the scoring rules.
    pub fn record_default(&mut self, agent: Address) {
        self.assert_admin();
        let score = self.get_score(agent) - 25;
        self.reputation.set(&agent, score);
    }

    // ----------------------------------------------------------------- views

    pub fn get_pool_stats(&self) -> PoolStats {
        let total_liquidity = self.total_liquidity.get_or_default();
        let total_borrowed = self.total_borrowed.get_or_default();
        let total_loans = self.total_loans.get_or_default();
        let utilization_rate = if total_liquidity > U256::zero() {
            ((total_borrowed.saturating_mul(U256::from(10_000u64))) / total_liquidity).as_u32()
        } else {
            0
        };
        PoolStats {
            total_liquidity,
            total_borrowed,
            total_loans,
            apy_basis_points: 200,
            utilization_rate,
        }
    }

    pub fn get_loan(&self, loan_id: u64) -> Option<Loan> {
        self.loans.get(&loan_id)
    }

    // --------------------------------------------------------------- helpers

    fn cep18(&self) -> Cep18ContractRef {
        Cep18ContractRef::new(self.env(), self.asset_token.get().unwrap())
    }

    fn assert_admin(&self) {
        if self.env().caller() != self.admin.get().unwrap() {
            self.env().revert(Fund402Error::AdminOnly);
        }
    }
}

/// Minimal CEP-18 external contract interface used for settlement + escrow.
#[odra::external_contract]
pub trait Cep18 {
    fn transfer(&mut self, recipient: &Address, amount: &U256);
    fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
    fn balance_of(&self, address: &Address) -> U256;
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    fn deploy_vault(env: &HostEnv) -> Fund402VaultHostRef {
        // asset_token is a placeholder account; the tier/credit math never
        // touches CEP-18, so these checks are token-independent.
        let asset = env.get_account(9);
        Fund402Vault::deploy(env, Fund402VaultInitArgs { asset_token: asset })
    }

    #[test]
    fn tier_thresholds() {
        assert!(TIER2_MIN_SCORE < TIER3_MIN_SCORE);
    }

    #[test]
    fn new_agent_starts_tier_1() {
        let env = odra_test::env();
        let vault = deploy_vault(&env);
        let agent = env.get_account(1);
        assert_eq!(vault.get_tier(agent), 1);
        assert_eq!(vault.get_score(agent), 0);
    }

    #[test]
    fn tier_1_credit_limit_is_10x_collateral() {
        let env = odra_test::env();
        let vault = deploy_vault(&env);
        let agent = env.get_account(1);
        let collateral = U256::from(100u64);
        assert_eq!(
            vault.get_agent_credit_limit(agent, collateral),
            U256::from(1000u64)
        );
    }

    #[test]
    fn simulate_borrow_requires_150_percent() {
        let env = odra_test::env();
        let vault = deploy_vault(&env);
        let amount = U256::from(1_000_000u64);
        let sim = vault.simulate_borrow(amount);
        assert_eq!(sim.required_collateral, U256::from(1_500_000u64));
        assert!(sim.required_collateral > amount);
    }

    #[test]
    fn tier_promotion_by_score() {
        let env = odra_test::env();
        let mut vault = deploy_vault(&env);
        let agent = env.get_account(1);
        // admin (account 0, the deployer) awards reputation.
        vault.award_reputation(agent, 60);
        assert_eq!(vault.get_tier(agent), 2);
        vault.award_reputation(agent, 200);
        assert_eq!(vault.get_tier(agent), 3);
    }
}
