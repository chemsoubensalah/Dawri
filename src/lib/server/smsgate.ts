/**
 * رسائل SMS من هاتف العيادة نفسه — تطبيق «SMS Gateway for Android» مفتوح المصدر (sms-gate.app).
 *
 * الطبيب يثبّت التطبيق على هاتف أندرويد فيه شريحة (موبيليس/جازي/أوريدو، الرسائل شبه مجّانية في الباقات)،
 * ويفعّل «Cloud server»، ثمّ يلصق اسم المستخدم وكلمة السرّ هنا. «دوري» يرسل عبر واجهة الخادم السحابي:
 *
 *   POST {base}/messages          (base = https://api.sms-gate.app/3rdparty/v1)
 *   Authorization: Basic base64(username:password)
 *   { "textMessage": { "text": "…" }, "phoneNumbers": ["+213…"], "ttl": 900, "priority": 100 }
 *   ← 202 { "id": "…", "state": "Pending", "recipients": [...] }
 *
 *   GET {base}/devices            ← 200 [{ "id", "name", "lastSeen", … }]  (فحص بيانات الربط بلا إرسال)
 *
 * (المرجع: docs.sms-gate.app ومواصفة OpenAPI 1.77 — capcom6.github.io/android-sms-gateway/swagger.json)
 * وضع «الخادم المحلّي» على الهاتف نفسه (http://IP:8080، المسار /message) مدعوم فقط لنسخة «دوري»
 * المستضافة داخل شبكة العيادة (SMSGATE_ALLOW_PRIVATE=1).
 *
 * المبادئ: التنبيهات لا تُوقف الطابور أبداً (تُرسل في الخلفية، ولا استثناء يخرج من هنا إلى notify)،
 * ولا رسالة مكرّرة مدفوعة إن كانت النتيجة مجهولة؛ الاتّصال بالعنوان الذي فُحص نفسه (لا DNS rebinding)؛
 * كلمة السرّ مشفّرة ولا تخرج إلى المتصفّح، ولا نرسل إلّا رقم الهاتف ونصّاً قصيراً بلا أيّ معلومة طبّية.
 */
import crypto from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { after } from "next/server";
import { normalizePhone } from "../domain/phone";
import { dayKey } from "../domain/time";
import { DomainError, type Lang, type NotifyType, type Shop, type Ticket } from "../domain/types";
import { t } from "../i18n";
import { now as clockNow } from "./clock";
import { getDb } from "./db";
import { claimRate, rateCount } from "./ratelimit";
import { smsProvider, type SmsSender } from "./sms";
import {
  deleteGateway,
  gatewaySendsCodes,
  getGateway,
  recordError,
  recordSent,
  upsertGateway,
  type GatewayRow,
  type GatewayWrite,
} from "./smsgate-repo";

export const DEFAULT_BASE_URL = "https://api.sms-gate.app/3rdparty/v1";
const DEFAULT_HOST = "api.sms-gate.app";
/** رسائل تجريبية في الساعة لكلّ عيادة */
export const TESTS_PER_HOUR = 5;
/** فحوص الربط (تغيير بيانات الدخول) في الساعة */
const CHECKS_PER_HOUR = 10;
/** حماية شريحة العيادة: أقصى عدد رموز تحقّق تُرسَل فعلاً عبر هاتفها في الساعة (ثمّ المزوّد الاحتياطي) */
export const CLINIC_CODES_PER_HOUR = 60;
/**
 * المهل (ميلي ثانية). «دورك الآن»/«اقترب دورك» تُرسل في الخلفية بمهلة قصيرة؛ الرموز والفحص ينتظرها المستخدم.
 * (قابلة للتعديل في الاختبارات)
 */
export const timeouts = { dns: 2000, notify: 3000, other: 6000 };
const HOUR = 3600_000;

/** مفاتيح حدود المحاولات (جدول rate_limits — لا يمحوها حذف الربط). */
export const limitKey = {
  test: (shopId: string) => `sg:test:${shopId}`,
  check: (shopId: string) => `sg:check:${shopId}`,
  codes: (shopId: string) => `sg:codes:${shopId}`,
};
/** بعد خطأ «بطيء» (مهلة/خادم معطّل) نتخطّى هاتف العيادة في التنبيهات لهذه المدّة */
const BREAKER_MS = 2 * 60_000;
const SLOW_ERRORS = new Set(["unreachable", "server"]);

export type GatewayEvent = "called" | "soon" | "codes" | "test";

