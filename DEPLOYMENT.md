# Fund402 — Live Testnet Deployment (casper-test)

End-to-end proof that Fund402 works on Casper testnet: an AI agent with **zero
balance and zero collateral** (Tier 3, reputation-only) borrows just-in-time
credit, and the vault settles the CEP-18 payment on-chain.

Deployed 2026-06-21 with `scripts/e2e.mjs` (casper-js-sdk v5 ModuleBytes installs).

## Contracts

| Contract | Package hash | Explorer |
|----------|--------------|----------|
| Fund402 Vault (Odra) | `664d99de146b9b573161a387d89fefc649677351d8a6d2acbe22109bf88f6b12` | [install ↗](https://testnet.cspr.live/deploy/f742b8a48d1585e0ff4853cb8dbde39fdd5dd4461373a348229bb3e256414327) |
| CEP-18 x402 token "Fund402 USDC" (F402, 9 dec) | `389cedc529cc553e2639884c9dcc5e6dcbeb3920f7f5ca5a39bf7f7b866bccd0` | [install ↗](https://testnet.cspr.live/deploy/43f55b98e2e26d9f6c7ddb527c80d8f0b37e2f60fe9ceaefb5006cbea4423430) |

## Accounts

| Role | Public key | Account hash |
|------|-----------|--------------|
| deployer / admin / LP / merchant | `01a4f90fc3d6f10e225125cf855f0f82e7996864293910bf4abb6287bca63fcd64` | `db39abe4f2bcc2e69efc834e67f3d4e74c483fd053b560b3466664ae88e10ad4` |
| agent (borrower, Tier 3) | `01bdaee49881c0cfa9fee239ae4833bb2e1bf2d384cc310d50a4c6c431697a9aba` | `6721ce00497afd40dcd5cdb9e7c0df6191fa372ab6731d53cd08f01a9d45b592` |

## The end-to-end flow (all confirmed on-chain, error_message: None)

| Step | Entry point | Deploy |
|------|-------------|--------|
| 1. Fund agent gas | (CSPR transfer) | [`66fc65…`](https://testnet.cspr.live/deploy/66fc65d7e7a133c3123903e6f7ee19847541247e3d80624fd723521dc16af2cc) |
| 2. Approve vault | `approve` (CEP-18) | [`1a11e7…`](https://testnet.cspr.live/deploy/1a11e74a25309fa4e312203196e01582c078c8840bb88df46b2be397d82ac319) |
| 3. Seed liquidity (1e8) | `deposit_liquidity` | [`a79385…`](https://testnet.cspr.live/deploy/a79385c62a01214c1808c741c2023585b45adaf11f49810596e9b844ace60141) |
| 4. Agent → Tier 3 | `award_reputation(+250)` | [`a2d618…`](https://testnet.cspr.live/deploy/a2d618d7dd7b0a34bcdac87f8b8d1f5bcae8c96b30ac000bec682a073f356b6b) |
| 5. **JIT loan** | `borrow_and_pay(1e6, collateral=0)` | [`5fadfa…`](https://testnet.cspr.live/deploy/5fadfa774f9d87f0f0b4e0219cf89086cd93aa8677cb0da8e0edda3740b9be17) |

**On-chain result of step 5:** vault pool CEP-18 `100,000,000 → 99,000,000`
(−1,000,000); merchant balance `+1,000,000`. The vault fronted the agent's
payment with zero collateral, purely on reputation. ✅

## Reproduce / extend

```bash
cd fund402
node scripts/e2e.mjs cep18    # deploy CEP-18
node scripts/e2e.mjs vault    # deploy vault (init asset_token = CEP-18 package)
node scripts/e2e.mjs fund     # CSPR -> agent (gas)
node scripts/e2e.mjs seed     # approve + deposit_liquidity
node scripts/e2e.mjs rep      # award_reputation -> Tier 3
node scripts/e2e.mjs borrow   # borrow_and_pay  (the money shot)
```

Hashes persist in `scripts/e2e-state.json`. Deploys use the public testnet RPC
(`node.testnet.casper.network/rpc`); reads use CSPR.cloud.

## WASM build notes (hard-won)

The vault wasm needs **odra 2.x** + **nightly-2026-01-01** (`rust-toolchain.toml`)
+ **wasm-opt** (binaryen) to lower bulk-memory for the Casper VM. The contract
entry points (`call`, `borrow_and_pay`, …) are emitted only when building with
`ODRA_MODULE=Fund402Vault ODRA_BACKEND=casper` **and** the odra-2.x
`bin/build_contract.rs` shape (`#![no_std] #![no_main] use fund402_vault;`) +
`build.rs` (`odra_build::build()`). cargo-odra 0.1.7 alone does not set these.
