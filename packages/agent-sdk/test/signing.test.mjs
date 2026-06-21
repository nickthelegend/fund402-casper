// Offline proof of the x402 `exact` EIP-712 signing path (fund402 fix #1).
//
// This is the offline equivalent of the facilitator's POST /verify — everything
// except the network round-trip. It proves:
//   1. The payload built by the OFFICIAL @make-software/casper-x402 client has a
//      well-formed 65-byte [algo|64] signature + tagged authorization.
//   2. fund402's hand-rolled digest (src/eip712.ts) is byte-identical to the
//      canonical @casper-ecosystem/casper-eip-712 digest for the same message.
//   3. The signature verifies against that digest using exactly the checks the
//      facilitator's verify() runs (publicKey.accountHash == authorization.from
//      and publicKey.verifySignature(digest, sig) === true).
//
// Run:  npm run test:signing
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import * as casperNS from "casper-js-sdk";
import * as x402NS from "@make-software/casper-x402";
import {
  hashTypedData,
  buildDomain,
  CASPER_DOMAIN_TYPES,
} from "@casper-ecosystem/casper-eip-712";

const require = createRequire(import.meta.url);
// fund402's independent digest implementation (compiled output).
const { transferAuthorizationDigest } = require("../dist/eip712.js");

// CJS/ESM interop: these packages ship CommonJS; classes land under `.default`.
const casper = casperNS.default ?? casperNS;
const x402 = x402NS.default ?? x402NS;
const { PrivateKey, PublicKey, KeyAlgorithm } = casper;
const ExactCasperScheme = x402.ExactCasperScheme;
const toClientCasperSigner = x402.toClientCasperSigner;

// The typed-data the LIVE facilitator uses (defined inline in casper-x402, not
// the snake_case TransferAuthorizationTypes that casper-eip-712 also exports).
const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

function hexToBytes(h) {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

const NETWORK = "casper:casper-test";
const NAME = "Cep18x402";
const VERSION = "1";
const ASSET = "ee".repeat(32); // 64-hex CEP-18 package hash (test value)
const PAYTO = "00" + "ab".repeat(32); // tagged merchant account hash
const AMOUNT = "10000";

console.log("fund402 agent-sdk · signing.test — offline /verify equivalent\n");

// 1) Generate a test ed25519 agent key, wrap with the official client signer.
const priv = PrivateKey.generate(KeyAlgorithm.ED25519);
const signer = toClientCasperSigner(priv);
const scheme = new ExactCasperScheme(signer);

// 2) Build the payment payload with the OFFICIAL client.
const requirements = {
  scheme: "exact",
  network: NETWORK,
  asset: ASSET,
  payTo: PAYTO,
  amount: AMOUNT,
  maxTimeoutSeconds: 300,
  extra: { name: NAME, version: VERSION },
};
const result = await scheme.createPaymentPayload(2, requirements);
const { signature, publicKey, authorization } = result.payload;

console.log("authorization:", JSON.stringify(authorization));
console.log("publicKey:", publicKey);
console.log("signature:", signature.slice(0, 18) + "… (" + hexToBytes(signature).length + " bytes)\n");

// 3) Recompute the digest two independent ways; assert byte-equality.
const domain = buildDomain(NAME, VERSION, NETWORK, "0x" + ASSET);
const messageOfficial = {
  from: "0x" + authorization.from,
  to: "0x" + authorization.to,
  value: BigInt(authorization.value),
  validAfter: BigInt(authorization.validAfter),
  validBefore: BigInt(authorization.validBefore),
  nonce: "0x" + authorization.nonce,
};
const digestOfficial = hashTypedData(
  domain,
  transferWithAuthorizationTypes,
  "TransferWithAuthorization",
  messageOfficial,
  { domainTypes: CASPER_DOMAIN_TYPES }
);

const digestManual = transferAuthorizationDigest(
  { name: NAME, version: VERSION, chainName: NETWORK, contractPackageHash: ASSET },
  {
    from: authorization.from,
    to: authorization.to,
    value: authorization.value,
    validAfter: authorization.validAfter,
    validBefore: authorization.validBefore,
    nonce: authorization.nonce,
  }
);

assert.equal(digestOfficial.length, 32, "digest must be 32 bytes");
assert.deepEqual(
  Buffer.from(digestManual),
  Buffer.from(digestOfficial),
  "fund402 manual digest must equal canonical casper-eip-712 digest"
);
console.log("✓ digest cross-check: fund402 manual == canonical (" + Buffer.from(digestOfficial).toString("hex").slice(0, 16) + "…)");

// 4) Verify the signature EXACTLY as the facilitator does.
const pub = PublicKey.fromHex(publicKey);
const sigBytes = hexToBytes(signature);
assert.equal(sigBytes.length, 65, "signature must be 65 bytes [algo|64]");
assert.equal(
  pub.accountHash().toHex(),
  authorization.from.slice(2),
  "publicKey.accountHash must equal authorization.from (facilitator publickey_mismatch check)"
);
assert.equal(
  pub.verifySignature(digestOfficial, sigBytes),
  true,
  "signature must verify against the digest (facilitator invalid_signature check)"
);
console.log("✓ publicKey.accountHash == authorization.from");
console.log("✓ signature verifies against digest (facilitator's exact check)");

console.log("\nALL SIGNING CHECKS PASSED ✅");
console.log("This is the facilitator /verify logic minus the network call.");
console.log("Run `npm run test:facilitator` with a CSPR.cloud key for the live round-trip.");
