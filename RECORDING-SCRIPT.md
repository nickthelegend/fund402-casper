# Payward — live demo recording script (show the real working thing)

A hands‑on screen recording that proves Payward runs: the SDK, an x402‑gated endpoint, the
lending pool, a real on‑chain borrow, the agent + MCP driving it from chat, then Clawback's
escrow + AI‑adjudicated clawback — with cspr.live proofs. ~6–8 min (trim per taste).

> **Casper is not instant.** A testnet deploy takes ~1–2 min to confirm. So the demo scripts
> below *wait*. Two safe options: **(a)** pre‑run each script once so keys/deps are warm, then
> run it live and **speed up the wait in edit**; or **(b)** pre‑run it, keep the terminal +
> the cspr.live tab, and on camera just re‑read the result and click the proof. Never gamble on
> a first‑try live tx during the take.

---

## Pre‑flight (before you hit record)

**Keys / env** (testnet only; all gitignored):
- `fund402/.keys/deployer_secret.pem` (funded), `fund402/.env.local` → `CSPR_CLOUD_API_KEY`.
- `fund402-agent/.env` + `fund402-mcp/.env` → `CSPR_CLOUD_API_KEY`, `GROQ_API_KEY`.
- `clawback-casper/clawback-agent/.env` → `CSPR_CLOUD_API_KEY`, `GROQ_API_KEY`.

