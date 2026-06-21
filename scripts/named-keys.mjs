import casperPkg from "casper-js-sdk";
const casper = casperPkg.default ?? casperPkg;
const { HttpHandler, RpcClient, PrivateKey, KeyAlgorithm, AccountIdentifier, EntityIdentifier } = casper;
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = new RpcClient(new HttpHandler("https://node.testnet.casper.network/rpc"));
const deployer = PrivateKey.fromPem(readFileSync(join(ROOT, ".keys/deployer_secret.pem"), "utf8"), KeyAlgorithm.ED25519);

function findKeys(obj) {
  // walk the response and print anything that looks like a named-keys list or package hash
  const hits = [];
  const seen = new Set();
  (function walk(o, path) {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (/named.?keys/i.test(k)) hits.push([path + "." + k, JSON.stringify(v).slice(0, 400)]);
      if (typeof v === "string" && /(package-|contract-package-)[0-9a-f]{64}/i.test(v)) hits.push([path + "." + k, v]);
      walk(v, path + "." + k);
    }
  })(obj, "");
  return hits;
}

for (const [label, call] of [
  ["getAccountInfo", () => client.getAccountInfo(null, new AccountIdentifier(undefined, deployer.publicKey))],
  ["getEntity", () => (client.getEntity ?? client.getLatestEntity)?.call(client, EntityIdentifier.fromPublicKey(deployer.publicKey))],
]) {
  try {
    const res = await call();
    const hits = findKeys(res);
    console.log(`\n=== ${label} ===`);
    if (hits.length) hits.forEach(([p, v]) => console.log(`  ${p} = ${v}`));
    else console.log("  (no named-keys/package matches)  top keys:", Object.keys(res ?? {}).join(", "));
  } catch (e) { console.log(`\n=== ${label} ERR: ${e.message}`); }
}
