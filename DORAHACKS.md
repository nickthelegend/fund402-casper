# Payward

### The credit & settlement layer for the machine economy — on Casper.

Autonomous AI agents can browse, call APIs, and act on their own — but they **can't pay**.
The moment an agent's wallet is empty it hits an HTTP `402` and stops, and when one agent
pays another there's **no protection** if the work comes back wrong. **Payward** fixes both:

- **Fund402** — *credit in.* An agent pays a `402` paywall with an **empty wallet**; a Casper
  liquidity pool fronts the CEP‑18 micropayment, settles it on‑chain, and the agent repays later.
- **Clawback** — *settlement out.* Agent‑to‑agent payments are held in **escrow** and, on a
  dispute, a **Groq AI verifier** adjudicates the delivery against the spec and **claws the
  payment back** to the buyer.

> One `npm install`. Two on‑chain primitives. **Live on Casper testnet — every number below is a real deploy.**

---

## 🎥 Demo & links

- **Demo video (1:45, narrated):** `promo/payward-promo.mp4` — *upload to YouTube and paste the link here*
- **GitHub (8 open‑source repos):** https://github.com/nickthelegend
- **npm SDK:** `npm i @nickthelegend69/fund402` — https://www.npmjs.com/package/@nickthelegend69/fund402
- **Network:** Casper testnet (`casper-test`)
- **Track:** Agentic / AI agents on Casper

---

## The problem

The x402 standard lets agents pay per HTTP request — but an agent dies the instant its wallet
is empty, or when a paid endpoint's price is only known at runtime. There is **no credit
primitive for machines**, and **no buyer protection** in agent‑to‑agent commerce.

## The solution — two layers, one platform

| Layer | What it does |
|---|---|
| **Fund402** (credit) | Hit a `402` → a CEP‑18 **liquidity pool fronts** the payment, settles on Casper, records the loan + on‑chain reputation. 3‑tier credit (collateral → reputation‑only). Repay later; a **5% fee becomes LP yield**. |
| **Clawback** (settlement) | Buyer's payment held in **escrow** vs a spec. Good delivery → **released** to seller; bad delivery → **disputed**, a **Groq AI verifier** adjudicates, and the payment is **clawed back** to the buyer. On‑chain reputation per agent. |

**Credit on the way in, protection on the way out — both settling on Casper.**

## How it works

```
agent (empty wallet) ─GET /v/price─▶ paywall() ─402─▶ fund402Fetch() ─borrow_and_pay─▶ Fund402 Vault
        ▲                                                                                   │ (CEP-18 pool
   200 OK + data ◀── verify settlement on-chain (CSPR.cloud) ◀── settled on Casper ◀────────┘  fronts the pay)

agent ⇄ agent:  buyer.open(spec) ▶ HELD ▶ seller delivers ▶ Groq AI verifier adjudicates
                good → release (seller paid)      bad → dispute → resolve(false) → clawback (buyer refunded)
```

## ✅ Live on Casper — no mocks

| Proof | On‑chain |
|---|---|
| **Fund402 Vault v2** (yield‑bearing) | pkg `ca4086d3…` |
| **CEP‑18 "Fund402 USDC" (F402)** | `389cedc5…` |
| **ClawbackEscrow** | `088655d1…` |
| Agent with **0 balance & 0 collateral** borrows `1e6` F402, pool pays the merchant | [borrow_and_pay ↗](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17) |
| Full SDK loop `402 → borrow → settle‑verify → 200 + data` | [settlement ↗](https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264) |
| LP realizes yield: 2,000,000 in → **2,050,000 out (+2.5%)** | [repay ↗](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) · [withdraw ↗](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c) |
| Clawback **honest**: AI meets‑spec → release (seller +1e6) | [open ↗](https://testnet.cspr.live/deploy/02bfd9cf6c55118ca0ea5eb34b4f36aeea120ca20cc9b565d8c39e164b7f91b1) · [release ↗](https://testnet.cspr.live/deploy/87a30923652d57dc13a4372d7890c93218685a0a01d5aacbae7395446f74a889) |
| Clawback **dispute**: AI does‑not‑meet‑spec → refund | [dispute ↗](https://testnet.cspr.live/deploy/0106f5e033c94b99ad2847c0089763b8e33cfd66ced56c94d84e837da4c94d12) · [resolve ↗](https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435) |

Every runtime path uses real on‑chain data. The only test double anywhere is a `MockCep18`
in two contract unit tests — and every behavior it covers is *also* proven live.

## What we built (the full stack)

**SDK** (`@nickthelegend69/fund402` — `paywall()` + `fund402Fetch()`, Express/Hono/Next
adapters) · **Vault** (Odra/Rust→WASM, CEP‑18 pool, 3‑tier credit, on‑chain reputation, yield)
· **autonomous Agent** (12 on‑chain tools) · **MCP server + Groq TUI** (drive it from chat) ·
**Agent Skills** (`npx skills add`) · **LP dashboard** · **JIT‑credit cockpit demo** ·
**Clawback** (escrow contract + AI verifier + dashboard). **8 open‑source repos.**

## Tech

Casper 2.0 / Condor · Odra 2.8 (Rust → WASM) · CEP‑18 · x402 v2 `exact` scheme with EIP‑712
signing verified against the **live CSPR.cloud facilitator** · Groq `llama‑3.3‑70b` AI verifier
· TypeScript SDK on npm · Model Context Protocol.

## Why it matters

Agents that transact need what humans take for granted: **a line of credit** and **buyer
protection**. Payward is those two primitives — native to Casper, drop‑in via one `npm install`
— the missing money rails for the agentic economy.

## What's next

On‑chain loan‑TTL enforcement · an autonomous scheduler that repays from an x402 revenue
stream · browser‑tested CSPR.click LP deposits · mainnet.

**License:** Apache‑2.0 (Fund402) · MIT (Clawback)
