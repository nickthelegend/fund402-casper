#!/usr/bin/env node
// Generate ed25519 keypairs (agent, deployer, lp) and print the account-keys to
// fund. Secret PEMs are written to ../.keys (gitignored). Re-run any time.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// account_hash = blake2b256( "ed25519" || 0x00 || pubkey ). Node has no blake2b256
// in `crypto`, so we shell to openssl + a tiny WASM-free fallback via casper-js-sdk
// if available. Simplest portable path: use casper-js-sdk when installed.
let PrivateKey, KeyAlgorithm;
try {
  ({ PrivateKey, KeyAlgorithm } = await import("casper-js-sdk"));
} catch {
  console.error("Run `npm install` first so casper-js-sdk is available.");
  process.exit(1);
}

mkdirSync(new URL("../.keys/", import.meta.url), { recursive: true });
const roles = ["agent", "deployer", "lp"];
console.log("ROLE       PUBLIC KEY (account-key, fund this)");
for (const role of roles) {
  const pk = await PrivateKey.generate(KeyAlgorithm.ED25519);
  const pub = pk.publicKey.toHex();
  const ah = pk.publicKey.accountHash().toPrefixedString?.() ?? pk.publicKey.accountHash();
  const dir = new URL("../.keys/", import.meta.url);
  writeFileSync(new URL(`${role}_secret.pem`, dir), pk.toPem());
  writeFileSync(new URL(`${role}_public_key.txt`, dir), pub + "\n");
  writeFileSync(new URL(`${role}_account_hash.txt`, dir), String(ah) + "\n");
  console.log(`${role.padEnd(10)} ${pub}`);
}
console.log("\nSecrets written to .keys/ (gitignored). Fund the public keys at the testnet faucet.");
