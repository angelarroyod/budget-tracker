/**
 * Demo session: the cookie holds `<userId>.<HMAC-SHA256 signature>`. Signing means a visitor
 * can't edit the cookie to become an arbitrary user. Web Crypto works in both proxy and pages.
 * Authorization still happens server-side on every query (see dal.ts) — the cookie only says who.
 */

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();

async function hmacKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(userId: number) {
  const payload = String(userId);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${payload}.${Buffer.from(sig).toString("base64url")}`;
}

/** Returns the user id, or null for a missing, malformed or tampered cookie. */
export async function verifySession(token: string | undefined): Promise<number | null> {
  const [payload, sig, extra] = token?.split(".") ?? [];
  if (!payload || !sig || extra !== undefined || !/^\d+$/.test(payload)) return null;
  // crypto.subtle.verify compares in constant time
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), Buffer.from(sig, "base64url"), enc.encode(payload));
  return ok ? Number(payload) : null;
}
