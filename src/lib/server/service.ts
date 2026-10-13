/**
 * حالات الاستخدام: كلّ ما تفعله الصفحات وواجهات API يمرّ من هنا.
 * كلّ تغيير في طابور يوم ما يجري داخل معاملة تقفل صفّ ذلك اليوم.
 */
import crypto from "node:crypto";
import { dayKey, isValidHours, isWithinHours, localTime, minutesBetween, nextOpeningToday, DEFAULT_HOURS } from "../domain/time";
import { formatPhone, normalizePhone } from "../domain/phone";
import {
  averageServiceMinutes,
  currentTicket,
  dayStats,
  estimateWaitMinutes,
  initialFlags,
  lineup,
  peopleAhead,
  planApprove,
  queueStarted,
  planCancel,
  planCheckIn,
  planCloseStale,
  planConfirm,
  planNext,
  planReject,
  planTick,
} from "../domain/queue";
import {
  DEFAULT_SETTINGS,
  DomainError,
  isDisplayStyle,
  isHexColor,
  isTheme,
  NO_SHOW_RETENTION_DAYS,
  type Action,
  type Lang,
  type Shop,
  type ShopKind,
  type ShopProfile,
  type ShopSettings,
  type Ticket,
  type WeeklyHours,
} from "../domain/types";
import { aheadText, errorText, isLang, t } from "../i18n";
import { hashCode, hashPin, isValidPin, randomDigits, randomToken, safeEqual, signSession, verifyPin } from "./auth";
import { now as clockNow } from "./clock";
import { getDb, type Q } from "./db";
import { getNotifier, type Notification } from "./notify";
import * as repo from "./repo";
import { getMailer } from "./email";
import { getSms } from "./sms";
import { clinicSendsCodes, codeSender } from "./smsgate";
import {
  alertsMessage,
  parseInbound,
  parseIntent,
  shortCode,
  verifyMessage,
  waConfig,
  waLink,
  waSendText,
  type WaRecipient,
} from "./whatsapp";

const DAY_MS = 86_400_000;
/** مدّة حفظ اسم المريض وهاتفه في التذاكر (ثمّ تُجهَّل، وتبقى الأعداد للإحصاءات). */
export const TICKET_RETENTION_DAYS = 30;

// ————————————————————————— أدوات مشتركة —————————————————————————

export function isSubscriptionActive(shop: Shop, now: Date): boolean {
  const until = Math.max(shop.trialEndsAt.getTime(), shop.paidUntil?.getTime() ?? 0);
  return now.getTime() < until;
}

function demoMode() {
  return process.env.DAWRI_DEMO === "1" || !process.env.DATABASE_URL;
}

function phoneVerificationOn() {
  return process.env.PHONE_VERIFICATION !== "off";
}

async function shopOr404(q: Q, slug: string): Promise<Shop> {
  const shop = typeof slug === "string" ? await repo.getShopBySlug(q, slug.toLowerCase()) : null;
  if (!shop) throw new DomainError("shop_not_found", 404);
  return shop;
}

function cleanName(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (s.length < 2 || s.length > 60) throw new DomainError("invalid_name");
  return s;
}

function requirePhone(v: unknown): string {
  const p = typeof v === "string" ? normalizePhone(v) : null;
  if (!p) throw new DomainError("invalid_phone");
  return p;
}

function langOf(v: unknown, fallback: Lang): Lang {
  return isLang(v) ? v : fallback;
}

/** سبب رفض أخذ رقم الآن، أو null إن كان مسموحاً. */
/** لماذا لا يستطيع المريض أخذ رقم الآن؟ (issued = عدد الأرقام الموزّعة اليوم) */
function ticketBlocker(shop: Shop, closed: boolean, now: Date, issued: number): string | null {
  if (!isSubscriptionActive(shop, now)) return "subscription";
  if (closed) return "queue_closed";
  if (!isWithinHours(shop.hours, now)) {
    const next = nextOpeningToday(shop.hours, now);
    return next ? (next.afterBreak ? "on_break" : "not_open_yet") : "outside_hours";
  }
  if (shop.settings.dailyLimit > 0 && issued >= shop.settings.dailyLimit) return "day_full";
  return null;
}

interface Ctx {
  q: Q;
  shop: Shop;
  now: Date;
  day: string;
  closed: boolean;
  tickets: Ticket[];
}

async function applyActions(q: Q, actions: Action[], byId: Map<string, Ticket>, shop: Shop, now: Date, out: Action[]) {
  for (const a of actions) {
    if (a.kind === "update") {
      const ok = await repo.updateTicket(q, a.id, a.expect, a.patch);
      if (!ok) throw new DomainError("conflict", 409);
    } else if (a.kind === "noShow") {
      const t = byId.get(a.id);
      if (t?.phone) await repo.insertNoShow(q, shop.id, t.phone, t.id, now);
    } else {
      out.push(a);
    }
  }
}

/**
 * يُشغّل خطّة على طابور اليوم داخل معاملة مقفلة، ثمّ يطبّق ما يفرضه مرور الوقت (planTick)،
 * ثمّ يرسل التنبيهات بعد الحفظ.
 */