/**
 * مدّة صلاحية الرسالة وأولويتها: إن كان الهاتف مطفأً تُلغى الرسالة بعد ttl ثانية
 * (لا يصل «دورك الآن» بعد ساعة). الأولوية ≥ 100 تتخطّى التأخير بين الرسائل في التطبيق.
 */
const EVENT_OPTS: Record<GatewayEvent, { ttl: number; priority: number }> = {
  codes: { ttl: 600, priority: 100 }, // = مدّة صلاحية الرمز
  called: { ttl: 900, priority: 100 },
  soon: { ttl: 1200, priority: 50 },
  test: { ttl: 600, priority: 100 },
};

// ————————————————————————— التشفير —————————————————————————

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    throw new Error("SESSION_SECRET (32+ chars) is required in production");
  }
  return "dawri-dev-secret-change-me-dawri-dev-secret";
}

let keyCache: { secret: string; key: Buffer } | null = null;

/** مفتاح AES-256 مشتقّ من SESSION_SECRET (HKDF-SHA256، info = dawri-smsgate). */
function gatewayKey(): Buffer {
  const secret = sessionSecret();
  if (keyCache?.secret !== secret) {
    keyCache = { secret, key: Buffer.from(crypto.hkdfSync("sha256", secret, "dawri", "dawri-smsgate", 32)) };
  }
  return keyCache.key;
}

const IV_BYTES = 12;
/** وسم المصادقة كاملاً (16 بايت) دائماً: لا نقبل وسماً مقصوراً يسهّل التزوير. */
const TAG_BYTES = 16;

/** AES-256-GCM. النصّ المشفّر مربوط بالعيادة (AAD) فلا يصلح نسخه إلى عيادة أخرى. */
export function encryptSecret(plain: string, shopId: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const c = crypto.createCipheriv("aes-256-gcm", gatewayKey(), iv, { authTagLength: TAG_BYTES });
  c.setAAD(Buffer.from(shopId));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), enc.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

/** null إن تعذّر فكّ التشفير (تغيّر SESSION_SECRET أو عُبث بالقيمة أو وسم ليس 16 بايت). */
export function decryptSecret(blob: string, shopId: string): string | null {
  const [v, iv, enc, tag, extra] = blob.split(".");
  if (v !== "v1" || !iv || !enc || !tag || extra !== undefined) return null;
  try {
    const ivBuf = Buffer.from(iv, "base64url");
    const tagBuf = Buffer.from(tag, "base64url");
    if (ivBuf.length !== IV_BYTES || tagBuf.length !== TAG_BYTES) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", gatewayKey(), ivBuf, { authTagLength: TAG_BYTES });
    d.setAAD(Buffer.from(shopId));
    d.setAuthTag(tagBuf);
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ————————————————————————— التحقّق من المدخلات —————————————————————————

function allowPrivate() {
  return process.env.SMSGATE_ALLOW_PRIVATE === "1";
}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** عنوان IP داخلي/محجوز (لا نسمح للخادم بالاتّصال به: حماية من SSRF). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (dotted) return ipv4Private(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(x);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^(f[cd]|fe[89ab]|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8:") || x.startsWith("::");
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(h)) return isPrivateIp(h);
  if (h === "localhost" || !h.includes(".")) return true;
  return /\.(localhost|local|internal|lan|home|corp|home\.arpa)$/.test(h);
}

/**
 * يوحّد عنوان الخادم: https فقط، بلا بيانات دخول ولا استعلام، وليس عنواناً داخلياً.
 * يقبل لصق الرابط الكامل (…/messages) أو النطاق وحده (يُكمَل بـ /3rdparty/v1).
 * http (الخادم المحلّي على الهاتف) مسموح فقط مع SMSGATE_ALLOW_PRIVATE=1.
 */
export function normalizeBaseUrl(raw: unknown): string {
  let s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return DEFAULT_BASE_URL;
  if (s.length > 200) throw new DomainError("sg_invalid_url");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new DomainError("sg_invalid_url");
  }
  const priv = allowPrivate();
  if (u.protocol !== "https:" && !(priv && u.protocol === "http:")) throw new DomainError("sg_invalid_url");
  if (u.username || u.password || u.search || u.hash) throw new DomainError("sg_invalid_url");
  if (!priv && isPrivateHost(u.hostname)) throw new DomainError("sg_blocked_host");
  let path = u.pathname.replace(/\/+$/, "").replace(/\/(messages?|devices)$/i, "");
  if (u.protocol === "https:" && !/\/3rdparty\/v1$/i.test(path)) {
    path = u.hostname === DEFAULT_HOST ? "/3rdparty/v1" : `${path}/3rdparty/v1`;
  }
  return `${u.protocol}//${u.host}${path}`;
}

/** اسم المستخدم كما يظهر في التطبيق: لا مسافات ولا «:» (فاصل Basic auth). */
function cleanUsername(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^[\x21-\x39\x3b-\x7e]{1,64}$/.test(s)) throw new DomainError("sg_invalid_credentials");
  return s;
}

