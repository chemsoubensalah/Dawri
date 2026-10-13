/**
 * عيادات بعدّة أطبّاء + أدوار الطبيب/السكرتيرة.
 * - كلّ طبيب = طابور (shop) باشتراكه الخاصّ؛ العيادة تجمعهم: مدير واحد، صفحة مرضى واحدة، شاشة قاعة واحدة.
 * - مدير العيادة له صلاحيات «صاحب العيادة» على طوابير أعضائها فقط.
 * - ما يُعرض للعموم: أرقام وأعداد فقط، أبداً أسماء المرضى أو هواتفهم.
 */
import { dayKey, isWithinHours, minutesBetween, nextOpeningToday } from "../domain/time";
import { DomainError, type Lang, type Shop, type ShopKind } from "../domain/types";
import { isLang } from "../i18n";
import { hashPin, isValidPin, safeEqual, signClinicSession, verifyPin } from "./auth";
import { now as clockNow } from "./clock";
import { getClinicTvMessages } from "./tvmessages";
import { getDb } from "./db";
import * as repo from "./repo";
import * as crepo from "./clinicsRepo";
import type { Clinic } from "./clinicsRepo";
import { createShop } from "./service";
import { MAX_DOCTORS } from "../pricing";
import { clinicCoverUntil, isSubscriptionActive, ownUntil, subscriptionStatus, subscriptionUntil } from "../domain/subscription";

export type { Clinic };

const DAY_MS = 86_400_000;
/** حدّ أطبّاء العيادة (المصدر: src/lib/pricing.ts، آمن للواجهة). */
export { MAX_DOCTORS };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const RESERVED = ["api", "new", "staff", "admin", "manage", "login"];
const KINDS: ShopKind[] = ["doctor", "dentist", "lab", "barber", "other"];

function cleanSlug(v: unknown): string {
  const slug = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!SLUG_RE.test(slug) || RESERVED.includes(slug)) throw new DomainError("invalid_slug");
  return slug;
}

function cleanText(v: unknown, max: number, min = 0): string | null {
  if (v === undefined || v === null) {
    if (min > 0) throw new DomainError("invalid_name");
    return null;
  }
  if (typeof v !== "string") throw new DomainError("invalid_settings");
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) {
    if (min > 0) throw new DomainError("invalid_name");
    return null;
  }
  if (s.length < min || s.length > max) throw new DomainError(min > 0 ? "invalid_name" : "invalid_settings");
  return s;
}

function cleanEmail(v: unknown): string {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new DomainError("invalid_email");
  return e;
}

function checkSignupCode(code: unknown) {
  const required = process.env.SIGNUP_CODE;
  if (required && !(typeof code === "string" && safeEqual(code, required))) throw new DomainError("bad_signup_code", 403);
}

export function clinicSessionFor(clinic: Clinic, now: Date): string {
  return signClinicSession({ clinicId: clinic.id, v: clinic.sessionVersion, exp: now.getTime() + 30 * DAY_MS });
}

export async function clinicOr404(slug: unknown): Promise<Clinic> {
  const db = await getDb();
  const c = typeof slug === "string" && SLUG_RE.test(slug.toLowerCase()) ? await crepo.getClinicBySlug(db, slug.toLowerCase()) : null;
  if (!c) throw new DomainError("clinic_not_found", 404);
  return c;
}

// ————————————————————————— الإنشاء والدخول —————————————————————————

interface DoctorInput {
  doctorName?: unknown;
  specialty?: unknown;
  kind?: unknown;
  room?: unknown;
  slug?: unknown;
  pin?: unknown;
  /** اسم الطابور كما يظهر للمرضى (افتراضياً: اسم العيادة) */
  name?: unknown;
}

