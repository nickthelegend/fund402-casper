// Live facilitator /verify round-trip (fund402 fix #1, the network half).
//
// The casper-x402 facilitator's verify() is purely cryptographic + format +
// timing — it does NOT read on-chain balances or token existence. So this test
// confirms the EIP-712 digest + 65-byte signature are accepted by the LIVE
// facilitator using ONLY a CSPR.cloud API key. No deploy, no funding required.
//
//   CSPR_CLOUD_API_KEY=<token> npm run test:facilitator
//
// Optional overrides (all have safe defaults):
//   FACILITATOR_URL   default https://x402-facilitator.cspr.cloud
//   X402_NETWORK      default casper:casper-test
//   CEP18_ASSET       default a dummy 64-hex package hash (fine for /verify)
//   CEP18_NAME        default Cep18x402
//   CEP18_VERSION     default 1
//   PAY_TO            default a dummy 00-tagged merchant account hash
//   AMOUNT            default 10000
//   AGENT_SECRET_HEX  default an ephemeral generated ed25519 key
import * as casperNS from "casper-js-sdk";
import * as x402NS from "@make-software/casper-x402";

const casper = casperNS.default ?? casperNS;
const x402 = x402NS.default ?? x402NS;
const { PrivateKey, KeyAlgorithm } = casper;
const { ExactCasperScheme, toClientCasperSigner } = x402;

const API_KEY = process.env.CSPR_CLOUD_API_KEY;
const FACILITATOR =
  process.env.FACILITATOR_URL ?? "https://x402-facilitator.cspr.cloud";
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
const signer = toClientCasperSigner(priv);
const scheme = new ExactCasperScheme(signer);

const requirements = {
  scheme: "exact",
  network: NETWORK,
  asset: ASSET,
  payTo: PAY_TO,
  amount: AMOUNT,
  maxTimeoutSeconds: 300,
  extra: { name: NAME, version: VERSION },
};

const result = await scheme.createPaymentPayload(2, requirements);

const body = {
  paymentPayload: {
    x402Version: 2,
    resource: { url: "https://fund402.example/verify-selftest" },
    accepted: {
      scheme: "exact",
      network: NETWORK,
      asset: ASSET,
      amount: AMOUNT,
      payTo: PAY_TO,
      maxTimeoutSeconds: 300,
    },
    payload: result.payload,
  },
  paymentRequirements: requirements,
};

console.log(`POST ${FACILITATOR}/verify  (network=${NETWORK})`);
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
  console.error(`HTTP ${res.status} — non-JSON response:\n${text.slice(0, 500)}`);
  process.exit(1);
}

console.log(`HTTP ${res.status}:`, JSON.stringify(json));

if (json.isValid === true) {
  console.log("\n✅ LIVE /verify PASSED — EIP-712 signing confirmed against the facilitator.");
  process.exit(0);
}
console.error(
  `\n❌ /verify returned isValid=false: ${json.invalidReason ?? "?"} — ${json.invalidMessage ?? ""}`
);
console.error(
  "If invalidReason is invalid_signature, the digest/signature encoding needs adjustment;\n" +
    "if it is network/asset/payto, just supply real values via env. See STATUS.md."
);
process.exit(1);
