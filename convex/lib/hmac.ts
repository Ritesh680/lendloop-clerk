// Request signing shared by both directions of the n8n integration.
// Uses Web Crypto so it runs in Convex's default runtime without "use node".

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const SIGNATURE_VERSION = "v1";
/** Tolerated clock skew and replay window, in seconds. */
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

/**
 * The signature covers the timestamp (limits replay), the method and path
 * (a signature for one endpoint is useless on another) and the exact bytes of
 * the body. n8n builds this same string in its Code nodes.
 */
export function canonicalString(parts: {
  timestamp: string;
  method: string;
  path: string;
  body: string;
}): string {
  return `${parts.timestamp}.${parts.method.toUpperCase()}.${parts.path}.${parts.body}`;
}

function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function signPayload(secret: string, message: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret, "sign"),
    encoder.encode(message),
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${SIGNATURE_VERSION}=${hex}`;
}

export type VerifyFailure = "missing" | "stale" | "bad_signature";

export async function verifySignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  body: string;
  nowMs?: number;
}): Promise<{ ok: true } | { ok: false; reason: VerifyFailure }> {
  const { secret, timestamp, signature, method, path, body } = input;
  if (!timestamp || !signature) return { ok: false, reason: "missing" };

  const seconds = Number(timestamp);
  const now = (input.nowMs ?? Date.now()) / 1000;
  if (!Number.isInteger(seconds) || Math.abs(now - seconds) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const prefix = `${SIGNATURE_VERSION}=`;
  if (!signature.startsWith(prefix)) {
    return { ok: false, reason: "bad_signature" };
  }
  const bytes = hexToBytes(signature.slice(prefix.length));
  if (!bytes) return { ok: false, reason: "bad_signature" };

  // subtle.verify compares in constant time, unlike string equality.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importKey(secret, "verify"),
    bytes,
    encoder.encode(canonicalString({ timestamp, method, path, body })),
  );
  return valid ? { ok: true } : { ok: false, reason: "bad_signature" };
}