/** يُنشئ عيادة متعدّدة الأطبّاء + طبيبها الأوّل (رابطه = رابط العيادة، ورمزه = رمز المدير مبدئياً). */
export async function createClinic(input: {
  name?: unknown;
  slug?: unknown;
  email?: unknown;
  pin?: unknown;
  lang?: unknown;
  signupCode?: unknown;
  doctor?: DoctorInput;
}) {
  checkSignupCode(input.signupCode);
  const name = cleanText(input.name, 80, 2)!;
  const slug = cleanSlug(input.slug);
  const email = cleanEmail(input.email);
  if (!isValidPin(input.pin)) throw new DomainError("invalid_pin");
  const doc = input.doctor ?? {};
  const doctorName = cleanText(doc.doctorName, 80, 2)!;
  cleanText(doc.specialty, 80);
  cleanText(doc.room, 30);
  const shopSlug = doc.slug === undefined || doc.slug === "" ? slug : cleanSlug(doc.slug);
  const db = await getDb();
  if (await crepo.getClinicBySlug(db, slug)) throw new DomainError("slug_taken", 409);
  if (await repo.getShopBySlug(db, shopSlug)) throw new DomainError("slug_taken", 409);
  let clinic: Clinic;
  try {
    clinic = await crepo.insertClinic(db, {
      slug,
      name,
      ownerEmail: email,
      pinHash: hashPin(input.pin),
      look: { theme: "emerald", custom: null, display: "night" },
      trialEndsAt: new Date(clockNow().getTime() + 60 * DAY_MS), // مجّاني أوّل شهرين، كالطبيب الواحد
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new DomainError("slug_taken", 409);
    throw e;
  }
  try {
    const shop = await addDoctor(clinic, { ...doc, slug: shopSlug, pin: isValidPin(doc.pin) ? doc.pin : input.pin, name: doc.name ?? name }, isLang(input.lang) ? input.lang : "ar");
    return { clinic, shop };
  } catch (e) {
    // لا نترك عيادة فارغة إن فشل إنشاء الطبيب الأوّل
    await db.query("delete from clinics where id = $1", [clinic.id]);
    throw e;
  }
}

export async function clinicLogin(slug: unknown, pin: unknown) {
  const db = await getDb();
  const clinic = await clinicOr404(slug);
  const now = clockNow();
  if (!(await crepo.claimClinicLoginAttempt(db, clinic.id, now))) throw new DomainError("locked", 429);
  const ok = typeof pin === "string" && isValidPin(pin) && verifyPin(pin, clinic.pinHash);
  if (!ok) throw new DomainError("wrong_pin", 401);
  await crepo.resetClinicLoginAttempts(db, clinic.id);
  return { clinic, token: clinicSessionFor(clinic, now) };
}

/** تغيير رمز المدير: يُخرج كلّ أجهزة المدير الأخرى. */
export async function changeClinicPin(clinic: Clinic, pin: unknown, currentPin?: unknown) {
  if (!isValidPin(pin)) throw new DomainError("invalid_pin");
  // كوكي مسروق لا يكفي لتغيير الرمز: نطلب الرمز الحالي
  if (!(typeof currentPin === "string" && isValidPin(currentPin) && verifyPin(currentPin, clinic.pinHash))) {
    throw new DomainError("wrong_pin", 401);
  }
  const db = await getDb();
  await crepo.updateClinic(db, clinic.id, { pinHash: hashPin(pin), bumpSession: true });
  return (await crepo.getClinicById(db, clinic.id))!;
}

/**
 * الطبيب يغادر العيادة متعدّدة الأطبّاء: يسقط وصول مديرها إلى طابوره فوراً،
 * ولا يعود اشتراك العيادة يغطّيه — يرجع إلى اشتراكه الخاصّ (تجربته أو مدّته المدفوعة) كما هو.
 */
export async function leaveClinic(shop: Shop) {
  if (shop.clinicId) await crepo.detachShop(await getDb(), shop.id, shop.clinicId);
  return { inClinic: false };
}

// ————————————————————————— إدارة الأطبّاء —————————————————————————

async function memberCount(clinicId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ n: number }>("select count(*)::int as n from shops where clinic_id = $1", [clinicId]);
  return Number(rows[0]?.n ?? 0);
}

/** يضيف طبيباً جديداً (طابوراً جديداً بتجربته المجّانية) تحت العيادة. */
export async function addDoctor(clinic: Clinic, input: DoctorInput, lang: Lang = "ar"): Promise<Shop> {
  if ((await memberCount(clinic.id)) >= MAX_DOCTORS) throw new DomainError("clinic_full", 409);
  const doctorName = cleanText(input.doctorName, 80, 2)!;
  const specialty = cleanText(input.specialty, 80);
  const room = cleanText(input.room, 30);
  const name = cleanText(input.name, 80) ?? clinic.name;
  if (name.length < 2) throw new DomainError("invalid_name");
  const slug = cleanSlug(input.slug);
  if (!isValidPin(input.pin)) throw new DomainError("invalid_pin");
  const kind = KINDS.includes(input.kind as ShopKind) ? (input.kind as ShopKind) : "doctor";
  const shop = await createShop({
    name,
    slug,
    kind,
    pin: input.pin,
    lang,
    signupCode: process.env.SIGNUP_CODE, // المدير مُصادَق عليه مسبقاً
    doctorName,
    email: clinic.ownerEmail ?? undefined,
  });
  const db = await getDb();
  await repo.updateShop(db, shop.id, { profile: { ...shop.profile, doctorName, specialty }, look: clinic.look });
  if (!(await crepo.attachShop(db, shop.id, clinic.id, room))) throw new DomainError("conflict", 409);
  return (await repo.getShopById(db, shop.id))!;
}

/** يضمّ طابوراً موجوداً بإثبات رمز صاحبه (مع عدّاد القفل نفسه). */
export async function joinDoctor(clinic: Clinic, input: { slug?: unknown; pin?: unknown; room?: unknown }): Promise<Shop> {
  const db = await getDb();
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const shop = SLUG_RE.test(slug) ? await repo.getShopBySlug(db, slug) : null;
  if (!shop) throw new DomainError("shop_not_found", 404);
  const room = cleanText(input.room, 30);
  const now = clockNow();
  // عدّاد قفل العيادة (لا عدّاد الطبيب): التخمين يقفل المدير، ولا يقفل الطبيب خارج طابوره
  if (!(await crepo.claimClinicLoginAttempt(db, clinic.id, now))) throw new DomainError("locked", 429);
  // رمز الطبيب فقط (لا رمز السكرتيرة)
  const ok = typeof input.pin === "string" && isValidPin(input.pin) && verifyPin(input.pin, shop.pinHash);
  if (!ok) throw new DomainError("wrong_pin", 401);
  await crepo.resetClinicLoginAttempts(db, clinic.id);
  if (shop.clinicId === clinic.id) return shop;
  if (shop.clinicId) throw new DomainError("already_in_clinic", 409);
  if ((await memberCount(clinic.id)) >= MAX_DOCTORS) throw new DomainError("clinic_full", 409);
  if (!(await crepo.attachShop(db, shop.id, clinic.id, room))) throw new DomainError("already_in_clinic", 409);
  return (await repo.getShopById(db, shop.id))!;
}

async function memberOr404(clinic: Clinic, shopSlug: unknown): Promise<Shop> {
  const db = await getDb();
  const slug = typeof shopSlug === "string" ? shopSlug.toLowerCase() : "";
  const shop = SLUG_RE.test(slug) ? await repo.getShopBySlug(db, slug) : null;
  if (!shop || shop.clinicId !== clinic.id) throw new DomainError("shop_not_found", 404);
  return shop;
}

export async function setDoctorRoom(clinic: Clinic, shopSlug: unknown, room: unknown) {
  const shop = await memberOr404(clinic, shopSlug);
  const r = cleanText(room, 30);
  if (!(await crepo.setRoom(await getDb(), shop.id, clinic.id, r))) throw new DomainError("shop_not_found", 404);
  return { ok: true };
}

/** يُخرج الطبيب من العيادة: طابوره واشتراكه الخاصّ يبقيان كما هما (لم يعد مشمولاً باشتراك العيادة). */
export async function removeDoctor(clinic: Clinic, shopSlug: unknown) {
  const shop = await memberOr404(clinic, shopSlug);
  if (!(await crepo.detachShop(await getDb(), shop.id, clinic.id))) throw new DomainError("shop_not_found", 404);
  return { ok: true };
}

// ————————————————————————— الحالة الحيّة —————————————————————————

export type DoctorStatus = "open" | "break" | "later" | "closed" | "inactive";

function liveDoctors(rows: Awaited<ReturnType<typeof crepo.clinicLive>>, now: Date) {
  return rows.map(({ shop, live }) => {
    const active = isSubscriptionActive(shop, now);
    let status: DoctorStatus = "open";
    let resumesAt: string | null = null;
    if (!active) status = "inactive";
    else if (live.closed) status = "closed";
    else if (!isWithinHours(shop.hours, now)) {
      const next = nextOpeningToday(shop.hours, now);
      resumesAt = next?.at ?? null;
      status = next ? (next.afterBreak ? "break" : "later") : "closed";
    }
    // نفس تقدير صفحة المريض: متوسّط مدّة الكشف (مع قيمة افتراضية حتى 3 كشوف)
    const def = shop.settings.defaultServiceMin;
    const k = Math.max(0, 3 - live.doneN);
    const avg = (live.doneSumMin + def * k) / (live.doneN + k);
    const waitNewMin = live.calledAt
      ? Math.ceil(Math.max(avg - minutesBetween(live.calledAt, now), 1) + live.waiting * avg)
      : Math.ceil(live.waiting * avg);
    return { shop, live, active, status, resumesAt, waitNewMin };
  });
}

/** واجهة عامّة واحدة (صفحة العيادة + شاشة القاعة): لا أسماء مرضى ولا هواتف. */
export async function clinicPublic(slug: unknown) {
  const clinic = await clinicOr404(slug);
  const db = await getDb();
  const now = clockNow();
  const rows = liveDoctors(await crepo.clinicLive(db, clinic.id, dayKey(now)), now);
  const address = rows.map((r) => r.shop.profile.address).find(Boolean) ?? null;
  const phone = rows.map((r) => r.shop.profile.phone).find(Boolean) ?? null;
  const mapsUrl = rows.map((r) => r.shop.profile.mapsUrl).find(Boolean) ?? null;
  return {
    clinic: { slug: clinic.slug, name: clinic.name, look: clinic.look, address, phone, mapsUrl },
    doctors: rows.map(({ shop, live, status, resumesAt, waitNewMin }) => ({
      slug: shop.slug,
      name: shop.name,
      kind: shop.kind,
      doctorName: shop.profile.doctorName,
      specialty: shop.profile.specialty,
      room: shop.room ?? null,
      status,
      resumesAt,
      currentNumber: live.currentNumber,
      waiting: live.waiting,
      nextNumbers: live.nextNumbers,
      waitNewMin,
    })),
    messages: await getClinicTvMessages(rows.map((r) => r.shop.id)),
    serverTime: now.toISOString(),
  };
}

export type ClinicPublicView = Awaited<ReturnType<typeof clinicPublic>>;
export type PublicDoctor = ClinicPublicView["doctors"][number];

/** حالة اشتراك العيادة (للوحة المدير وصفحة الاشتراك). */
export function clinicSubscription(clinic: Pick<Clinic, "trialEndsAt" | "paidUntil">, now: Date) {
  const s = subscriptionStatus(clinic, now);
  return {
    active: s.active,
    trial: s.trial,
    until: s.until.toISOString(),
    paidUntil: s.paidUntil?.toISOString() ?? null,
    trialEndsAt: clinic.trialEndsAt.toISOString(),
    daysLeft: s.daysLeft,
  };
}

/** لوحة المدير: نفس الحالة + المخدومون اليوم + حالة الاشتراك (اشتراك العيادة يغطّي كلّ الأطبّاء). */
export async function managerView(clinic: Clinic) {
  const db = await getDb();
  const now = clockNow();
  const rows = liveDoctors(await crepo.clinicLive(db, clinic.id, dayKey(now)), now);
  return {
    clinic: { slug: clinic.slug, name: clinic.name, look: clinic.look, maxDoctors: MAX_DOCTORS },
    subscription: clinicSubscription(clinic, now),
    doctors: rows.map(({ shop, live, active, status, resumesAt, waitNewMin }) => {
      // النهاية الفعلية: اشتراك الطبيب الخاصّ أو اشتراك العيادة (الأبعد)
      const until = subscriptionUntil(shop);
      // «تجربة» أو «مدفوع» حسب المصدر الذي يحدّد النهاية (العيادة أو الطبيب نفسه)، لا خليط منهما
      const cover = clinicCoverUntil(shop);
      const fromClinic = Boolean(cover && cover.getTime() >= ownUntil(shop).getTime());
      const trial = fromClinic ? subscriptionStatus(clinic, now).trial : subscriptionStatus(shop, now).trial;
      return {
        slug: shop.slug,
        name: shop.name,
        kind: shop.kind,
        doctorName: shop.profile.doctorName,
        specialty: shop.profile.specialty,
        room: shop.room ?? null,
        status,
        resumesAt,
        currentNumber: live.currentNumber,
        waiting: live.waiting,
        served: live.served,
        waitNewMin,
        subscription: {
          active,
          trial,
          until: until.toISOString(),
          daysLeft: Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS)),
        },
      };
    }),
    serverTime: now.toISOString(),
  };
}

export type ManagerView = Awaited<ReturnType<typeof managerView>>;

// ————————————————————————— رمز السكرتيرة —————————————————————————

/** يضبط/يغيّر/يحذف رمز السكرتيرة. كلّ تغيير يُخرج أجهزة السكرتيرة فقط (لا الطبيب). */
export async function setAssistantPin(shop: Shop, pin: unknown) {
  const db = await getDb();
  if (pin === null || pin === "") {
    await crepo.setAssistantPin(db, shop.id, null);
    return { hasPin: false };
  }
  if (!isValidPin(pin)) throw new DomainError("invalid_pin");
  if (verifyPin(pin, shop.pinHash)) throw new DomainError("assistant_same_pin");
  await crepo.setAssistantPin(db, shop.id, hashPin(pin));
  return { hasPin: true };
}
