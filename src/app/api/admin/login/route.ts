import { ADMIN_COOKIE, adminToken, checkAdminSecret } from "@/lib/server/admin";
import { json, readJson } from "@/lib/server/http";

export async function POST(req: Request) {
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  if (!checkAdminSecret(body.secret)) return json({ error: "unauthorized" }, 401);
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
}
