/** لوحة المؤسّس: محميّة بـ ADMIN_SECRET (لا تعمل إن لم يُضبط). */
import { cookies } from "next/headers";
import { readSession, safeEqual, signSession } from "./auth";
import { now } from "./clock";

export const ADMIN_COOKIE = "dawri_admin";

export function adminEnabled() {
  return (process.env.ADMIN_SECRET ?? "").length >= 12;
}

export function checkAdminSecret(s: unknown): boolean {
  return adminEnabled() && typeof s === "string" && safeEqual(s, process.env.ADMIN_SECRET!);
}

export function adminToken() {
  return signSession({ shopId: "admin", v: 1, exp: now().getTime() + 12 * 3600_000 });
}

export async function isAdmin(): Promise<boolean> {
  if (!adminEnabled()) return false;
  const s = readSession((await cookies()).get(ADMIN_COOKIE)?.value, now());
  return s?.shopId === "admin";
}
