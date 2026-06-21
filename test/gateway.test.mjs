// Unit tests for the gateway's pure x402 logic (src/lib/casper.ts).
// Runs under Node's TypeScript type-stripping (Node 23.6+). No network.
//   node --test test/   (or: node test/gateway.test.mjs)
import { strict as assert } from "node:assert";

// Config is read from env at import time → set it before importing the module.
process.env.CASPER_NETWORK = "casper:casper-test";
process.env.MERCHANT_ACCOUNT_HASH = "00" + "ab".repeat(32);
process.env.X402_ASSET_PACKAGE = "ee".repeat(32);
process.env.X402_PRICE_UNITS = "1000000";
process.env.X402_ASSET_NAME = "Fund402 USDC";
process.env.X402_ASSET_SYMBOL = "F402";

const lib = await import("../src/lib/casper.ts");

console.log("gateway · lib/casper.ts\n");

// configError — null when merchant + asset are configured
assert.equal(lib.configError(), null, "configError null when configured");

// buildPaymentRequirements — x402 v2 exact shape
const r = lib.buildPaymentRequirements("https://x/v/v1/market", "Fund402 data");
assert.equal(r.scheme, "exact");
assert.equal(r.network, "casper:casper-test");
assert.equal(r.payTo, "00" + "ab".repeat(32), "payTo = merchant");
assert.equal(r.amount, "1000000", "amount = price units");
assert.equal(r.asset, "ee".repeat(32), "asset = CEP-18 package");
assert.equal(r.maxTimeoutSeconds, 900);
assert.equal(r.extra.name, "Fund402 USDC");
assert.equal(r.extra.symbol, "F402");
console.log("✓ buildPaymentRequirements");

// challengeBody — x402 v2 envelope
const c = lib.challengeBody(r);
assert.equal(c.x402Version, 2);
assert.ok(Array.isArray(c.accepts) && c.accepts.length === 1, "accepts[]");
assert.equal(c.accepts[0], r);
console.log("✓ challengeBody");

// decodePaymentSignature — base64(JSON) round-trip + malformed → null
const payload = { payload: { settlement: { deployHash: "ab".repeat(32) } } };
const header = Buffer.from(JSON.stringify(payload)).toString("base64");
assert.deepEqual(lib.decodePaymentSignature(header), payload, "decode round-trip");
assert.equal(lib.decodePaymentSignature("@@@not base64 json@@@"), null, "malformed → null");
console.log("✓ decodePaymentSignature");

// explorerTx — testnet cspr.live url
assert.match(
  lib.explorerTx("ab".repeat(32)),
  /^https:\/\/cspr\.live\/deploy\/[a-f0-9]{64}\?network=casper-test$/,
  "explorerTx url"
);
console.log("✓ explorerTx");

console.log("\nGATEWAY LIB CHECKS PASSED ✅");
