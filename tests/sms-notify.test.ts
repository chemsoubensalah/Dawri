import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, migrate, setDb, type Db } from "@/lib/server/db";
import { defaultNotifier, smsTypes } from "@/lib/server/notify";
import { sentSms } from "@/lib/server/sms";
import { DEFAULT_SETTINGS, type NotifyType, type Shop, type Ticket } from "@/lib/domain/types";

let db: Db;
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.SMS_PROVIDER = "console";
  db = await createPgliteDb();
  await migrate(db);
  setDb(db);
});
afterAll(async () => {
  delete process.env.SMS_NOTIFICATIONS;
  delete process.env.SMS_PROVIDER;
  setDb(undefined);
  await db.close();
});
beforeEach(() => {
  sentSms.length = 0;
});

const shop = { name: "عيادة الشفاء", settings: DEFAULT_SETTINGS } as Shop;
const ticket = (phone: string | null): Ticket =>
  ({ id: crypto.randomUUID(), number: 7, lang: "ar", phone, confirmAskedAt: null, confirmedAt: null }) as unknown as Ticket;
const send = (type: NotifyType, phone: string | null = "+213550000001") =>
  defaultNotifier.send({ type, ticket: ticket(phone), shop, ahead: 3 });

describe("رسائل SMS للمريض", () => {
  it("SMS_NOTIFICATIONS=called: رسالة فقط حين يحين دوره", async () => {
    process.env.SMS_NOTIFICATIONS = "called";
    await send("soon");
    await send("called");
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].to).toBe("+213550000001");
    expect(sentSms[0].text).toContain("دورك الآن");
    expect(sentSms[0].text).toContain("عيادة الشفاء");
    expect(sentSms[0].text).toContain("7");
  });

  it("SMS_NOTIFICATIONS=1: «تعال الآن» و«دورك الآن»", async () => {
    process.env.SMS_NOTIFICATIONS = "1";
    await send("soon");
    await send("called");
    await send("missed");
    expect(sentSms.map((m) => m.text.split(" ")[0])).toEqual(["تعال", "دورك"]);
  });

  it("بلا إعداد أو بلا رقم هاتف: لا رسائل", async () => {
    delete process.env.SMS_NOTIFICATIONS;
    await send("called");
    process.env.SMS_NOTIFICATIONS = "called";
    await send("called", null);
    expect(sentSms).toHaveLength(0);
  });

  it("يقرأ القوائم ويتجاهل القيم الخاطئة", () => {
    process.env.SMS_NOTIFICATIONS = "called, soon, banana";
    expect([...smsTypes()].sort()).toEqual(["called", "soon"]);
    process.env.SMS_NOTIFICATIONS = "off";
    expect(smsTypes().size).toBe(0);
  });
});
