import { NextRequest, NextResponse } from "next/server";
import {
  buildPaymentRequirements,
  challengeBody,
  decodePaymentSignature,
  verifyBorrowDeploy,
  fetchOrigin,
  explorerTx,
  configError,
  MERCHANT,
  PRICE_UNITS,
} from "@/lib/casper";

// Fund402 x402 Gateway — GET /v/:vault_id/*path
// -----------------------------------------------------------------------------
// 1. No PAYMENT-SIGNATURE        -> 402 + x402 v2 challenge body.
// 2. PAYMENT-SIGNATURE present   -> verify the vault borrow_and_pay deploy
//    on-chain (CSPR.cloud), then proxy the real upstream origin.
//
// All config (merchant, asset, price, origin) comes from env. No mock data.

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ vault_id: string; path: string[] }> }
) {
  const cfgErr = configError();
  if (cfgErr) {
    return NextResponse.json(
      { error: `gateway not configured: ${cfgErr}. See SETUP.md / .env.example.` },
      { status: 500 }
    );
  }

  const { path } = await ctx.params;
  const resourcePath = path.join("/");
  const resource = req.nextUrl.href;
  const requirements = buildPaymentRequirements(resource, `Fund402 data: ${resourcePath}`);

  const sigHeader = req.headers.get("payment-signature");

  // ---- 1. Challenge ----
  if (!sigHeader) {
    return NextResponse.json(challengeBody(requirements), { status: 402 });
  }

  // ---- 2. Verify the on-chain settlement ----
  const payload = decodePaymentSignature(sigHeader);
  if (!payload) {
    return NextResponse.json({ error: "malformed PAYMENT-SIGNATURE" }, { status: 400 });
  }

  const deployHash: string | undefined =
    payload?.payload?.settlement?.deployHash ?? payload?.settlement?.deployHash;
  if (!deployHash) {
    return NextResponse.json(
      { error: "PAYMENT-SIGNATURE missing settlement.deployHash" },
      { status: 402 }
    );
  }

  const check = await verifyBorrowDeploy(deployHash, { amount: PRICE_UNITS, merchant: MERCHANT });
  if (!check.valid) {
    return NextResponse.json(
      { error: "payment verification failed", reason: check.reason, status: check.status },
      { status: 402 }
    );
  }

  // ---- 3. Proxy the protected origin ----
  const origin = await fetchOrigin(resourcePath);
  if (!origin.ok) {
    return NextResponse.json(
      { error: "origin error", status: origin.status, data: origin.data },
      { status: 502 }
    );
  }

  return new NextResponse(JSON.stringify(origin.data), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "payment-response": Buffer.from(
        JSON.stringify({
          success: true,
          network: requirements.network,
          deployHash,
          explorer: explorerTx(deployHash),
        })
      ).toString("base64"),
    },
  });
}
