#!/usr/bin/env node
// Fund402 end-to-end testnet deploy + run, step by step. Uses casper-js-sdk v5
// ModuleBytes installs (the odra_cfg_* convention, same as casper-x402's CEP-18).
//
//   node scripts/e2e.mjs cep18     # deploy Cep18X402.wasm -> token package/contract
//   node scripts/e2e.mjs vault     # deploy Fund402Vault.wasm(init asset_token)
//   node scripts/e2e.mjs fund      # CSPR->agent gas; CEP-18 -> lp + agent
//   node scripts/e2e.mjs seed      # lp approves + deposit_liquidity
//   node scripts/e2e.mjs rep       # award_reputation(agent, 250) -> Tier 3
//   node scripts/e2e.mjs borrow    # agent borrow_and_pay -> cspr.live deploy
//
// State (hashes) persists in scripts/e2e-state.json between steps.
import casperPkg from "casper-js-sdk";
const casper = casperPkg.default ?? casperPkg;
const {
  HttpHandler, RpcClient, PrivateKey, PublicKey, KeyAlgorithm,
  Deploy, DeployHeader, ExecutableDeployItem, StoredVersionedContractByHash, TransferDeployItem,
  Args, CLValue, Key, Hash, ContractHash, Duration, DEFAULT_DEPLOY_TTL, AccountIdentifier,
} = casper;
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const NODE = process.env.CASPER_NODE_URL || "https://node.testnet.casper.network/rpc";
const CHAIN = "casper-test";
const STATE_PATH = join(HERE, "e2e-state.json");
const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {};
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

const KEYS = join(ROOT, ".keys");
const loadKey = (pem) => PrivateKey.fromPem(readFileSync(join(KEYS, pem), "utf8"), KeyAlgorithm.ED25519);
const deployer = loadKey("deployer_secret.pem");
const client = new RpcClient(new HttpHandler(NODE));

const ahHex = (pk) => pk.publicKey.accountHash().toHex();
const motes = (cspr) => String(BigInt(Math.round(cspr * 1e9)));

function header(signerPub) {
  const h = DeployHeader.default();
  h.account = signerPub;
  h.chainName = CHAIN;
  h.ttl = new Duration(DEFAULT_DEPLOY_TTL);
  return h;
}

async function send(signer, session, payCspr, label) {
  const deploy = Deploy.makeDeploy(header(signer.publicKey), ExecutableDeployItem.standardPayment(motes(payCspr)), session);
  deploy.sign(signer);
  const { deployHash } = await client.putDeploy(deploy);
  const hash = deployHash.toHex();
  console.log(`  ${label}: ${hash}  -> https://testnet.cspr.live/deploy/${hash}`);
  const ok = await waitDeploy(hash);
  console.log(`  ${label}: ${ok ? "SUCCESS" : "FAILED"}`);
  if (!ok) throw new Error(`${label} deploy failed`);
  return hash;
}

async function waitDeploy(hash, tries = 60, intervalMs = 3000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await client.getDeploy(hash);
      const txt = JSON.stringify(res?.executionResults ?? res?.executionInfo ?? res ?? {});
      if (txt.includes('"Failure"') || txt.includes('"error_message"')) return false;
      if (txt.includes('"Success"') || txt.includes('"cost"')) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function installArgs(extra, pkgKeyName) {
  return Args.fromMap({
    ...extra,
    odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
    odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
    odra_cfg_package_hash_key_name: CLValue.newCLString(pkgKeyName),
  });
}

// Read a named key (the installed package hash, e.g. "hash-..") off the deployer
// account. The rawJSON form carries the key-type prefix we want.
async function readNamedKey(keyName, signerKey = deployer) {
  try {
    const res = await client.getAccountInfo(null, new AccountIdentifier(undefined, signerKey.publicKey));
    const raw = res?.rawJSON?.account?.named_keys ?? res?.account?.namedKeys ?? [];
    const found = (Array.isArray(raw) ? raw : []).find((k) => k.name === keyName);
    return found ? String(found.key) : null;
  } catch (e) {
    console.log("  readNamedKey err:", e.message);
    return null;
  }
}

const cep18Wasm = () => new Uint8Array(readFileSync(join(ROOT, "Cep18X402.wasm")));
const vaultWasm = () => new Uint8Array(readFileSync(join(ROOT, "contracts/fund402_vault/wasm/Fund402Vault.wasm")));

async function step_cep18() {
  console.log("Deploying Cep18X402 token...");
  const args = installArgs(
    {
      name: CLValue.newCLString("Fund402 USDC"),
      symbol: CLValue.newCLString("F402"),
      decimals: CLValue.newCLUint8(9),
      initial_supply: CLValue.newCLUInt256("1000000000000000"),
      chain_id: CLValue.newCLString("casper:casper-test"),
    },
    "x402_token_package_hash"
  );
  await send(deployer, ExecutableDeployItem.newModuleBytes(cep18Wasm(), args), 500, "cep18-install");
  state.cep18Package = await readNamedKey("x402_token_package_hash");
  console.log("  CEP-18 package:", state.cep18Package);
  save();
}

async function step_vault() {
  if (!state.cep18Package) throw new Error("run cep18 first");
  console.log("Deploying Fund402Vault (init asset_token = CEP-18 package)...");
  const assetKey = Key.newKey(state.cep18Package); // package-.. / hash-..
  const args = installArgs({ asset_token: CLValue.newCLKey(assetKey) }, "fund402_vault_package_hash");
  await send(deployer, ExecutableDeployItem.newModuleBytes(vaultWasm(), args), 400, "vault-install");
  state.vaultPackage = await readNamedKey("fund402_vault_package_hash");
  console.log("  Vault package:", state.vaultPackage);
  save();
}

// ---------------------------------------------------- contract-call helpers
const AGENT_PUB =
  process.env.FUND402_AGENT_PUBLIC_KEY ||
  "01bdaee49881c0cfa9fee239ae4833bb2e1bf2d384cc310d50a4c6c431697a9aba";
const agent = loadKey("agent_secret.pem");

const pkgHex = (s) => s.replace(/^(hash-|contract-package-|package-)/, "");
function callPkg(pkgStr, entryPoint, args) {
  const s = new ExecutableDeployItem();
  s.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(pkgHex(pkgStr)),
    entryPoint,
    args,
    undefined
  );
  return s;
}
const pkgAsKey = (pkgStr) => CLValue.newCLKey(Key.newKey("hash-" + pkgHex(pkgStr)));
const addressKey = (h) => CLValue.newCLKey(Key.newKey("account-hash-" + h.replace(/^account-hash-/, "")));

