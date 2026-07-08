// Real Casper wiring for @fund402/agent-sdk, targeting casper-js-sdk@5.x
// (Casper 2.0 / Condor). This module turns the abstract "borrow + settle" steps
// into actual on-chain contract calls against the Fund402 Vault.
//
// The x402 `exact` PaymentPayload (the EIP-712 TransferWithAuthorization that the
// casper-x402 facilitator's POST /verify checks) is built with the OFFICIAL
// `@make-software/casper-x402` client (`ExactCasperScheme` + `toClientCasperSigner`)
// so the digest + 65-byte signature are guaranteed to match the facilitator —
// no hand-rolled crypto on the hot path. `src/eip712.ts` is retained only as an
// independent cross-check (see test/signing.test.mjs).
//
// API surface used (all from casper-js-sdk v5):
//   HttpHandler, RpcClient            — JSON-RPC transport
//   PrivateKey, PublicKey, KeyAlgorithm
//   Deploy, DeployHeader, ExecutableDeployItem, StoredContractByHash, ContractHash
//   Args, CLValue, Key, Duration, DEFAULT_DEPLOY_TTL

import {
  HttpHandler,
  RpcClient,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  StoredContractByHash,
  StoredVersionedContractByHash,
  ContractHash,
  Args,
  CLValue,
  Key,
  Duration,
  DEFAULT_DEPLOY_TTL,
} from "casper-js-sdk";
import { transferAuthorizationDigest, randomNonce, bytesToHex } from "./eip712";

export interface CasperWiringConfig {
  nodeUrl: string;
  network: string; // CAIP-2, e.g. "casper:casper-test"
  chainName: string; // "casper-test"
  vaultContractHash: string; // 64-hex vault PACKAGE hash (called via the versioned package on Condor)
  agentSecretKey: string; // PEM contents or hex
  agentPublicKey: string; // account-key hex (01.. / 02..)
  keyAlgorithm?: KeyAlgorithm;
  /** payment (gas) in motes for a borrow_and_pay call. Default 5 CSPR. */
  borrowGasMotes?: string;
}

export function rpc(nodeUrl: string): RpcClient {
  const handler = new HttpHandler(nodeUrl);
  // CSPR.cloud's node RPC requires the access key in an Authorization header.
  // Attach it automatically when talking to a cspr.cloud endpoint so a borrow /
  // repay / approve deploy isn't rejected with 401.
  const key = process.env.CSPR_CLOUD_API_KEY;
  if (key && /cspr\.cloud/i.test(nodeUrl)) {
    handler.setCustomHeaders({ Authorization: key });
  }
  return new RpcClient(handler);
}

export async function loadPrivateKey(
  secret: string,
  algo: KeyAlgorithm = KeyAlgorithm.ED25519
): Promise<PrivateKey> {
  const trimmed = secret.trim();
  if (trimmed.includes("BEGIN") && trimmed.includes("PRIVATE KEY")) {
    return PrivateKey.fromPem(trimmed, algo);
  }
  return PrivateKey.fromHex(trimmed, algo);
}

/** Build a CLKey arg from an account-hash ("account-hash-..") or hex string. */
function addressKey(addr: string): CLValue {
  // Strip an optional "account-hash-" prefix down to raw hex first.
  let hex = addr.startsWith("account-hash-") ? addr.slice("account-hash-".length) : addr;
  // x402 payTo encodes an account hash with a leading "00" tag byte (public keys
  // use 01/02). A bare account hash is 64 hex chars; a tagged one is 66. Drop the
  // tag so Key.newKey receives the exact 64-hex account hash it expects.
  if (hex.length === 66 && hex.startsWith("00")) hex = hex.slice(2);
  // Key.newKey accepts a formatted key string (account-hash-.., hash-.., uref-..).
  return CLValue.newCLKey(Key.newKey(`account-hash-${hex}`));
}

/**
 * Call the vault's `borrow_and_pay(merchant, amount, collateral, vault_id)`.
 * The vault pulls the agent's CEP-18 collateral into escrow (transfer_from) and
 * fronts the CEP-18 `amount` to the merchant from the liquidity pool. Returns
 * the settlement deploy hash. (The agent must have `approve`d the vault on the
 * CEP-18 token for at least `collateral` beforehand — see ensureCollateralAllowance.)
 */
