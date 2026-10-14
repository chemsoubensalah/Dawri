/** الاشتراك: صفحة دفع Chargily، التحقّق من التوقيع، التفعيل مرّة واحدة، والتفعيل اليدوي. */
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { setClock } from "@/lib/server/clock";
import * as svc from "@/lib/server/service";
import * as repo from "@/lib/server/repo";
import { createCheckout, handleChargilyEvent, plans, recordManualPayment, setChargilyFetch } from "@/lib/server/billing";
import { POST as webhook } from "@/app/api/billing/chargily/route";
import type { Shop } from "@/lib/domain/types";

let db: Db;
const clock = new Date("2026-10-11T08:00:00Z");
const requests: { url: string; body: Record<string, unknown> }[] = [];
let checkoutSeq = 0;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.CHARGILY_SECRET_KEY = "test_sk_secret123";
  process.env.NEXT_PUBLIC_PRICE_DZD = "1000";
  process.env.NEXT_PUBLIC_PRICE_YEAR_DZD = "10000";
  db = await createPgliteDb();
  await migrate(db);
  setDb(db);
  setClock(() => clock);
  setChargilyFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    const id = `01chk${++checkoutSeq}`;
    return new Response(JSON.stringify({ id, checkout_url: `https://pay.chargily.dz/test/checkouts/${id}/pay`, status: "pending" }), { status: 200 });
  });
});

afterAll(async () => {
  delete process.env.CHARGILY_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_PRICE_DZD;
  setChargilyFetch(undefined);
  setClock(undefined);
  setDb(undefined);
  await db.close();
});

let shop: Shop;
let n = 0;
beforeEach(async () => {
  requests.length = 0;
  shop = await svc.createShop({ name: "عيادة الأمل", slug: `bill-${++n}`, kind: "doctor", pin: "4321", email: "dr@example.com" });
});

const sign = (raw: string) => crypto.createHmac("sha256", "test_sk_secret123").update(raw).digest("hex");
const paidEvent = (id: string, amount = 1000) =>
  JSON.stringify({ id: `evt_${id}`, entity: "event", livemode: "false", type: "checkout.paid", data: { id, entity: "checkout", amount, status: "paid", currency: "dzd" } });

describe("Chargily", () => {
  it("السنوي بسعر مخفّض", () => {
    expect(plans()).toEqual([
      { months: 1, amount: 1000 },
      { months: 12, amount: 10000 },
    ]);
  });

  it("يُنشئ صفحة دفع بالدينار مع الرابط الصحيح ويسجّل دفعة معلّقة", async () => {
    const r = await createCheckout(shop, 1, "ar", "https://dawri.example");
    expect(r.url).toMatch(/^https:\/\/pay\.chargily\.dz\//);
    expect(requests[0].url).toBe("https://pay.chargily.net/test/api/v2/checkouts");
    expect(requests[0].body).toMatchObject({
      amount: 1000,
      currency: "dzd",
      locale: "ar",
      chargily_pay_fees_allocation: "merchant",
      webhook_endpoint: "https://dawri.example/api/billing/chargily",
    });
    const payments = await repo.listPayments(db, shop.id);
    expect(payments[0]).toMatchObject({ status: "pending", months: 1, amount: 1000 });
  });

  it("checkout.paid: يمدّد الاشتراك بعد نهاية التجربة، مرّة واحدة فقط", async () => {
    await createCheckout(shop, 1, "fr", "https://dawri.example");
    const id = `01chk${checkoutSeq}`;
    const raw = paidEvent(id);
    expect((await webhook(new Request("https://x", { method: "POST", body: raw, headers: { signature: "bad" } }))).status).toBe(403);
    expect((await webhook(new Request("https://x", { method: "POST", body: raw }))).status).toBe(400);
    const ok = await webhook(new Request("https://x", { method: "POST", body: raw, headers: { signature: sign(raw) } }));
    expect(ok.status).toBe(200);
    const after = (await repo.getShopById(db, shop.id))!;
    // التجربة تنتهي بعد TRIAL_DAYS ← الشهر المدفوع يبدأ بعدها
    const expected = new Date(shop.trialEndsAt);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(Math.abs(after.paidUntil!.getTime() - expected.getTime())).toBeLessThan(3 * 86_400_000);
    // نفس الحدث مرّة ثانية: لا تمديد إضافي
    await webhook(new Request("https://x", { method: "POST", body: raw, headers: { signature: sign(raw) } }));
    expect((await repo.getShopById(db, shop.id))!.paidUntil!.getTime()).toBe(after.paidUntil!.getTime());
    expect((await repo.listPayments(db, shop.id))[0].status).toBe("paid");
  });

  it("مبلغ أقلّ من المطلوب لا يفعّل شيئاً", async () => {
    await createCheckout(shop, 12, "fr", "https://dawri.example");
    await expect(handleChargilyEvent(JSON.parse(paidEvent(`01chk${checkoutSeq}`, 100)))).rejects.toThrow("mismatch");
    expect((await repo.getShopById(db, shop.id))!.paidUntil).toBeNull();
  });

  it("checkout.failed يعلّم الدفعة فاشلة", async () => {
    await createCheckout(shop, 1, "fr", "https://dawri.example");
    await handleChargilyEvent({ type: "checkout.failed", data: { id: `01chk${checkoutSeq}`, status: "failed" } });
    expect((await repo.listPayments(db, shop.id))[0].status).toBe("failed");
  });
});

describe("التفعيل اليدوي (تحويل بريدي)", () => {
  it("يسجّل دفعة ويمدّد، والاشتراك المنتهي يبدأ من اليوم", async () => {
    await db.query("update shops set trial_ends_at = $2 where id = $1", [shop.id, new Date(clock.getTime() - 86_400_000)]);
    const until = await recordManualPayment(shop.id, 3, 7500, "BaridiMob 12/10");
    const expected = new Date(clock);
    expected.setUTCMonth(expected.getUTCMonth() + 3);
    expect(Math.abs(until!.getTime() - expected.getTime())).toBeLessThan(3 * 86_400_000);
    expect(svc.isSubscriptionActive((await repo.getShopById(db, shop.id))!, clock)).toBe(true);
    await expect(recordManualPayment(shop.id, 0, 0, null)).rejects.toThrow("invalid_plan");
  });
});
