/**
 * التقرير اليومي للطبيب (بريد إلكتروني) — يُرسل من runCron (03:00 بتوقيت الجزائر) عن يوم الأمس.
 * أعداد فقط: لا أسماء ولا هواتف. مرّة واحدة لكلّ عيادة ولكلّ يوم (report_log).
 * قابل للاستئناف: sent_at يُثبَّت بعد نجاح الإرسال فقط، والحجز المعلّق يُستعاد بعد 10 دقائق،
 * وكلّ تشغيل يغطّي آخر 3 أيّام لم يُرسل تقريرها (مهلة Vercel أو عطل البريد لا يُضيّعان يوماً).
 */
import { DomainError, type Lang, type Shop } from "../domain/types";
import { dayKey } from "../domain/time";
import { t, type DictKey } from "../i18n";
import { now as clockNow } from "./clock";
import { getDb, type Q } from "./db";
import { getMailer, type Mail } from "./email";
import * as repo from "./repo";

const DAY_MS = 86_400_000;
export const PREVIEW_PER_DAY = 3;
/** إرسالات متزامنة كحدّ أقصى */
export const REPORT_CONCURRENCY = 5;
/** نتوقّف عن بدء إرسالات جديدة بعد هذه المدّة (maxDuration للمسار = 60 ث) */
export const REPORT_BUDGET_MS = 45_000;
/** حجز بلا إرسال ناجح أقدم من هذا = مهمّة انقطعت ← يُعاد حجزه */
export const REPORT_CLAIM_STALE_MS = 10 * 60_000;
/** أمس + اليومان السابقان (إن لم يُرسل تقريرهما بنجاح) */
export const REPORT_BACKLOG_DAYS = 3;

export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export interface DayReport {
  day: string;
  total: number;
  served: number;
  online: number;
  desk: number;
  noShows: number;
  avgWaitMin: number | null;
  avgServiceMin: number | null;
  busiestHour: number | null;
  /** دقائق انتظرها مرضى «عن بُعد» خارج العيادة (called_at − created_at) */
  savedMin: number;
  lastWeekServed: number;
  /** التغيّر مقارنة بنفس اليوم من الأسبوع الماضي (٪)، null إن لم يكن هناك مرضى */
  changePct: number | null;
}

async function dayNumbers(q: Q, shopId: string, day: string) {
  const rows = await q.query<Record<string, number | null>>(
    `select count(*)::int as total,
            count(*) filter (where status = 'done')::int as served,
            count(*) filter (where source = 'online')::int as online,
            count(*) filter (where source = 'desk')::int as desk,
            count(*) filter (where status = 'no_show')::int as no_shows,
            round(avg(extract(epoch from (called_at - created_at)) / 60) filter (where called_at is not null))::int as avg_wait,
            round(avg(extract(epoch from (done_at - called_at)) / 60)
                  filter (where status = 'done' and done_at is not null and called_at is not null))::int as avg_service,
            coalesce(round(sum(extract(epoch from (called_at - created_at)) / 60)
                  filter (where source = 'online' and called_at is not null and called_at > created_at)), 0)::int as saved
     from tickets where shop_id = $1 and day = $2`,
    [shopId, day],
  );
  return rows[0];
}

export async function computeDayReport(q: Q, shopId: string, day: string): Promise<DayReport> {
  const r = await dayNumbers(q, shopId, day);
  const last = await dayNumbers(q, shopId, shiftDay(day, -7));
  // الجزائر = UTC+1 طوال السنة (بلا توقيت صيفي)
  const h = await q.query<{ h: number; n: number }>(
    `select extract(hour from (created_at at time zone 'UTC') + interval '1 hour')::int as h, count(*)::int as n
     from tickets where shop_id = $1 and day = $2 group by h order by n desc, h asc limit 1`,
    [shopId, day],
  );
  const served = Number(r.served ?? 0);
  const lastWeekServed = Number(last.served ?? 0);
  return {
    day,
    total: Number(r.total ?? 0),
    served,
    online: Number(r.online ?? 0),
    desk: Number(r.desk ?? 0),
    noShows: Number(r.no_shows ?? 0),
    avgWaitMin: r.avg_wait == null ? null : Number(r.avg_wait),
    avgServiceMin: r.avg_service == null ? null : Number(r.avg_service),
    busiestHour: h[0] ? Number(h[0].h) : null,
    savedMin: Number(r.saved ?? 0),
    lastWeekServed,
    changePct: lastWeekServed > 0 ? Math.round(((served - lastWeekServed) / lastWeekServed) * 100) : null,
  };
}

