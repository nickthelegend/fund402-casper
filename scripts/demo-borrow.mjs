#!/usr/bin/env node
// End-to-end CLI smoke test: the agent calls a 402-gated endpoint through the
// @fund402/agent-sdk interceptor, which borrows + settles on Casper and retries.
import { withPaymentInterceptor, testnetConfig } from "../packages/agent-sdk/dist/index.js";
import { readFileSync } from "node:fs";

const agent = withPaymentInterceptor({
  ...testnetConfig(),
  agentSecretKey: readFileSync(process.env.AGENT_PEM ?? ".keys/agent_secret.pem", "utf8"),
  agentPublicKey: process.env.AGENT_PUBLIC_KEY,           // 01..
  vaultContractHash: process.env.FUND402_VAULT_CONTRACT,  // 64-hex
  onEvent: (e) => console.log(`[fund402] ${e.type}`, e.data),
});

const url = process.env.DEMO_VAULT_URL ??
  "http://localhost:3005/v/a0000000-0000-0000-0000-000000000001/market/casper/stats";
const { data } = await agent.get(url);
console.log("DATA:", JSON.stringify(data, null, 2));
