#!/usr/bin/env node
// Fund402 v2 LIVE yield proof, on casper-test. Shows the lending pool EARNING:
//   1. an LP deposits a small pool,
//   2. an agent borrows + repays (principal + 5% JIT fee) via repay_latest,
//   3. the fee accrues to the pool, and the LP withdraws MORE than it deposited.
//
// Reuses the proven ModuleBytes/contract-call plumbing. Reads the v2 vault package
// from scripts/e2e-state.json (run `node scripts/e2e.mjs vault` first).
//
//   node scripts/yield-e2e.mjs
import casperPkg from "casper-js-sdk";
const casper = casperPkg.default ?? casperPkg;
const {
  HttpHandler, RpcClient, PrivateKey, PublicKey, KeyAlgorithm,
  Deploy, DeployHeader, ExecutableDeployItem, StoredVersionedContractByHash, TransferDeployItem,
  Args, CLValue, Key, ContractHash, Duration, DEFAULT_DEPLOY_TTL,
} = casper;
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const NODE = process.env.CASPER_NODE_URL || "https://node.testnet.casper.network/rpc";
const CHAIN = "casper-test";
const state = JSON.parse(readFileSync(join(HERE, "e2e-state.json"), "utf8"));
const VAULT = state.vaultPackage;
const CEP18 = state.cep18Package;

