// Live facilitator /verify round-trip for the SHIPPED path (buildExactPayload).
// The casper-x402 facilitator's verify() is purely cryptographic + format +
// timing (no on-chain reads), so this confirms the EIP-712 digest + 65-byte
// signature the agent SDK actually produces are accepted by the LIVE facilitator
// using ONLY a CSPR.cloud API key.
//
//   CSPR_CLOUD_API_KEY=<token> npm run test:facilitator
//
// Optional overrides (safe defaults): FACILITATOR_URL, X402_NETWORK, CEP18_ASSET,
// CEP18_NAME, CEP18_VERSION, PAY_TO, AMOUNT, AGENT_SECRET_HEX.
import { createRequire } from "node:module";
import * as casperNS from "casper-js-sdk";

const casper = casperNS.default ?? casperNS;
const { PrivateKey, KeyAlgorithm } = casper;
const require = createRequire(import.meta.url);
const { buildExactPayload } = require("../dist/casper.js");

const API_KEY = process.env.CSPR_CLOUD_API_KEY;
const FACILITATOR = process.env.FACILITATOR_URL ?? "https://x402-facilitator.cspr.cloud";
const NETWORK = process.env.X402_NETWORK ?? "casper:casper-test";
const ASSET = (process.env.CEP18_ASSET ?? "ee".repeat(32)).replace(/^0x/, "");
const NAME = process.env.CEP18_NAME ?? "Cep18x402";
const VERSION = process.env.CEP18_VERSION ?? "1";
const PAY_TO = process.env.PAY_TO ?? "00" + "ab".repeat(32);
const AMOUNT = process.env.AMOUNT ?? "10000";

if (!API_KEY) {
  console.log(
    "⏭  test:facilitator skipped — set CSPR_CLOUD_API_KEY to run the live /verify.\n" +
      "   Get a key at https://cspr.cloud. Nothing else is required (no deploy/funding)."
  );
  process.exit(0);
}

const priv = process.env.AGENT_SECRET_HEX
  ? PrivateKey.fromHex(process.env.AGENT_SECRET_HEX, KeyAlgorithm.ED25519)
  : PrivateKey.generate(KeyAlgorithm.ED25519);

// Build the payload exactly the way the SDK does in production.
const result = await buildExactPayload(
  {
    network: NETWORK,
    chainName: NETWORK.includes("test") ? "casper-test" : "casper",
    nodeUrl: "https://node.testnet.casper.network/rpc",
    vaultContractHash: "00".repeat(32),
    agentSecretKey: priv.toPem(),
    agentPublicKey: priv.publicKey.toHex(),
  },
  { payTo: PAY_TO, amount: AMOUNT, asset: ASSET, maxTimeoutSeconds: 300, resource: "https://fund402.example/verify-selftest", extra: { name: NAME, version: VERSION } },
  { deployHash: "00".repeat(32) }
);

const body = {
  paymentPayload: {
    x402Version: 2,
    resource: result.resource,
    accepted: result.accepted,
    payload: {
      signature: result.payload.signature,
      publicKey: result.payload.publicKey,
      authorization: result.payload.authorization,
    },
  },
  paymentRequirements: result.paymentRequirements,
};

console.log(`POST ${FACILITATOR}/verify  (network=${NETWORK}, SDK buildExactPayload)`);
console.log("payer:", result.payload.authorization.from);

const res = await fetch(`${FACILITATOR}/verify`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: API_KEY },
  body: JSON.stringify(body),
});
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error(`HTTP ${res.status} — non-JSON:\n${text.slice(0, 400)}`);
  process.exit(1);
}
console.log(`HTTP ${res.status}:`, JSON.stringify(json));

if (json.isValid === true) {
  console.log("\n✅ LIVE /verify PASSED — the SDK's shipped payload is accepted by the facilitator.");
  process.exit(0);
}
console.error(`\n❌ /verify isValid=false: ${json.invalidReason ?? "?"} — ${json.invalidMessage ?? ""}`);
process.exit(1);
