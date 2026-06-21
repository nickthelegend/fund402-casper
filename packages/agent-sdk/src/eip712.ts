// casper-eip-712 TransferWithAuthorization typed-data digest, implemented to
// match make-software/casper-x402 + casper-ecosystem/casper-eip-712 exactly so
// the produced signature verifies against the facilitator's POST /verify.
//
// Domain (CASPER_DOMAIN_TYPES):
//   EIP712Domain(string name,string version,string chain_name,bytes32 contract_package_hash)
// Message:
//   TransferWithAuthorization(address from,address to,uint256 value,
//                             uint256 validAfter,uint256 validBefore,bytes32 nonce)
// digest = keccak256( 0x19 0x01 || domainSeparator || structHash )
//
// Encoding rules (from casper-eip-712 encoding.ts):
//   string  -> keccak256(utf8 bytes)
//   uint256 -> 32-byte big-endian
//   bytes32 -> raw 32 bytes
//   address -> a 33-byte Casper address (1-byte type tag 00=Account / 01=Package
//              + 32-byte hash) encoded as keccak256(the 33 bytes)

import { keccak_256 } from "@noble/hashes/sha3";

const enc = new TextEncoder();

function keccak(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return keccak_256(buf);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function uint256(value: bigint | string): Uint8Array {
  let v = BigInt(value);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** EIP-712 `address` encoding for a Casper tagged address ("00.."/"01.." + hash). */
function encodeAddress(addr: string): Uint8Array {
  const bytes = hexToBytes(addr); // expect 33 bytes (1 tag + 32 hash)
  return keccak_256(bytes);
}

function typeHash(typeString: string): Uint8Array {
  return keccak_256(enc.encode(typeString));
}

const DOMAIN_TYPE =
  "EIP712Domain(string name,string version,string chain_name,bytes32 contract_package_hash)";
const MESSAGE_TYPE =
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";

export interface Eip712Domain {
  name: string;
  version: string;
  chainName: string; // CAIP-2, e.g. "casper:casper-test"
  contractPackageHash: string; // 32-byte hex (CEP-18 package hash)
}

export interface TransferAuthorization {
  from: string; // tagged address "00" + 32-byte account hash
  to: string; // tagged address "00" + 32-byte account hash
  value: string; // base units
  validAfter: string; // unix seconds
  validBefore: string; // unix seconds
  nonce: string; // 32-byte hex
}

function domainSeparator(d: Eip712Domain): Uint8Array {
  return keccak(
    typeHash(DOMAIN_TYPE),
    keccak_256(enc.encode(d.name)),
    keccak_256(enc.encode(d.version)),
    keccak_256(enc.encode(d.chainName)),
    hexToBytes(d.contractPackageHash) // bytes32 raw
  );
}

function structHash(m: TransferAuthorization): Uint8Array {
  return keccak(
    typeHash(MESSAGE_TYPE),
    encodeAddress(m.from),
    encodeAddress(m.to),
    uint256(m.value),
    uint256(m.validAfter),
    uint256(m.validBefore),
    hexToBytes(m.nonce) // bytes32 raw
  );
}

/** Final 32-byte EIP-712 digest to be signed by the agent key. */
export function transferAuthorizationDigest(
  domain: Eip712Domain,
  message: TransferAuthorization
): Uint8Array {
  const prefix = new Uint8Array([0x19, 0x01]);
  return keccak(prefix, domainSeparator(domain), structHash(message));
}

/** Random 32-byte nonce as hex. */
export function randomNonce(): string {
  const b = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(b);
}
