# Payward — Hackathon Submission

**Casper Agentic Buildathon 2026**

> **Payward — the credit & settlement layer for the machine economy.**
> Payward gives autonomous AI agents on Casper the two things they lack: **credit** and
> **buyer protection**. It ships as two layers:
> **Fund402** (credit *in*) lets an agent pay an HTTP `402` paywall with an **empty wallet**
> — a liquidity pool fronts the micropayment and settles it on Casper.
> **Clawback** (settlement *out*) holds agent‑to‑agent payments in **escrow** with
> **AI‑adjudicated disputes**.

---

## 🎬 Demo video

`promo/payward-promo.mp4` — 1:45 (105s), narrated, karaoke‑captioned, with real on‑chain proofs on
screen. (Recording flow + narration for a live walkthrough: see **[DEMO-SCRIPT.md](./DEMO-SCRIPT.md)**.)

> **Naming:** *Payward* is the product. Its two layers ship as separate open‑source repos —
> **Fund402** (`@nickthelegend69/fund402`, the credit layer) and **Clawback** (the settlement
> layer). The repos keep those names; Payward is the umbrella.

## The problem

AI agents can browse, call APIs, and act on their own — but they **can't pay**. The x402
standard lets them pay per HTTP request, yet an agent dies the instant its wallet is empty,
or when a paid endpoint's price is only known at runtime (the `402` arrives dynamically).
There is **no credit primitive for machines**, and **no protection** when one agent pays
another for work that comes back wrong.

## The solution — Payward's two layers

**Payward** is one platform, two primitives:

| Layer | What it does |
|---|---|
| **Fund402** (credit, *in*) | When an agent hits a `402`, a CEP‑18 **liquidity pool fronts** the payment, settles it on Casper, and records the loan + the agent's on‑chain reputation. 3‑tier credit (collateralized → reputation‑only). The agent repays later; a **5% fee becomes LP yield**. |
| **Clawback** (settlement, *out*) | A buyer agent's payment is **held in escrow** against a stated spec. Good delivery → **released** to the seller; bad delivery → **disputed**, and a **Groq AI verifier** adjudicates and **claws the payment back** to the buyer. Reputation accrues per agent. |

One credit on the way in, one protection on the way out — both settling on Casper.

## How it works

```
agent (empty wallet) ──GET /v/price──▶ paywall()  ──402──▶ fund402Fetch()
        │                                                       │ borrow_and_pay
        │                                                       ▼
        │                                   Fund402 Vault (Odra/Rust→WASM, CEP‑18 pool)
        │                                   ├─ 3‑tier credit + on‑chain reputation
        │                                   └─ fronts the CEP‑18 payment to the merchant
        ▼                                                       ▼
   200 OK + data  ◀──verify settlement on‑chain (CSPR.cloud)── settled on Casper (deploy hash)

agent ⇄ agent:  buyer.open(spec) ▶ HELD ▶ seller.delivers ▶ Groq verifier adjudicates
                good → release (seller paid)   ·   bad → dispute → resolve(false) → refund (clawback)
```

## ✅ Live on Casper testnet — real, no mocks

