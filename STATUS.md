# Fund402 — Honest Status

Straight account of what is real, what is verified, and exactly what's left.
Last updated after the "fix the four simplified things" pass (network access +
a funded testnet account available this time).

## ✅ Real and verified this pass

### 1. EIP-712 signing — now built on the official client + verified offline
- `packages/agent-sdk` builds the x402 `exact` payload with the **official
  `@make-software/casper-x402` client** (`ExactCasperScheme` + `toClientCasperSigner`),
  so the digest + 65-byte `[algo|sig]` signature are produced by the same code the
  facilitator's counterpart expects — no hand-rolled crypto on the hot path.
- `npm run test:signing` (in `packages/agent-sdk`) **passes** and proves, offline:
  - fund402's independent digest (`src/eip712.ts`) is **byte-identical** to the
    canonical `@casper-ecosystem/casper-eip-712` digest for the same message;
  - `publicKey.accountHash() == authorization.from` and
    `publicKey.verifySignature(digest, sig) == true` — i.e. it passes the
    facilitator's **exact** `verify()` checks, minus the network call.
- **Live `/verify` is now one command:** `CSPR_CLOUD_API_KEY=… npm run test:facilitator`.
  The facilitator's verify is purely cryptographic/format/timing (it does **not**
  read on-chain balances), so this confirms signing live with **only an API key** —
  no deploy or funding required. (Left to you: you hold the key.)

### 2. casper-js-sdk v5 — compiles clean
- `npm install && npm run build` in `packages/agent-sdk` **succeeds** against
  `casper-js-sdk@5.0.12`. Fixed the real v5 mismatches the compiler found:
  `Duration` wrapper for `header.ttl`, `Hash.toHex()` on `putDeploy` results,
  `newCLUint64` casing, and added `@types/node`. The v5 API names are now
  compiler-verified, not "per the docs."

### 3. Collateral is physically escrowed (CEP-18) + the contract actually builds
- `contracts/fund402_vault` now escrows collateral in the **CEP-18 asset** via
  `transfer_from(agent → vault)` on `borrow_and_pay`, returns it on `repay_loan`,
  and seizes it on `slash_defaulted_loan`. (CEP-18 escrow, not CSPR-via-payable,
  because Odra 1.4 payable needs session WASM and can't be driven from a plain
  casper-js-sdk deploy — CEP-18 `transfer_from` can.)
- Fixed **three pre-existing bugs that meant the contract never compiled before**:
  inner-doc placement (`//!` after `extern crate`), missing `use odra::ContractRef`,
  and `odra-build` declared as a build-dependency (the `[[bin]]` targets need it as
  a normal dependency).
- `cargo +nightly test --lib` **passes 5/5** (tier thresholds, tier-1 starts new,
  10× credit limit, 150% collateral, score→tier promotion).

### 4. Dashboard wallet connect + deposit/withdraw — wired to CSPR.click
- `fund402-dashboard` now connects a wallet with **CSPR.click** (`useClickRef`,
  `signIn`/`signOut`, active-account tracking) and the Deposit/Withdraw buttons
  build real `approve` + `deposit_liquidity` / `withdraw_liquidity` deploys with
  casper-js-sdk and **sign + submit them through the wallet** (`clickRef.send`) —
  no private key in the browser. `lib/tx.ts` holds the builders.
- `npx tsc --noEmit` on the dashboard **passes** (also fixed a pre-existing
  `lib/casper.ts` headers type bug).

### 5. New demo (replaces the chat box)
- `fund402-demo` is now a **live JIT-credit cockpit**: an empty-wallet agent, an
  animated 4-stage credit pipeline (Agent → x402 Paywall → Fund402 Vault →
  Casper), a streaming `agent.log` console, and a settlement panel with the
  **real** `cspr.live` deploy link, the data the agent paid for, and a reputation
  reward meter. Still calls the **real** `@fund402/agent-sdk` (`/api/agent`); shows
  an explicit "flow preview — deploy to settle" state when not configured (no fake
  hashes/data).

## ⚠️ Honest caveats / what still needs a live network or your machine

1. **Live facilitator `/verify`** — signing is offline-verified against the
   canonical spec; the live round-trip just needs your CSPR.cloud key
   (`npm run test:facilitator`). One command.
2. **Contract WASM build for deployment.** The contract *lib* compiles and tests
   pass, but `cargo odra build` (wasm) fails here: the latest nightly rejects
   `#[no_mangle]` on internal lang items in `odra-casper-wasm-env`, and
   `cargo-odra 0.1.7` hardcodes `+nightly` (ignoring the pinned
   `rust-toolchain.toml = nightly-2026-01-01`). Fix at deploy time by using a
   `cargo-odra` that honours the toolchain, or building the contract under
   `nightly-2026-01-01` directly. The wasm is the only thing between this and a
   testnet deploy of the vault.
3. **CSPR.click in a browser** — the dashboard wiring type-checks against the real
   `@make-software/csprclick-*` API, but I can't run a browser/wallet here. You
   need a CSPR.click `appId` (https://console.cspr.build) and a wallet to click
   through deposit/withdraw. Watch the "sign message vs raw digest" caveat in
   `skills/cspr-click`.
4. **End-to-end testnet run** — now unblocked by the funded testnet account you
   provided. Sequence in `SETUP.md`: deploy CEP-18 + vault → seed liquidity → set
   env → `npm run demo:borrow`. For a **collateral-free** demo, seed the agent to
   Tier 3 with `award_reputation` (admin) so `borrow_and_pay` needs no collateral;
   otherwise the agent must hold CEP-18 and `approve` the vault first
   (`ensureCollateralAllowance` in the SDK).

## 🔧 Requires you (cannot be done from my sandbox)
- A **CSPR.cloud API key** (facilitator `/verify` + dashboard reads + gateway
  on-chain verification).
- Deploy the **CEP-18 x402 token** + the **vault** wasm and set the hashes in the
  `.env.local` files (see caveat #2 for the wasm toolchain).
- A CSPR.click **appId** for the dashboard's wallet writes.

## Bottom line
All four "simplified" items are now real code: signing is on the official client
and offline-proven against the facilitator's own checks; the SDK compiles against
casper-js-sdk v5; collateral is genuinely escrowed and the contract compiles +
passes tests; the dashboard signs deposits/withdrawals through CSPR.click. What's
left is operational — your CSPR.cloud key, the wasm toolchain alignment for
deploy, and a browser for the wallet flow — not fabricated data.
