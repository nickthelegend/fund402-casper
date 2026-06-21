#!/usr/bin/env node
// Deploy the CEP-18 x402 settlement token. Use the Cep18X402.wasm from
// make-software/casper-x402 (infra/local/deployer) so it supports both standard
// `transfer`/`transfer_from` (used by the vault) and `transfer_with_authorization`
// (used by the x402 facilitator).
//
//   CEP18_WASM_PATH=./Cep18X402.wasm node scripts/deploy-token.mjs
import { readFileSync } from "node:fs";
import {
  HttpHandler, RpcClient, PrivateKey, KeyAlgorithm,
  Deploy, DeployHeader, ExecutableDeployItem, Args, CLValue,
} from "casper-js-sdk";

const NODE = process.env.CASPER_NODE_URL ?? "https://node.testnet.cspr.cloud/rpc";
const CHAIN = process.env.CASPER_CHAIN ?? "casper-test";
const WASM = process.env.CEP18_WASM_PATH ?? "./Cep18X402.wasm";
const DEPLOYER_PEM = process.env.DEPLOYER_PEM ?? ".keys/deployer_secret.pem";

const key = await PrivateKey.fromPem(readFileSync(DEPLOYER_PEM, "utf8"), KeyAlgorithm.ED25519);
const rpc = new RpcClient(new HttpHandler(NODE));

const args = Args.fromMap({
  name: CLValue.newCLString(process.env.TOKEN_NAME ?? "Fund402 USD"),
  symbol: CLValue.newCLString(process.env.TOKEN_SYMBOL ?? "USDC"),
  decimals: CLValue.newCLUInt8(9),
  total_supply: CLValue.newCLUInt256(process.env.TOKEN_SUPPLY ?? "1000000000000000"), // 1M @ 9dp
});

const header = DeployHeader.default();
header.account = key.publicKey;
header.chainName = CHAIN;
const session = ExecutableDeployItem.newModuleBytes(new Uint8Array(readFileSync(WASM)), args);
const payment = ExecutableDeployItem.standardPayment(process.env.DEPLOY_GAS ?? "150000000000"); // 150 CSPR
const deploy = Deploy.makeDeploy(header, payment, session);
deploy.sign(key);

const res = await rpc.putDeploy(deploy);
console.log("CEP-18 deploy hash:", res.deployHash);
console.log("Track it: https://cspr.live/deploy/" + res.deployHash + "?network=" + CHAIN);
console.log("After execution, read the contract/package hash from the deployer's named keys.");