// CSPR.cloud key (for token-balance reads) — from fund402-agent/.env.
const envTxt = existsSync(join(ROOT, "..", "fund402-agent", ".env")) ? readFileSync(join(ROOT, "..", "fund402-agent", ".env"), "utf8") : "";
const CSPR_KEY = (envTxt.match(/CSPR_CLOUD_API_KEY\s*=\s*(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
const REST = "https://api.testnet.cspr.cloud";

const KEYS = join(ROOT, ".keys");
const loadKey = (pem) => PrivateKey.fromPem(readFileSync(join(KEYS, pem), "utf8"), KeyAlgorithm.ED25519);
const deployer = loadKey("deployer_secret.pem"); // LP + admin + merchant
const agent = loadKey("agent_secret.pem");       // the borrowing agent
const client = new RpcClient(new HttpHandler(NODE));

const ahHex = (pk) => pk.publicKey.accountHash().toHex();
const motes = (c) => String(BigInt(Math.round(c * 1e9)));
const pkgHex = (s) => String(s).replace(/^(hash-|contract-package-|package-)/, "");

function header(pub) { const h = DeployHeader.default(); h.account = pub; h.chainName = CHAIN; h.ttl = new Duration(DEFAULT_DEPLOY_TTL); return h; }
async function send(signer, session, payCspr, label) {
  const deploy = Deploy.makeDeploy(header(signer.publicKey), ExecutableDeployItem.standardPayment(motes(payCspr)), session);
  deploy.sign(signer);
  const { deployHash } = await client.putDeploy(deploy);
  const hash = deployHash.toHex();
  process.stdout.write(`  ${label}: ${hash}\n`);
  const ok = await waitDeploy(hash);
  process.stdout.write(`  ${label}: ${ok ? "SUCCESS ✓" : "FAILED ✗"}  https://testnet.cspr.live/deploy/${hash}\n`);
  if (!ok) throw new Error(`${label} failed`);
  return hash;
}
async function waitDeploy(hash, tries = 60, intervalMs = 3000) {
  for (let i = 0; i < tries; i++) {
    try { const res = await client.getDeploy(hash); const txt = JSON.stringify(res?.executionResults ?? res?.executionInfo ?? res ?? {});
      if (txt.includes('"Failure"') || /"error_?[Mm]essage":\s*"[^"]/.test(txt)) return false;
      if (txt.includes('"Success"') || txt.includes('"cost"')) return true;
    } catch {} await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
function callPkg(pkg, entry, args) {
  const s = new ExecutableDeployItem();
  s.storedVersionedContractByHash = new StoredVersionedContractByHash(ContractHash.newContract(pkgHex(pkg)), entry, args, undefined);
  return s;
}
const u256 = (v) => CLValue.newCLUInt256(String(v));
const pkgAsKey = (pkg) => CLValue.newCLKey(Key.newKey("hash-" + pkgHex(pkg)));
const acctKey = (h) => CLValue.newCLKey(Key.newKey("account-hash-" + h.replace(/^account-hash-/, "")));

async function vaultTokenBalance() {
  // The pool's F402 balance == cash in the pool (proves the fee accrual on-chain).
  try {
    const r = await fetch(`${REST}/contract-packages/${pkgHex(CEP18)}/ft-token-ownership?page_size=200`, { headers: { Authorization: CSPR_KEY } });
    const j = await r.json();
    const row = (j?.data ?? []).find((x) => String(x.owner_hash).toLowerCase() === pkgHex(VAULT).toLowerCase());
    return row ? BigInt(row.balance) : 0n;
  } catch { return -1n; }
}

const POOL = 2_000_000n;     // LP deposits 0.002 F402
const BORROW = 1_000_000n;   // agent borrows 0.001 F402
const FEE = BORROW * 500n / 10_000n; // 5% = 50_000
const REPAY = BORROW + FEE;  // 1_050_000

console.log(`== Fund402 v2 LIVE yield demo ==\n  vault(v2)=${VAULT}\n  pool=${POOL}  borrow=${BORROW}  fee(5%)=${FEE}\n`);

// 0) ensure the agent has CSPR gas + F402 "earnings" to repay with.
console.log("0) prep: gas + simulate agent earnings");
{ const s = new ExecutableDeployItem(); s.transfer = TransferDeployItem.newTransfer(motes(45), agent.publicKey, null, Date.now() % 1e9); await send(deployer, s, 1, "fund-agent-cspr"); }
await send(deployer, callPkg(CEP18, "transfer", Args.fromMap({ recipient: acctKey(ahHex(agent)), amount: u256(REPAY) })), 5, "fund-agent-f402");

// 1) LP (treasury) deposits the pool.
console.log("\n1) LP deposits liquidity");
await send(deployer, callPkg(CEP18, "approve", Args.fromMap({ spender: pkgAsKey(VAULT), amount: u256(POOL) })), 5, "lp-approve");
await send(deployer, callPkg(VAULT, "deposit_liquidity", Args.fromMap({ amount: u256(POOL) })), 10, "deposit_liquidity");
const poolAfterDeposit = await vaultTokenBalance();
console.log(`   pool F402 balance: ${poolAfterDeposit}`);

// 2) promote the agent to Tier 3 and borrow.
console.log("\n2) agent borrows (Tier 3, zero collateral)");
await send(deployer, callPkg(VAULT, "award_reputation", Args.fromMap({ agent: acctKey(ahHex(agent)), delta: CLValue.newCLInt64(250) })), 5, "award_reputation");
await send(agent, callPkg(VAULT, "borrow_and_pay", Args.fromMap({
  merchant: acctKey(ahHex(deployer)), amount: u256(BORROW), collateral: u256(0), vault_id: CLValue.newCLString("yield-demo"),
})), 20, "borrow_and_pay");
const poolAfterBorrow = await vaultTokenBalance();
console.log(`   pool F402 balance: ${poolAfterBorrow}  (lent ${BORROW} to merchant)`);

// 3) agent repays principal + fee via repay_latest (no loan id needed).
console.log("\n3) agent repays principal + fee (repay_latest)");
await send(agent, callPkg(CEP18, "approve", Args.fromMap({ spender: pkgAsKey(VAULT), amount: u256(REPAY) })), 5, "repay-approve");
await send(agent, callPkg(VAULT, "repay_latest", Args.fromMap({})), 10, "repay_latest");
const poolAfterRepay = await vaultTokenBalance();
console.log(`   pool F402 balance: ${poolAfterRepay}  (expected ${POOL + FEE} = pool + fee)`);

// 4) LP withdraws ALL shares — receives MORE than it deposited.
console.log("\n4) LP withdraws all shares — realizes the yield");
const lpBefore = await tokenOf(ahHex(deployer));
await send(deployer, callPkg(VAULT, "withdraw_liquidity", Args.fromMap({ shares: u256(POOL) })), 10, "withdraw_liquidity");
const lpAfter = await tokenOf(ahHex(deployer));
const received = lpAfter - lpBefore;
console.log(`   LP received on withdraw: ${received}  (deposited ${POOL})`);

const yielded = poolAfterRepay - poolAfterDeposit;
console.log(`\n== RESULT ==`);
console.log(`  pool grew by the fee:  ${poolAfterDeposit} → ${poolAfterRepay}  (+${yielded})`);
console.log(`  LP withdrew ${received} for a ${POOL} deposit  → yield ${received > POOL ? "+" : ""}${received - POOL}`);
const pass = poolAfterRepay === POOL + FEE && received >= POOL + FEE;
console.log(pass ? "\nLIVE YIELD PROVEN ✅ — the LPs earned." : "\n⚠️ numbers off — inspect above.");
process.exit(pass ? 0 : 1);

async function tokenOf(ownerHash) {
  try {
    const r = await fetch(`${REST}/contract-packages/${pkgHex(CEP18)}/ft-token-ownership?page_size=200`, { headers: { Authorization: CSPR_KEY } });
    const j = await r.json();
    const row = (j?.data ?? []).find((x) => String(x.owner_hash).toLowerCase() === ownerHash.toLowerCase());
    return row ? BigInt(row.balance) : 0n;
  } catch { return 0n; }
}