/** كلمة السرّ كما هي تماماً (لا قصّ للمسافات: قد تكون جزءاً منها)؛ الفارغة أو المسافات وحدها مرفوضة. */
function cleanPassword(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (!s.trim() || !/^[\x20-\x7e]{1,128}$/.test(s)) throw new DomainError("sg_invalid_credentials");
  return s;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") throw new DomainError("invalid_settings");
  return v;
}

/** الشهر بتوقيت الجزائر «YYYY-MM». */
export function monthKey(d: Date): string {
  return dayKey(d).slice(0, 7);
}

// ————————————————————————— نصوص الرسائل —————————————————————————

/** اسم العيادة في الرسالة: قصير لتبقى الرسالة واحدة (24 حرفاً، يُقصّ عند كلمة). */
export function smsShopName(name: string): string {
  const s = name.replace(/\s+/g, " ").trim();
  if (s.length <= 24) return s;
  const cut = s.slice(0, 24);
  const sp = cut.lastIndexOf(" ");
  return (sp >= 12 ? cut.slice(0, sp) : cut).replace(/[\s\-\u2013\u2014,.:;|/(]+$/u, "").trim();
}

/** يستبدل الرموز التي تُخرج الرسالة من أبجدية GSM (فتصير 70 حرفاً بدل 160). */
function gsmFriendly(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/[\u064B-\u0652\u0670]/g, ""); // التشكيل العربي: كلّ حركة حرف إضافي
}

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** عدد الرسائل القصيرة التي يأخذها النصّ (GSM-7: 160/153، وإلّا UCS-2: 70/67). */
export function smsSegments(text: string): number {
  let gsm = true;
  let len = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) {
    const units = text.length; // UTF-16
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

type TextKind = "called" | "soon" | "code" | "test";
const TEXT_KEYS = { called: "sg_smsCalled", soon: "sg_smsSoon", code: "sg_smsCode", test: "sg_smsTest" } as const;

export function clinicSmsText(kind: TextKind, lang: Lang, shopName: string, vars: { n?: number; code?: string } = {}): string {
  return gsmFriendly(t(lang, TEXT_KEYS[kind], { shop: smsShopName(shopName), n: vars.n ?? "", code: vars.code ?? "" }));
}

// ————————————————————————— الاتّصال بالخادم —————————————————————————

interface Creds {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * نتيجة طلب. unknown = ربّما وصلت الرسالة إلى الخادم (انقطاع/مهلة بعد الاتّصال، أو 5xx غير 503):
 * لا نرسل نسخة ثانية عبر المزوّد العامّ (رسالة مكرّرة ومدفوعة). وإلّا فالفشل مؤكَّد: لم تُرسَل.
 */
type CallResult = { ok: true; status: number; data: unknown } | { ok: false; error: string; unknown: boolean };

/** الخادم السحابي/الخاصّ (…/3rdparty/v1) أم الخادم المحلّي على الهاتف (http://IP:8080). */
function isLocalMode(baseUrl: string): boolean {
  return !/\/3rdparty\/v1$/i.test(baseUrl);
}

/** للاختبارات: استبدال حلّ أسماء النطاقات. */
export const resolver = {
  lookup: async (host: string): Promise<string[]> => (await dns.promises.lookup(host, { all: true })).map((a) => a.address),
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

/**
 * يحلّ اسم الخادم مرّة واحدة لكلّ طلب ويُرجع العنوان المثبَّت (address) الذي سنتّصل به فعلاً،
 * بعد التأكّد أنّه ليس عنواناً داخلياً — فلا يمكن لنطاق أن يشير إلى عنوان عامّ عند الفحص ثمّ إلى
 * عنوان داخلي عند الاتّصال (DNS rebinding). address = null: نطاق sms-gate.app الافتراضي (موثوق)
 * أو عنوان IP مكتوب مباشرة (لا شيء يُحلّ).
 */
async function resolveTarget(baseUrl: string): Promise<{ ok: true; address: string | null } | { ok: false; error: string }> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === DEFAULT_HOST) return { ok: true, address: null };
  const priv = allowPrivate();
  if (!priv && isPrivateHost(host)) return { ok: false, error: "blocked_host" };
  if (net.isIP(host)) return { ok: true, address: null };
  let addrs: string[];
  try {
    addrs = await withTimeout(resolver.lookup(host), timeouts.dns);
  } catch {
    return { ok: false, error: "unreachable" };
  }
  const valid = addrs.filter((a) => net.isIP(a));
  if (!valid.length) return { ok: false, error: "unreachable" };
  if (!priv && valid.some(isPrivateIp)) return { ok: false, error: "blocked_host" };
  return { ok: true, address: valid[0] };
}

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** العنوان المثبَّت (null = حلّ عاديّ للاسم) */
  address: string | null;
  timeoutMs: number;
}

