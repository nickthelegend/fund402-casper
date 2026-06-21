#!/usr/bin/env node
// Seed the vault with liquidity: LP approves the vault on the CEP-18 token, then
// calls deposit_liquidity. Run after the token + vault are deployed.
//
//   FUND402_VAULT_CONTRACT=.. X402_ASSET_CONTRACT=.. node scripts/setup-liquidity.mjs
import { readFileSync } from "node:fs";
import {
  HttpHandler, RpcClient, PrivateKey, KeyAlgorithm,
  Deploy, DeployHeader, ExecutableDeployItem, StoredContractByHash,
  ContractHash, Args, CLValue, Key,
} from "casper-js-sdk";

const NODE = process.env.CASPER_NODE_URL ?? "https://node.testnet.cspr.cloud/rpc";
const CHAIN = process.env.CASPER_CHAIN ?? "casper-test";
const VAULT = need("FUND402_VAULT_CONTRACT");      // 64-hex
const TOKEN = need("X402_ASSET_CONTRACT");          // 64-hex CEP-18 contract hash
const AMOUNT = process.env.LP_AMOUNT ?? "500000000000"; // 500 @ 9dp
const LP_PEM = process.env.LP_PEM ?? ".keys/lp_secret.pem";

function need(k){ const v = process.env[k]; if(!v){ console.error("Missing env "+k); process.exit(1);} return v; }
const lp = await PrivateKey.fromPem(readFileSync(LP_PEM, "utf8"), KeyAlgorithm.ED25519);
const rpc = new RpcClient(new HttpHandler(NODE));

async function call(contractHash, entry, argsMap, gas) {
  const header = DeployHeader.default();
  header.account = lp.publicKey; header.chainName = CHAIN;
  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(
    ContractHash.newContract(contractHash), entry, Args.fromMap(argsMap));
  const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment(gas), session);
  deploy.sign(lp);
  const res = await rpc.putDeploy(deploy);
  console.log(`${entry} -> ${res.deployHash}`);
  return res.deployHash;
}

// 1. approve the vault as spender
await call(TOKEN, "approve", {
  spender: CLValue.newCLKey(Key.newKey("hash-" + VAULT)),
  amount: CLValue.newCLUInt256(AMOUNT),
}, "3000000000");

// 2. deposit liquidity into the vault
await call(VAULT, "deposit_liquidity", {
  amount: CLValue.newCLUInt256(AMOUNT),
}, "5000000000");

console.log("Liquidity seeded:", AMOUNT, "base units.");
