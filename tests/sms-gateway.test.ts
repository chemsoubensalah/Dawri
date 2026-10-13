/**
 * رسائل SMS من هاتف العيادة (SMS Gateway for Android): التشفير، الإعداد، التنبيهات، الرموز، العدّاد، والحدود.
 * طبقة HTTP مُستبدَلة (gate.transport): لا اتّصال حقيقي بـ api.sms-gate.app.
 * اختبارات «الشبكة الحقيقية» تستعمل خادماً محلّياً على 127.0.0.1 فقط.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgDb, createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { defaultNotifier, setNotifier } from "@/lib/server/notify";
import { sentSms } from "@/lib/server/sms";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import * as gate from "@/lib/server/smsgate";
import { getGateway } from "@/lib/server/smsgate-repo";
import { claimRate, rateCount } from "@/lib/server/ratelimit";
import { hashCode } from "@/lib/server/auth";
import { DomainError, type NotifyType, type Shop, type Ticket } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T07:00:00Z"); // الأحد 08:00 بتوقيت الجزائر
const advance = (m: number) => (clock = new Date(clock.getTime() + m * 60000));
const SCHEMA = "smsgw_test";

// ——— خادم SMS Gateway مزيّف (طبقة HTTP) ———
interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: Record<string, unknown> | null;
  /** العنوان المثبَّت الذي سيُتّصل به (null = النطاق الافتراضي أو IP مكتوب) */
  address: string | null;
  timeoutMs: number;
}
let calls: Call[] = [];
/** network = لم يصل شيء (رفض الاتّصال/DNS)، timeout = ربّما وصل (مهلة بعد الاتّصال) */
type Reply = { status: number; body?: unknown } | "network" | "timeout";
let replies: { devices: Reply; messages: Reply } = { devices: { status: 200 }, messages: { status: 202 } };
/** إن وُجد: الرسائل تنتظره قبل الردّ (هاتف بطيء) */
let hold: Promise<void> | null = null;
const DEVICES = [{ id: "dev1", name: "Galaxy A10", lastSeen: "2026-10-11T06:59:00Z" }];

const realRequest = gate.transport.request;
const fakeRequest = vi.fn(async (r: gate.HttpRequest): Promise<gate.HttpResponse> => {
  const body = r.body ? JSON.parse(r.body) : null;
  calls.push({ url: r.url, method: r.method, auth: r.headers.Authorization ?? null, body, address: r.address, timeoutMs: r.timeoutMs });
  const devices = /\/devices$/.test(r.url);
  if (!devices && hold) await hold;
  const rep = devices ? replies.devices : replies.messages;
  if (rep === "network") return { ok: false, sent: "no" };
  if (rep === "timeout") return { ok: false, sent: "unknown" };
  const payload = rep.body !== undefined ? rep.body : devices ? DEVICES : { id: `m${calls.length}`, state: "Pending", recipients: [] };
  return { ok: true, status: rep.status, text: JSON.stringify(payload) };
});
const defaultTimeouts = { ...gate.timeouts };

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
const sends = () => calls.filter((c) => c.method === "POST");
const sentText = (c: Call) => (c.body!.textMessage as { text: string }).text;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.SIGNUP_CODE;
  delete process.env.SMS_NOTIFICATIONS;
  delete process.env.SMS_PROVIDER;
  delete process.env.SMSGATE_ALLOW_PRIVATE;
  // TEST_DATABASE_URL: Postgres حقيقي، في مخطّط خاصّ بهذا الملفّ (لا يتعارض مع service.test.ts)
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const admin = await createPgDb(url);
    await admin.exec(`drop schema if exists ${SCHEMA} cascade; create schema ${SCHEMA};`);
    await admin.close();
    const u = new URL(url);
    u.searchParams.set("options", `-c search_path=${SCHEMA}`);
    db = await createPgDb(u.toString());
    expect((await db.query<{ s: string }>("select current_schema() as s"))[0].s).toBe(SCHEMA);
  } else {
    db = await createPgliteDb();
  }
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier(undefined); // المُرسل الحقيقي (notify.ts) — نختبر الربط معه
  gate.transport.request = fakeRequest;
  gate.resolver.lookup = async () => ["93.184.216.34"]; // لا DNS حقيقي
});

afterAll(async () => {
  gate.transport.request = realRequest;
  setDb(undefined);
  setClock(undefined);
  delete process.env.SMS_NOTIFICATIONS;
  delete process.env.SMS_PROVIDER;
  if (process.env.TEST_DATABASE_URL) await db.exec(`drop schema if exists ${SCHEMA} cascade`);
  await db.close();
});

let shop: Shop;
let n = 0;