/** sent = no: لم يصل شيء إلى الخادم (DNS، رفض الاتّصال، TLS، مهلة قبل الاتّصال). unknown: ربّما وصل. */
export type HttpResponse = { ok: true; status: number; text: string } | { ok: false; sent: "no" | "unknown" };

const MAX_BODY = 64_000;

/**
 * طلب HTTP(S) عبر node:http/https مع عنوان مثبَّت (lookup ثابت): الاتّصال يذهب إلى العنوان
 * الذي فحصناه، وTLS يتحقّق من الشهادة باسم النطاق نفسه (SNI). لا تحويلات، وجواب صغير فقط.
 */
function nodeRequest(r: HttpRequest): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve) => {
    const u = new URL(r.url);
    const secure = u.protocol === "https:";
    let connected = false; // بعد الاتّصال (وبعد مصافحة TLS) قد يكون الطلب وصل
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: HttpResponse) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const headers: Record<string, string | number> = { ...r.headers };
    if (r.body !== undefined) headers["Content-Length"] = Buffer.byteLength(r.body);
    const opts: https.RequestOptions = {
      method: r.method,
      host: u.hostname.replace(/^\[|\]$/g, ""),
      port: u.port || undefined,
      path: `${u.pathname}${u.search}`,
      headers,
      agent: false, // اتّصال جديد لكلّ طلب: نعرف بدقّة هل وصلنا إلى الخادم
    };
    if (r.address) {
      const address = r.address;
      const family = net.isIPv6(address) ? 6 : 4;
      opts.lookup = ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
        if (options?.all) cb(null, [{ address, family }]);
        else cb(null, address, family);
      }) as unknown as net.LookupFunction;
    }
    let status: number | null = null; // وصلت حالة الجواب: النتيجة معروفة حتى إن انقطع الجسم بعدها
    const chunks: Buffer[] = [];
    const answered = () => finish({ ok: true, status: status!, text: Buffer.concat(chunks).toString("utf8") });
    let req: http.ClientRequest;
    try {
      req = (secure ? https : http).request(opts, (res) => {
        status = res.statusCode ?? 0;
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) res.destroy();
          else chunks.push(c);
        });
        res.on("end", answered);
        res.on("close", answered);
        res.on("error", answered);
      });
    } catch {
      return finish({ ok: false, sent: "no" });
    }
    timer = setTimeout(() => req.destroy(new Error("timeout")), r.timeoutMs);
    req.on("socket", (sock) => {
      if (!secure && !sock.connecting && !sock.destroyed) connected = true;
      sock.once(secure ? "secureConnect" : "connect", () => {
        connected = true;
      });
    });
    req.on("error", () => (status !== null ? answered() : finish({ ok: false, sent: connected ? "unknown" : "no" })));
    req.end(r.body);
  });
}

/** للاختبارات: استبدال طبقة HTTP. */
export const transport = { request: nodeRequest };

function errorFromStatus(status: number): string {
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 422) return "rejected";
  if (status === 404 || status === 405) return "not_found";
  if (status === 429) return "rate";
  if (status === 503) return "queue";
  if (status >= 500) return "server";
  return "http";
}

/** 5xx (غير 503 «الطابور ممتلئ/غير متاح») قد يأتي بعد قبول الرسالة: النتيجة مجهولة. */
function maybeAccepted(status: number): boolean {
  return status >= 500 && status !== 503;
}

