// @fund402/agent-sdk
// Casper-native Axios interceptor for autonomous AI agents.
//
// When a downstream HTTP request returns `402 Payment Required`, the interceptor:
//   1. Decodes the x402 challenge.
//   2. Computes the JIT collateral and calls the Fund402 Vault `borrow_and_pay`
//      on Casper (the vault fronts the CEP-18 payment to the merchant).
//   3. Waits for the settlement deploy, builds the x402 `exact` PaymentPayload,
//      and replays the request with a `PAYMENT-SIGNATURE` header.
//
// Mirrors the original Stellar SDK's public surface so agent code is unchanged.

import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { KeyAlgorithm } from "casper-js-sdk";
import {
  borrowAndPayOnChain,
  buildExactPayload,
  waitForDeploy,
  type CasperWiringConfig,
} from "./casper";

export interface Fund402Config {
  agentSecretKey: string; // PEM or hex
  agentPublicKey: string; // account-key hex (01.. ed25519 / 02.. secp256k1)
  vaultContractHash: string; // 64-hex vault PACKAGE hash (called via the versioned package)
  network: string; // CAIP-2, e.g. "casper:casper-test"
  nodeUrl: string; // Casper JSON-RPC
  facilitatorUrl: string; // casper-x402 facilitator base URL
  chainName?: string; // "casper-test" (derived from network if omitted)
  keyAlgorithm?: KeyAlgorithm;
  /**
   * Collateral in CEP-18 base units to post for the JIT borrow. Omit (or 0n) for
   * the reputation-based, ZERO-collateral flow — the empty-wallet case: a Tier-3
   * agent borrows with nothing in its wallet. Set a positive value only for the
   * collateralized tiers (the agent must hold + `approve` that much first).
   */
  collateralBaseUnits?: bigint;
  onEvent?: (event: Fund402Event) => void;
}

export interface Fund402Event {
  type:
    | "intercepted_402"
    | "simulating_borrow"
    | "signing_authorization"
    | "borrow_submitted"
    | "payment_settled"
    | "payment_sent"
    | "request_retried"
    | "payment_confirmed";
  data: Record<string, unknown>;
  timestamp: number;
}

export interface PaymentRequiredBody {
  x402Version: 2;
  accepts: PaymentRequirements[];
  error?: string;
}

// x402 v2 PaymentRequirements (casper-x402 `exact` scheme).
export interface PaymentRequirements {
  scheme: "exact";
  network: string; // CAIP-2, e.g. "casper:casper-test"
  payTo: string; // merchant account hash, "00" + 32-byte hex
  amount: string; // token base units
  asset: string; // CEP-18 contract package hash (64 hex)
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string; decimals?: string; symbol?: string };
}

export function withPaymentInterceptor(config: Fund402Config): AxiosInstance {
  const instance = axios.create();
  const wiring: CasperWiringConfig = {
    nodeUrl: config.nodeUrl,
    network: config.network,
    chainName: config.chainName ?? (config.network.includes("test") ? "casper-test" : "casper"),
    vaultContractHash: config.vaultContractHash,
    agentSecretKey: config.agentSecretKey,
    agentPublicKey: config.agentPublicKey,
    keyAlgorithm: config.keyAlgorithm,
  };

  instance.interceptors.response.use(
    (r) => r,
    async (error) => {
      if (error.response?.status !== 402) throw error;

      const body = decodeChallenge(error.response);
      if (!body) throw error;

      const option = body.accepts.find((o) => o.network.startsWith("casper")) ?? body.accepts[0];
      if (!option) throw new Error("No Casper payment option in 402 challenge");

      const amount = BigInt(option.amount);
      emit(config, "intercepted_402", {
        resource: option.resource,
        amount: amount.toString(),
        asset: option.asset,
      });

      // 1. JIT collateral — default 0 (reputation-based, empty-wallet borrow).
      // The vault re-checks the agent's on-chain tier and reverts if the posted
      // collateral is short for its tier.
      emit(config, "simulating_borrow", { amount: amount.toString() });
      const collateral = config.collateralBaseUnits ?? 0n;

      // 2. Front the payment through the vault.
      emit(config, "signing_authorization", { merchant: option.payTo });
      const { deployHash } = await borrowAndPayOnChain(wiring, {
        merchant: option.payTo,
        amount,
        collateral,
        vaultId: deriveVaultId(option.resource ?? error.config?.url ?? ""),
      });
      emit(config, "borrow_submitted", { deployHash });

      const ok = await waitForDeploy(wiring, deployHash);
      emit(config, "payment_settled", { deployHash, success: ok });

      // 3. Build the x402 exact payload and replay.
      const paymentPayload = await buildExactPayload(wiring, option, { deployHash });
      emit(config, "payment_sent", { deployHash });

      const originalRequest = error.config as InternalAxiosRequestConfig;
      originalRequest.headers["PAYMENT-SIGNATURE"] = Buffer.from(
        JSON.stringify(paymentPayload)
      ).toString("base64");

      emit(config, "request_retried", { url: originalRequest.url });
      const retried = await instance(originalRequest);
      emit(config, "payment_confirmed", { deployHash });
      return retried;
    }
  );

  return instance;
}

function decodeChallenge(response: {
  headers: Record<string, string>;
  data?: unknown;
}): PaymentRequiredBody | null {
  const header = response.headers["payment-required"];
  if (header) {
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    } catch {
      /* ignore */
    }
  }
  if (response.data && typeof response.data === "object" && "accepts" in response.data) {
    return response.data as PaymentRequiredBody;
  }
  return null;
}

function deriveVaultId(resource: string): string {
  const m = resource.match(/\/v\/([^/]+)/);
  return m ? m[1] : "vault_1";
}

function emit(config: Fund402Config, type: Fund402Event["type"], data: Record<string, unknown>) {
  config.onEvent?.({ type, data, timestamp: Date.now() });
}

export function testnetConfig(): Partial<Fund402Config> {
  return {
    network: "casper:casper-test",
    chainName: "casper-test",
    nodeUrl: process.env.CASPER_NODE_URL ?? "https://node.testnet.cspr.cloud/rpc",
    facilitatorUrl: "https://x402-facilitator.cspr.cloud",
  };
}

export function mainnetConfig(): Partial<Fund402Config> {
  return {
    network: "casper:casper",
    chainName: "casper",
    nodeUrl: process.env.CASPER_NODE_URL ?? "https://node.mainnet.cspr.cloud/rpc",
    facilitatorUrl: "https://x402-facilitator.cspr.cloud",
  };
}

export * from "./casper";