Everything below is **deployed and proven on `casper-test`** (links in
[DEPLOYMENT.md](./DEPLOYMENT.md) and the [Clawback repo](https://github.com/nickthelegend/clawback-casper)):

| | hash / proof |
|---|---|
| **Fund402 Vault v2** (yield‑bearing) | `ca4086d3…073e1b2f` |
| **CEP‑18 "Fund402 USDC" (F402)** | `389cedc5…7b866bccd0` |
| **ClawbackEscrow** | `088655d1…5888efb9` |
| **The money shot** — agent with 0 balance & 0 collateral borrowed `1e6` F402, pool fronted it to the merchant | [`borrow_and_pay` ↗](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17) |
| **Full SDK loop** — `paywall()` server + `fund402Fetch()` agent: `402 → borrow → on‑chain settle verify → 200 + data` | [settlement ↗](https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264) |
| **LP yield realized** — LP deposited 2,000,000, agent repaid via `repay_latest`, LP withdrew **2,050,000 (+2.5%)** | [repay ↗](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) · [withdraw ↗](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c) |
| **Clawback — honest path** — escrow → deliver → AI *meets‑spec* → release (seller +1,000,000) | [open ↗](https://testnet.cspr.live/deploy/02bfd9cf6c55118ca0ea5eb34b4f36aeea120ca20cc9b565d8c39e164b7f91b1) · [release ↗](https://testnet.cspr.live/deploy/87a30923652d57dc13a4372d7890c93218685a0a01d5aacbae7395446f74a889) |
| **Clawback — dispute path** — junk delivery → AI *does‑not‑meet‑spec* → resolve(false) → buyer refunded | [dispute ↗](https://testnet.cspr.live/deploy/0106f5e033c94b99ad2847c0089763b8e33cfd66ced56c94d84e837da4c94d12) · [resolve ↗](https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435) |

**No mocks in any production path.** Every runtime path uses real on‑chain data or returns
an explicit `configured:false`. The only test double anywhere is a `MockCep18` in two contract
unit modules — and every behavior it covers is *also* proven live against the real CEP‑18.

## Tech

- **Contracts:** Odra 2.8 (Rust → WASM) on Casper 2.0 / Condor. CEP‑18 collateral escrow via
  `approve` + `transfer_from`; on‑chain reputation; 3‑tier credit; share‑based yield pool.
- **x402 / payments:** x402 v2 `exact` scheme, EIP‑712 authorization signing verified against
  the **live CSPR.cloud facilitator** (`isValid:true`).
- **AI verifier:** Groq `llama‑3.3‑70b` adjudicates Clawback disputes (spec vs delivery), then
  signs the on‑chain `resolve`.
- **SDK:** published npm package [`@nickthelegend69/fund402`](https://www.npmjs.com/package/@nickthelegend69/fund402)
  — `paywall()` (+ Express/Hono/Next adapters) and `fund402Fetch()` (drop‑in `fetch`).
- **Tooling:** an autonomous **agent** (12 on‑chain tools), an **MCP server** + Groq TUI, and
  **Agent Skills** (`npx skills add`).

## The full stack (8 open‑source repos)

| Repo | What |
|---|---|
| [fund402-casper](https://github.com/nickthelegend/fund402-casper) | The vault contract, gateway, docs — the hub |
| [fund402-sdk](https://github.com/nickthelegend/fund402-sdk) → npm `@nickthelegend69/fund402` | The SDK — `paywall()` + `fund402Fetch()` |
| [fund402-agent](https://github.com/nickthelegend/fund402-agent) | 12‑tool autonomous agent toolbox |
| [fund402-mcp](https://github.com/nickthelegend/fund402-mcp) | Groq TUI + MCP server |
| [fund402-agent-skills](https://github.com/nickthelegend/fund402-agent-skills) | `npx skills add` — teach any coding agent |
| [fund402-casper-dashboard](https://github.com/nickthelegend/fund402-casper-dashboard) | LP liquidity dashboard |
| [fund402-casper-demo](https://github.com/nickthelegend/fund402-casper-demo) | Live JIT‑credit cockpit demo |
| [clawback-casper](https://github.com/nickthelegend/clawback-casper) | Escrow + AI‑adjudicated disputes |

## Why it matters for the agentic economy

Agents that transact need two things humans take for granted: **a line of credit** (so an empty
wallet isn't a dead end) and **buyer protection** (so paying another agent isn't a leap of
faith). **Payward** is those two primitives — Fund402 and Clawback — native to Casper, drop‑in
via one `npm install`.

## What's next

- On‑chain loan TTL enforcement in `slash_defaulted_loan`.
- An autonomous scheduler that calls `repay_latest` off an x402 revenue stream.
- Browser‑tested CSPR.click deposit/withdraw on the LP dashboard.

## Links

- **npm:** `npm i @nickthelegend69/fund402`
- **GitHub:** https://github.com/nickthelegend
- **Network:** Casper testnet (`casper-test`)
- **License:** Apache‑2.0 (Fund402) · MIT (Clawback)
