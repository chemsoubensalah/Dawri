/**
 * واتساب: التحقّق بالرسالة الأولى، ربط التنبيهات، الأزرار، STOP، والتوقيع.
 * لا اتّصال بـ Meta: نلتقط الرسائل المرسلة بدل إرسالها.
 */
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import { defaultNotifier, setNotifier } from "@/lib/server/notify";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import { parseIntent, setWaSender, verifySignature } from "@/lib/server/whatsapp";
import { GET, POST } from "@/app/api/whatsapp/webhook/route";
import type { Shop } from "@/lib/domain/types";

let db: Db;
let clock = new Date("2026-10-11T08:00:00Z");
const sent: Record<string, unknown>[] = [];
const ENV = {
  WHATSAPP_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_NUMBER: "213550000000",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-me",
};

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  Object.assign(process.env, ENV);
  db = await createPgliteDb();
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setNotifier(defaultNotifier); // المسار الحقيقي للتنبيهات (واتساب)
  setWaSender(async (body) => void sent.push(body));
});

afterAll(async () => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  delete process.env.WHATSAPP_TEMPLATE_TURN;
  setWaSender(undefined);
  setNotifier(undefined);
  setClock(undefined);
  setDb(undefined);
  await db.close();
});

let shop: Shop;
let n = 0;
beforeEach(async () => {
  clock = new Date("2026-10-11T08:00:00Z");
  sent.length = 0;
  shop = await svc.createShop({ name: "عيادة الشفاء", slug: `wa-clinic-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

let msgSeq = 0;
function inbound(from: string | null, text: string | null, opts: { buttonId?: string; userId?: string } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "213550000000", phone_number_id: "1234567890" },
              contacts: [{ profile: { name: "Amine" }, wa_id: from ?? undefined, user_id: opts.userId ?? `DZ.user${from}` }],
              messages: [
                {
                  from: from ?? undefined,
                  from_user_id: opts.userId ?? `DZ.user${from}`,
                  id: `wamid.${++msgSeq}`,
                  timestamp: String(Math.floor(clock.getTime() / 1000)),
                  ...(opts.buttonId
                    ? { type: "interactive", interactive: { type: "button_reply", button_reply: { id: opts.buttonId, title: "ok" } } }
                    : { type: "text", text: { body: text } }),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const texts = () => sent.map((b) => JSON.stringify(b));

describe("فهم رسائل المريض", () => {
  it("يستخرج الرموز حتى لو عُدّل النصّ", () => {
    expect(parseIntent("دوري: تأكيد رقمي V-K7Q2X\nDawri", null)).toEqual({ kind: "verify", code: "K7Q2X" });
    expect(parseIntent("t-abcde", null)).toEqual({ kind: "alerts", code: "ABCDE" });
    expect(parseIntent("Stop", null)).toEqual({ kind: "stop" });
    expect(parseIntent("مرحبا", null)).toEqual({ kind: "other" });
    expect(parseIntent(null, "c:0d6f1a3e-2b4c-4d5e-8f90-1a2b3c4d5e6f")).toEqual({ kind: "coming", ticketId: "0d6f1a3e-2b4c-4d5e-8f90-1a2b3c4d5e6f" });
  });

  it("يرفض التوقيع الخاطئ ويقبل الصحيح", () => {
    const raw = '{"a":1}';
    const sig = "sha256=" + crypto.createHmac("sha256", "app-secret").update(raw).digest("hex");
    expect(verifySignature(raw, sig, "app-secret")).toBe(true);
    expect(verifySignature(raw + " ", sig, "app-secret")).toBe(false);
    expect(verifySignature(raw, null, "app-secret")).toBe(false);
  });
});

describe("التحقّق عبر واتساب (بديل SMS)", () => {
  it("رسالة المريض تُنشئ تذكرته وتربط تنبيهاته، ويصله ردّ برقمه", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "أمين", phone: "0661111111", reason: "followup" });
    expect(start.link).toMatch(/^https:\/\/wa\.me\/213550000000\?text=/);
    expect(decodeURIComponent(start.link)).toContain(start.code);
    expect((await svc.waVerificationStatus(shop.slug, start.id)).status).toBe("pending");

    await svc.handleWhatsappInbound(inbound("213661111111", `دوري: تأكيد رقمي ${start.code}`));
    const st = await svc.waVerificationStatus(shop.slug, start.id);
    expect(st.status).toBe("done");
    const ticket = (await repo.getTicket(db, st.ticketId!))!;
    expect(ticket.phone).toBe("+213661111111");
    expect(ticket.reason).toBe("followup"); // السبب المختار في الصفحة يصل إلى التذكرة
    expect(ticket.waPhone).toBe("+213661111111");
    expect(ticket.waWindowUntil!.getTime()).toBeGreaterThan(clock.getTime());
    expect(texts().some((t) => t.includes("213661111111") && t.includes("*1*"))).toBe(true);
  });

  it("ثغرة مُصلَحة: رقم واتساب أجنبي لا يستطيع انتحال تذكرة شخص آخر", async () => {
    const c = await svc.requestCode(shop.slug, { name: "الضحية", phone: "0661234567" });
    const victim = await svc.takeTicket(shop.slug, { name: "الضحية", phone: "0661234567", code: c.devCode });
    const start = await svc.startWaVerification(shop.slug, { name: "مهاجم", phone: "0661234567" });
    await svc.handleWhatsappInbound(inbound("33612345678", start.code));
    const st = await svc.waVerificationStatus(shop.slug, start.id);
    expect(st.status).toBe("failed");
    expect(st.ticketId).toBeNull();
    expect((await repo.getTicket(db, victim.ticketId))!.waUserId).toBeNull();
    expect(texts().join()).not.toContain(victim.ticketId);
  });

  it("ثغرة مُصلَحة: رمز مستعمل لا يكشف التذكرة لمرسل آخر", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "منى", phone: "0661111119" });
    await svc.handleWhatsappInbound(inbound("213661111119", start.code));
    const { ticketId } = await svc.waVerificationStatus(shop.slug, start.id);
    sent.length = 0;
    await svc.handleWhatsappInbound(inbound("213779999999", start.code));
    expect(texts().join()).not.toContain(ticketId!);
    expect(texts()[0]).toContain("انتهت");
  });

  it("رقم الواتساب هو المعتمد إن اختلف عمّا كُتب", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "سارة", phone: "0661111112" });
    await svc.handleWhatsappInbound(inbound("213770000099", start.code));
    const st = await svc.waVerificationStatus(shop.slug, start.id);
    expect((await repo.getTicket(db, st.ticketId!))!.phone).toBe("+213770000099");
  });

  it("الرسالة المكرّرة (نفس المعرّف) تُعالج مرّة واحدة", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "كريم", phone: "0661111113" });
    const payload = inbound("213661111113", start.code);
    await svc.handleWhatsappInbound(payload);
    await svc.handleWhatsappInbound(payload);
    expect(sent).toHaveLength(1);
  });

  it("رمز منتهٍ ← ردّ بأنّ الرمز انتهى، بلا تذكرة", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "نادية", phone: "0661111114" });
    clock = new Date(clock.getTime() + 21 * 60000);
    await svc.handleWhatsappInbound(inbound("213661111114", start.code));
    expect((await svc.waVerificationStatus(shop.slug, start.id)).status).toBe("expired");
    expect(texts()[0]).toContain("انتهت");
  });
});

describe("التنبيهات عبر واتساب", () => {
  async function waTicket(phone: string, name = "مريض") {
    const start = await svc.startWaVerification(shop.slug, { name, phone: `0${phone.slice(3)}` });
    await svc.handleWhatsappInbound(inbound(phone, start.code));
    return (await svc.waVerificationStatus(shop.slug, start.id)).ticketId!;
  }
  async function next() {
    const s = await svc.staffState((await repo.getShopBySlug(db, shop.slug))!);
    await svc.staffAction((await repo.getShopBySlug(db, shop.slug))!, { action: "next", current: s.current?.id ?? null });
  }

  it("«دورك الآن» يصل برسالة عادية داخل النافذة، وسؤال التأكيد بأزرار تعمل", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await waTicket(`21366200000${i}`, `م${i}`));
    sent.length = 0;
    await next(); // ينادي الأوّل، ويسأل من أمامه 5
    const called = sent.find((b) => (b as { to?: string }).to === "213662000000")!;
    expect(called.type).toBe("text");
    expect(JSON.stringify(called)).toContain("دورك الآن");
    const asked = sent.find((b) => (b as { to?: string }).to === "213662000005")!;
    expect(asked.type).toBe("interactive");
    const btn = (asked as { interactive: { action: { buttons: { reply: { id: string } }[] } } }).interactive.action.buttons[0].reply.id;
    expect(btn).toBe(`c:${ids[5]}`);

    // المريض يضغط «نعم، قادم»
    await svc.handleWhatsappInbound(inbound("213662000005", null, { buttonId: btn }));
    expect((await repo.getTicket(db, ids[5]))!.confirmedAt).not.toBeNull();
    // شخص آخر لا يستطيع ضغط زرّ غيره
    await svc.handleWhatsappInbound(inbound("213669999999", null, { buttonId: `x:${ids[4]}` }));
    expect((await repo.getTicket(db, ids[4]))!.status).toBe("waiting");
    // صاحب التذكرة يلغي
    await svc.handleWhatsappInbound(inbound("213662000004", null, { buttonId: `x:${ids[4]}` }));
    expect((await repo.getTicket(db, ids[4]))!.status).toBe("cancelled");
  });

  it("ربط تذكرة أُخذت برمز SMS عبر «T-رمز»، ثمّ STOP يوقف كلّ شيء", async () => {
    const c = await svc.requestCode(shop.slug, { name: "علي", phone: "0663000001" });
    const { ticketId } = await svc.takeTicket(shop.slug, { name: "علي", phone: "0663000001", code: c.devCode });
    const view = await svc.ticketView(ticketId);
    expect(view.wa.linked).toBe(false);
    const code = decodeURIComponent(view.wa.link!).match(/T-([A-Z0-9]{5})/)![1];
    await svc.handleWhatsappInbound(inbound("213663000001", `T-${code}`));
    expect((await svc.ticketView(ticketId)).wa.linked).toBe(true);
    expect(texts().at(-1)).toContain("مفعّلة");

    await svc.handleWhatsappInbound(inbound("213663000001", "STOP"));
    expect((await svc.ticketView(ticketId)).wa.linked).toBe(false);
    sent.length = 0;
    await next();
    expect(sent.filter((b) => (b as { to?: string }).to === "213663000001")).toHaveLength(0);
  });

  it("بعد انتهاء النافذة: قالب معتمد إن وُجد، وإلّا لا شيء", async () => {
    const id = await waTicket("213664000001", "بلال");
    // نحاكي انتهاء نافذة الـ24 ساعة دون تغيير اليوم
    await db.query("update tickets set wa_window_until = $2 where id = $1", [id, new Date(clock.getTime() - 1000)]);
    sent.length = 0;
    await next();
    expect(sent).toHaveLength(0);

    process.env.WHATSAPP_TEMPLATE_TURN = "dawri_turn";
    const s = await svc.staffState((await repo.getShopBySlug(db, shop.slug))!);
    await svc.staffAction((await repo.getShopBySlug(db, shop.slug))!, { action: "recall", current: s.current?.id ?? null });
    expect(sent[0].type).toBe("template");
    expect(JSON.stringify(sent[0])).toContain("dawri_turn");
    delete process.env.WHATSAPP_TEMPLATE_TURN;
  });
});

describe("نقطة استقبال Meta", () => {
  it("تحقّق GET بالرمز الصحيح فقط", async () => {
    const ok = await GET(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"));
    expect(bad.status).toBe(403);
  });

  it("POST بتوقيع خاطئ يُرفض، وبتوقيع صحيح يُعالَج", async () => {
    const start = await svc.startWaVerification(shop.slug, { name: "هدى", phone: "0665000001" });
    const raw = JSON.stringify(inbound("213665000001", start.code));
    const bad = await POST(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(bad.status).toBe(403);
    const sig = "sha256=" + crypto.createHmac("sha256", "app-secret").update(raw).digest("hex");
    const ok = await POST(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }));
    expect(ok.status).toBe(200);
    expect((await svc.waVerificationStatus(shop.slug, start.id)).status).toBe("done");
  });
});
