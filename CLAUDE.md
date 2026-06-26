# CLAUDE.md — Fund402 (Casper)

Operational guide for AI agents working in this repo. Read this first.

## What this is

Fund402 = **just-in-time credit for AI agents on Casper**. An agent hits an HTTP
`402 Payment Required` paywall with an empty wallet → the Fund402 **Odra vault**
fronts the CEP-18 micropayment from a liquidity pool, records the loan + 3-tier
on-chain reputation, and settles on Casper. **Live on casper-test** (see
`DEPLOYMENT.md`). Casper port of a Stellar/Soroban original.

## Status (honest — keep `STATUS.md` in sync)

- **Real + proven on-chain:** the vault (deposit / `borrow_and_pay` / `repay_loan`
  / `slash` / tiers / reputation) is deployed and a **Tier-3 zero-collateral loan
  settled live** (pool 100M→99M, merchant +1M). EIP-712 signing is accepted by the
  **live facilitator** (`isValid:true`). No mock data anywhere (only `MockCep18`
  in the contract test module).
- **Simplified / not fully wired:** the agent-SDK auto-borrow interceptor has **no
  `approve` step** (so only Tier-3 collateral-free borrows succeed on-chain) and
  **no automated repayment**; the **full SDK→gateway→demo flow has not been run
  live** (only the direct `scripts/e2e.mjs` package-hash path was); CSPR.click
  dashboard writes type-check but aren't browser-tested; loan TTL/expiry is
  admin-discretion (not enforced on-chain); the SRSD `EarningStream` is not built.
- **Rough completion:** core (contract + signing) ~92%, full autonomous loop
  (borrow via gateway + repay) ~65%, overall ~80%.

## Layout

| Path | What |
|---|---|
| `contracts/fund402_vault/` | Odra/Rust vault (lib.rs = the contract; 7 OdraVM tests incl. `full_loan_lifecycle`) |
| `packages/agent-sdk/` | `@fund402/agent-sdk` — axios 402 interceptor, casper-js-sdk v5 deploys, EIP-712 (`eip712.ts`) |
| `src/app/` | Next.js x402 **gateway** (`:3005`) — 402 challenge + on-chain deploy verify + origin proxy |
| `scripts/e2e.mjs` | testnet deploy + run, one step per subcommand |
| `Cep18X402.wasm` | prebuilt CEP-18 (gitignored) |

## Commands (these are the WORKING ones)

```bash
npm test                              # gateway + agent-SDK suites (facilitator skips w/o key)
CSPR_CLOUD_API_KEY=<key> npm test     # + live facilitator /verify
npm run contract:test                 # cargo +nightly-2026-01-01 test --lib  → 7/7
node scripts/e2e.mjs <cep18|vault|fund|seed|rep|borrow>   # live testnet flow
```

## ⚠️ Build/deploy gotchas (cost ~20 iterations — don't relearn them)

- **Vault WASM:** needs **odra 2.8 + `nightly-2026-01-01`** (pinned in
  `contracts/fund402_vault/rust-toolchain.toml`) + **`wasm-opt`/binaryen** (lowers
  bulk-memory the Casper VM rejects). `cargo-odra 0.1.7` does NOT emit odra-2.x
  entry points — the build needs `ODRA_MODULE=Fund402Vault ODRA_BACKEND=casper`,
  `build.rs` (`odra_build::build()`), and `bin/build_contract.rs` =
  `#![no_std] #![no_main] use fund402_vault;` (NO `fn main`). Verify the wasm
  exports `call` + entry points before deploying.
- **Deploy** via casper-js-sdk `ExecutableDeployItem.newModuleBytes(wasm, args)`
  with `odra_cfg_*` args (see `scripts/e2e.mjs`), not `cargo odra livenet`. Read the
  installed package hash from the deployer's named keys
  (`getAccountInfo(null, new AccountIdentifier(undefined, pub)).rawJSON.account.named_keys`).
- **Do NOT import `@make-software/casper-x402` from CJS** — its CJS build is broken
  (`casper-js-sdk.default` undefined). Sign manually: `eip712.ts` digest +
  `privateKey.signAndAddAlgorithmBytes(digest)` (identical to the official client).
- **Casper 2.0 entity migration:** after the first deploy the account migrates to
  an AddressableEntity; named keys move under `entity.Account.named_keys`.

## Conventions

- **No mock data, ever** (the user demands honest real-vs-fake accounting). If a
  value can't be fetched/configured, return an explicit "not configured" state.
- Config is env-driven (`.env.local`, gitignored). Secrets live in `.keys/`
  (gitignored). Never commit `*.pem`, `.env.local`, `*.wasm`, or the seed.
- Public RPC `node.testnet.casper.network/rpc` for deploys (no auth); CSPR.cloud
  REST for reads (needs the API key).

## Live deployment (casper-test)

- Vault package `664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12`
- CEP-18 package `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0`
- Money-shot borrow: deploy `5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17`
