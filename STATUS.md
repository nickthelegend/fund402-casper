# Fund402 — Honest Status (updated 2026-06-27)

No spin. What's real, what's simplified, what's left. Completion at the bottom.

## ✅ Real + verified (actually ran / proven on-chain)

- **Vault deployed live** on casper-test (pkg `664d99de…`). `deposit_liquidity` /
  `borrow_and_pay` / `repay_loan` / `slash_defaulted_loan` / 3-tier credit /
  on-chain reputation / **real CEP-18 collateral escrow** (`transfer_from`).
- **A Tier-3 (zero-collateral) loan settled live**: pool CEP-18 `100M → 99M`,
  merchant `+1M`, deploy `5fadfa77…`, `error_message: None`.
- **CEP-18 token deployed live** (`389cedc5…`, "Fund402 USDC"/F402).
- **EIP-712 signing is facilitator-correct**: fund402's digest == canonical
  `casper-eip-712`, and the **shipped payload returns `isValid:true`** from the live
  facilitator (`x402-facilitator.cspr.cloud/verify`).
- **📦 SDK published + the full loop verified LIVE** —
  [`@nickthelegend69/fund402`](https://www.npmjs.com/package/@nickthelegend69/fund402).
  A real `paywall()` HTTP server + a real `fund402Fetch()` agent ran end-to-end on
  casper-test: `GET → 402 → borrow_and_pay (pool fronts the F402) → on-chain
  settlement verify via CSPR.cloud → 200 + data`. Settlement deploy `96f30ddf…`
  (`status: processed`, amount `1000000`, merchant = treasury, collateral `0`).
  The SDK now calls the vault by **package hash** (`StoredVersionedContractByHash`) —
  the path proven live — and `verifyPoolSettlement` checks `contract_package_hash`.
- **🔐 Collateralized (Tier-1) borrow verified live through the SDK** — a no-reputation
  agent had `fund402Fetch` **auto-approve and escrow 150% collateral** then borrow:
  approve `f088362a…`, settlement `a9dd1581…` (on-chain `collateral=1500000`,
  `amount=1000000`, processed). Both credit paths (zero-collateral + collateralized)
  now run end-to-end through the published SDK.
- **🔁 Repayment proven live**: `repay_loan` settled on-chain (deploy `357334fa…`) —
  collateral released, reputation `+10`.
- **🤖 Autonomous agent + MCP, live**: `fund402-agent` (12 on-chain tools) +
  `fund402-mcp` (Groq TUI + MCP server). A fresh wallet was created → funded →
  Tier-3 → **borrowed (x402)** → repaid, entirely on-chain, driven from chat.
- **Gateway** (reference Next.js) issues the real x402 v2 402 challenge and verifies
  the vault deploy on-chain via CSPR.cloud before proxying — same logic the SDK
  productizes and runs live.
- **Dashboard reads** are real CSPR.cloud (`ft-token-ownership` / `ft-token-actions`).
- **Tests** — 7 contract (incl. `full_loan_lifecycle`, `slash`) + gateway (4) +
  agent-sdk signing/payload/facilitator + **SDK offline units (server + EIP-712) and
  a live e2e**. Green.
- **No mock data** in any production path — the only mock is `MockCep18` in the
  contract test module.

## ⚠️ Simplified / not fully wired (the honest gaps)

1. **No autonomous `EarningStream`.** Repayment is real and proven live, but it's an
   explicit call (agent tool / `repayLoanOnChain`), not auto-triggered from the
   agent's own x402 revenue. The SRSD `EarningStream` contract is intentionally not built.
2. **Loan TTL/expiry is not enforced on-chain.** Loans store a `timestamp`;
   `slash_defaulted_loan` is admin-discretion with no expiry check (SRSD `loan_ttl`
   absent).
3. **CSPR.click dashboard deposit/withdraw** type-checks but isn't browser-tested
   (needs an `appId` + a wallet; watch the "sign message vs raw digest" x402 caveat).
4. **Facilitator `/settle` path** is supported as optional defense-in-depth
   (`verifyWithFacilitator`), but Fund402 settles via the vault (the pool is the
   payer) and verifies that on-chain — `/settle` is an alternative model, not the
   primary flow.

## SRSD scope intentionally dropped

- `EarningStream` contract (auto-repay from x402 revenue).
- Separate `ReputationRegistry` / `LoanRegistry` contracts — folded **inline** into
  the vault (functionally equivalent: `reputation` / `loans` mappings).

## 🔧 External prerequisites

- CSPR.cloud API key (live `/verify` + dashboard reads + gateway/SDK verify) — provided.
- CSPR.click `appId` for dashboard wallet writes.
- A browser + wallet to exercise CSPR.click.

## Completion (honest)

| Layer | % | Note |
|---|---|---|
| Vault contract (core) | ~90% | works + deployed + proven; no on-chain TTL, no earning-stream |
| EIP-712 / x402 signing | ~95% | live `/verify` = `isValid:true` |
| **SDK (`@nickthelegend69/fund402`)** | ~93% | **published**; full server↔client↔vault loop **run live** on **both** credit paths (Tier-3 zero-collateral + Tier-1 auto-approve/escrow); Express/Hono/Next adapters |
| Agent + MCP | ~90% | 12 tools; create→fund→Tier3→borrow→repay **proven live**; Groq TUI + MCP server working |
| Gateway (reference) | ~85% | superseded by the SDK as the productized, live-verified path |
| Dashboard | ~70% | reads real; writes wired, not browser-tested |
| Demo | ~80% | runs the real SDK; honest preview |
| Tests | ~88% | strong core + SDK units + live e2e; no frontend integration tests |
| Deploy + docs | ~95% | deployed, documented, scripted, published |

**Overall ≈ 89%.** Core (contract + signing + SDK) ≈ 93%. The autonomous loop — agent
borrows through a pool-settled paywall (zero-collateral **and** collateralized) and
repays — is now **proven live end-to-end** (≈ 92%); only an automatic earning-stream
trigger and on-chain TTL remain for full SRSD parity (≈ 70%). Hackathon-submittable: **yes**.

## Next, to close the remaining gap (priority order)

1. Enforce loan TTL on-chain in `slash_defaulted_loan`.
2. Browser-test CSPR.click deposit/withdraw.
3. `EarningStream` auto-repay from x402 revenue (optional, post-hackathon).
