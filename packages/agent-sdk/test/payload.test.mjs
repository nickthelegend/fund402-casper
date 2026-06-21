// Structural test for the x402 v2 `exact` payload the agent SDK builds
// (buildExactPayload) + the Fund402 settlement extension + agentTaggedAddress.
// Offline — generates an ephemeral ed25519 key, no network.
//   node test/payload.test.mjs
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import * as casperNS from "casper-js-sdk";

const casper = casperNS.default ?? casperNS;
const { PrivateKey, KeyAlgorithm } = casper;
const require = createRequire(import.meta.url);
const { buildExactPayload, agentTaggedAddress } = require("../dist/casper.js");

const hexToBytes = (h) => {
  const s = h.replace(/^0x/, "");
  const o = new Uint8Array(s.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16);
  return o;
};

const PAYTO = "00" + "ab".repeat(32);
const ASSET = "ee".repeat(32);
const DEPLOY = "cd".repeat(32);

const priv = PrivateKey.generate(KeyAlgorithm.ED25519);
const pub = priv.publicKey.toHex();

const cfg = {
  nodeUrl: "https://node.testnet.casper.network/rpc",
  network: "casper:casper-test",
  chainName: "casper-test",
  vaultContractHash: "00".repeat(32),
  agentSecretKey: priv.toPem(),
  agentPublicKey: pub,
};
const req = {
  payTo: PAYTO,
  amount: "10000",
  asset: ASSET,
  maxTimeoutSeconds: 300,
  resource: "https://example/v/v1/data",
  extra: { name: "Fund402 USDC", version: "1" },
};

const p = await buildExactPayload(cfg, req, { deployHash: DEPLOY });

console.log("agent-sdk · payload.test\n");
assert.equal(p.x402Version, 2, "x402Version == 2");
assert.equal(p.scheme, "exact", "scheme exact");
assert.equal(p.network, "casper:casper-test", "network");
assert.equal(p.accepted.asset, ASSET, "accepted.asset");
assert.equal(p.accepted.payTo, PAYTO, "accepted.payTo");
assert.equal(p.paymentRequirements.extra.name, "Fund402 USDC", "extra.name echoed");
assert.equal(hexToBytes(p.payload.signature).length, 65, "signature is 65 bytes [algo|64]");
assert.equal(p.payload.authorization.value, "10000", "authorization.value");
assert.equal(p.payload.authorization.to, PAYTO, "authorization.to == payTo");
assert.match(p.payload.authorization.from, /^00[0-9a-f]{64}$/, "authorization.from tagged");
assert.equal(p.payload.settlement.deployHash, DEPLOY, "Fund402 settlement.deployHash extension");
assert.equal(p.payload.settlement.asset, ASSET, "settlement.asset");
assert.match(agentTaggedAddress(pub), /^00[0-9a-f]{64}$/, "agentTaggedAddress format");

console.log("✓ x402 v2 payload shape + settlement extension + tagged address");
console.log("\nPAYLOAD CHECKS PASSED ✅");
