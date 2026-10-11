import { DEFAULT_SETTINGS, type WeeklyHours } from "../domain/types";
import { hashPin } from "./auth";
import type { Db } from "./db";
import * as repo from "./repo";

/** محلّ تجريبي للتطوير المحلّي: /s/demo — رمز السكرتيرة 1234. */
export async function seedDemo(db: Db) {
  if (await repo.getShopBySlug(db, "demo")) return;
  const allDay: WeeklyHours = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [["00:00", "23:59"]]]),
  );
  await repo.insertShop(db, {
    slug: "demo",
    name: "عيادة الدكتور التجريبية",
    kind: "doctor",
    pinHash: hashPin("1234"),
    doorCode: "door-demo",
    hours: allDay,
    settings: DEFAULT_SETTINGS,
    defaultLang: "ar",
    trialEndsAt: new Date(Date.now() + 3650 * 86_400_000),
  });
}