async function mutate<R>(
  shop: Shop,
  plan: (ctx: Ctx) => Promise<{ actions: Action[]; result: R }> | { actions: Action[]; result: R },
): Promise<{ result: R; tickets: Ticket[] }> {
  const db = await getDb();
  const now = clockNow();
  const day = dayKey(now);
  const notifications: Action[] = [];
  const { result, tickets } = await db.tx(async (q) => {
    const qd = await repo.lockDay(q, shop.id, day);
    let tickets = await repo.listDayTickets(q, shop.id, day);
    const { actions, result } = await plan({ q, shop, now, day, closed: qd.closed, tickets });
    await applyActions(q, actions, new Map(tickets.map((t) => [t.id, t])), shop, now, notifications);
    tickets = await repo.listDayTickets(q, shop.id, day);
    const tick = planTick(tickets, now, shop.settings);
    if (tick.length) {
      await applyActions(q, tick, new Map(tickets.map((t) => [t.id, t])), shop, now, notifications);
      tickets = await repo.listDayTickets(q, shop.id, day);
    }
    return { result, tickets };
  });
  await dispatch(shop, tickets, notifications);
  return { result, tickets };
}

async function dispatch(shop: Shop, tickets: Ticket[], actions: Action[]) {
  if (!actions.length) return;
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const notifier = getNotifier();
  await Promise.all(
    actions.map(async (a) => {
      if (a.kind !== "notify") return;
      const ticket = byId.get(a.id);
      if (!ticket) return;
      const n: Notification = { type: a.type, ticket, shop, ahead: peopleAhead(tickets, ticket) };
      try {
        await notifier.send(n);
      } catch (e) {
        console.error("[notify]", e);
      }
    }),
  );
}

/** يقرأ طابور اليوم، ويطبّق ما فات من مهل (بلا قفل إن لم يكن هناك ما يتغيّر). */
async function refreshDay(shop: Shop): Promise<{ tickets: Ticket[]; closed: boolean; now: Date }> {
  const db = await getDb();
  const now = clockNow();
  const day = dayKey(now);
  const tickets = await repo.listDayTickets(db, shop.id, day);
  const qd = await repo.getDay(db, shop.id, day);
  if (!planTick(tickets, now, shop.settings).length) return { tickets, closed: qd.closed, now };
  const r = await mutate(shop, () => ({ actions: [], result: null }));
  return { tickets: r.tickets, closed: qd.closed, now };
}

/** يُغلق تذاكر الأيّام السابقة التي بقيت مفتوحة. */
export async function closeStaleTickets(shopId: string | null): Promise<number> {
  const db = await getDb();
  const now = clockNow();
  const stale = await repo.listStaleOpenTickets(db, shopId, dayKey(now));
  if (!stale.length) return 0;
  const actions = planCloseStale(stale, now);
  const byId = new Map(stale.map((t) => [t.id, t]));
  await db.tx(async (q) => {
    for (const a of actions) {
      if (a.kind === "update") await repo.updateTicket(q, a.id, a.expect, a.patch);
      else if (a.kind === "noShow") {
        const t = byId.get(a.id)!;
        if (t.phone) await repo.insertNoShow(q, t.shopId, t.phone, t.id, now);
      }
    }
  });
  return stale.length;
}

// ————————————————————————— إنشاء محلّ —————————————————————————

const KINDS: ShopKind[] = ["doctor", "dentist", "lab", "barber", "other"];

export async function createShop(input: {
  name?: unknown;
  slug?: unknown;
  kind?: unknown;
  pin?: unknown;
  lang?: unknown;
  signupCode?: unknown;
  doctorName?: unknown;
  email?: unknown;
}) {
  const required = process.env.SIGNUP_CODE;
  if (required && !(typeof input.signupCode === "string" && safeEqual(input.signupCode, required))) {
    throw new DomainError("bad_signup_code", 403);
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) throw new DomainError("invalid_name");
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug) || ["api", "new", "staff", "admin"].includes(slug)) {
    throw new DomainError("invalid_slug");
  }
  if (!isValidPin(input.pin)) throw new DomainError("invalid_pin");
  const ownerEmail = cleanEmail(input.email);
  const kind = KINDS.includes(input.kind as ShopKind) ? (input.kind as ShopKind) : "doctor";
  const db = await getDb();
  if (await repo.getShopBySlug(db, slug)) throw new DomainError("slug_taken", 409);
  const now = clockNow();
  try {
    const shop = await repo.insertShop(db, {
      slug,
      name,
      kind,
      pinHash: hashPin(input.pin),
      doorCode: randomToken(6),
      hours: DEFAULT_HOURS,
      settings: DEFAULT_SETTINGS,
      defaultLang: langOf(input.lang, "ar"),
      trialEndsAt: new Date(now.getTime() + 60 * DAY_MS), // مجّاني أوّل شهرين
      ownerEmail,
    });
    if (typeof input.doctorName === "string" && input.doctorName.trim()) {
      const profile = cleanProfile({ ...shop.profile, doctorName: input.doctorName });
      await repo.updateShop(db, shop.id, { profile });
      return { ...shop, profile };
    }
    return shop;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new DomainError("slug_taken", 409);
    throw e;
  }
}

// ————————————————————————— صفحة المحلّ العامّة —————————————————————————

export async function publicShop(slug: string) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const { tickets, closed, now } = await refreshDay(shop);
  const cur = currentTicket(tickets);
  const lt = localTime(now);
  const avg = averageServiceMinutes(tickets, shop.settings.defaultServiceMin);
  const waiting = lineup(tickets).filter((t) => !t.held).length;
  // انتظار من يأخذ رقماً الآن
  const waitNewMin = cur?.calledAt
    ? Math.ceil(Math.max(avg - minutesBetween(cur.calledAt, now), 1) + waiting * avg)
    : Math.ceil(waiting * avg);
  return {
    shop,
    view: {
      slug: shop.slug,
      name: shop.name,
      kind: shop.kind,
      profile: shop.profile,
      look: shop.look,
      waitNewMin,
      blocker: ticketBlocker(shop, closed, now, tickets.length),
      /** وقت استئناف أخذ الأرقام اليوم (استراحة أو قبل الافتتاح) */
      resumesAt: nextOpeningToday(shop.hours, now)?.at ?? null,
      hoursToday: shop.hours[String(lt.weekday)] ?? [],
      currentNumber: cur?.number ?? null,
      waiting,
      avgServiceMin: Math.round(avg),
      verifyPhone: phoneVerificationOn(),
      waVerify: waConfig().enabled,
      smsVerify: getSms() !== null || (await clinicSendsCodes(shop.id)),
      nextNumbers: lineup(tickets)
        .filter((t) => !t.held)
        .slice(0, 3)
        .map((t) => t.number),
    },
  };
}

