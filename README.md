# Fund402 — Just-In-Time Credit for AI Agents on Casper

> **The credit card for the machine economy.** When an autonomous agent hits an
> HTTP `402 Payment Required` paywall with an empty wallet, Fund402 fronts the
> CEP-18 micropayment from an on-chain liquidity vault, settles it on **Casper**,
> and records the loan + the agent's reputation on-chain — no human in the loop.

Built for the **Casper Agentic Buildathon 2026**. Casper port of the original
Stellar/Soroban Fund402.

---

## ✅ Live on Casper testnet

The full protocol is deployed and a real Tier-3 (zero-collateral) loan has settled
on-chain. Details + every deploy link in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

| | Package hash | |
|---|---|---|
| **Vault** | `664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12` | [install ↗](https://testnet.cspr.live/deploy/f742b8a48d1585e0ff4853cb8dbde39fdd5dd4461373a348229bb3e256414327) |
| **CEP-18 "Fund402 USDC" (F402)** | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` | [install ↗](https://testnet.cspr.live/deploy/43f55b98e2e26d9f6c7ddb527c80d8f0b37e2f60fe9ceaefb5006cbea4423430) |

**The money shot:** an agent with **0 balance and 0 collateral** borrowed `1e6`
F402 → the vault fronted it to the merchant (pool `100M → 99M`, merchant `+1M`).
[`borrow_and_pay` deploy ↗](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17)

---

## The problem

AI agents are productive but **credit-constrained**. The x402 protocol lets them
pay per HTTP request — but an agent fails the moment its wallet is empty, or when
a paid endpoint's price is only known at runtime (the `402` arrives dynamically).
There is no credit primitive for machines. Fund402 is that primitive.

## How it works

```
        ┌──────────────────────────────────────────────────────────┐
        │   AI Agent (empty wallet) · @fund402/agent-sdk (axios)     │
        └─────────────────────────────┬────────────────────────────┘
            1. GET /v/<vault>/<path>   │            ▲  6. replay → 200 OK + data
                                       ▼            │
        ┌──────────────────────────────────────────────────────────┐
        │   x402 Gateway (Next.js · :3005)  src/app/api/v/...        │
        │   no signature → 402 Payment Required + x402 challenge     │
        │   signature   → verify the vault deploy on-chain → proxy   │
        └─────────────────────────────┬────────────────────────────┘
            2. borrow_and_pay          │  (@fund402/agent-sdk → casper-js-sdk)
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │   Fund402 Vault (Odra/Rust → WASM)  contracts/fund402_vault│
        │   • CEP-18 liquidity pool     • 3-tier credit + collateral │
        │   • on-chain reputation       • borrow / repay / slash     │
        └─────────────────────────────┬────────────────────────────┘
            3. CEP-18 transfer to merchant (the vault is the payer)
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │   Casper Network (casper-test)                            │
        │   CEP-18 token + casper-x402 facilitator (/verify /settle) │
        └──────────────────────────────────────────────────────────┘
            4. settled → deploy hash    5. gateway verifies via CSPR.cloud
```

1. Agent requests a paid resource through the gateway → gets `402` + an x402 v2
   challenge (asset = CEP-18 package, amount, `payTo`).
2. The agent SDK calls the vault's `borrow_and_pay`; the vault checks the agent's
   tier/collateral and **fronts the CEP-18 payment to the merchant from the pool**.
3–4. The transfer settles on Casper; the deploy hash is the proof.
5. The agent replays the request with a `PAYMENT-SIGNATURE`; the gateway verifies
   the borrow deploy on-chain (CSPR.cloud) and proxies the real upstream data.
6. Repayment pulls the principal back + bumps reputation (`+10`); default slashes
   collateral + reputation (`-50`).

## Repository layout

| Component | Path | What it is |
|---|---|---|
| **Gateway** | `src/app` | Next.js x402 gateway (`:3005`) — 402 challenge, on-chain verify, origin proxy |
| **Vault** | `contracts/fund402_vault` | Odra/Rust contract — CEP-18 pool, tiered JIT loans, reputation |
| **Agent SDK** | `packages/agent-sdk` | `@fund402/agent-sdk` — axios interceptor; builds + signs the x402 `exact` payload (official `@make-software/casper-x402`) and drives `borrow_and_pay` via casper-js-sdk v5 |
| **Scripts** | `scripts/e2e.mjs` | One-command-per-step testnet deploy + run |

## The 3-tier credit model

| Tier | Who | Requirement | Credit limit | Collateral |
|---|---|---|---|---|
| **1 — New** | score < 50 | collateral-first | 10× collateral | required (150%) |
| **2 — Established** | score ≥ 50 | reputation + partial collateral | score-weighted | reduced |
| **3 — Trusted** | score ≥ 200 | reputation only | reputation-based | **none** |

Reputation: `+10` on-time repay, `-25` default, `-50` slash. Collateral is
physically **escrowed in the CEP-18 asset** via `transfer_from` (returned on repay,
seized on slash).

## Quickstart

```bash
# 1. build the agent SDK + gateway
npm install
npm --prefix packages/agent-sdk install && npm --prefix packages/agent-sdk run build

# 2. verify the x402 signing (offline proof + live /verify)
npm --prefix packages/agent-sdk run test:signing
CSPR_CLOUD_API_KEY=<key> npm --prefix packages/agent-sdk run test:facilitator

# 3. build + test the vault (Odra, needs nightly — see below)
cargo +nightly-2026-01-01 test --manifest-path contracts/fund402_vault/Cargo.toml --lib

# 4. deploy + run end-to-end on testnet (see DEPLOYMENT.md)
node scripts/e2e.mjs cep18   # deploy CEP-18
node scripts/e2e.mjs vault   # deploy + init the vault
node scripts/e2e.mjs fund    # CSPR → agent (gas)
node scripts/e2e.mjs seed    # approve + deposit_liquidity
node scripts/e2e.mjs rep     # award_reputation → Tier 3
node scripts/e2e.mjs borrow  # borrow_and_pay  ← the money shot
```

Config lives in `.env.local` (gitignored) — see `.env.example`. Keys live in
`.keys/` (gitignored). Funding runbook: **[SETUP.md](./SETUP.md)**.

## Tests

```bash
npm test                            # gateway lib + agent-SDK signing/payload (facilitator skips w/o key)
CSPR_CLOUD_API_KEY=<key> npm test   # + LIVE facilitator /verify of the shipped payload
npm run contract:test               # Odra vault: 7 tests incl. the full loan lifecycle (OdraVM, nightly)
```

| Suite | What it proves |
|---|---|
| `contracts/fund402_vault` (Rust/OdraVM) | tier math, 150% collateral, **full lifecycle** (deposit → Tier-3 borrow → repay, real CEP-18 balance moves + reputation), slash |
| `packages/agent-sdk/test/signing` | fund402's EIP-712 digest **== canonical** `casper-eip-712`; the 65-byte signature passes the facilitator's exact checks (offline) |
| `packages/agent-sdk/test/payload` | x402 v2 payload shape + the Fund402 `settlement` extension |
| `packages/agent-sdk/test/facilitator` | the **shipped** payload is accepted by the **live** facilitator (`isValid:true`) |
| `test/gateway` | 402 challenge / payment-requirements / signature decode / config |

All green as of the last run. The contract suite mirrors the on-chain e2e in
[DEPLOYMENT.md](./DEPLOYMENT.md).

## Building the vault WASM (the hard-won recipe)

Odra contracts for Casper 2.0 need a specific toolchain — encoded in
`contracts/fund402_vault/rust-toolchain.toml`:

- **odra 2.8 + `nightly-2026-01-01`** (newer nightlies reject odra's `#[no_mangle]`
  panic handler; older can't parse modern dep manifests).
- **`wasm-opt` (binaryen)** — lowers the bulk-memory ops the Casper VM rejects.
- Entry points (`call`, `borrow_and_pay`, …) are emitted only when building with
  `ODRA_MODULE=Fund402Vault ODRA_BACKEND=casper` and the odra-2.x `bin/build_contract.rs`
  shape (`#![no_std] #![no_main] use fund402_vault;`) + `build.rs`.
- Deploy via casper-js-sdk `ModuleBytes` (see `scripts/e2e.mjs`), not `cargo odra livenet`.

## Status & honesty

What's real, verified, and simplified is tracked candidly in **[STATUS.md](./STATUS.md)**.
The headline: signing is confirmed against the **live** facilitator, the vault is
**deployed**, and a real loan **settled on-chain** — no mocks.

## Related repos

- **fund402-dashboard** — LP liquidity dashboard (deposit/withdraw via CSPR.click).
- **fund402-demo** — live JIT-credit cockpit demo.

## License

Apache-2.0.
