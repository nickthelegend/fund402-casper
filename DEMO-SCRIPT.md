# Payward — demo recording (flow + narration / TTS)

A ~3‑minute live walkthrough for the Casper Agentic Buildathon. Screen recording + voiceover
(read it yourself, or run the narration through TTS and lay it under the recording).

> **Payward** is the product; **Fund402** (credit) and **Clawback** (settlement) are its two
> layers. Name it *Payward* wherever you introduce or close.

> **Tip:** you can open with the polished 90s film (`promo/payward-promo.mp4`) as a sizzle
> intro, then cut to the live walkthrough below — or just record the walkthrough straight.
> Keep it calm and confident; let the on‑chain proofs do the bragging.

---

## Before you record — have these ready

**Dev servers (each in its own terminal):**
- Fund402 cockpit demo — `cd fund402-demo && npm install && npm run dev` → the live borrow→settle→serve cockpit
- LP dashboard — `cd fund402-dashboard && npm run dev`
- Clawback dashboard — `node clawback-web/serve.mjs` (or open `clawback-web/index.html`)
- (optional) Agent TUI / MCP — `cd fund402-mcp && npm install && node src/tui.mjs` (Groq key set)

**Browser tabs open:**
- The Fund402 cockpit + the LP dashboard + the Clawback dashboard (localhost)
- npm: `https://www.npmjs.com/package/@nickthelegend69/fund402`
- cspr.live settlement proof: `https://testnet.cspr.live/deploy/96f30ddfac9b3b8bc04a9fe274b1c006aff398ac624e7360669a2c1f3dc28264`
- cspr.live Clawback resolve proof: `https://testnet.cspr.live/deploy/f6f6c5db8bb63b8bd946ff468f4a63aa9ed9ed441818fa56d0100b5fb5989435`
- The SDK code (`paywall()` + `fund402Fetch()`) open in your editor

---

## The flow (segment by segment)

### 1 · Hook  (0:00–0:20)
**SHOW:** Title / the promo's cold open, or the Fund402 cockpit at rest.
**SAY:**
> "Autonomous agents can browse, call APIs, and act on their own — but the moment their wallet
> hits zero, they stop. They hit an HTTP four‑oh‑two, *payment required*, and there's no credit
> card for a machine. This is Payward. It's two layers: Fund402 — just‑in‑time credit for agents on Casper — and Clawback,
> escrow with an AI judge for when agents pay each other."

### 2 · Fund402, live  (0:20–1:05)
**SHOW:** The cockpit. Trigger the agent: it requests a paid endpoint → `402` → borrows from the
pool → settles → `200` + data. Then click through to **cspr.live** on the settlement deploy.
**SAY:**
> "Here's an agent with an empty wallet asking for a paid price feed. It gets a four‑oh‑two. So
> the SDK borrows just‑in‑time from a Casper liquidity pool — the pool fronts the CEP‑18 payment
> to the merchant, it settles on chain, and the data comes back, two hundred OK. And this is
> real — here's that exact settlement on cspr.live: amount, merchant, zero collateral, status
> processed. The agent paid with nothing in its wallet."

### 3 · The SDK  (1:05–1:30)
**SHOW:** The npm page, then the two snippets in your editor — `paywall()` (server) and
`fund402Fetch()` (client).
**SAY:**
> "For a developer it's one npm install and two functions. On your server, `paywall` gates any
> route. On the agent, `fund402Fetch` is a drop‑in fetch that handles the whole four‑oh‑two
> dance — borrow, pay, retry — so your caller pays even with an empty wallet. Express, Hono, and
> Next adapters ship in the box."

### 4 · The pool earns  (1:30–1:50)
**SHOW:** The LP dashboard — TVL, utilization, a deposit/withdraw.
**SAY:**
> "Liquidity providers fund this. Every borrow pays a five‑percent fee that flows back into a
> share‑based pool — so providers withdraw more than they put in. We proved it live: two million
> in, two‑point‑oh‑five million out, plus two‑and‑a‑half percent realized yield."