export async function borrowAndPayOnChain(
  cfg: CasperWiringConfig,
  args: { merchant: string; amount: bigint; collateral: bigint; vaultId: string }
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const runtimeArgs = Args.fromMap({
    merchant: addressKey(args.merchant),
    amount: CLValue.newCLUInt256(args.amount.toString()),
    collateral: CLValue.newCLUInt256(args.collateral.toString()),
    vault_id: CLValue.newCLString(args.vaultId),
  });

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = new ExecutableDeployItem();
  // The vault is deployed as a versioned package (Condor) — call the latest
  // version by package hash, matching the on-chain contract registration.
  session.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(cfg.vaultContractHash),
    "borrow_and_pay",
    runtimeArgs,
    undefined
  );

  const payment = ExecutableDeployItem.standardPayment(cfg.borrowGasMotes ?? "5000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/** Repay a loan: vault pulls principal back from the agent (CEP-18 allowance required). */
export async function repayLoanOnChain(
  cfg: CasperWiringConfig,
  loanId: number
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = new ExecutableDeployItem();
  session.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(cfg.vaultContractHash),
    "repay_loan",
    Args.fromMap({ loan_id: CLValue.newCLUint64(BigInt(loanId)) }),
    undefined
  );

  const payment = ExecutableDeployItem.standardPayment("3000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/**
 * Approve the vault to pull `amount` of the CEP-18 asset from the agent (needed
 * before borrow_and_pay can escrow collateral and before repay_loan can pull the
 * principal). One-time per allowance top-up.
 */
export async function ensureCollateralAllowance(
  cfg: CasperWiringConfig & { assetPackageHash: string },
  spender: { vaultContractHash: string },
  amount: bigint
): Promise<{ deployHash: string }> {
  const client = rpc(cfg.nodeUrl);
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const signer = await loadPrivateKey(cfg.agentSecretKey, algo);
  const sender = PublicKey.fromHex(cfg.agentPublicKey);

  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = cfg.chainName;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(
    ContractHash.newContract(cfg.assetPackageHash),
    "approve",
    Args.fromMap({
      spender: addressKey(`hash-${spender.vaultContractHash}`),
      amount: CLValue.newCLUInt256(amount.toString()),
    })
  );

  const payment = ExecutableDeployItem.standardPayment("2000000000");
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(signer);

  const result = await client.putDeploy(deploy);
  return { deployHash: result.deployHash.toHex() };
}

/** Poll until a deploy executes; resolves true on success. */
export async function waitForDeploy(
  cfg: CasperWiringConfig,
  deployHash: string,
  { tries = 30, intervalMs = 2000 } = {}
): Promise<boolean> {
  const client = rpc(cfg.nodeUrl);
  for (let i = 0; i < tries; i++) {
    try {
      const res: any = await client.getDeploy(deployHash);
      const results =
        res?.executionResults ?? res?.execution_results ?? res?.executionInfo;
      if (results && (Array.isArray(results) ? results.length : true)) {
        const txt = JSON.stringify(results);
        if (txt.includes("Failure")) return false;
        if (txt.includes("Success")) return true;
      }
    } catch {
      /* not yet propagated */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** Casper account-hash ("00" + 32-byte hash) for the agent's public key. */
export function agentTaggedAddress(agentPublicKey: string): string {
  const pk = PublicKey.fromHex(agentPublicKey);
  const ah: any = pk.accountHash();
  // v5 AccountHash exposes hex via toHex()/toString(); strip any "account-hash-" prefix.
  let hex: string = (ah?.toHex?.() ?? ah?.toString?.() ?? String(ah)).replace(
    /^account-hash-/,
    ""
  );
  hex = hex.replace(/^0x/, "");
  return "00" + hex; // 00 = AccountHash tag
}

interface PaymentRequirementsLike {
  amount?: string;
  maxAmountRequired?: string;
  payTo: string;
  asset?: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  requiredDeadlineSeconds?: number;
  extra?: { tokenAddress?: string; name?: string; version?: string };
}

/**
 * Build the real x402 v2 `exact` PaymentPayload for the casper:* family using the
 * OFFICIAL @make-software/casper-x402 client. The produced `authorization` +
 * 65-byte EIP-712 `signature` verify against the casper-x402 facilitator's POST
 * /verify. We then attach the Fund402 `settlement.deployHash` extension — the
 * on-chain vault borrow_and_pay deploy the gateway checks via CSPR.cloud.
 */
export async function buildExactPayload(
  cfg: CasperWiringConfig,
  req: PaymentRequirementsLike,
  proof: { deployHash: string }
) {
  const algo = cfg.keyAlgorithm ?? KeyAlgorithm.ED25519;
  const priv = await loadPrivateKey(cfg.agentSecretKey, algo);

  const assetPkg = (req.asset ?? req.extra?.tokenAddress ?? "").replace(/^0x/, "");
  const amount = String(req.amount ?? req.maxAmountRequired ?? "0");
  const maxTimeoutSeconds = req.maxTimeoutSeconds ?? req.requiredDeadlineSeconds ?? 300;
  const name = req.extra?.name ?? "Cep18x402";
  const version = req.extra?.version ?? "1";

  // Same construction the casper-x402 `exact` client uses, built directly off
  // casper-js-sdk so the payload is byte-identical to the official one WITHOUT
  // depending on @make-software/casper-x402 at runtime (its CJS build is broken).
  // The digest (src/eip712.ts) is cross-checked against the canonical
  // @casper-ecosystem/casper-eip-712 in test/signing.test.mjs.
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 600;
  const validBefore = now + maxTimeoutSeconds;
  const nonce = randomNonce();
  const from = "00" + priv.publicKey.accountHash().toHex(); // tagged account hash
  const to = req.payTo;

  const digest = transferAuthorizationDigest(
    { name, version, chainName: cfg.network, contractPackageHash: assetPkg },
    { from, to, value: amount, validAfter: String(validAfter), validBefore: String(validBefore), nonce }
  );
  // 65-byte [algorithm byte | 64-byte sig] — what the facilitator's verify() expects.
  const signature = bytesToHex(priv.signAndAddAlgorithmBytes(digest));
  const publicKey = priv.publicKey.toHex();

  const requirements = {
    scheme: "exact" as const,
    network: cfg.network,
    asset: assetPkg, // 64-hex CEP-18 package hash
    payTo: to, // tagged "00" + 32-byte account hash
    amount,
    maxTimeoutSeconds,
    extra: { name, version },
  };

  return {
    x402Version: 2,
    resource: req.resource ? { url: req.resource } : undefined,
    // `accepted` echoes the chosen requirements — the facilitator's verify()
    // reads payload.accepted.scheme / .network.
    accepted: requirements,
    scheme: "exact" as const,
    network: cfg.network,
    payload: {
      signature,
      publicKey,
      authorization: {
        from,
        to,
        value: amount,
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce,
      },
      // Fund402 extension: the vault deploy that actually moved the funds.
      settlement: { deployHash: proof.deployHash, asset: assetPkg },
    },
    paymentRequirements: requirements,
  };
}