// Send the agent 50 CSPR for gas (so it can call borrow_and_pay).
async function step_fund() {
  const s = new ExecutableDeployItem();
  s.transfer = TransferDeployItem.newTransfer(motes(50), PublicKey.fromHex(AGENT_PUB), null, 1);
  await send(deployer, s, 1, "fund-agent-cspr");
}

// Deployer (holding the CEP-18 supply) seeds the pool: approve + deposit_liquidity.
async function step_seed() {
  if (!state.vaultPackage) throw new Error("run vault first");
  const amt = process.env.SEED_UNITS || "100000000"; // 1e8 base units
  await send(
    deployer,
    callPkg(state.cep18Package, "approve", Args.fromMap({ spender: pkgAsKey(state.vaultPackage), amount: CLValue.newCLUInt256(amt) })),
    5, "approve-vault"
  );
  await send(
    deployer,
    callPkg(state.vaultPackage, "deposit_liquidity", Args.fromMap({ amount: CLValue.newCLUInt256(amt) })),
    10, "deposit_liquidity"
  );
}

// Admin (deployer) seeds the agent to Tier 3 so it borrows with zero collateral.
async function step_rep() {
  await send(
    deployer,
    callPkg(state.vaultPackage, "award_reputation", Args.fromMap({ agent: addressKey(ahHex(agent)), delta: CLValue.newCLInt64(250) })),
    5, "award_reputation"
  );
}

// THE MONEY SHOT: the agent borrows + the vault fronts the CEP-18 to the merchant.
async function step_borrow() {
  if (!state.vaultPackage) throw new Error("run vault first");
  const merchant = (process.env.MERCHANT_ACCOUNT_HASH || "00" + ahHex(deployer)).replace(/^00/, "");
  const amount = process.env.X402_PRICE_UNITS || "1000000";
  console.log(`  agent ${ahHex(agent).slice(0, 10)}… borrow_and_pay(merchant=${merchant.slice(0, 10)}…, amount=${amount}, collateral=0)`);
  state.borrowDeploy = await send(
    agent,
    callPkg(state.vaultPackage, "borrow_and_pay", Args.fromMap({
      merchant: addressKey(merchant),
      amount: CLValue.newCLUInt256(amount),
      collateral: CLValue.newCLUInt256("0"),
      vault_id: CLValue.newCLString("vault_1"),
    })),
    20, "borrow_and_pay"
  );
  save();
  console.log(`\n  🎉 LIVE JIT LOAN: https://testnet.cspr.live/deploy/${state.borrowDeploy}`);
}

const STEP = process.argv[2];
const steps = {
  cep18: step_cep18, vault: step_vault,
  fund: step_fund, seed: step_seed, rep: step_rep, borrow: step_borrow,
};
if (!steps[STEP]) {
  console.error("usage: node scripts/e2e.mjs <cep18|vault|fund|seed|rep|borrow>");
  process.exit(1);
}
console.log(`== Fund402 e2e :: ${STEP} ==  node=${NODE}`);
console.log(`   deployer ah=${ahHex(deployer)}`);
await steps[STEP]();
console.log("done.");
