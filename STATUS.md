# Fund402 — Honest Status (post-audit, 2026-06-21)

No spin. What's real, what's simplified, what's left. Completion at the bottom.

## ✅ Real + verified (actually ran / proven on-chain)

- **Vault deployed live** on casper-test (pkg `664d99de…`). `deposit_liquidity` /
  `borrow_and_pay` / `repay_loan` / `slash_defaulted_loan` / 3-tier credit /
  on-chain reputation / **real CEP-18 collateral escrow** (`transfer_from`).
- **A Tier-3 (zero-collateral) loan settled live**: pool CEP-18 `100M → 99M`,
  merchant `+1M`, deploy `5fadfa77…`, `error_message: None`.
- **CEP-18 token deployed live** (`389cedc5…`, "Fund402 USDC"/F402).
- **EIP-712 signing is facilitator-correct**: fund402's digest == canonical
  `casper-eip-712`, and the **shipped `buildExactPayload` payload returns
  `isValid:true` from the live facilitator** (`x402-facilitator.cspr.cloud/verify`).
- **Agent SDK** compiles against `casper-js-sdk@5.0.12`; signing + payload tests pass.
- **Gateway** issues the real x402 v2 402 challenge and verifies the vault deploy
  on-chain via CSPR.cloud before proxying the real upstream.
- **Dashboard reads** are real CSPR.cloud (`ft-token-ownership` / `ft-token-actions`).
- **Tests** — 7 contract (incl. `full_loan_lifecycle`, `slash`) + gateway (4) +
  signing + payload + live facilitator. All green (`npm test`, `npm run contract:test`).
- **No mock data** in any production path — every "mock/fake" string is a "No mock
  data" comment; the only mock is `MockCep18` in the contract test module.

## ⚠️ Simplified / not fully wired (the honest gaps)

1. **Auto-borrow works only for Tier 3.** The SDK interceptor (`index.ts`) never
   calls `approve` before `borrow_and_pay`, so Tier-1/2 collateral borrows would
   **revert on-chain** (no CEP-18 allowance). `ensureCollateralAllowance` exists in
   the SDK but isn't called in the flow. Seed agents to Tier 3 (`award_reputation`)
   for the collateral-free path, or wire the approve step.
2. **No automated repayment.** `repay_loan` is real but manual; the SDK never calls
   it. The SRSD `EarningStream` (auto-repay from agent x402 revenue) is not built.
3. **The full SDK→gateway→demo flow has NOT been run live.** The on-chain borrow was
   proven via `scripts/e2e.mjs` (direct **package-hash** calls). The SDK's
   `borrowAndPayOnChain` (**contract-hash** path), the gateway's verify, and the demo
   were not exercised end-to-end against the live deployment. Components compile +
   work individually; the integrated live run is unverified.
4. **Loan TTL/expiry is not enforced on-chain.** Loans store a `timestamp`;
   `slash_defaulted_loan` is admin-discretion with no expiry check (SRSD `loan_ttl`
   absent).
5. **CSPR.click dashboard deposit/withdraw** type-checks but isn't browser-tested
   (needs an `appId` + a wallet; watch the "sign message vs raw digest" x402 caveat).
6. **Facilitator `/settle` path** is wired but unused — Fund402 settles via the vault
   (the vault is the payer); `/settle` (agent→merchant `transfer_with_authorization`)
   is an alternative model, not the primary flow.

## SRSD scope intentionally dropped

- `EarningStream` contract (auto-repay from x402 revenue).
- Separate `ReputationRegistry` / `LoanRegistry` contracts — folded **inline** into
  the vault (functionally equivalent: `reputation`/`loans` mappings).

## 🔧 External prerequisites

- CSPR.cloud API key (live `/verify` + dashboard reads + gateway verify) — provided.
- CSPR.click `appId` for dashboard wallet writes.
- A browser + wallet to exercise CSPR.click.

## Completion (honest)

| Layer | % | Note |
|---|---|---|
| Vault contract (core) | ~90% | works + deployed + proven; no on-chain TTL, no earning-stream |
| EIP-712 / x402 signing | ~95% | live `/verify` = `isValid:true` |
| Agent SDK | ~70% | compiles + signing proven; borrow only Tier 3, no approve/repay, exact path not run live |
| Gateway | ~80% | real code; not run live end-to-end |
| Dashboard | ~70% | reads real; writes wired, not browser-tested |
| Demo | ~80% | runs the real SDK; honest preview; full live flow not run |
| Tests | ~85% | strong on the testable core; no frontend/e2e-integration tests |
| Deploy + docs | ~95% | deployed, documented, scripted |

**Overall ≈ 80%.** Core (contract + signing) ≈ 92%. Full autonomous loop (agent
borrows through the gateway **and** repays) ≈ 65%. Hackathon-submittable: **yes**.
Production-complete per the full SRSD: ≈ 65%.

## Next, to close the gap (priority order)

1. Add the `approve` step (+ optional auto-repay) to the SDK interceptor.
2. Run the SDK→gateway→demo flow **live** end-to-end against the deployed vault.
3. Enforce loan TTL on-chain in `slash_defaulted_loan`.
4. Browser-test CSPR.click deposit/withdraw.
5. `EarningStream` auto-repay (optional, post-hackathon).
