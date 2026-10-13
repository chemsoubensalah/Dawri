import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { DomainError, type Shop } from "../domain/types";
import { isLang } from "../i18n";
import type { Lang } from "../domain/types";
import { clinicCookieName, readClinicSession, readSession, sessionCookieName } from "./auth";
import * as clinicsRepo from "./clinicsRepo";
import { now } from "./clock";
import { getDb } from "./db";
import * as repo from "./repo";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * تشخيص تقريبي لأخطاء الإعداد (قاعدة البيانات خصوصاً) كي يعرف صاحب الموقع السبب
 * دون فتح السجلّات. لا يكشف أيّ تفاصيل حسّاسة: رمز عامّ فقط.
 */
export function diagnose(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  if (/YOUR-PASSWORD/.test(msg)) return "db_password_placeholder";
  if (code === "42P01") return "db_tables_missing"; // الجداول غير موجودة: شغّل ملفّ SQL
  if (code === "28P01" || code === "28000" || /password|Tenant or user not found|SASL/i.test(msg)) return "db_auth";
  if (code === "ERR_INVALID_URL" || /Invalid URL/i.test(msg)) return `db_url_invalid:${describeDbUrl(process.env.DATABASE_URL)}`;
  if (/SESSION_SECRET/.test(msg)) return "session_secret_missing";
  if (/DATABASE_URL/.test(msg)) return "database_url_missing";
  if (
    ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN", "ECONNRESET"].includes(code) ||
    /timeout|terminated/i.test(msg)
  ) {
    return "db_unreachable";
  }
  return "unknown";
}

/** وصف بنية الرابط فقط (بلا أيّ حرف من محتواه) لمعرفة أين الخطأ. */
export function describeDbUrl(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "empty";
  const flags: string[] = [];
  if (!/^["']?(DATABASE_URL\s*=\s*)?["']?postgres(ql)?:\/\//i.test(s)) flags.push("no_scheme");
  if (!s.includes("@")) flags.push("no_at");
  if (!/pooler\.supabase\.com/.test(s)) flags.push("not_pooler_host");
  if (!/:6543\//.test(s)) flags.push("no_port_6543");
  if (/\s/.test(s)) flags.push("has_space");
  return flags.join(",") || "structure_ok";
}

export function serverError(e: unknown) {
  console.error(e);
  return json({ error: "generic", hint: diagnose(e) }, 500);
}

/** يحوّل أخطاء المجال إلى {error: code} مع رمز HTTP مناسب. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, e.status);
    return serverError(e);
  }
}

/** يقبل JSON فقط (يمنع إرسال النماذج من مواقع أخرى). */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new DomainError("bad_request", 415);
  const text = await req.text();
  if (text.length > 20_000) throw new DomainError("bad_request", 413);
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new DomainError("bad_request", 400);
  }
}

export type StaffRole = "owner" | "assistant" | "manager";

/**
 * من يفتح فضاء هذا الطابور؟ جلسة الطبيب (owner) أو السكرتيرة (assistant)،
 * أو مدير العيادة متعدّدة الأطبّاء إن كان الطابور عضواً في عيادته (manager = صلاحيات الطبيب).
 */
export async function staffAccess(slug: string): Promise<{ shop: Shop; role: StaffRole } | null> {
  if (typeof slug !== "string") return null;
  const db = await getDb();
  const shop = await repo.getShopBySlug(db, slug.toLowerCase());
  if (!shop) return null;
  const jar = await cookies();
  const t = now();
  const s = readSession(jar.get(sessionCookieName(shop.id))?.value, t);
  if (s && s.shopId === shop.id) {
    if (s.r === "a") {
      if (shop.assistantPinHash && s.v === (shop.assistantVersion ?? 1)) return { shop, role: "assistant" };
    } else if (s.v === shop.sessionVersion) {
      return { shop, role: "owner" };
    }
  }
  if (shop.clinicId) {
    const c = readClinicSession(jar.get(clinicCookieName(shop.clinicId))?.value, t);
    if (c && c.clinicId === shop.clinicId) {
      const clinic = await clinicsRepo.getClinicById(db, shop.clinicId);
      if (clinic && clinic.sessionVersion === c.v) return { shop, role: "manager" };
    }
  }
  return null;
}

/** المحلّ إن كانت أيّ جلسة فريق صالحة (طبيب، سكرتيرة، مدير العيادة)، وإلّا null. */
export async function staffShop(slug: string): Promise<Shop | null> {
  return (await staffAccess(slug))?.shop ?? null;
}

export async function requireStaff(slug: string): Promise<Shop> {
  const shop = await staffShop(slug);
  if (!shop) throw new DomainError("unauthorized", 401);
  return shop;
}

/** صاحب العيادة فقط (الإعدادات، الاشتراك، إعدادات الميزات): الطبيب أو مدير العيادة — لا السكرتيرة. */
export async function ownerShop(slug: string): Promise<Shop | null> {
  const a = await staffAccess(slug);
  return a && a.role !== "assistant" ? a.shop : null;
}

export async function requireOwner(slug: string): Promise<Shop> {
  const a = await staffAccess(slug);
  if (!a) throw new DomainError("unauthorized", 401);
  if (a.role === "assistant") throw new DomainError("forbidden", 403);
  return a.shop;
}

/** الطبيب نفسه فقط (رمزه، بريده، رمز السكرتيرة، مغادرة العيادة) — لا مدير العيادة ولا السكرتيرة. */
export async function requireDoctor(slug: string): Promise<Shop> {
  const a = await staffAccess(slug);
  if (!a) throw new DomainError("unauthorized", 401);
  if (a.role !== "owner") throw new DomainError("forbidden", 403);
  return a.shop;
}

/** دور الجلسة الحالية لعرض الواجهة (إخفاء الإعدادات عن السكرتيرة…). */
export async function staffRole(slug: string): Promise<StaffRole | null> {
  return (await staffAccess(slug))?.role ?? null;
}

export function setSessionCookie(res: NextResponse, shop: Shop, token: string) {
  res.cookies.set(sessionCookieName(shop.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86400,
  });
}

/** اللغة: ?lang= ثمّ الكوكي ثمّ لغة المتصفّح ثمّ العربية. */
export async function getLang(fallback?: Lang, query?: string | string[]): Promise<Lang> {
  if (isLang(query)) return query;
  const c = (await cookies()).get("lang")?.value;
  if (isLang(c)) return c;
  if (fallback) return fallback;
  const al = (await headers()).get("accept-language") ?? "";
  return /^fr/i.test(al) ? "fr" : "ar";
}

/** الرابط الأساسي للموقع (لرموز QR). */
export async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * عنوان موثوق للروابط المرسلة بالبريد: لا نثق بترويسة Host (يمكن تزويرها لسرقة رابط إعادة التعيين).
 */
export async function trustedBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (!process.env.DATABASE_URL) return baseUrl(); // تطوير محلّي فقط
  throw new DomainError("email_unavailable", 503);
}