### 5 · Clawback — the differentiator  (1:50–2:35)
**SHOW:** The Clawback dashboard. Walk both lanes: **honest** (buyer escrows → seller delivers →
AI *meets‑spec* → release) and **bad** (junk delivery → dispute → AI *does‑not‑meet‑spec* →
refund). Click through to **cspr.live** on the `resolve` deploy.
**SAY:**
> "But credit is only half of it. When one agent pays another, what protects the money if the
> work is wrong? That's Clawback. The payment is held in escrow against a spec. A good delivery
> is released to the seller. A bad one is disputed — and a Groq AI verifier reads the spec
> against what was actually delivered, decides it doesn't meet spec, and claws the payment back
> to the buyer. Chargebacks for the machine economy — and here's the AI's verdict, settled on
> chain."

### 6 · The whole stack  (2:35–3:00)
**SHOW:** The agent TUI / MCP taking a real on‑chain action (or the GitHub org), and `npx skills add`.
**SAY:**
> "And it's a whole stack, not just a library: an autonomous agent with twelve on‑chain tools,
> an MCP server so you can drive it from chat, agent skills you add with one command, and
> Clawback as the settlement layer. Eight open‑source repos, all live on Casper testnet."

### 7 · Close  (3:00–3:20)
**SHOW:** The Fund402 + Clawback end card / the npm + GitHub.
**SAY:**
> "That's Payward, the credit and settlement layer for the machine economy. Fund402 for credit; Clawback for settlement. One npm
> install, live on Casper. Thanks for watching."

---

## Full narration (one block — for TTS in a single pass)

> Autonomous agents can browse, call APIs, and act on their own — but the moment their wallet
> hits zero, they stop. They hit an HTTP four‑oh‑two, payment required, and there's no credit
> card for a machine. This is Payward. It's two layers: Fund402 — just‑in‑time credit for agents on Casper — and Clawback,
> escrow with an AI judge for when agents pay each other.
>
> Here's an agent with an empty wallet asking for a paid price feed. It gets a four‑oh‑two. So
> the SDK borrows just‑in‑time from a Casper liquidity pool — the pool fronts the payment to the
> merchant, it settles on chain, and the data comes back, two hundred OK. And this is real —
> here's that exact settlement on cspr.live: amount, merchant, zero collateral, status processed.
> The agent paid with nothing in its wallet.
>
> For a developer it's one npm install and two functions. On your server, paywall gates any
> route. On the agent, fund402Fetch is a drop‑in fetch that handles the whole four‑oh‑two dance,
> so your caller pays even with an empty wallet.
>
> Liquidity providers fund this. Every borrow pays a five‑percent fee that flows back to them —
> two million in, two‑point‑oh‑five million out, plus two‑and‑a‑half percent realized yield.
>
> But credit is only half of it. When one agent pays another, what protects the money if the
> work is wrong? That's Clawback. The payment is held in escrow against a spec. Good work is
> released to the seller. Bad work is disputed — and a Groq AI verifier reads the spec against
> what was delivered, decides it doesn't meet spec, and claws the payment back to the buyer.
> Chargebacks for the machine economy, settled on chain.
>
> And it's a whole stack: an autonomous agent with twelve on‑chain tools, an MCP server, agent
> skills you add with one command, and Clawback as the settlement layer. Eight open‑source repos,
> all live on Casper.
>
> That's Payward, the credit and settlement layer for the machine economy. Fund402 for credit; Clawback for settlement. One npm
> install, live on Casper. Thanks for watching.

---

## Shorter cut (~90s, if you need it tight)

Use segments **1 → 2 → 5 → 7** only (hook → Fund402 live → Clawback → close). That keeps the two
strongest proofs — an empty wallet paying on chain, and the AI clawing back a bad payment — and
drops the SDK/yield/stack detail.

## Recording tips

- 1080p, 30fps; hide bookmarks/notifications; zoom the browser to ~110% so text reads on video.
- Pre‑click once so pages are warm; do the real click on camera.
- When you cut to cspr.live, pause ~2s on `status: processed` — that's the proof, let it land.
- Keep the cursor calm. Speak ~10% slower than feels natural.
