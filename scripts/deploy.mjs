#!/usr/bin/env node
// Deploy the Fund402 Vault to Casper Testnet using the Odra livenet backend.
// Prereqs: `cargo odra build`, a funded secret key, and CSPR.cloud RPC access.
//
//   ODRA_BACKEND=casper \
//   ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.cspr.cloud/rpc \
//   ODRA_CASPER_LIVENET_SECRET_KEY_PATH=./secret_key.pem \
//   ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test \
//   cargo odra livenet -- --contract fund402_vault
//
// This wrapper just shells out so it lives next to the app.
import { execSync } from "node:child_process";

const env = {
  ...process.env,
  ODRA_BACKEND: "casper",
  ODRA_CASPER_LIVENET_NODE_ADDRESS:
    process.env.CASPER_NODE_URL ?? "https://node.testnet.cspr.cloud/rpc",
  ODRA_CASPER_LIVENET_CHAIN_NAME: "casper-test",
};

console.log("Building vault wasm...");
execSync("cargo odra build", { cwd: "contracts/fund402_vault", stdio: "inherit", env });
console.log("Deploying to casper-test...");
execSync("cargo odra livenet -- --contract fund402_vault", {
  cwd: "contracts/fund402_vault",
  stdio: "inherit",
  env,
});
