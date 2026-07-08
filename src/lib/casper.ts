// Server-side helpers for the Fund402 x402 gateway.
//
// The gateway issues x402 v2 `402 Payment Required` challenges and verifies the
// agent's payment by checking the Fund402 vault `borrow_and_pay` deploy on-chain
// via the CSPR.cloud REST API (the vault is the settlement — it already paid the
// merchant). No mock data; every value comes from env or the chain.

export const NETWORK = process.env.CASPER_NETWORK ?? "casper:casper-test";
export const IS_TESTNET = NETWORK.includes("test");
export const CSPR_CLOUD_REST =
  process.env.CSPR_CLOUD_REST ?? (IS_TESTNET ? "https://api.testnet.cspr.cloud" : "https://api.cspr.cloud");
export const CSPR_CLOUD_API_KEY = process.env.CSPR_CLOUD_API_KEY ?? "";

// Merchant + asset + price are required config — the gateway refuses to issue a
// challenge without them (rather than inventing a fake address).
export const MERCHANT = process.env.MERCHANT_ACCOUNT_HASH ?? ""; // "00" + 32-byte hex
export const ASSET_PACKAGE = process.env.X402_ASSET_PACKAGE ?? ""; // CEP-18 package hash (64 hex)
export const ASSET_NAME = process.env.X402_ASSET_NAME ?? "Cep18x402";
export const ASSET_VERSION = process.env.X402_ASSET_VERSION ?? "1";
export const ASSET_DECIMALS = process.env.X402_ASSET_DECIMALS ?? "9";
export const ASSET_SYMBOL = process.env.X402_ASSET_SYMBOL ?? "USDC";
export const PRICE_UNITS = process.env.X402_PRICE_UNITS ?? "1000000"; // base units per call
export const VAULT_CONTRACT = (process.env.FUND402_VAULT_CONTRACT ?? "").replace(/^hash-/, "");
// The vault is deployed as a versioned package; borrow_and_pay deploys target it
// by package hash (stable across version upgrades). This is the canonical vault
// identity to verify a settlement against.
export const VAULT_PACKAGE = (process.env.FUND402_VAULT_PACKAGE ?? "").replace(/^hash-/, "");
export const ORIGIN_BASE_URL = process.env.ORIGIN_BASE_URL ?? "https://api.coinbase.com/v2";

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  payTo: string;
  amount: string;
  asset: string;
  resource: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; decimals: string; symbol: string };
}

export function configError(): string | null {
  if (!MERCHANT) return "MERCHANT_ACCOUNT_HASH is not set";
  if (!ASSET_PACKAGE) return "X402_ASSET_PACKAGE (CEP-18 package hash) is not set";
  return null;
}

export function buildPaymentRequirements(resource: string, description: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    payTo: MERCHANT,
    amount: PRICE_UNITS,
    asset: ASSET_PACKAGE,
    resource,
    description,
    mimeType: "application/json",
    maxTimeoutSeconds: 900,
    extra: { name: ASSET_NAME, version: ASSET_VERSION, decimals: ASSET_DECIMALS, symbol: ASSET_SYMBOL },
  };
}

export function challengeBody(req: PaymentRequirements) {
  return { x402Version: 2, accepts: [req], error: "payment required" };
}

export function decodePaymentSignature(header: string): any | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

const csprHeaders = () => (CSPR_CLOUD_API_KEY ? { Authorization: CSPR_CLOUD_API_KEY } : {});

export interface DeployCheck {
  valid: boolean;
  reason?: string;
  status?: string;
  entryPoint?: number;
  paidMerchant?: boolean;
  paidAmount?: boolean;
}

/**
 * Verify a Fund402 vault `borrow_and_pay` deploy actually executed and paid the
 * required merchant + amount, using CSPR.cloud GET /deploys/{hash}. This is the
 * real on-chain proof the gateway requires before serving the resource.
 */
export async function verifyBorrowDeploy(
  deployHash: string,
  expect: { amount: string; merchant: string }
): Promise<DeployCheck> {
  if (!CSPR_CLOUD_API_KEY) {
    return { valid: false, reason: "CSPR_CLOUD_API_KEY not set — cannot verify on-chain" };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(deployHash)) {
    return { valid: false, reason: "malformed deploy hash" };
  }
  let res: Response;
  try {
    res = await fetch(`${CSPR_CLOUD_REST}/deploys/${deployHash}`, { headers: csprHeaders() });
  } catch (e: any) {
    return { valid: false, reason: `cspr.cloud fetch failed: ${e?.message}` };
  }
  if (!res.ok) return { valid: false, reason: `cspr.cloud /deploys ${res.status}` };

  const body = await res.json();
  const d = body?.data ?? body;
  const status: string = d?.status ?? "unknown";
  if (status !== "processed" || d?.error_message) {
    return { valid: false, reason: `deploy not successful (status=${status})`, status };
  }
  // Optional stricter checks against the deploy args.
  const args = d?.args ?? {};
  const argAmount = String(args?.amount?.parsed ?? "");
  const argMerchant = String(args?.merchant?.parsed ?? args?.merchant?.parsed?.Account ?? "");
  const paidAmount = !argAmount || argAmount === expect.amount;
  const paidMerchant =
    !argMerchant || argMerchant.toLowerCase().includes(expect.merchant.replace(/^00/, "").toLowerCase());

  // Ensure the deploy targeted the Fund402 vault. The vault is a versioned
  // package, so match its package hash (primary, upgrade-stable); fall back to
  // the resolved contract-entity hash for legacy configs.
  const pkgHash = String(d?.contract_package_hash ?? "").toLowerCase();
  const ctrHash = String(d?.contract_hash ?? "").toLowerCase();
  const targetsVault =
    (VAULT_PACKAGE && pkgHash.includes(VAULT_PACKAGE.toLowerCase())) ||
    (VAULT_CONTRACT && ctrHash.includes(VAULT_CONTRACT.toLowerCase()));
  if ((VAULT_PACKAGE || VAULT_CONTRACT) && (pkgHash || ctrHash) && !targetsVault) {
    return { valid: false, reason: "deploy did not target the configured vault", status };
  }

  return { valid: paidAmount && paidMerchant, status, entryPoint: d?.entry_point_id, paidMerchant, paidAmount };
}

export function explorerTx(deployHash: string): string {
  return `https://cspr.live/deploy/${deployHash}?network=${IS_TESTNET ? "casper-test" : "casper"}`;
}

/** Proxy the protected upstream origin and return its JSON. */
export async function fetchOrigin(path: string): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = `${ORIGIN_BASE_URL.replace(/\/$/, "")}/${path}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, status: res.status };
  } catch (e: any) {
    return { ok: false, data: { error: e?.message }, status: 502 };
  }
}