async function call(c: Creds, method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<CallResult> {
  const target = await resolveTarget(c.baseUrl);
  if (!target.ok) return { ok: false, error: target.error, unknown: false };
  const res = await transport.request({
    url: `${c.baseUrl}${path}`,
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    address: target.address,
    timeoutMs,
  });
  if (!res.ok) return { ok: false, error: "unreachable", unknown: res.sent === "unknown" };
  if (res.status < 200 || res.status > 299) {
    return { ok: false, error: errorFromStatus(res.status), unknown: maybeAccepted(res.status) };
  }
  let data: unknown = null;
  try {
    data = res.text ? JSON.parse(res.text) : null;
  } catch {}
  return { ok: true, status: res.status, data };
}

/** يرسل رسالة واحدة. لا يرمي: يُرجع رمز الخطأ (unknown = ربّما أُرسلت). */
export async function gatewaySend(
  c: Creds,
  to: string,
  text: string,
  event: GatewayEvent,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string; unknown: boolean }> {
  const { ttl, priority } = EVENT_OPTS[event];
  const local = isLocalMode(c.baseUrl);
  const timeout = event === "called" || event === "soon" ? timeouts.notify : timeouts.other;
  const r = await call(c, "POST", local ? "/message" : "/messages", { textMessage: { text }, phoneNumbers: [to], ttl, priority }, timeout);
  if (!r.ok) return r;
  const d = (r.data ?? {}) as { id?: unknown; state?: unknown };
  if (d.state === "Failed") return { ok: false, error: "rejected", unknown: false };
  return { ok: true, id: typeof d.id === "string" ? d.id.slice(0, 64) : null };
}

/**
 * يتحقّق من بيانات الربط دون إرسال رسالة (GET /devices).
 * null = لا يمكن الفحص (الخادم المحلّي): تُثبت الرسالة التجريبية الربط.
 */
export async function gatewayCheck(c: Creds): Promise<{ ok: true; deviceName: string | null } | { ok: false; error: string } | null> {
  if (isLocalMode(c.baseUrl)) return null;
  const r = await call(c, "GET", "/devices", undefined, timeouts.other);
  if (!r.ok) return { ok: false, error: r.error };
  const list = Array.isArray(r.data) ? (r.data as { name?: unknown; deletedAt?: unknown }[]) : null;
  if (!list) return { ok: false, error: "http" };
  const live = list.filter((x) => x && !x.deletedAt);
  if (!live.length) return { ok: false, error: "no_device" };
  const names = live.map((x) => (typeof x.name === "string" ? x.name.trim() : "")).filter(Boolean);
  const first = names[0] ?? "Android";
  return { ok: true, deviceName: (live.length > 1 ? `${first} (+${live.length - 1})` : first).slice(0, 80) };
}

/** خطأ إرسال عبر هاتف العيادة (code = auth | queue | unreachable | …). unknown = ربّما وصلت الرسالة. */
export class GatewayError extends Error {
  constructor(
    public code: string,
    public unknown = false,
  ) {
    super(`smsgate: ${code}${unknown ? " (outcome unknown)" : ""}`);
  }
}

function senderFor(gw: GatewayRow, password: string, event: GatewayEvent): SmsSender {
  return {
    async send(to, text) {
      const db = await getDb();
      const r = await gatewaySend({ baseUrl: gw.baseUrl, username: gw.username, password }, to, text, event);
      const now = clockNow();
      if (!r.ok) {
        await recordError(db, gw.shopId, r.error, now).catch(() => {});
        throw new GatewayError(r.error, r.unknown);
      }
      await recordSent(db, gw.shopId, monthKey(now), now).catch((e) => console.error("[smsgate] counter", e));
    },
  };
}

/** خادم لا يردّ منذ قليل (مهلة/خادم معطّل): نتخطّاه لدقيقتين بدل انتظار المهلة مع كلّ رسالة. */
function breakerOpen(gw: GatewayRow, now: Date): boolean {
  return Boolean(
    gw.lastError && SLOW_ERRORS.has(gw.lastError) && gw.lastErrorAt && now.getTime() - gw.lastErrorAt.getTime() < BREAKER_MS,
  );
}

/**
 * مرسل الرسائل عبر هاتف العيادة لحدث ما، أو null إن لم يكن مفعّلاً له.
 * (event = test يعمل حتى لو كان الإرسال متوقّفاً، للتجربة قبل التفعيل)
 * بعد خطأ «بطيء» حديث: null للتنبيهات والرموز (المزوّد العامّ مباشرة)، إلّا مع ignoreBreaker
 * (رموز بلا مزوّد عامّ: هاتف العيادة هو الوسيلة الوحيدة فنحاول).
 */
export async function getShopSmsSender(
  shop: Pick<Shop, "id">,
  event: GatewayEvent = "called",
  opts: { ignoreBreaker?: boolean } = {},
): Promise<SmsSender | null> {
  const db = await getDb();
  const gw = await getGateway(db, shop.id);
  if (!gw) return null;
  if (event !== "test") {
    if (!gw.enabled) return null;
    if ((event === "called" && !gw.sendCalled) || (event === "soon" && !gw.sendSoon) || (event === "codes" && !gw.sendCodes)) return null;
    if (!opts.ignoreBreaker && breakerOpen(gw, clockNow())) return null;
  }
  const password = decryptSecret(gw.passwordEnc, gw.shopId);
  if (password === null) {
    await recordError(db, gw.shopId, "decrypt", clockNow()).catch(() => {});
    return null;
  }
  return senderFor(gw, password, event);
}

// ————————————————————————— العمل في الخلفية —————————————————————————

const inflight = new Set<Promise<void>>();

/**
 * يشغّل مهمّة دون أن ينتظرها الطلب (زرّ «التالي» لا ينتظر هاتف العيادة).
 * داخل طلب Next: after() يُبقي الدالّة حيّة حتى تنتهي (waitUntil على Vercel). خارجه (سكربت/اختبار): تعمل كوعد عاديّ.
 */
export function background(task: () => Promise<void>) {
  const p: Promise<void> = task()
    .catch((e) => console.error("[smsgate] background", e))
    .finally(() => inflight.delete(p));
  inflight.add(p);
  try {
    after(p);
  } catch {
    // خارج نطاق طلب: الوعد يعمل على أيّ حال
  }
}

/** للاختبارات: ينتظر انتهاء كلّ ما يجري في الخلفية. */
export async function settled() {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

// ————————————————————————— الربط مع التنبيهات والرموز —————————————————————————

/**
 * «دورك الآن» و«اقترب دورك» من هاتف العيادة. true = تكفّل بها هاتف العيادة (الإرسال يجري في الخلفية).
 * لا يرمي أبداً. fallback (المزوّد العامّ) يُستدعى فقط إن فشل الإرسال فشلاً مؤكَّداً؛
 * إن كانت النتيجة مجهولة (مهلة بعد الاتّصال، 5xx) فلا نرسل نسخة ثانية مدفوعة.
 */
export async function sendClinicNotification(
  n: { type: NotifyType; ticket: Ticket; shop: Shop },
  fallback: (() => Promise<void>) | null = null,
): Promise<boolean> {
  if ((n.type !== "called" && n.type !== "soon") || !n.ticket.phone || n.ticket.waOptOut || !n.shop?.id) return false;
  let sender: SmsSender | null;
  try {
    sender = await getShopSmsSender(n.shop, n.type);
  } catch (e) {
    console.error("[smsgate] notify", (e as Error).message);
    return false;
  }
  if (!sender) return false;
  const to = n.ticket.phone;
  const text = clinicSmsText(n.type, n.ticket.lang, n.shop.name, { n: n.ticket.number });
  const s = sender;
  background(async () => {
    try {
      await s.send(to, text);
    } catch (e) {
      const unknown = e instanceof GatewayError && e.unknown;
      console.error("[smsgate] notify", (e as Error).message);
      if (!unknown && fallback) await fallback();
    }
  });
  return true;
}

export interface CodeSender {
  send(to: string, code: string, lang: Lang): Promise<void>;
}

/**
 * مرسل رموز التحقّق: هاتف العيادة أوّلاً (إن فعّلت ذلك)، ثمّ المزوّد العامّ احتياطاً.
 * null = لا وسيلة إرسال. حدّ CLINIC_CODES_PER_HOUR يحمي شريحة العيادة: يُحسب ذرّياً لحظة الإرسال
 * عبرها فقط (الرموز المرسلة عبر المزوّد العامّ لا تُحسب).
 * المزوّد العامّ لا يُستعمل إلّا إن فشل هاتف العيادة فشلاً مؤكَّداً، أو كان معطّلاً منذ قليل (قاطع الدائرة).
 */
export async function codeSender(shop: Shop, fallback: SmsSender | null): Promise<CodeSender | null> {
  let clinic: SmsSender | null = null;
  const key = limitKey.codes(shop.id);
  try {
    clinic = await getShopSmsSender(shop, "codes", { ignoreBreaker: !fallback });
    // قرار مبكّر (غير ذرّي، للرسالة الواضحة)؛ الحجز الذرّي عند الإرسال
    if (clinic && (await rateCount(await getDb(), key, HOUR, clockNow())) >= CLINIC_CODES_PER_HOUR) {
      if (!fallback) throw new DomainError("too_many_codes", 429);
      clinic = null;
    }
  } catch (e) {
    if (e instanceof DomainError) throw e;
    console.error("[smsgate] codes", e);
    clinic = null;
  }
  if (!clinic && !fallback) return null;
  return {
    async send(to, code, lang) {
      if (clinic) {
        let claimed = false;
        try {
          claimed = await claimRate(await getDb(), key, HOUR, CLINIC_CODES_PER_HOUR, clockNow());
        } catch (e) {
          console.error("[smsgate] codes", e);
        }
        if (claimed) {
          try {
            await clinic.send(to, clinicSmsText("code", lang, shop.name, { code }));
            return;
          } catch (e) {
            if (e instanceof GatewayError && e.unknown) {
              // ربّما وصل الرمز: لا رسالة ثانية (إن لم يصل يطلب المريض رمزاً جديداً — والقاطع يحوّله إلى المزوّد العامّ)
              console.error("[smsgate] code", e.message);
              return;
            }
            console.error("[smsgate] code", (e as Error).message);
            if (!fallback) throw e;
          }
        } else if (!fallback) {
          throw new DomainError("too_many_codes", 429);
        }
      }
      await fallback!.send(to, t(lang, "sms_code", { code }));
    },
  };
}

/** هل يرسل هاتف العيادة رموز التحقّق؟ (لإظهار خيار «عبر SMS» في صفحة المريض) */
export async function clinicSendsCodes(shopId: string): Promise<boolean> {
  try {
    return await gatewaySendsCodes(await getDb(), shopId);
  } catch {
    return false;
  }
}

/** قناة SMS في قائمة «التنبيهات» بالإعدادات: مفعّلة إن كان هاتف العيادة مربوطاً. */
export async function withClinicSms<T extends { sms: boolean; smsTest: boolean }>(c: T, shopId: string): Promise<T> {
  try {
    const gw = await getGateway(await getDb(), shopId);
    if (gw?.enabled && (gw.sendCalled || gw.sendSoon)) return { ...c, sms: true, smsTest: false };
  } catch {}
  return c;
}

// ————————————————————————— الإعدادات (صاحب العيادة فقط) —————————————————————————

export async function smsSettingsView(shop: Pick<Shop, "id">) {
  const db = await getDb();
  const gw = await getGateway(db, shop.id);
  const now = clockNow();
  const testsUsed = await rateCount(db, limitKey.test(shop.id), HOUR, now);
  const failing = Boolean(gw?.lastError && (!gw.lastOkAt || (gw.lastErrorAt && gw.lastErrorAt >= gw.lastOkAt)));
  const provider = smsProvider();
  return {
    configured: Boolean(gw),
    defaultBaseUrl: DEFAULT_BASE_URL,
    baseUrl: gw?.baseUrl ?? DEFAULT_BASE_URL,
    username: gw?.username ?? "",
    /** كلمة السرّ لا تُرسل أبداً: نقول فقط إن كانت محفوظة */
    hasPassword: Boolean(gw),
    enabled: gw?.enabled ?? false,
    sendCalled: gw?.sendCalled ?? true,
    sendSoon: gw?.sendSoon ?? true,
    sendCodes: gw?.sendCodes ?? true,
    deviceName: gw?.deviceName ?? null,
    status: !gw ? ("off" as const) : failing ? ("error" as const) : gw.lastOkAt ? ("ok" as const) : ("unknown" as const),
    lastError: failing ? gw!.lastError : null,
    lastOkAt: gw?.lastOkAt?.toISOString() ?? null,
    sentThisMonth: gw && gw.sentMonth === monthKey(now) ? gw.sentCount : 0,
    testsLeft: Math.max(0, TESTS_PER_HOUR - testsUsed),
    /** مزوّد SMS عامّ احتياطي على الخادم */
    fallback: provider !== null && provider !== "console",
    /** التحقّق من الهاتف مفعّل على الخادم (وإلّا فخيار «رمز التحقّق» بلا معنى) */
    codesActive: process.env.PHONE_VERIFICATION !== "off",
  };
}

export type SmsSettingsView = Awaited<ReturnType<typeof smsSettingsView>>;

/**
 * حفظ الإعدادات. عند تغيير بيانات الربط نفحصها فوراً (GET /devices):
 * بيانات خاطئة أو عنوان خاطئ ← رفض دون حفظ؛ هاتف غير متّصل أو خادم لا يردّ ← نحفظ ونُظهر التنبيه.
 */
export async function saveSmsSettings(shop: Pick<Shop, "id">, body: Record<string, unknown>) {
  const db = await getDb();
  const now = clockNow();
  const cur = await getGateway(db, shop.id);
  const baseUrl = body.baseUrl === undefined && cur ? cur.baseUrl : normalizeBaseUrl(body.baseUrl);
  const username = body.username === undefined && cur ? cur.username : cleanUsername(body.username);
  if (body.password !== undefined && body.password !== null && typeof body.password !== "string") {
    throw new DomainError("sg_invalid_credentials");
  }
  const typed = typeof body.password === "string" && body.password.trim() ? cleanPassword(body.password) : null;
  const stored = cur ? decryptSecret(cur.passwordEnc, shop.id) : null;
  const password = typed ?? stored;
  if (password === null) throw new DomainError(cur ? "sg_decrypt" : "sg_missing_password");

  const enabled = bool(body.enabled, cur?.enabled ?? true);
  const sendCalled = bool(body.sendCalled, cur?.sendCalled ?? true);
  const sendSoon = bool(body.sendSoon, cur?.sendSoon ?? true);
  const sendCodes = bool(body.sendCodes, cur?.sendCodes ?? true);

  const credsChanged = !cur || typed !== null || baseUrl !== cur.baseUrl || username !== cur.username;
  let check: GatewayWrite["check"] = null;
  let deviceName = cur?.deviceName ?? null;
  if (credsChanged) {
    // كلّ فحص يُحسب، بما فيه الربط الأوّل (قبل وجود أيّ صفّ) والفحوص الفاشلة: لا تخمين لكلمات السرّ عبر خادمنا
    if (!(await claimRate(db, limitKey.check(shop.id), HOUR, CHECKS_PER_HOUR, now))) {
      throw new DomainError("sg_too_many_checks", 429);
    }
    const r = await gatewayCheck({ baseUrl, username, password });
    if (r === null) {
      deviceName = null;
    } else if (r.ok) {
      check = { ok: true };
      deviceName = r.deviceName;
    } else if (r.error === "auth" || r.error === "not_found" || r.error === "blocked_host") {
      throw new DomainError(`sg_${r.error}`, 400); // لا نحفظ بيانات نعرف أنّها خاطئة
    } else {
      // هاتف غير متّصل أو خادم لا يردّ: نحفظ ونُظهر السبب («rejected» هنا لا يخصّ رقماً ← خطأ عامّ)
      check = { ok: false, error: r.error === "rejected" ? "http" : r.error };
      deviceName = null;
    }
  }
  await upsertGateway(
    db,
    shop.id,
    {
      baseUrl,
      username,
      passwordEnc: typed !== null || !cur ? encryptSecret(password, shop.id) : cur.passwordEnc,
      enabled,
      sendCalled,
      sendSoon,
      sendCodes,
      deviceName,
      check,
    },
    now,
  );
  return smsSettingsView(shop);
}

/** رسالة تجريبية إلى رقم يكتبه الطبيب (5 في الساعة على الأكثر)، بلغة واجهته. */
export async function sendTest(shop: Pick<Shop, "id" | "name" | "defaultLang">, to: unknown, lang?: unknown) {
  const phone = typeof to === "string" && to.length <= 30 ? normalizePhone(to) : null;
  if (!phone) throw new DomainError("invalid_phone");
  const db = await getDb();
  const gw = await getGateway(db, shop.id);
  if (!gw) throw new DomainError("sg_not_configured", 409);
  const now = clockNow();
  // نحجز المحاولة قبل الإرسال: حتى المحاولات الفاشلة تُحسب (لا إغراق)، ولا يصفّرها حذف الربط
  if (!(await claimRate(db, limitKey.test(shop.id), HOUR, TESTS_PER_HOUR, now))) {
    throw new DomainError("sg_too_many_tests", 429);
  }
  const sender = await getShopSmsSender(shop, "test");
  if (!sender) throw new DomainError("sg_decrypt", 409);
  try {
    await sender.send(phone, clinicSmsText("test", lang === "fr" || lang === "ar" ? lang : shop.defaultLang, shop.name));
  } catch (e) {
    if (e instanceof GatewayError) throw new DomainError(`sg_${e.code}`, 502);
    throw e;
  }
  return { ok: true, view: await smsSettingsView(shop) };
}

export async function removeSmsGateway(shop: Pick<Shop, "id">) {
  await deleteGateway(await getDb(), shop.id);
  return smsSettingsView(shop);
}
