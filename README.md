# Fund402 — Just-In-Time Credit for AI Agents on Casper

> **The credit card for the machine economy.** When an autonomous agent hits an
> HTTP `402 Payment Required` paywall with an empty wallet, Fund402 fronts the
> CEP-18 micropayment from an on-chain liquidity vault, settles it on **Casper**,
> and records the loan + the agent's reputation on-chain — no human in the loop.

Built for the **Casper Agentic Buildathon 2026**. Casper port of the original
Stellar/Soroban Fund402.

**▶ Watch the 90-second demo** — [`promo/fund402-promo.mp4`](./promo/fund402-promo.mp4)
([how it was built](./promo/README.md)): two acts — **Fund402** (problem → SDK → live
borrow→settle→serve → LP yield) and **Clawback** (escrow → AI-adjudicated release or
clawback) → the whole stack.

[![Fund402 demo](./promo/preview.jpg)](./promo/fund402-promo.mp4)

---

## ✅ Live on Casper testnet

The full protocol is deployed and a real Tier-3 (zero-collateral) loan has settled
on-chain. Details + every deploy link in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

| | Package hash | |
|---|---|---|
| **Vault v2** (yield-bearing) | `ca4086d3a7b1abf000d0a79e23a237bb484a14807e9438f2c56f3461073e1b2f` | [install ↗](https://testnet.cspr.live/deploy/4e15da97c4b556eddfa19686d4286ee386f80c31217102ed2fa50540820503ae) |
| **CEP-18 "Fund402 USDC" (F402)** | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` | [install ↗](https://testnet.cspr.live/deploy/43f55b98e2e26d9f6c7ddb527c80d8f0b37e2f60fe9ceaefb5006cbea4423430) |

**The money shot:** an agent with **0 balance and 0 collateral** borrowed `1e6`
F402 → the vault fronted it to the merchant (pool `100M → 99M`, merchant `+1M`).
[`borrow_and_pay` deploy ↗](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17)

**💰 The LPs earn, too:** v2 charges a **5% JIT credit fee** that accrues to the pool on
repayment. Proven live — an LP deposited `2_000_000`, an agent borrowed + **repaid via
`repay_latest`** (no loan id), and the LP **withdrew `2_050_000` for its `2_000_000`
deposit (+50k yield).**
[repay ↗](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) ·
[LP withdraw ↗](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c)
(v1 vault `664d99de…` remains live; v2 supersedes it.)

---

## 📦 The SDK — `npm i @nickthelegend69/fund402`

Fund402 ships as a **published, framework-agnostic SDK** so any developer can add
*"x402 endpoints settled by a lending pool"* in a few lines —
[**@nickthelegend69/fund402**](https://www.npmjs.com/package/@nickthelegend69/fund402)
([repo](https://github.com/nickthelegend/fund402-sdk)).

**Server (merchant)** — gate a route; the pool fronts the payment so callers can pay
with an empty wallet. Drop-in for **Express / Hono / Next.js**:

```ts
import { expressPaywall } from "@nickthelegend69/fund402/express";
app.use("/v", expressPaywall({
  payTo, asset, price: "1000000", vaultContract,
  csprCloudApiKey: process.env.CSPR_CLOUD_API_KEY,
}));
```

**Client (agent)** — a drop-in `fetch` that borrows JIT and replays the request:

```ts
import { fund402Fetch } from "@nickthelegend69/fund402";
const f = fund402Fetch({ agentSecretKey, agentPublicKey, vaultContract });
const res = await f("https://merchant.example/v/price/BTC-USD"); // paid + served
```

✅ **Verified live, whole loop on casper-test**: a real `paywall()` server + a real
`fund402Fetch()` agent → 402 → borrow from the pool → on-chain settlement verify →
`200 + data`.
[settlement deploy `96f30ddf…` ↗](https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264)

---

## 🤖 Autonomous agent + MCP

Beyond the SDK, an agent can drive the whole protocol from natural language:

- **[fund402-agent](https://github.com/nickthelegend/fund402-agent)** — 12 on-chain
  tools (create wallets, fund, deposit liquidity, award reputation, **borrow + x402**,
  repay, sign/verify x402, balances).
- **[fund402-mcp](https://github.com/nickthelegend/fund402-mcp)** — a **Groq TUI**
  (chat → live on-chain tool calls) **+ an MCP server** for Claude Desktop. Verified
  live: a wallet was created → funded → made Tier-3 → borrowed (x402) → repaid, all
  on-chain, driven from chat.

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

| Component | Path / repo | What it is |
|---|---|---|
| **Vault** | `contracts/fund402_vault` | Odra/Rust contract — CEP-18 pool, tiered JIT loans, on-chain reputation, borrow / repay / slash |
| **SDK** (published) | [`fund402-sdk`](https://github.com/nickthelegend/fund402-sdk) → `@nickthelegend69/fund402` | Both sides: `paywall()` + Express/Hono/Next adapters (server) and `fund402Fetch()` + axios interceptor (client). The productized, framework-agnostic SDK. |
| **Gateway** | `src/app` | Reference Next.js x402 gateway (`:3005`) — 402 challenge, on-chain verify, origin proxy |
| **Agent SDK** | `packages/agent-sdk` | In-repo origin of the SDK — axios interceptor; builds + signs the x402 `exact` payload via a **manual** EIP-712 digest + `signAndAddAlgorithmBytes` (the `@make-software/casper-x402` CJS build is broken), driving `borrow_and_pay` on casper-js-sdk v5 |
| **Agent + MCP** | [`fund402-agent`](https://github.com/nickthelegend/fund402-agent) · [`fund402-mcp`](https://github.com/nickthelegend/fund402-mcp) | 12-tool agent toolbox + Groq TUI + MCP server (Claude Desktop) |
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

## The Fund402 ecosystem

- **[fund402-sdk](https://github.com/nickthelegend/fund402-sdk)** → npm
  [`@nickthelegend69/fund402`](https://www.npmjs.com/package/@nickthelegend69/fund402)
  — the SDK (create + pay pool-settled x402 endpoints).
- **[fund402-agent](https://github.com/nickthelegend/fund402-agent)** — 12-tool
  autonomous agent toolbox (wallets, funding, borrow/x402/repay).
- **[fund402-mcp](https://github.com/nickthelegend/fund402-mcp)** — Groq TUI + MCP
  server over the agent toolbox.
- **[fund402-casper-dashboard](https://github.com/nickthelegend/fund402-casper-dashboard)**
  — LP liquidity dashboard (deposit/withdraw via CSPR.click).
- **[fund402-casper-demo](https://github.com/nickthelegend/fund402-casper-demo)**
  — live JIT-credit cockpit demo.
- **[clawback-casper](https://github.com/nickthelegend/clawback-casper)** — the
  companion **settlement layer**: agent payment escrow with AI-adjudicated disputes
  ("chargebacks for the machine economy"). Fund402 *fronts* payments; Clawback
  *escrows* them with dispute resolution. Run both — credit on the way in, protection
  on the way out.

## License

Apache-2.0.