export type PublicShopView = Awaited<ReturnType<typeof publicShop>>["view"];

// ————————————————————————— أخذ رقم —————————————————————————

export async function requestCode(slug: string, body: { name?: unknown; phone?: unknown; lang?: unknown }) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  cleanName(body.name);
  const phone = requirePhone(body.phone);
  const now = clockNow();
  const qd = await repo.getDay(db, shop.id, dayKey(now));
  // من لديه تذكرة اليوم يستطيع استرجاعها بالرمز حتى خارج الساعات
  const existing = await repo.findTicketByPhone(db, shop.id, dayKey(now), phone);
  if (!existing) {
    const blocker = ticketBlocker(shop, qd.closed, now, qd.lastNumber);
    if (blocker) throw new DomainError(blocker, 409);
  }
  if (!phoneVerificationOn()) return { sent: false, verify: false, devCode: undefined as string | undefined };
  const sms = await codeSender(shop, getSms()); // هاتف العيادة أوّلاً (إن فعّلت ذلك) ثمّ المزوّد العامّ
  if (!sms) throw new DomainError("sms_unavailable", 503);
  if ((await repo.countRecentCodes(db, shop.id, phone, new Date(now.getTime() - 30 * 60000))) >= 3) {
    throw new DomainError("too_many_codes", 429);
  }
  if ((await repo.countRecentCodes(db, shop.id, null, new Date(now.getTime() - 60 * 60000))) >= 200) {
    throw new DomainError("too_many_codes", 429);
  }
  const code = randomDigits(6);
  await repo.insertCode(db, shop.id, phone, hashCode(shop.id, phone, code), now, new Date(now.getTime() + 10 * 60000));
  try {
    await sms.send(phone, code, langOf(body.lang, shop.defaultLang));
  } catch (e) {
    console.error("[sms]", e);
    throw new DomainError("sms_failed", 502);
  }
  return { sent: true, verify: true, devCode: demoMode() ? code : undefined };
}

async function verifyCode(q: Q, shop: Shop, phone: string, code: unknown, now: Date) {
  if (!phoneVerificationOn()) return;
  const c = typeof code === "string" ? code.trim() : "";
  const row = await repo.latestCode(q, shop.id, phone, now);
  if (!row || row.attempts >= 5) throw new DomainError("code_expired");
  if (!/^\d{6}$/.test(c) || !safeEqual(hashCode(shop.id, phone, c), row.code_hash)) {
    await repo.markCodeAttempt(q, row.id, false, now);
    throw new DomainError("invalid_code");
  }
  await repo.markCodeAttempt(q, row.id, true, now);
}

export async function takeTicket(
  slug: string,
  body: { name?: unknown; phone?: unknown; code?: unknown; door?: unknown; lang?: unknown },
): Promise<{ ticketId: string; existing: boolean }> {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const name = cleanName(body.name);
  const phone = requirePhone(body.phone);
  await verifyCode(db, shop, phone, body.code, clockNow());
  const atDoor = typeof body.door === "string" && safeEqual(body.door, shop.doorCode);
  const { ticketId, existing } = await issueTicket(shop, { name, phone, lang: langOf(body.lang, shop.defaultLang), atDoor });
  return { ticketId, existing };
}

/** رمز واتساب قصير للتذكرة، فريد في اليوم على مستوى المنصّة (رقم «دوري» واحد). */
async function freshWaCode(q: Q, day: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = shortCode();
    if (!(await repo.findTicketByWaCode(q, day, code))) return code;
  }
  return shortCode(7).slice(0, 5);
}

/**
 * يُصدر تذكرة لهاتف تحقّقنا منه (برمز SMS أو بواتساب).
 * تذكرة واحدة لكلّ هاتف في اليوم: إن وُجدت نُرجعها (ونسجّل الوصول إن كان عند الباب).
 */
export async function issueTicket(
  shop: Shop,
  o: { name: string; phone: string; lang: Lang; atDoor: boolean; wa?: { userId: string | null; phone: string | null; windowUntil: Date } },
): Promise<{ ticketId: string; existing: boolean; ticket: Ticket; tickets: Ticket[] }> {
  const { result, tickets } = await mutate(shop, async ({ q, now, day, closed, tickets }) => {
    const existing = tickets.find((t) => t.phone === o.phone);
    if (existing) {
      if (o.wa) await repo.waLinkTicket(q, existing.id, o.wa);
      const actions =
        o.atDoor && ["waiting", "called", "deferred"].includes(existing.status) ? safeCheckIn(existing, now, shop) : [];
      return { actions, result: { ticketId: existing.id, existing: true } };
    }
    const blocker = ticketBlocker(shop, closed, now, tickets.length);
    if (blocker) throw new DomainError(blocker, 409);
    const since = new Date(now.getTime() - NO_SHOW_RETENTION_DAYS * DAY_MS);
    const noShows = await repo.countNoShows(q, shop.id, o.phone, since);
    const number = await repo.allocateNumber(q, shop.id, day);
    const flags = initialFlags(tickets, shop.settings, now, { arrived: o.atDoor, source: "online" });
    const ticket = await repo.insertTicket(q, {
      shopId: shop.id,
      day,
      number,
      name: o.name,
      phone: o.phone,
      lang: o.lang,
      source: "online",
      status: noShows >= shop.settings.noShowLimit ? "pending_approval" : "waiting",
      createdAt: now,
      arrivedAt: flags.arrivedAt ?? null,
      confirmedAt: flags.confirmedAt ?? null,
      notifiedSoonAt: flags.notifiedSoonAt ?? null,
      waCode: await freshWaCode(q, day),
    });
    if (o.wa) await repo.waLinkTicket(q, ticket.id, o.wa);
    return { actions: [], result: { ticketId: ticket.id, existing: false } };
  });
  return { ...result, ticket: tickets.find((t) => t.id === result.ticketId)!, tickets };
}

