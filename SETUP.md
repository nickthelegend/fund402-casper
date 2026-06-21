# Fund402 — Testnet Setup, Funding & End-to-End Runbook

This is the exact sequence to get Fund402 paying real x402 micropayments on **Casper testnet**, plus which addresses to fund.

> Targets `casper-js-sdk@5.0.12` (Casper 2.0). All on-chain tooling lives in `scripts/`.

---

## 0. Addresses to fund

Pre-generated ed25519 keypairs (secrets in `.keys/`, gitignored — never commit them). Fund the **public keys** below at the Casper testnet faucet: <https://testnet.cspr.live/tools/faucet> (paste the key, request CSPR).

| Role | Public key (account-key) — **fund this** | Why it needs funds |
|---|---|---|
| **agent** | `01bdaee49881c0cfa9fee239ae4833bb2e1bf2d384cc310d50a4c6c431697a9aba` | CSPR for gas + CSPR collateral on each borrow |
| **deployer / admin** | `01a4f90fc3d6f10e225125cf855f0f82e7996864293910bf4abb6287bca63fcd64` | CSPR to deploy the CEP-18 token + the vault |
| **lp** | `011ea3e098483468c5c5aae31885bc3fe2d93cc1a9926ec56d4335b306f66214af` | CSPR for gas; receives CEP-18 to deposit as liquidity |

Account hashes (for reference / contract args):

```
agent     account-hash-6721ce00497afd40dcd5cdb9e7c0df6191fa372ab6731d53cd08f01a9d45b592
deployer  account-hash-db39abe4f2bcc2e69efc834e67f3d4e74c483fd053b560b3466664ae88e10ad4
lp        account-hash-098e733e39fbe1f0d65baa9c1abb53ca6f8c62d2504bdffa17495edd74311aa5
```

**Faucet tip:** the testnet faucet gives ~1000 CSPR per request. One request each for `agent` and `deployer` is plenty; `lp` needs a small amount for gas. The CEP-18 *token* balance is **not** from the faucet — it's minted by the deployer and transferred (see step 3).

> Lost/rotated keys? Regenerate everything with `node scripts/keygen.mjs` and re-fund the new public keys it prints.

---

## 1. Install

```bash
npm install                 # gateway + casper-js-sdk
npm --prefix packages/agent-sdk install && npm run sdk:build
```

## 2. Deploy the contracts

**Vault (Odra):**

```bash
npm run contract:build      # cargo odra build -> wasm
DEPLOYER_PEM=.keys/deployer_secret.pem node scripts/deploy.mjs   # Odra livenet -> casper-test
```

**CEP-18 x402 token** — use `Cep18X402.wasm` from [make-software/casper-x402 `infra/local/deployer`](https://github.com/make-software/casper-x402/tree/master/infra/local/deployer) so it supports both `transfer`/`transfer_from` (vault) and `transfer_with_authorization` (facilitator):

```bash
CEP18_WASM_PATH=./Cep18X402.wasm node scripts/deploy-token.mjs
```

Record the resulting **contract hashes** (read them from the deployer's named keys on cspr.live, or the Odra deploy output) and put them in `.env.local`:

```
FUND402_VAULT_CONTRACT=<64-hex vault contract hash>
X402_ASSET_CONTRACT=<64-hex CEP-18 contract hash>
X402_ASSET_PACKAGE=<32-byte CEP-18 package hash>
```

Then initialize the vault with the token (admin only):

```
# vault.init(asset_token = <CEP-18 package hash>)  — done via the Odra deploy args
```

## 3. Seed liquidity

Transfer some CEP-18 from the deployer to the `lp` account (use `makeCep18TransferDeploy` or the token's `transfer`), then:

```bash
FUND402_VAULT_CONTRACT=... X402_ASSET_CONTRACT=... node scripts/setup-liquidity.mjs
```

This makes `lp` approve the vault and call `deposit_liquidity` so the pool can front payments. Confirm with the dashboard (`/api/stats`) or the vault's `get_pool_stats`.

## 4. Run the stack

```bash
# gateway (this repo)
npm run dev                                   # :3005
# dashboard
cd ../fund402-dashboard && npm install && npm run dev   # :3007
# demo
cd ../fund402-demo && npm install && npm run dev        # :3006
```

## 5. End-to-end test (the money shot)

```bash
AGENT_PUBLIC_KEY=01bdaee49881c0cfa9fee239ae4833bb2e1bf2d384cc310d50a4c6c431697a9aba \
FUND402_VAULT_CONTRACT=<vault hash> \
DEMO_VAULT_URL="http://localhost:3005/v/a0000000-0000-0000-0000-000000000001/market/casper/stats" \
node scripts/demo-borrow.mjs
```

Expected: the agent gets a `402`, the SDK calls `borrow_and_pay`, the vault fronts the CEP-18 payment, the deploy settles on Casper, the request is replayed with `PAYMENT-SIGNATURE`, and the protected data prints — with a `cspr.live` deploy link in the event log.

---

## What needs real funds vs. what runs free

| Layer | Runs with zero funds? | Needs funding |
|---|---|---|
| Demo theater (`fund402-demo`) | ✅ yes (mock settle) | — |
| Dashboard (`fund402-dashboard`) | ✅ yes (snapshot) | live reads need a deployed vault |
| Gateway 402 challenge | ✅ yes | — |
| Real `borrow_and_pay` settlement | ❌ | `agent` + `deployer` CSPR, deployed vault + CEP-18, seeded liquidity |

So you can demo the UX immediately; fund the three keys above only when you want **real on-chain settlement**.

## Facilitator

For real settlement you also need an x402 facilitator. Either:

- **Hosted:** point `X402_FACILITATOR_URL` at `https://x402-facilitator.cspr.cloud` (set `CSPR_CLOUD_API_KEY`), or
- **Self-host** [make-software/casper-x402](https://github.com/make-software/casper-x402) (`go run apps/facilitator/main.go`, port `4022`) with its own funded Casper account.

## Security

`.keys/` and all `*.pem` are gitignored. These are **testnet** keys — never reuse them on mainnet, and never commit secrets.