**Terminals (one each):**
1. `cd fund402-dashboard && npm i && npm run dev`   → LP dashboard (http://localhost:3000)
2. `cd fund402-demo && npm i && npm run dev`         → cockpit (http://localhost:3006)
3. `cd fund402 && npm i`                             → for `npm run demo:borrow`
4. `cd fund402-mcp && npm i`                         → for `npm run tui`
5. `cd clawback-casper/clawback-agent && npm i`      → for `npm run seller` / `npm run demo`
6. `cd clawback-casper/clawback-web && node serve.mjs` → Clawback dashboard

**Browser tabs:** the LP dashboard · the cockpit · the Clawback dashboard · npm
(`npmjs.com/package/@nickthelegend69/fund402`) · GitHub `github.com/nickthelegend` · two
cspr.live tabs (settlement `96f30ddf…`, clawback resolve `f6f6c5db…`) · your editor.

**Record:** 1080p/30, browser zoom ~110%, notifications off, terminal font large.

---

# ACT 1 — Fund402 (credit)

## 1 · The repo + what's real  (~30s)
**SHOW:** GitHub `nickthelegend/fund402-casper` — scroll the README: the architecture diagram
and the **"Live on Casper testnet"** proof table (real deploy links).
**SAY:**
> "This is Fund402 — the credit layer of Payward. It's fully deployed on Casper testnet: the
> vault, the CEP‑18 token, and real settled loans — every hash here is clickable. Let me show
> you it actually working, starting with how a developer plugs in."

## 2 · The SDK — create an x402 endpoint  (~70s)
**SHOW:** the npm page for `@nickthelegend69/fund402`, then in your editor open the gateway
route (`fund402/src/app/api/v/…`) — the real paywall‑gated endpoint. Then the SDK's two calls.
**DO:** in a terminal, `npm i @nickthelegend69/fund402`. Point at the `paywall({...})` wrapper
on the server route, and the `fund402Fetch(...)` call on the client.
**SAY:**
> "It's one npm install and two functions. On the server, `paywall` wraps any route — you set
> a price and a payTo, and it issues the x402 challenge and verifies settlement on‑chain. On
> the agent side, `fund402Fetch` is a drop‑in `fetch`: it hits the endpoint, gets the four‑oh‑
> two, borrows just‑in‑time from the pool, pays, and replays — so the caller pays *even with an
> empty wallet*. That's how you make an endpoint that accepts x402 lending for agents."

## 3 · The lending pool  (~50s)
**SHOW:** the **LP dashboard** (localhost:3000) — TVL, capital deployed, utilization, the
borrower directory. Then click a borrower row through to cspr.live. (Optional: connect a
CSPR.click wallet and start a small `deposit`.)
**SAY:**
> "The credit comes from a liquidity pool. Providers deposit the CEP‑18 asset here; the vault
> lends it to agents just‑in‑time. Every borrow pays a five‑percent fee into a share‑based
> pool, so LPs withdraw more than they put in — we proved that live: two million in, two‑point‑
> oh‑five million out."

## 4 · The live flow — a real on‑chain borrow  (~70s)
**SHOW / DO:** in the `fund402` terminal run:
```bash
npm run demo:borrow
```
Let the terminal log the steps: an agent with **0 balance** requests the paid resource, gets a
`402`, the vault runs `borrow_and_pay`, the pool fronts the CEP‑18 to the merchant, and it
prints the **deploy hash**. Copy that hash → open it on **cspr.live**, pause ~2s on
`status: processed`, `amount`, `collateral 0`.
*(Visual alternative: the cockpit at localhost:3006 — trigger the agent and watch 402 → borrow
→ settle → 200 with the receipt.)*
**SAY:**
> "Here's the money shot, live. This agent has nothing in its wallet. It asks for a paid price
> feed, gets a four‑oh‑two, and the pool fronts the payment — it settles on Casper, and here's
> that exact deploy: amount paid, merchant credited, zero collateral, status processed. The
> agent paid with an empty wallet."

## 5 · The agent + MCP, working  (~80s)
**SHOW / DO:** first, `cd fund402-agent && npm run tools` — the **12 on‑chain tools** print.
Then the MCP + Groq TUI:
```bash
cd fund402-mcp && npm run tui
```
Type a natural‑language request, e.g.:
> `create a fresh agent wallet, make it trusted, borrow 1 F402 through x402, then repay it`

Watch the TUI stream the **tool calls and live on‑chain deploys** as it goes. (`npm start`
runs the same toolbox as an **MCP server** for Claude Desktop — mention it.)
**SAY:**
> "And this isn't just a library — it's an autonomous agent. Twelve on‑chain tools, exposed
> both as an MCP server for Claude Desktop and as this Groq‑driven chat. I ask it in plain
> English to spin up a wallet, take credit through x402, and repay — and it does it, for real,
> on Casper, streaming every deploy. No human clicking through wallets."

## 6 · Agent Skills  (~30s)
**SHOW / DO:** `npx skills add nickthelegend/fund402-agent-skills` — the skills install; open
one `SKILL.md`.
**SAY:**
> "And to teach *any* coding agent to use Fund402, it's one command — `npx skills add`. Drop
> these in and your agent learns, on demand, how to borrow, pay an x402 API, and repay."

---

# ACT 2 — Clawback (settlement)

## 7 · The endpoint being paid for  (~40s)
**SHOW:** the `clawback-casper` repo (escrow state machine in the README), then the **seller
service** file (`clawback-agent/src/seller.mjs`). Start it:
```bash
cd clawback-casper/clawback-agent && npm run seller
```
**SAY:**
> "Credit gets an agent paid *in*. Clawback is the other half — protection when one agent pays
> *another*. Here's a seller agent exposing a paid endpoint: a buyer will pay for a deliverable
> against a stated spec, and the money is held in escrow until the work is verified."

## 8 · The clawback of assets — real, on‑chain  (~90s)
**SHOW / DO:** run the full flow (honest + bad):
```bash
npm run demo both
```
Narrate the terminal as it runs **both** scenarios:
- **Honest:** buyer opens escrow (`HELD 1,000,000`) → seller delivers → the **Groq AI verifier**
  says *meets‑spec* → buyer **releases** → seller paid.
- **Bad:** junk delivery → the AI says *does‑not‑meet‑spec* ("status is 'error' instead of
  'ok'") → buyer **disputes** → the AI verifier **resolves(false)** → the payment is **clawed
  back** to the buyer.

Then open the **Clawback dashboard** (localhost) — the escrow lane HELD → DELIVERED →
RELEASED / DISPUTED → REFUNDED, with the tx firehose. Click the `resolve` row → **cspr.live**,
pause on the refund.
**SAY:**
> "Watch the assets move. Good delivery — the AI verifier reads the spec against what was
> delivered, agrees, and the escrow releases to the seller. Now the bad one — the seller ships
> junk. The AI verifier catches it — 'status is error, not ok' — the buyer disputes, and the
> verifier resolves it false, clawing the payment back to the buyer. Chargebacks for the
> machine economy — and here it is, settled on Casper."

## 9 · Same toolbox, driven from chat  (~20s, optional)
**SHOW:** the Clawback tools in `clawback-mcp` / the `clawback-*` skills in fund402‑agent‑skills.
**SAY:**
> "And Clawback rides the same rails — its tools are in the MCP server and shipped as agent
> skills, so an agent can escrow, dispute, and resolve from chat too."

---

# Close  (~20s)
**SHOW:** the Payward end‑card (or `promo/payward-promo.mp4`), then the GitHub org / npm.
**SAY:**
> "So that's Payward — Fund402 for credit on the way in, Clawback for settlement on the way
> out. One npm install, eight open‑source repos, all live on Casper. Thanks for watching."

---

## Tight cut (~3 min, if you're short)
Segments **1 → 2 → 4 → 5 → 8 → close**. Keeps the strongest proofs: create an endpoint, a real
empty‑wallet borrow, the agent driving it from chat, and the AI clawing back a bad payment.

## Gotchas while recording
- Confirmations take ~1–2 min — pre‑run once, then speed the wait in edit (or cut to cspr.live).
- The MCP TUI needs `GROQ_API_KEY`; the on‑chain scripts need the funded `.keys` + `CSPR_CLOUD_API_KEY`.
- If a live tx is slow on camera, keep talking over the pre‑warmed result and let cspr.live be the proof.
