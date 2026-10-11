import crypto from "node:crypto";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    throw new Error("SESSION_SECRET (32+ chars) is required in production");
  }
  return "dawri-dev-secret-change-me-dawri-dev-secret";
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin);
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export interface StaffSession {
  shopId: string;
  v: number;
  exp: number;
}

export function signSession(s: StaffSession): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function readSession(token: string | undefined, now: Date): StaffSession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as StaffSession;
    return s.exp > now.getTime() ? s : null;
  } catch {
    return null;
  }
}

export const sessionCookieName = (shopId: string) => `dawri_s_${shopId.replace(/-/g, "").slice(0, 12)}`;

/** بصمة رمز التحقّق: مرتبطة بالمحلّ والهاتف كي لا تُعاد في مكان آخر. */
export function hashCode(shopId: string, phone: string, code: string): string {
  return crypto.createHmac("sha256", secret()).update(`${shopId}|${phone}|${code}`).digest("hex");
}

export function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10).toString();
  return s;
}

export function randomToken(bytes = 6): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