// ————————————————————————— البريد —————————————————————————

export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function formatSaved(lang: Lang, min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return t(lang, "gr_mMinutes", { m });
  if (m === 0) return t(lang, "gr_mHours", { h });
  return t(lang, "gr_mHoursMin", { h, m });
}

function longDay(lang: Lang, day: string) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(new Date(`${day}T12:00:00Z`));
}

function weekdayName(lang: Lang, day: string) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function renderReport(shop: Shop, r: DayReport, base = appUrl()): Mail {
  const lang = shop.defaultLang;
  const tt = (k: DictKey, v?: Record<string, string | number>) => t(lang, k, v);
  const rtl = lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const dash = `${base}/staff/${shop.slug}`;
  const settings = `${base}/staff/${shop.slug}/settings#report`;
  const d = longDay(lang, r.day);
  const wd = weekdayName(lang, r.day);
  const min = (n: number | null) => (n == null ? tt("gr_mNone") : tt("gr_mMin", { n }));
  const hour = r.busiestHour == null ? tt("gr_mNone") : `${String(r.busiestHour).padStart(2, "0")}:00–${String((r.busiestHour + 1) % 24).padStart(2, "0")}:00`;
  const vs =
    r.changePct == null
      ? tt("gr_mVsNew", { w: wd })
      : r.changePct > 0
        ? tt("gr_mVsUp", { p: r.changePct, w: wd })
        : r.changePct < 0
          ? tt("gr_mVsDown", { p: -r.changePct, w: wd })
          : tt("gr_mVsSame", { w: wd });
  const vsColor = r.changePct == null || r.changePct === 0 ? "#64748b" : r.changePct > 0 ? "#047857" : "#b91c1c";
  const saved = formatSaved(lang, r.savedMin);
  const subject = tt("gr_mSubject", { d, name: shop.name });
  const empty = r.total === 0;

  const stats: [string, string][] = [
    [tt("gr_mTickets"), String(r.total)],
    [tt("gr_mOnline"), String(r.online)],
    [tt("gr_mDesk"), String(r.desk)],
    [tt("gr_mNoShows"), String(r.noShows)],
    [tt("gr_mAvgWait"), min(r.avgWaitMin)],
    [tt("gr_mAvgService"), min(r.avgServiceMin)],
    [tt("gr_mBusiest"), hour],
  ];

  const text = [
    tt("gr_mHello"),
    "",
    empty ? tt("gr_mEmpty", { d }) : tt("gr_mIntro", { d, name: shop.name }),
    "",
    ...(empty
      ? []
      : [
          `${tt("gr_mServed")}: ${r.served} (${vs})`,
          ...stats.map(([k, v]) => `${k}: ${v}`),
          "",
          `${tt("gr_mSaved")}: ${saved}`,
          tt("gr_mSavedSub"),
          "",
        ]),
    `${tt("gr_mOpen")}: ${dash}`,
    "",
    tt("gr_mPrivacy"),
    tt("gr_mFooter", { url: settings }),
  ].join("\n");

  const font = rtl ? "Tahoma,Arial,sans-serif" : "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  const cell = (k: string, v: string) =>
    `<td width="50%" style="padding:6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;"><tr><td style="padding:12px 14px;text-align:${align};">` +
    `<div style="font-size:12px;color:#64748b;line-height:1.6;">${esc(k)}</div>` +
    `<div dir="ltr" style="font-size:20px;font-weight:700;color:#0f172a;text-align:${align};">${esc(v)}</div></td></tr></table></td>`;
  let grid = "";
  for (let i = 0; i < stats.length; i += 2) {
    grid += `<tr>${cell(...stats[i])}${stats[i + 1] ? cell(...stats[i + 1]) : '<td width="50%"></td>'}</tr>`;
  }

  const body = empty
    ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.9;color:#334155;">${esc(tt("gr_mEmpty", { d }))}</p>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:16px;margin-bottom:16px;"><tr><td style="padding:20px;text-align:${align};">
         <div style="font-size:13px;color:#047857;font-weight:600;">${esc(tt("gr_mServed"))}</div>
         <div dir="ltr" style="font-size:40px;font-weight:800;color:#065f46;line-height:1.2;text-align:${align};">${r.served}</div>
         <div style="font-size:13px;color:${vsColor};font-weight:600;line-height:1.8;">${esc(vs)}</div>
       </td></tr></table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px 16px;">${grid}</table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f766e;border-radius:16px;margin-bottom:20px;"><tr><td style="padding:22px;text-align:center;color:#ffffff;">
         <div style="font-size:14px;opacity:.9;line-height:1.8;">${esc(tt("gr_mSaved"))}</div>
         <div style="font-size:32px;font-weight:800;line-height:1.4;">${esc(saved)}</div>
         <div style="font-size:12px;opacity:.85;line-height:1.8;">${esc(tt("gr_mSavedSub"))}</div>
       </td></tr></table>`;

  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:560px;background:#ffffff;border-radius:20px;font-family:${font};">
  <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;text-align:${align};">
    <span style="display:inline-block;background:#0f766e;color:#fff;border-radius:10px;padding:4px 10px;font-weight:800;font-size:14px;">دوري · Dawri</span>
    <div style="margin-top:10px;font-size:20px;font-weight:700;color:#0f172a;line-height:1.6;">${esc(shop.name)}</div>
    <div style="font-size:13px;color:#64748b;line-height:1.6;">${esc(d)}</div>
  </td></tr>
  <tr><td style="padding:24px;text-align:${align};">
    <p style="margin:0 0 6px;font-size:16px;color:#0f172a;line-height:1.9;">${esc(tt("gr_mHello"))}</p>
    ${empty ? "" : `<p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.9;">${esc(tt("gr_mIntro", { d, name: shop.name }))}</p>`}
    ${body}
    <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:12px;background:#0f172a;">
      <a href="${esc(dash)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">${esc(tt("gr_mOpen"))}</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.8;text-align:${align};">
    ${esc(tt("gr_mPrivacy"))}<br><a href="${esc(settings)}" style="color:#64748b;">${esc(tt("gr_mStop"))}</a>
  </td></tr>
</table></td></tr></table></body></html>`;

  return { to: shop.ownerEmail ?? "", subject, text, html };
}

// ————————————————————————— الإرسال —————————————————————————

/** يوم الأمس بتوقيت الجزائر. */
export function yesterday(now: Date): string {
  return shiftDay(dayKey(now), -1);
}

export interface ReportRunOptions {
  /** مدّة العمل القصوى بالملّي ثانية (تُقاس بساعة حقيقية رتيبة، لا بساعة النطاق) */
  budgetMs?: number;
  concurrency?: number;
}

/**
 * يُرسل التقارير المستحقّة (الأمس + آخر يومين بلا إرسال ناجح) لكلّ العيادات المعنية.
 * لا يرمي بسبب عيادة واحدة. 5 إرسالات متوازية، ويتوقّف عن البدء بجديد عند نفاد المهلة؛
 * ما بقي (pending) يُرسل في التشغيل التالي.
 */
export async function sendDailyReports(opts: ReportRunOptions = {}) {
  const started = performance.now();
  const budgetMs = opts.budgetMs ?? REPORT_BUDGET_MS;
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? REPORT_CONCURRENCY));
  const db = await getDb();
  const now = clockNow();
  const day = yesterday(now);
  const days = Array.from({ length: REPORT_BACKLOG_DAYS }, (_, i) => shiftDay(day, -i));
  await db.query("delete from report_previews where created_at < $1", [new Date(now.getTime() - 2 * DAY_MS)]);
  const mailer = getMailer();
  if (!mailer) return { day, days, sent: 0, failed: 0, pending: 0, skipped: "no_mailer" as const };
  const staleBefore = new Date(now.getTime() - REPORT_CLAIM_STALE_MS);
  const rows = await db.query(
    `select s.*, d.day as report_day
       from shops s
      cross join unnest($1::text[]) as d(day)
       left join report_settings r on r.shop_id = s.id
       left join report_log l on l.shop_id = s.id and l.day = d.day
      where s.owner_email is not null
        and coalesce(r.daily, true)
        and greatest(s.trial_ends_at, coalesce(s.paid_until, s.trial_ends_at)) > $2
        and exists (select 1 from tickets t where t.shop_id = s.id and t.day = d.day)
        and (l.shop_id is null or (l.sent_at is null and l.claimed_at < $3))
      order by d.day desc, s.created_at
      limit 2000`,
    [days, now, staleBefore],
  );

  let sent = 0;
  let failed = 0;
  let next = 0;
  const sendOne = async (row: (typeof rows)[number]) => {
    const shop = repo.rowToShop(row);
    const reportDay = String(row.report_day);
    const claimedAt = clockNow();
    // نحجز أوّلاً (cron مكرّر أو متوازٍ لا يرسل مرّتين). الحجز المعلّق القديم (مهمّة انقطعت) يُستعاد.
    const claim = await db.query(
      `insert into report_log (shop_id, day, claimed_at, sent_at) values ($1, $2, $3, null)
       on conflict (shop_id, day) do update set claimed_at = excluded.claimed_at
         where report_log.sent_at is null and report_log.claimed_at < $4
       returning day`,
      [shop.id, reportDay, claimedAt, new Date(claimedAt.getTime() - REPORT_CLAIM_STALE_MS)],
    );
    if (!claim[0]) return;
    try {
      const report = await computeDayReport(db, shop.id, reportDay);
      await mailer.send(renderReport(shop, report));
    } catch (e) {
      failed++;
      console.error("[report]", shop.slug, reportDay, e);
      // نُلغي حجزنا (لا حجز غيرنا) فيُعاد المحاولة في التشغيل التالي
      await db
        .query("delete from report_log where shop_id = $1 and day = $2 and sent_at is null and claimed_at = $3", [shop.id, reportDay, claimedAt])
        .catch(() => {});
      return;
    }
    sent++;
    await db
      .query("update report_log set sent_at = $3 where shop_id = $1 and day = $2", [shop.id, reportDay, clockNow()])
      .catch((e) => console.error("[report] mark sent", shop.slug, reportDay, e));
  };
  const worker = async () => {
    while (next < rows.length && performance.now() - started < budgetMs) {
      const row = rows[next++];
      try {
        await sendOne(row);
      } catch (e) {
        failed++;
        console.error("[report]", e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  const pending = rows.length - next;
  if (pending) console.warn(`[report] time budget reached: ${pending} report(s) left for the next run`);
  return { day, days, sent, failed, pending };
}

// ————————————————————————— الإعدادات —————————————————————————

export async function getReportSettings(shop: Shop) {
  const db = await getDb();
  const rows = await db.query<{ daily: boolean }>("select daily from report_settings where shop_id = $1", [shop.id]);
  return { daily: rows[0] ? Boolean(rows[0].daily) : true, email: shop.ownerEmail };
}

export async function saveReportSettings(shop: Shop, body: Record<string, unknown>) {
  if (typeof body.daily !== "boolean") throw new DomainError("bad_request");
  const db = await getDb();
  await db.query(
    `insert into report_settings (shop_id, daily) values ($1, $2)
     on conflict (shop_id) do update set daily = excluded.daily`,
    [shop.id, body.daily],
  );
  return getReportSettings(shop);
}

/**
 * «أرسل لي تقرير الأمس الآن» — 3 مرّات في 24 ساعة.
 * نحجز خانة من الحدّ تحت قفل قصير (طلبات متوازية لا تتجاوز 3)، ثمّ نحسب ونرسل خارج المعاملة،
 * ونُعيد الخانة إن فشل الإرسال: الفشل لا يستهلك من الحدّ.
 */
export async function sendReportPreview(shop: Shop) {
  if (!shop.ownerEmail) throw new DomainError("report_no_email");
  const mailer = getMailer();
  if (!mailer) throw new DomainError("email_unavailable", 503);
  const db = await getDb();
  const now = clockNow();
  const slot = await db.tx(async (q) => {
    await q.query("select id from shops where id = $1 for update", [shop.id]);
    const c = await q.query<{ n: number }>("select count(*)::int as n from report_previews where shop_id = $1 and created_at > $2", [
      shop.id,
      new Date(now.getTime() - DAY_MS),
    ]);
    if (Number(c[0]?.n ?? 0) >= PREVIEW_PER_DAY) throw new DomainError("report_rate_limited", 429);
    const ins = await q.query<{ id: string | number }>("insert into report_previews (shop_id, created_at) values ($1, $2) returning id", [
      shop.id,
      now,
    ]);
    return ins[0].id;
  });
  try {
    const report = await computeDayReport(db, shop.id, yesterday(now));
    await mailer.send(renderReport(shop, report));
  } catch (e) {
    console.error("[report] preview", e);
    await db.query("delete from report_previews where id = $1", [slot]).catch(() => {});
    throw new DomainError("email_unavailable", 503);
  }
  return { ok: true };
}