// ————————————————————————— واتساب —————————————————————————

/** الخطوة 1: المريض يكتب اسمه (وهاتفه) ← نعطيه رابط wa.me برمز قصير. */
export async function startWaVerification(
  slug: string,
  body: { name?: unknown; phone?: unknown; lang?: unknown; door?: unknown },
) {
  if (!waConfig().enabled) throw new DomainError("wa_unavailable", 503);
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const name = cleanName(body.name);
  const phone = requirePhone(body.phone);
  const now = clockNow();
  const qd = await repo.getDay(db, shop.id, dayKey(now));
  const existing = await repo.findTicketByPhone(db, shop.id, dayKey(now), phone);
  if (!existing) {
    const blocker = ticketBlocker(shop, qd.closed, now, qd.lastNumber);
    if (blocker) throw new DomainError(blocker, 409);
  }
  if ((await repo.countRecentWaVerifications(db, shop.id, phone, new Date(now.getTime() - 30 * 60000))) >= 5) {
    throw new DomainError("too_many_codes", 429);
  }
  const lang = langOf(body.lang, shop.defaultLang);
  const atDoor = typeof body.door === "string" && safeEqual(body.door, shop.doorCode);
  for (let i = 0; i < 5; i++) {
    try {
      const v = await repo.insertWaVerification(db, {
        shopId: shop.id,
        code: shortCode(),
        name,
        phone,
        lang,
        atDoor,
        now,
        expiresAt: new Date(now.getTime() + 20 * 60000),
      });
      return { id: v.id, code: `V-${v.code}`, link: waLink(verifyMessage(v.code))! };
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new DomainError("generic", 500);
}

/** الخطوة 2: الصفحة تسأل: هل وصلت رسالته؟ */
export async function waVerificationStatus(slug: string, id: string) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const v = await repo.getWaVerification(db, id);
  if (!v || v.shopId !== shop.id) throw new DomainError("not_found", 404);
  if (v.ticketId) return { status: "done" as const, ticketId: v.ticketId, reason: null };
  if (v.failedReason) return { status: "failed" as const, ticketId: null, reason: v.failedReason };
  if (v.expiresAt < clockNow()) return { status: "expired" as const, ticketId: null, reason: null };
  return { status: "pending" as const, ticketId: null, reason: null };
}

function waTexts(lang: Lang) {
  return {
    t: (k: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang, k, vars),
  };
}

function ticketUrl(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/t/${id}` : null;
}

/** يعالج رسائل واتساب الواردة (بعد التحقّق من التوقيع). */
export async function handleWhatsappInbound(payload: unknown) {
  const db = await getDb();
  for (const m of parseInbound(payload)) {
    if (!(await repo.waMarkInbound(db, m.id))) continue; // عولجت من قبل
    const now = clockNow();
    const phone = m.from ? normalizePhone(`+${m.from}`) : null;
    const who = { userId: m.userId, phone };
    // الردّ يذهب إلى رقم المرسل كما هو (حتى غير الجزائري)، أمّا «الهاتف المؤكَّد» فجزائري فقط
    const me: WaRecipient = { phone: m.from ? `+${m.from}` : null, userId: m.userId };
    const windowUntil = new Date(m.timestamp.getTime() + DAY_MS);
    await repo.waTouchUser(db, who, windowUntil, dayKey(new Date(now.getTime() - DAY_MS)));
    const intent = parseIntent(m.text, m.buttonId);
    try {
      await handleIntent(intent, { db, now, who, me, windowUntil });
    } catch (e) {
      console.error("[whatsapp] intent", intent.kind, e);
    }
  }
}

async function handleIntent(
  intent: ReturnType<typeof parseIntent>,
  c: { db: Q; now: Date; who: { userId: string | null; phone: string | null }; me: WaRecipient; windowUntil: Date },
) {
  const reply = (text: string) => waSendText(c.me, text).catch((e) => console.error("[whatsapp] reply", e));
  if (intent.kind === "verify") {
    const v = await repo.getWaVerificationByCode(c.db, intent.code);
    const lang = (v?.lang === "fr" ? "fr" : "ar") as Lang;
    const { t: tr } = waTexts(lang);
    if (!v) return reply(tr("wa_codeExpired"));
    const shop = (await repo.getShopById(c.db, v.shopId))!;
    let ticketId = v.ticketId;
    if (ticketId) {
      // رمز مستعمل: لا نكشف التذكرة إلّا لصاحبها
      const owner = await repo.getTicket(c.db, ticketId);
      const same = owner && ((c.who.userId && owner.waUserId === c.who.userId) || (c.who.phone && owner.waPhone === c.who.phone));
      if (!same) return reply(tr("wa_codeExpired"));
    } else {
      if (v.expiresAt < c.now) return reply(tr("wa_codeExpired"));
      // الرقم الوحيد المقبول هو رقم الواتساب الذي أرسل الرسالة فعلاً (جوّال جزائري).
      // لا نعتمد أبداً الرقم المكتوب في الصفحة: وإلّا أمكن انتحال تذكرة شخص آخر.
      if (!c.who.phone) {
        await repo.failWaVerification(c.db, v.id, "wa_need_dz");
        return reply(tr("wa_needDz"));
      }
      try {
        const r = await issueTicket(shop, {
          name: v.name,
          phone: c.who.phone,
          lang,
          atDoor: v.atDoor,
          wa: { ...c.who, windowUntil: c.windowUntil },
        });
        ticketId = r.ticketId;
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        await repo.failWaVerification(c.db, v.id, e.code);
        return reply(errorText(lang, e.code));
      }
      await repo.completeWaVerification(c.db, v.id, ticketId, c.now);
    }
    const view = await ticketView(ticketId);
    const url = ticketUrl(ticketId);
    const ahead = view.ahead === null ? "" : view.ahead === 0 ? tr("ahead0") : aheadText(lang, view.ahead);
    return reply(
      [tr("wa_ticketOk", { shop: shop.name, n: view.number }), ahead, tr("wa_willAlert"), url].filter(Boolean).join("\n"),
    );
  }
  if (intent.kind === "alerts") {
    const ticket = await repo.findTicketByWaCode(c.db, dayKey(c.now), intent.code);
    if (!ticket || !["pending_approval", "waiting", "called", "deferred"].includes(ticket.status)) {
      return reply(t("ar", "wa_codeExpired") + "\n" + t("fr", "wa_codeExpired"));
    }
    await repo.waLinkTicket(c.db, ticket.id, { ...c.who, windowUntil: c.windowUntil });
    const shop = (await repo.getShopById(c.db, ticket.shopId))!;
    return reply(t(ticket.lang, "wa_alertsOn", { shop: shop.name, n: ticket.number }));
  }
  if (intent.kind === "coming" || intent.kind === "cancel") {
    const ticket = await repo.getTicket(c.db, intent.ticketId);
    // الزرّ يعمل فقط لصاحب التذكرة
    if (!ticket || !((c.who.userId && ticket.waUserId === c.who.userId) || (c.who.phone && ticket.waPhone === c.who.phone))) return;
    try {
      await ticketAction(ticket.id, { action: intent.kind === "coming" ? "confirm" : "cancel" });
      return reply(t(ticket.lang, intent.kind === "coming" ? "wa_thanksComing" : "wa_cancelled"));
    } catch {
      return reply(t(ticket.lang, "err_ticket_closed"));
    }
  }
  if (intent.kind === "stop") {
    await repo.waOptOut(c.db, c.who, dayKey(new Date(c.now.getTime() - DAY_MS)));
    return reply(`${t("ar", "wa_stopped")}\n${t("fr", "wa_stopped")}`);
  }
  return reply(`${t("ar", "wa_help")}\n${t("fr", "wa_help")}`);
}
function safeCheckIn(ticket: Ticket, now: Date, shop: Shop): Action[] {
  try {
    return planCheckIn(ticket, now, shop.settings);
  } catch {
    return [];
  }
}

// ————————————————————————— صفحة التذكرة —————————————————————————

export async function ticketView(id: string) {
  const db = await getDb();
  const found = await repo.getTicket(db, id);
  if (!found) throw new DomainError("ticket_not_found", 404);
  const shop = (await repo.getShopById(db, found.shopId))!;
  const today = dayKey(clockNow());
  let tickets: Ticket[] = [];
  let now = clockNow();
  if (found.day === today) ({ tickets, now } = await refreshDay(shop));
  const ticket = tickets.find((x) => x.id === id) ?? found;
  const s = shop.settings;
  const ahead = found.day === today ? peopleAhead(tickets, ticket) : null;
  const cur = currentTicket(tickets);
  const isOpen = ["pending_approval", "waiting", "called", "deferred"].includes(ticket.status);
  return {
    id: ticket.id,
    number: ticket.number,
    name: ticket.name,
    status: found.day === today || !isOpen ? ticket.status : "expired",
    held: ticket.held,
    lang: ticket.lang,
    arrived: Boolean(ticket.arrivedAt),
    shop: { slug: shop.slug, name: shop.name, kind: shop.kind, profile: shop.profile, look: shop.look },
    createdAt: ticket.createdAt.toISOString(),
    /** كم شخصاً نودي منذ أخذ رقمه (لشريط التقدّم) */
    servedSince: tickets.filter((x) => x.id !== ticket.id && x.calledAt && x.calledAt > ticket.createdAt).length,
    calledAt: ticket.calledAt?.toISOString() ?? null,
    serverTime: now.toISOString(),
    currentNumber: cur?.number ?? null,
    ahead,
    etaMin: ahead === null ? null : estimateWaitMinutes(tickets, ticket, now, s),
    askConfirm:
      ticket.status === "waiting" &&
      (ticket.held || (Boolean(ticket.confirmAskedAt) && !ticket.confirmedAt && !ticket.arrivedAt)),
    // قبل أن يبدأ الطبيب لا نقول «تعال الآن» لمن أخذ رقمه على السادسة صباحاً
    comeNow:
      ticket.status === "waiting" && !ticket.held && ahead !== null && ahead <= s.notifyAhead && queueStarted(tickets),
    deferredLeftMin:
      ticket.status === "deferred" && ticket.deferredAt
        ? Math.max(0, Math.ceil(s.lateWindowMin - minutesBetween(ticket.deferredAt, now)))
        : null,
    confirmTimeoutMin: s.confirmTimeoutMin,
    lateWindowMin: s.lateWindowMin,
    pushKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    wa: {
      linked: Boolean(ticket.waUserId || ticket.waPhone) && !ticket.waOptOut,
      link: waConfig().enabled && ticket.waCode ? waLink(alertsMessage(ticket.waCode)) : null,
    },
  };
}

export type TicketView = Awaited<ReturnType<typeof ticketView>>;

export async function ticketAction(id: string, body: { action?: unknown; door?: unknown }) {
  const db = await getDb();
  const ticket = await repo.getTicket(db, id);
  if (!ticket) throw new DomainError("ticket_not_found", 404);
  const shop = (await repo.getShopById(db, ticket.shopId))!;
  if (ticket.day !== dayKey(clockNow())) throw new DomainError("ticket_closed", 409);
  const action = body.action;
  if (action === "checkin" && !(typeof body.door === "string" && safeEqual(body.door, shop.doorCode))) {
    throw new DomainError("bad_door_code", 403);
  }
  await mutate(shop, ({ tickets, now }) => {
    const t = tickets.find((x) => x.id === id)!;
    switch (action) {
      case "confirm":
        return { actions: planConfirm(t, now), result: null };
      case "cancel":
        return { actions: planCancel(t, now), result: null };
      case "checkin":
        return { actions: planCheckIn(t, now, shop.settings), result: null };
      default:
        throw new DomainError("invalid_action");
    }
  });
  return ticketView(id);
}

export async function savePush(id: string, body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  const db = await getDb();
  const ticket = await repo.getTicket(db, id);
  if (!ticket) throw new DomainError("ticket_not_found", 404);
  const { endpoint, keys } = body;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) {
    throw new DomainError("invalid_subscription");
  }
  if (typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") throw new DomainError("invalid_subscription");
  await repo.savePushSub(db, id, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
  return { ok: true };
}

// ————————————————————————— السكرتيرة —————————————————————————

export async function staffLogin(slug: string, pin: unknown) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const now = clockNow();
  // نحتسب المحاولة ذرّياً قبل التحقّق: لا يمكن تجاوز القفل بطلبات متزامنة
  if (!(await repo.claimLoginAttempt(db, shop.id, now))) throw new DomainError("locked", 429);
  const ok = typeof pin === "string" && isValidPin(pin) && verifyPin(pin, shop.pinHash);
  if (!ok) throw new DomainError("wrong_pin", 401);
  await repo.resetLoginAttempts(db, shop.id);
  return { shop, token: sessionFor(shop, now) };
}

export function sessionFor(shop: Shop, now: Date) {
  return signSession({ shopId: shop.id, v: shop.sessionVersion, exp: now.getTime() + 30 * DAY_MS });
}

export async function staffState(shop: Shop) {
  await closeStaleTickets(shop.id);
  const { tickets, closed, now } = await refreshDay(shop);
  const db = await getDb();
  const since = new Date(now.getTime() - NO_SHOW_RETENTION_DAYS * DAY_MS);
  const row = (t: Ticket) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    phone: formatPhone(t.phone),
    source: t.source,
    arrived: Boolean(t.arrivedAt),
    confirmed: Boolean(t.confirmedAt),
    asked: Boolean(t.confirmAskedAt) && !t.confirmedAt,
    held: t.held,
  });
  const pending = await Promise.all(
    tickets
      .filter((t) => t.status === "pending_approval")
      .sort((a, b) => a.number - b.number)
      .map(async (t) => ({ ...row(t), noShows: t.phone ? await repo.countNoShows(db, shop.id, t.phone, since) : 0 })),
  );
  const cur = currentTicket(tickets);
  const lt = localTime(now);
  const from = dayKey(new Date(now.getTime() - 6 * DAY_MS));
  return {
    shop: {
      slug: shop.slug,
      name: shop.name,
      kind: shop.kind,
      trialEndsAt: shop.trialEndsAt.toISOString(),
      paidUntil: shop.paidUntil?.toISOString() ?? null,
      active: isSubscriptionActive(shop, now),
      noShowLimit: shop.settings.noShowLimit,
      callGraceMin: shop.settings.callGraceMin,
      profileComplete: Boolean(shop.profile.address || shop.profile.phone || shop.profile.doctorName),
      hasEmail: Boolean(shop.ownerEmail),
    },
    closed,
    blocker: ticketBlocker(shop, closed, now, tickets.length),
    hoursToday: shop.hours[String(lt.weekday)] ?? [],
    current: cur
      ? { ...row(cur), minutes: cur.calledAt ? Math.floor(minutesBetween(cur.calledAt, now)) : 0 }
      : null,
    waiting: lineup(tickets).map((t) => ({ ...row(t), eta: t.held ? null : estimateWaitMinutes(tickets, t, now, shop.settings) })),
    pending,
    deferred: tickets
      .filter((t) => t.status === "deferred")
      .map((t) => ({
        ...row(t),
        minutesLeft: Math.max(0, Math.ceil(shop.settings.lateWindowMin - minutesBetween(t.deferredAt!, now))),
      })),
    stats: dayStats(tickets),
    avgServiceMin: Math.round(averageServiceMinutes(tickets, shop.settings.defaultServiceMin)),
    history: await repo.dailyStats(db, shop.id, from),
    serverTime: now.toISOString(),
  };
}

export type StaffState = Awaited<ReturnType<typeof staffState>>;

export async function staffAction(
  shop: Shop,
  body: { action?: unknown; ticketId?: unknown; current?: unknown; name?: unknown; phone?: unknown; present?: unknown },
) {
  const action = body.action;
  if (action === "open" || action === "close") {
    await mutate(shop, async ({ q, day }) => {
      await repo.setDayClosed(q, shop.id, day, action === "close");
      return { actions: [], result: null };
    });
    return { ok: true };
  }
  if (action === "add") {
    const name = cleanName(body.name);
    const phone = body.phone ? requirePhone(body.phone) : null;
    const present = body.present !== false;
    const { result } = await mutate(shop, async ({ q, now, day, tickets }) => {
      if (phone && tickets.some((t) => t.phone === phone)) throw new DomainError("already_has_ticket", 409);
      const number = await repo.allocateNumber(q, shop.id, day);
      const flags = initialFlags(tickets, shop.settings, now, { arrived: present, source: "desk" });
      await repo.insertTicket(q, {
        shopId: shop.id,
        day,
        number,
        name,
        phone,
        lang: shop.defaultLang,
        source: "desk",
        status: "waiting",
        createdAt: now,
        arrivedAt: flags.arrivedAt ?? null,
        confirmedAt: flags.confirmedAt ?? null,
        notifiedSoonAt: flags.notifiedSoonAt ?? null,
      });
      return { actions: [], result: number };
    });
    return { ok: true, number: result };
  }

  await mutate(shop, ({ tickets, now }) => {
    const cur = currentTicket(tickets);
    if (action === "next" || action === "no_show_next") {
      // حماية من الضغط المزدوج على شبكة بطيئة: الطلب يذكر من كان «الحالي» عند الضغط
      const expected = body.current ?? null;
      if ((cur?.id ?? null) !== expected) throw new DomainError("conflict", 409);
      return { actions: planNext(tickets, now, action === "next" ? "done" : "no_show"), result: null };
    }
    if (action === "recall") {
      if (!cur) throw new DomainError("ticket_closed", 409);
      return { actions: [{ kind: "notify", id: cur.id, type: "called" }], result: null };
    }
    const t = tickets.find((x) => x.id === body.ticketId);
    if (!t) throw new DomainError("ticket_not_found", 404);
    switch (action) {
      case "arrived":
        return { actions: planCheckIn(t, now, shop.settings), result: null };
      case "approve":
        return { actions: planApprove(t), result: null };
      case "reject":
        return { actions: planReject(t, now), result: null };
      case "cancel":
        return { actions: planCancel(t, now), result: null };
      default:
        throw new DomainError("invalid_action");
    }
  });
  return { ok: true };
}

function cleanProfile(v: unknown): ShopProfile {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (x: unknown, max: number) => {
    const t = typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";
    if (t.length > max) throw new DomainError("invalid_settings");
    return t || null;
  };
  const mapsUrl = str(o.mapsUrl, 500);
  if (mapsUrl && !/^https:\/\/\S+$/.test(mapsUrl)) throw new DomainError("invalid_settings");
  const phone = str(o.phone, 20);
  if (phone && !/^[+\d][\d\s-]{5,19}$/.test(phone)) throw new DomainError("invalid_settings");
  return {
    doctorName: str(o.doctorName, 80),
    specialty: str(o.specialty, 80),
    address: str(o.address, 160),
    phone,
    mapsUrl,
  };
}

const SETTING_LIMITS: Record<keyof ShopSettings, [number, number]> = {
  confirmAhead: [1, 30],
  confirmTimeoutMin: [2, 60],
  notifyAhead: [1, 20],
  callGraceMin: [0, 30],
  lateWindowMin: [5, 120],
  noShowLimit: [1, 10],
  defaultServiceMin: [1, 120],
  dailyLimit: [0, 500],
};

export async function updateSettings(
  shop: Shop,
  body: {
    name?: unknown;
    hours?: unknown;
    settings?: Record<string, unknown>;
    lang?: unknown;
    newPin?: unknown;
    rotateDoor?: unknown;
    profile?: unknown;
    look?: unknown;
    email?: unknown;
  },
) {
  const db = await getDb();
  const patch: Parameters<typeof repo.updateShop>[2] = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) throw new DomainError("invalid_name");
    patch.name = name;
  }
  if (body.hours !== undefined) {
    if (!isValidHours(body.hours)) throw new DomainError("invalid_settings");
    patch.hours = body.hours as WeeklyHours;
  }
  if (body.settings !== undefined) {
    const next: ShopSettings = { ...shop.settings };
    for (const [k, [min, max]] of Object.entries(SETTING_LIMITS) as [keyof ShopSettings, [number, number]][]) {
      const v = body.settings?.[k];
      if (v === undefined) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new DomainError("invalid_settings");
      next[k] = n;
    }
    if (next.notifyAhead > next.confirmAhead) throw new DomainError("invalid_settings");
    patch.settings = next;
  }
  if (body.lang !== undefined) patch.defaultLang = langOf(body.lang, shop.defaultLang);
  if (body.newPin) {
    if (!isValidPin(body.newPin)) throw new DomainError("invalid_pin");
    patch.pinHash = hashPin(body.newPin);
    patch.bumpSession = true;
  }
  if (body.rotateDoor === true) patch.doorCode = randomToken(6);
  if (body.profile !== undefined) patch.profile = cleanProfile(body.profile);
  if (body.email !== undefined) patch.ownerEmail = cleanEmail(body.email);
  if (body.look !== undefined) {
    const o = (body.look && typeof body.look === "object" ? body.look : null) as Record<string, unknown> | null;
    if (!o) throw new DomainError("invalid_settings");
    const look = { ...shop.look };
    if (o.theme !== undefined) {
      if (!isTheme(o.theme)) throw new DomainError("invalid_settings");
      look.theme = o.theme;
    }
    if (o.custom !== undefined) {
      if (o.custom !== null && !isHexColor(o.custom)) throw new DomainError("invalid_settings");
      look.custom = o.custom === null ? null : o.custom.toLowerCase();
    }
    if (o.display !== undefined) {
      if (!isDisplayStyle(o.display)) throw new DomainError("invalid_settings");
      look.display = o.display;
    }
    if (look.theme === "custom" && !look.custom) throw new DomainError("invalid_settings");
    patch.look = look;
  }
  await repo.updateShop(db, shop.id, patch);
  return (await repo.getShopById(db, shop.id))!;
}

// ————————————————————————— استعادة الرمز السرّي —————————————————————————

/** بريد صاحب العيادة: إلزامي وصالح (هو طريق استعادة الرمز). */
function cleanEmail(v: unknown): string {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (e.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new DomainError("invalid_email");
  return e;
}

const resetHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const RESET_TTL_MIN = 30;

/**
 * «نسيت الرمز»: يرسل رابط إعادة التعيين إلى بريد العيادة إن طابق البريد المكتوب.
 * الجواب واحد دائماً (لا نكشف هل البريد صحيح أم لا).
 */
export async function requestPinReset(slug: string, email: unknown, baseUrl: string) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  const mailer = getMailer();
  if (!mailer) throw new DomainError("email_unavailable", 503);
  const typed = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!shop.ownerEmail || !typed || !safeEqual(typed, shop.ownerEmail)) return { ok: true };
  const now = clockNow();
  // حدّ: 3 روابط في الساعة لكلّ عيادة (منع إغراق البريد)
  if ((await repo.countRecentPinResets(db, shop.id, new Date(now.getTime() - 3600_000))) >= 3) return { ok: true };
  const token = randomToken(24);
  await repo.insertPinReset(db, shop.id, resetHash(token), now, new Date(now.getTime() + RESET_TTL_MIN * 60_000));
  const lang = shop.defaultLang;
  const link = `${baseUrl}/staff/${shop.slug}/reset?t=${encodeURIComponent(token)}`;
  const subject = t(lang, "rs_mailSubject", { name: shop.name });
  const body = t(lang, "rs_mailBody", { name: shop.name, min: RESET_TTL_MIN });
  const ignore = t(lang, "rs_mailIgnore");
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0b1b2b">
<h2 style="margin:0 0 12px">دوري · Dawri</h2>
<p style="line-height:1.7">${esc(body)}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:bold;display:inline-block">${esc(t(lang, "rs_mailButton"))}</a></p>
<p style="color:#64748b;font-size:13px;line-height:1.6">${esc(ignore)}</p>
</div>`;
  try {
    await mailer.send({ to: shop.ownerEmail, subject, html, text: `${body}\n\n${link}\n\n${ignore}` });
  } catch (e) {
    console.error("[email]", e);
    throw new DomainError("email_unavailable", 503);
  }
  return { ok: true };
}

/** يضبط رمزاً جديداً من رابط البريد، ويُبطل كلّ الجلسات القديمة ويفكّ القفل. */
export async function resetPinWithToken(slug: string, token: unknown, pin: unknown) {
  const db = await getDb();
  const shop = await shopOr404(db, slug);
  if (!isValidPin(pin)) throw new DomainError("invalid_pin");
  if (typeof token !== "string" || token.length < 16 || token.length > 100) throw new DomainError("reset_invalid", 400);
  const now = clockNow();
  const updated = await db.tx(async (q) => {
    if (!(await repo.consumePinReset(q, shop.id, resetHash(token), now))) throw new DomainError("reset_invalid", 400);
    await repo.voidPinResets(q, shop.id, now);
    await repo.updateShop(q, shop.id, { pinHash: hashPin(pin), bumpSession: true });
    await repo.resetLoginAttempts(q, shop.id);
    return (await repo.getShopById(q, shop.id))!;
  });
  return { shop: updated, token: sessionFor(updated, now) };
}

/** لوحة المؤسّس: رمز مؤقّت جديد لعيادة (حين لا يوجد بريد). */
export async function adminResetPin(shopId: string) {
  const db = await getDb();
  const shop = await repo.getShopById(db, shopId);
  if (!shop) throw new DomainError("shop_not_found", 404);
  const pin = randomDigits(6);
  await repo.updateShop(db, shop.id, { pinHash: hashPin(pin), bumpSession: true });
  await repo.resetLoginAttempts(db, shop.id);
  await repo.voidPinResets(db, shop.id, clockNow());
  return { pin };
}

// ————————————————————————— المهامّ الدورية —————————————————————————

export async function runCron() {
  const db = await getDb();
  const now = clockNow();
  const stale = await closeStaleTickets(null);
  const purged = await repo.purgeOld(
    db,
    new Date(now.getTime() - NO_SHOW_RETENTION_DAYS * DAY_MS), // سجلّ الغياب يُمحى بعد شهرين
    new Date(now.getTime() - DAY_MS),
    new Date(now.getTime() - TICKET_RETENTION_DAYS * DAY_MS), // الاسم والهاتف يُمحيان بعد 30 يوماً
  );
  await repo.purgeWa(db, new Date(now.getTime() - 2 * DAY_MS));
  // صفحات دفع Chargily تنتهي بعد 30 دقيقة: ما بقي معلّقاً بعد ساعة = لم يكتمل
  await repo.expireStalePayments(db, new Date(now.getTime() - 3600_000));
  return { stale, ...purged };
}