beforeEach(async () => {
  clock = new Date("2026-10-11T07:00:00Z");
  calls = [];
  replies = { devices: { status: 200 }, messages: { status: 202 } };
  hold = null;
  sentSms.length = 0;
  delete process.env.SMS_NOTIFICATIONS;
  delete process.env.SMS_PROVIDER;
  delete process.env.SMSGATE_ALLOW_PRIVATE;
  shop = await svc.createShop({ name: "عيادة الشفاء", slug: `sms-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

afterEach(async () => {
  hold = null;
  await gate.settled();
  gate.resolver.lookup = async () => ["93.184.216.34"];
  gate.transport.request = fakeRequest;
  Object.assign(gate.timeouts, defaultTimeouts);
});

const connect = (extra: Record<string, unknown> = {}) =>
  gate.saveSmsSettings(shop, { username: "K7QX2M", password: "s3cr3t-pa55word", ...extra });

const ticket = (o: Partial<Ticket> = {}): Ticket =>
  ({
    id: crypto.randomUUID(),
    shopId: shop.id,
    number: 7,
    lang: "ar",
    phone: "+213550000001",
    confirmAskedAt: null,
    confirmedAt: null,
    waOptOut: false,
    ...o,
  }) as unknown as Ticket;

/** التنبيه + انتظار ما يجري في الخلفية (هاتف العيادة لا يُنتظر في مسار الطابور) */
const notify = async (type: NotifyType, t: Ticket = ticket()) => {
  await defaultNotifier.send({ type, ticket: t, shop, ahead: 2 });
  await gate.settled();
};

let phoneSeq = 10;
const newPhone = () => `05510000${String(phoneSeq++).padStart(2, "0")}`;

describe("تشفير كلمة سرّ التطبيق", () => {
  it("ذهاب وإياب، IV عشوائي، ومربوط بالعيادة", () => {
    const a = gate.encryptSecret("p@ss word", "shop-a");
    const b = gate.encryptSecret("p@ss word", "shop-a");
    expect(a).not.toBe(b);
    expect(a).not.toContain("p@ss");
    expect(gate.decryptSecret(a, "shop-a")).toBe("p@ss word");
    expect(gate.decryptSecret(a, "shop-b")).toBeNull(); // نسخ القيمة إلى عيادة أخرى لا يفيد
    const [v, iv, enc, tag] = a.split(".");
    const flipped = Buffer.from(enc, "base64url");
    flipped[0] ^= 1;
    expect(gate.decryptSecret([v, iv, flipped.toString("base64url"), tag].join("."), "shop-a")).toBeNull();
    expect(gate.decryptSecret("garbage", "shop-a")).toBeNull();
  });

  it("وسم المصادقة 16 بايت دائماً: وسم مقصور (أسهل للتزوير) مرفوض", () => {
    const blob = gate.encryptSecret("secret", "shop-a");
    const [v, iv, enc, tag] = blob.split(".");
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
    for (const n of [4, 8, 12, 15]) {
      const short = Buffer.from(tag, "base64url").subarray(0, n).toString("base64url");
      expect(gate.decryptSecret([v, iv, enc, short].join("."), "shop-a"), `tag ${n}`).toBeNull();
    }
    const longer = Buffer.concat([Buffer.from(tag, "base64url"), Buffer.from([0])]).toString("base64url");
    expect(gate.decryptSecret([v, iv, enc, longer].join("."), "shop-a")).toBeNull();
    expect(gate.decryptSecret(`${blob}.x`, "shop-a")).toBeNull();
    expect(gate.decryptSecret(blob, "shop-a")).toBe("secret");
  });

  it("المفتاح مشتقّ من SESSION_SECRET: تغييره يُبطل القيم القديمة", () => {
    const old = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "x".repeat(40);
    const blob = gate.encryptSecret("abc", "s");
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(gate.decryptSecret(blob, "s")).toBeNull();
    process.env.SESSION_SECRET = "x".repeat(40);
    expect(gate.decryptSecret(blob, "s")).toBe("abc");
    if (old === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = old;
  });
});

describe("الربط والإعدادات", () => {
  it("الربط يفحص بيانات الدخول (GET /devices) ويحفظ كلمة السرّ مشفّرة ولا يُرجعها أبداً", async () => {
    const view = await connect();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.sms-gate.app/3rdparty/v1/devices");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].auth).toBe(basic("K7QX2M", "s3cr3t-pa55word"));
    expect(calls[0].address).toBeNull(); // api.sms-gate.app: النطاق الافتراضي الموثوق
    expect(view).toMatchObject({ configured: true, enabled: true, status: "ok", deviceName: "Galaxy A10", username: "K7QX2M", hasPassword: true });
    const json = JSON.stringify(view);
    expect(json).not.toContain("s3cr3t");
    expect(Object.keys(view)).not.toContain("password");
    expect(Object.keys(view)).not.toContain("passwordEnc");
    // في القاعدة: مشفّرة
    const row = (await db.query<{ password_enc: string }>("select password_enc from sms_gateways where shop_id = $1", [shop.id]))[0];
    expect(row.password_enc).not.toContain("s3cr3t");
    expect(gate.decryptSecret(row.password_enc, shop.id)).toBe("s3cr3t-pa55word");
    // GET الحالة لاحقاً لا يكشفها أيضاً
    expect(JSON.stringify(await gate.smsSettingsView(shop))).not.toContain("s3cr3t");
  });

  it("بيانات خاطئة (401) ← رفض دون حفظ؛ هاتف غير متّصل ← حفظ مع تنبيه", async () => {
    replies.devices = { status: 401, body: { message: "Unauthorized" } };
    await expect(connect()).rejects.toThrow("sg_auth");
    expect((await gate.smsSettingsView(shop)).configured).toBe(false);

    replies.devices = { status: 200, body: [] };
    const v = await connect();
    expect(v).toMatchObject({ configured: true, status: "error", lastError: "no_device" });

    replies.devices = "network";
    const v2 = await connect({ password: "new-password-1" });
    expect(v2).toMatchObject({ status: "error", lastError: "unreachable" });
  });

  it("تغيير الأحداث فقط لا يعيد الفحص ويُبقي كلمة السرّ", async () => {
    await connect();
    calls = [];
    const v = await gate.saveSmsSettings(shop, { sendSoon: false, enabled: true });
    expect(calls).toHaveLength(0);
    expect(v).toMatchObject({ sendSoon: false, sendCalled: true, sendCodes: true, status: "ok" });
    // كلمة سرّ فارغة = نُبقي القديمة، حتى مع إعادة إرسال اسم المستخدم نفسه
    await gate.saveSmsSettings(shop, { username: "K7QX2M", password: "", baseUrl: "" });
    expect(calls).toHaveLength(0);
    const gw = await getGateway(db, shop.id);
    expect(gate.decryptSecret(gw!.passwordEnc, shop.id)).toBe("s3cr3t-pa55word");
  });

  it("يرفض المدخلات الخاطئة", async () => {
    await expect(gate.saveSmsSettings(shop, { username: "K7QX2M" })).rejects.toThrow("sg_missing_password");
    await expect(gate.saveSmsSettings(shop, { username: "a b", password: "x" })).rejects.toThrow("sg_invalid_credentials");
    await expect(gate.saveSmsSettings(shop, { username: "a:b", password: "x" })).rejects.toThrow("sg_invalid_credentials");
    await expect(gate.saveSmsSettings(shop, { username: "abc", password: "x".repeat(200) })).rejects.toThrow("sg_invalid_credentials");
    await expect(connect({ enabled: "yes" })).rejects.toThrow("invalid_settings");
    // مسافات وحدها = لا كلمة سرّ؛ أسطر جديدة/رموز تحكّم مرفوضة
    await expect(gate.saveSmsSettings(shop, { username: "abc", password: "   " })).rejects.toThrow("sg_missing_password");
    await expect(gate.saveSmsSettings(shop, { username: "abc", password: "pass\n" })).rejects.toThrow("sg_invalid_credentials");
    expect(calls).toHaveLength(0);
  });

  it("كلمة السرّ تُحفظ وتُرسل كما هي (لا قصّ للمسافات)", async () => {
    await connect({ password: "  pass word  " });
    expect(calls[0].auth).toBe(basic("K7QX2M", "  pass word  "));
    const gw = await getGateway(db, shop.id);
    expect(gate.decryptSecret(gw!.passwordEnc, shop.id)).toBe("  pass word  ");
  });

  it("عنوان الخادم: https فقط، لا عناوين داخلية (SSRF)، ويقبل لصق الرابط الكامل", async () => {
    expect(gate.normalizeBaseUrl("")).toBe(gate.DEFAULT_BASE_URL);
    expect(gate.normalizeBaseUrl("https://api.sms-gate.app/3rdparty/v1/messages/")).toBe(gate.DEFAULT_BASE_URL);
    expect(gate.normalizeBaseUrl("sms.example.com/api/3rdparty/v1")).toBe("https://sms.example.com/api/3rdparty/v1");
    expect(gate.normalizeBaseUrl("https://api.sms-gate.app")).toBe(gate.DEFAULT_BASE_URL);
    expect(gate.normalizeBaseUrl("https://sms.example.com/")).toBe("https://sms.example.com/3rdparty/v1");
    for (const bad of ["http://api.sms-gate.app/3rdparty/v1", "https://u:p@sms.example.com", "https://sms.example.com/?x=1", "ftp://x.com", "https://"]) {
      expect(() => gate.normalizeBaseUrl(bad), bad).toThrow("sg_invalid_url");
    }
    for (const bad of [
      "https://127.0.0.1/3rdparty/v1",
      "https://10.1.2.3",
      "https://169.254.169.254/latest",
      "https://[::1]:8080",
      "https://[::ffff:127.0.0.1]",
      "https://localhost:3000",
      "https://printer.local",
      "https://intranet",
      "https://0x7f.1",
    ]) {
      expect(() => gate.normalizeBaseUrl(bad), bad).toThrow("sg_blocked_host");
    }
    // نطاق عامّ يشير إلى عنوان داخلي ← مرفوض قبل أيّ اتّصال
    gate.resolver.lookup = async () => ["192.168.1.10"];
    await expect(connect({ baseUrl: "https://evil.example.com/3rdparty/v1" })).rejects.toThrow("sg_blocked_host");
    expect(calls).toHaveLength(0);
    // نطاق غير موجود (خطأ كتابة) ← يُحفظ مع «تعذّر الاتّصال»
    gate.resolver.lookup = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await connect({ baseUrl: "https://sms.exampel.org/api/3rdparty/v1" })).toMatchObject({ status: "error", lastError: "unreachable" });
    expect(calls).toHaveLength(0);
    gate.resolver.lookup = async () => ["93.184.216.34"];
    await connect({ baseUrl: "https://sms.example.org/api/3rdparty/v1", password: "other-pass" });
    expect(calls[0].url).toBe("https://sms.example.org/api/3rdparty/v1/devices");
    expect(calls[0].address).toBe("93.184.216.34"); // الاتّصال بالعنوان الذي فُحص نفسه
  });

  it("الخادم المحلّي (نسخة داخل شبكة العيادة فقط): المسار /message وبلا فحص مسبق", async () => {
    expect(() => gate.normalizeBaseUrl("http://192.168.1.20:8080")).toThrow();
    process.env.SMSGATE_ALLOW_PRIVATE = "1";
    const v = await connect({ baseUrl: "http://192.168.1.20:8080" });
    expect(calls).toHaveLength(0);
    expect(v.status).toBe("unknown");
    await gate.sendTest(shop, "0550 12 34 56", "ar");
    expect(sends()[0].url).toBe("http://192.168.1.20:8080/message");
  });

  it("إزالة الربط تحذف البيانات", async () => {
    await connect();
    const v = await gate.removeSmsGateway(shop);
    expect(v.configured).toBe(false);
    expect(await getGateway(db, shop.id)).toBeNull();
  });

  it("قناة SMS في قسم التنبيهات تظهر مفعّلة حين يُربط الهاتف", async () => {
    const base = { push: false, sms: false, smsTest: true, whatsapp: false, viber: false };
    expect(await gate.withClinicSms(base, shop.id)).toEqual(base);
    await connect();
    expect(await gate.withClinicSms(base, shop.id)).toMatchObject({ sms: true, smsTest: false });
    await gate.saveSmsSettings(shop, { enabled: false });
    expect(await gate.withClinicSms(base, shop.id)).toEqual(base);
  });
});

describe("التنبيهات عبر هاتف العيادة", () => {
  it("«دورك الآن» و«اقترب دورك»: الطلب الصحيح (المسار، Basic auth، النصّ، الرقم الدولي، المهلة)", async () => {
    await connect();
    process.env.SMS_NOTIFICATIONS = "1"; // المزوّد العامّ موجود لكنّه لا يُستعمل حين ينجح هاتف العيادة
    calls = [];
    await notify("called");
    await notify("soon", ticket({ number: 12, lang: "fr" }));
    expect(sentSms).toHaveLength(0);
    const [a, b] = sends();
    expect(a.url).toBe("https://api.sms-gate.app/3rdparty/v1/messages");
    expect(a.auth).toBe(basic("K7QX2M", "s3cr3t-pa55word"));
    expect(a.body).toMatchObject({ phoneNumbers: ["+213550000001"], ttl: 900, priority: 100 });
    expect(sentText(a)).toBe("عيادة الشفاء: دورك الآن! رقمك 7، تفضل بالدخول.");
    expect(b.body).toMatchObject({ ttl: 1200 });
    expect(sentText(b)).toBe("عيادة الشفاء : votre tour approche, numéro 12. Venez.");
    expect(gate.smsSegments(sentText(a))).toBe(1);
    const v = await gate.smsSettingsView(shop);
    expect(v.sentThisMonth).toBe(2);
    expect(v.status).toBe("ok");
  });

  it("الأحداث الأخرى، ومن أوقف التنبيهات، وبلا هاتف: لا شيء عبر هاتف العيادة", async () => {
    await connect();
    calls = [];
    await notify("missed");
    await notify("confirm");
    await notify("called", ticket({ waOptOut: true }));
    await notify("called", ticket({ phone: null }));
    expect(sends()).toHaveLength(0);
  });

  it("حدث مُطفأ أو إرسال متوقّف ← المزوّد العامّ كالعادة", async () => {
    await connect({ sendSoon: false });
    process.env.SMS_NOTIFICATIONS = "1";
    calls = [];
    await notify("soon");
    expect(sends()).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
    await gate.saveSmsSettings(shop, { enabled: false });
    await notify("called");
    expect(sends()).toHaveLength(0);
    expect(sentSms).toHaveLength(2);
  });

  it("فشل هاتف العيادة لا يكسر شيئاً: يُسجَّل الخطأ ويُرسل المزوّد العامّ", async () => {
    await connect();
    process.env.SMS_NOTIFICATIONS = "called";
    replies.messages = { status: 503, body: { error: "QueueLimitExceeded" } };
    await expect(notify("called")).resolves.toBeUndefined();
    expect(sends()).toHaveLength(1);
    expect(sentSms).toHaveLength(1);
    let v = await gate.smsSettingsView(shop);
    expect(v).toMatchObject({ status: "error", lastError: "queue", sentThisMonth: 0 });
    // بلا مزوّد عامّ: لا شيء، ولا استثناء
    delete process.env.SMS_NOTIFICATIONS;
    replies.messages = "network";
    await expect(notify("called")).resolves.toBeUndefined();
    v = await gate.smsSettingsView(shop);
    expect(v.lastError).toBe("unreachable");
    // خادم لا يردّ: لا ننتظر المهلة مع كلّ «التالي» — تخطٍّ لدقيقتين ثمّ محاولة جديدة
    replies.messages = { status: 202 };
    calls = [];
    advance(1);
    await notify("called");
    expect(sends()).toHaveLength(0);
    advance(2);
    await notify("called");
    expect(sends()).toHaveLength(1);
    v = await gate.smsSettingsView(shop);
    expect(v).toMatchObject({ status: "ok", lastError: null, sentThisMonth: 1 });
  });

  it("قاطع الدائرة يشمل الرموز: بعد خطأ بطيء ← المزوّد العامّ مباشرة؛ وبلا مزوّد عامّ ← نحاول هاتف العيادة", async () => {
    await connect();
    replies.messages = "network";
    await notify("called");
    replies.messages = { status: 202 };
    calls = [];
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(0); // لا ننتظر مهلة هاتف معطّل والمريض ينتظر رمزه
    expect(sentSms).toHaveLength(1);
    process.env.SMS_PROVIDER = "off";
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).resolves.toMatchObject({ sent: true });
    expect(sends()).toHaveLength(1); // الوسيلة الوحيدة: نحاول
    // بعد دقيقتين: هاتف العيادة من جديد
    delete process.env.SMS_PROVIDER;
    replies.messages = "network";
    await notify("called");
    advance(3);
    replies.messages = { status: 202 };
    calls = [];
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(1);
    expect(sentSms).toHaveLength(1);
  });

  it("كلمة سرّ لا يمكن فكّها (تغيّر SESSION_SECRET) ← لا إرسال، ورسالة واضحة", async () => {
    await connect();
    await db.query("update sms_gateways set password_enc = $2 where shop_id = $1", [shop.id, gate.encryptSecret("x", "other-shop")]);
    calls = [];
    await notify("called");
    expect(sends()).toHaveLength(0);
    expect((await gate.smsSettingsView(shop)).lastError).toBe("decrypt");
    await expect(gate.saveSmsSettings(shop, { sendSoon: false })).rejects.toThrow("sg_decrypt");
  });

  it("يوم عمل حقيقي: الرمز ثمّ «دورك الآن» من هاتف العيادة", async () => {
    await connect();
    calls = [];
    const phone = newPhone();
    const c = await svc.requestCode(shop.slug, { name: "أمينة", phone });
    expect(c.devCode).toMatch(/^\d{6}$/); // وضع التجربة يبقى كما هو
    const codeMsg = sends()[0];
    expect(codeMsg.body).toMatchObject({ phoneNumbers: [`+213${phone.slice(1)}`], ttl: 600, priority: 100 });
    expect(sentText(codeMsg)).toBe(`عيادة الشفاء: رمز التحقق ${c.devCode}. لا تعطه لأحد.`);
    expect(sentSms).toHaveLength(0); // لا شيء عبر المزوّد العامّ
    const { ticketId } = await svc.takeTicket(shop.slug, { name: "أمينة", phone, code: c.devCode });
    const s = await svc.staffState((await repo.getShopBySlug(db, shop.slug))!);
    await svc.staffAction((await repo.getShopBySlug(db, shop.slug))!, { action: "next", current: s.current?.id ?? null });
    await gate.settled();
    const called = sends().at(-1)!;
    expect(sentText(called)).toContain("دورك الآن");
    expect(sentText(called)).toContain(String((await svc.ticketView(ticketId)).number));
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(2);
  });
});

describe("رموز التحقّق", () => {
  it("رموز التحقّق مُطفأة ← المزوّد العامّ (نصّ «دوري» المعتاد)", async () => {
    await connect({ sendCodes: false });
    calls = [];
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].text).toContain("دوري");
  });

  it("فشل مؤكَّد لهاتف العيادة ← المزوّد العامّ؛ وبلا مزوّد عامّ ← sms_failed", async () => {
    await connect();
    for (const r of [{ status: 503 }, { status: 401 }, "network"] as Reply[]) {
      replies.messages = r;
      sentSms.length = 0;
      await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
      expect(sentSms, JSON.stringify(r)).toHaveLength(1);
      advance(3); // «network» يفتح القاطع: ننتظره كي يُجرَّب هاتف العيادة من جديد
    }
    replies.messages = { status: 503 };
    process.env.SMS_PROVIDER = "off";
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).rejects.toThrow("sms_failed");
  });

  it("نتيجة مجهولة (مهلة بعد الاتّصال، 5xx) ← لا رمز ثانٍ عبر المزوّد العامّ", async () => {
    await connect();
    for (const r of [{ status: 500 }, { status: 502 }, { status: 504 }, "timeout"] as Reply[]) {
      replies.messages = r;
      sentSms.length = 0;
      calls = [];
      const out = await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
      expect(out, JSON.stringify(r)).toMatchObject({ sent: true }); // ربّما وصل: لا خطأ ولا تكرار
      expect(sends()).toHaveLength(1);
      expect(sentSms, JSON.stringify(r)).toHaveLength(0);
      advance(3);
    }
    // الطلب التالي بعد مهلة: القاطع مفتوح ← المزوّد العامّ (إن لم يصل الرمز الأوّل)
    replies.messages = "timeout";
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    calls = [];
    sentSms.length = 0;
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
  });

  it("بلا مزوّد عامّ: هاتف العيادة وحده يكفي لتفعيل التحقّق بالرسائل", async () => {
    process.env.SMS_PROVIDER = "off";
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).rejects.toThrow("sms_unavailable");
    expect((await svc.publicShop(shop.slug)).view.smsVerify).toBe(false);
    await connect();
    expect((await svc.publicShop(shop.slug)).view.smsVerify).toBe(true);
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).resolves.toMatchObject({ sent: true });
    expect(sends()).toHaveLength(1);
  });

  it("حماية الشريحة: تُحسب الرموز المرسلة عبر هاتف العيادة فقط؛ بعد 60 في الساعة ← المزوّد العامّ، أو «رموز كثيرة»", async () => {
    await connect();
    const key = gate.limitKey.codes(shop.id);
    // رموز أُرسلت بوسائل أخرى (المزوّد العامّ، أو قبل الربط) لا تستهلك حصّة الشريحة
    for (let i = 0; i < gate.CLINIC_CODES_PER_HOUR; i++) {
      const p = `+2135520${String(i).padStart(5, "0")}`;
      await repo.insertCode(db, shop.id, p, hashCode(shop.id, p, "000000"), clock, new Date(clock.getTime() + 600_000));
    }
    calls = [];
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(1);
    expect(await rateCount(db, key, 3600_000, clock)).toBe(1);
    // رموز «مُطفأة» على هاتف العيادة ← المزوّد العامّ، ولا تُحسب
    await gate.saveSmsSettings(shop, { sendCodes: false });
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sentSms).toHaveLength(1);
    expect(await rateCount(db, key, 3600_000, clock)).toBe(1);
    await gate.saveSmsSettings(shop, { sendCodes: true });
    // الحصّة ممتلئة (عدّاد ذرّي لحظة الإرسال)
    for (let i = 1; i < gate.CLINIC_CODES_PER_HOUR; i++) await claimRate(db, key, 3600_000, gate.CLINIC_CODES_PER_HOUR, clock);
    calls = [];
    sentSms.length = 0;
    await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() });
    expect(sends()).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
    process.env.SMS_PROVIDER = "off";
    const e = await svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() }).catch((x) => x);
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe("too_many_codes");
    expect(e.status).toBe(429);
    // بعد ساعة تعود الحصّة
    advance(61);
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).resolves.toMatchObject({ sent: true });
    expect(sends()).toHaveLength(1);
  });

  it("الاشتراك المنتهي يوقف الرموز كما يوقف التذاكر", async () => {
    await connect();
    await db.query("update shops set trial_ends_at = $2 where id = $1", [shop.id, new Date(clock.getTime() - 1000)]);
    calls = [];
    await expect(svc.requestCode(shop.slug, { name: "سعيد", phone: newPhone() })).rejects.toThrow("subscription");
    expect(sends()).toHaveLength(0);
  });
});

describe("العدّاد الشهري والرسائل التجريبية", () => {
  it("العدّاد يُصفَّر مع الشهر الجديد بتوقيت الجزائر", async () => {
    expect(gate.monthKey(new Date("2026-10-31T22:59:00Z"))).toBe("2026-10");
    expect(gate.monthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11"); // 00:30 في الجزائر
    clock = new Date("2026-10-31T22:00:00Z");
    await connect();
    await notify("called");
    await notify("called");
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(2);
    clock = new Date("2026-10-31T23:30:00Z");
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(0); // شهر جديد
    await notify("called");
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(1);
  });

  it("رسالة تجريبية: الرقم يُوحَّد، والنصّ بلغة الطبيب، و5 في الساعة على الأكثر (حتى الفاشلة)", async () => {
    await expect(gate.sendTest(shop, "0550123456")).rejects.toThrow("sg_not_configured");
    await connect();
    await expect(gate.sendTest(shop, "12345")).rejects.toThrow("invalid_phone");
    calls = [];
    const r = await gate.sendTest(shop, "0550 12 34 56", "fr");
    expect(r.ok).toBe(true);
    expect(r.view.testsLeft).toBe(4);
    expect(sends()[0].body).toMatchObject({ phoneNumbers: ["+213550123456"] });
    expect(sentText(sends()[0])).toContain("Dawri");
    replies.messages = { status: 401 };
    await expect(gate.sendTest(shop, "0550123456")).rejects.toThrow("sg_auth");
    replies.messages = { status: 202 };
    await gate.sendTest(shop, "0550123456");
    await gate.sendTest(shop, "0550123456");
    await gate.sendTest(shop, "0550123456");
    await expect(gate.sendTest(shop, "0550123456")).rejects.toThrow("sg_too_many_tests");
    expect(sends()).toHaveLength(5);
    expect((await gate.smsSettingsView(shop)).testsLeft).toBe(0);
    advance(61);
    await expect(gate.sendTest(shop, "0550123456")).resolves.toMatchObject({ ok: true });
  });

  it("الحدّ لا يُتجاوز بطلبات متزامنة", async () => {
    await connect();
    calls = [];
    const r = await Promise.allSettled(Array.from({ length: 9 }, () => gate.sendTest(shop, "0550123456")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(5);
    expect(sends()).toHaveLength(5);
  });

  it("تغيير بيانات الربط محدود أيضاً (10 فحوص في الساعة)", async () => {
    await connect();
    // الربط الأوّل فحص، ثمّ 9 تغييرات
    for (let i = 0; i < 9; i++) await connect({ password: `pass-${i}` });
    await expect(connect({ password: "pass-x" })).rejects.toThrow("sg_too_many_checks");
  });
});

describe("لا انتظار ولا تكرار في التنبيهات", () => {
  it("زرّ «التالي» لا ينتظر هاتف العيادة: الإرسال في الخلفية (مهلة 3 ثوانٍ)", async () => {
    await connect();
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    calls = [];
    // التنبيه يعود فوراً بينما الطلب إلى الهاتف ما زال معلّقاً
    await defaultNotifier.send({ type: "called", ticket: ticket(), shop, ahead: 0 });
    expect(sends()).toHaveLength(1);
    expect(sends()[0].timeoutMs).toBe(3000);
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(0);
    // ومن مسار الطابور نفسه
    process.env.PHONE_VERIFICATION = "off";
    try {
      await svc.takeTicket(shop.slug, { name: "أمينة", phone: newPhone() });
      await svc.takeTicket(shop.slug, { name: "سعيد", phone: newPhone() });
    } finally {
      delete process.env.PHONE_VERIFICATION;
    }
    const fresh = (await repo.getShopBySlug(db, shop.slug))!;
    await svc.staffAction(fresh, { action: "next", current: null });
    expect(sends().length).toBeGreaterThanOrEqual(2); // «دورك الآن» (+ «اقترب دورك») معلّقة
    release();
    await gate.settled();
    expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(sends().length);
  });

  it("نتيجة مجهولة (مهلة بعد الاتّصال أو 5xx) ← لا نسخة مدفوعة عبر المزوّد العامّ؛ فشل مؤكَّد ← المزوّد العامّ", async () => {
    await connect();
    process.env.SMS_NOTIFICATIONS = "1";
    for (const r of ["timeout", { status: 500 }, { status: 504 }] as Reply[]) {
      replies.messages = r;
      sentSms.length = 0;
      await notify("called");
      expect(sentSms, JSON.stringify(r)).toHaveLength(0);
      advance(3);
    }
    for (const r of ["network", { status: 503 }, { status: 401 }, { status: 400 }] as Reply[]) {
      replies.messages = r;
      sentSms.length = 0;
      await notify("soon");
      expect(sentSms, JSON.stringify(r)).toHaveLength(1);
      advance(3);
    }
  });
});

/** خادم HTTP محلّي حقيقي (127.0.0.1) لاختبار طبقة الشبكة نفسها. */
async function localServer(mode: "ok" | "hang") {
  const seen: { host: string | undefined; url: string | undefined; auth: string | undefined; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ host: req.headers.host, url: req.url, auth: req.headers.authorization, body });
      if (mode === "hang") return; // لا ردّ أبداً: وصل الطلب ولا نعرف النتيجة
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "local-1", state: "Pending" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const close = () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  return { port, seen, close };
}

describe("الشبكة: عنوان مثبَّت ومهل قصيرة", () => {
  it("DNS rebinding: الاتّصال يذهب إلى العنوان الذي فُحص، ولا ذاكرة لنتيجة DNS", async () => {
    let n = 0;
    const answers = [["93.184.216.34"], ["93.184.216.35"], ["10.0.0.7"]];
    gate.resolver.lookup = async () => answers[Math.min(n++, answers.length - 1)];
    await connect({ baseUrl: "https://sms.example.org" });
    expect(calls[0].address).toBe("93.184.216.34");
    calls = [];
    await gate.sendTest(shop, "0550123456");
    expect(calls[0].address).toBe("93.184.216.35"); // حلّ جديد لكلّ طلب، والعنوان نفسه يُستعمل
    // النطاق صار يشير إلى عنوان داخلي ← مرفوض قبل أيّ اتّصال
    calls = [];
    await expect(gate.sendTest(shop, "0550123456")).rejects.toThrow("sg_blocked_host");
    expect(calls).toHaveLength(0);
    expect(n).toBe(3);
  });

  it("طلب حقيقي: يتّصل بالعنوان المثبَّت (لا يحلّ الاسم مرّة ثانية) ويُبقي اسم النطاق في Host", async () => {
    const srv = await localServer("ok");
    try {
      process.env.SMSGATE_ALLOW_PRIVATE = "1";
      gate.transport.request = realRequest;
      const lookups: string[] = [];
      // اسم لا يوجد في DNS الحقيقي: الاتّصال ينجح فقط إن استُعمل العنوان المثبَّت
      gate.resolver.lookup = async (h) => (lookups.push(h), ["127.0.0.1"]);
      await connect({ baseUrl: `http://gw.dawri-test.invalid:${srv.port}` });
      await gate.sendTest(shop, "0550 12 34 56", "fr");
      await gate.sendTest(shop, "0550123456");
      expect(srv.seen).toHaveLength(2);
      expect(srv.seen[0]).toMatchObject({ host: `gw.dawri-test.invalid:${srv.port}`, url: "/message", auth: basic("K7QX2M", "s3cr3t-pa55word") });
      expect(JSON.parse(srv.seen[0].body)).toMatchObject({ phoneNumbers: ["+213550123456"] });
      expect(lookups).toEqual(["gw.dawri-test.invalid", "gw.dawri-test.invalid"]); // مرّة لكلّ طلب
      expect((await gate.smsSettingsView(shop)).sentThisMonth).toBe(2);
    } finally {
      await srv.close();
    }
  });

  it("طلب حقيقي: رفض الاتّصال = لم يُرسل (المزوّد العامّ)؛ لا ردّ بعد الاتّصال = مجهول (لا تكرار)", async () => {
    process.env.SMSGATE_ALLOW_PRIVATE = "1";
    process.env.SMS_NOTIFICATIONS = "1";
    gate.transport.request = realRequest;
    gate.timeouts.notify = 300;
    // منفذ مغلق
    const closed = await localServer("ok");
    await closed.close();
    await connect({ baseUrl: `http://127.0.0.1:${closed.port}` });
    await notify("called");
    expect(sentSms).toHaveLength(1);
    expect((await gate.smsSettingsView(shop)).lastError).toBe("unreachable");
    // خادم يستلم ولا يردّ
    const srv = await localServer("hang");
    try {
      await gate.saveSmsSettings(shop, { baseUrl: `http://127.0.0.1:${srv.port}` });
      advance(3);
      sentSms.length = 0;
      const t0 = Date.now();
      await notify("called");
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(srv.seen).toHaveLength(1);
      expect(sentSms).toHaveLength(0); // ربّما وصلت: لا نسخة ثانية مدفوعة
      expect((await gate.smsSettingsView(shop)).lastError).toBe("unreachable");
    } finally {
      await srv.close();
    }
  });

  it("DNS بطيء: مهلة قصيرة ثمّ «تعذّر الاتّصال» دون أيّ طلب", async () => {
    gate.timeouts.dns = 50;
    gate.resolver.lookup = () => new Promise<string[]>(() => {});
    const t0 = Date.now();
    const v = await connect({ baseUrl: "https://sms.example.org" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(v).toMatchObject({ status: "error", lastError: "unreachable" });
    expect(calls).toHaveLength(0);
  });
});

describe("الحدود لا تُصفَّر", () => {
  it("إزالة الربط ثمّ إعادته لا تعيد الرسائل التجريبية", async () => {
    await connect();
    for (let i = 0; i < gate.TESTS_PER_HOUR; i++) await gate.sendTest(shop, "0550123456");
    await gate.removeSmsGateway(shop);
    await connect();
    expect((await gate.smsSettingsView(shop)).testsLeft).toBe(0);
    await expect(gate.sendTest(shop, "0550123456")).rejects.toThrow("sg_too_many_tests");
  });

  it("فحوص الربط محدودة من أوّل محاولة (حتى الفاشلة وقبل أيّ ربط)، والإزالة لا تصفّرها", async () => {
    replies.devices = { status: 401 };
    for (let i = 0; i < 10; i++) await expect(connect({ password: `guess-${i}` })).rejects.toThrow("sg_auth");
    await expect(connect({ password: "guess-x" })).rejects.toThrow("sg_too_many_checks");
    expect(calls).toHaveLength(10); // لا طلب بعد الحدّ
    expect((await gate.smsSettingsView(shop)).configured).toBe(false);

    advance(61);
    replies.devices = { status: 200 };
    await connect();
    for (let i = 0; i < 9; i++) await connect({ password: `p-${i}` });
    await gate.removeSmsGateway(shop);
    await expect(connect()).rejects.toThrow("sg_too_many_checks");
  });
});

describe("نصوص الرسائل", () => {
  it("رسالة واحدة دائماً (70 حرفاً بالعربية) حتى مع اسم عيادة طويل", () => {
    const long = "عيادة الدكتور محمد الأمين بن عبد الله لطب الأطفال والرضّع";
    expect(gate.smsShopName(long).length).toBeLessThanOrEqual(24);
    for (const lang of ["ar", "fr"] as const) {
      for (const kind of ["called", "soon"] as const) {
        const txt = gate.clinicSmsText(kind, lang, long, { n: 148 });
        expect(gate.smsSegments(txt), txt).toBe(1);
        expect(txt).toContain("148");
      }
      expect(gate.smsSegments(gate.clinicSmsText("code", lang, long, { code: "123456" }))).toBe(1);
    }
    // اسم لاتيني + فرنسية = أبجدية GSM (160 حرفاً)
    const fr = gate.clinicSmsText("called", "fr", "Cabinet Dr Benali — Pédiatrie", { n: 3 });
    expect(fr).not.toMatch(/[—’]/);
    expect(gate.smsSegments(fr)).toBe(1);
    expect(gate.smsSegments("a".repeat(161))).toBe(2);
    expect(gate.smsSegments("ب".repeat(71))).toBe(2);
  });
});
