/** أيّام العطل (إعدادات الطبيب): قراءة وحفظ، مع عدد المواعيد المحجوزة في كلّ يوم عطلة. */
import { cleanDaysOff, upcomingFixedHolidays } from "../domain/daysoff";
import { dayKey } from "../domain/time";
import type { Shop } from "../domain/types";
import { now as clockNow } from "./clock";
import { getDb } from "./db";
import * as repo from "./repo";
import * as ar from "./appointments-repo";

export async function daysOffView(shop: Shop) {
  const today = dayKey(clockNow());
  const items = shop.daysOff.filter((d) => d.day >= today);
  // مواعيد حُجزت قبل إضافة العطلة: يُنبَّه الطبيب ليتّصل بأصحابها
  const booked = new Map<string, number>();
  if (items.length) {
    const off = new Set(items.map((d) => d.day));
    const db = await getDb();
    for (const c of await ar.activeCounts(db, shop.id, items[0].day, items[items.length - 1].day)) {
      if (off.has(c.day)) booked.set(c.day, (booked.get(c.day) ?? 0) + c.n);
    }
  }
  return { today, items: items.map((d) => ({ ...d, booked: booked.get(d.day) ?? 0 })), holidays: upcomingFixedHolidays(today) };
}

export type DaysOffView = Awaited<ReturnType<typeof daysOffView>>;

/** يستبدل القائمة كلّها (الماضي يُحذف). */
export async function saveDaysOff(shop: Shop, items: unknown): Promise<DaysOffView> {
  const daysOff = cleanDaysOff(items, dayKey(clockNow()));
  const db = await getDb();
  await repo.updateShop(db, shop.id, { daysOff });
  return daysOffView({ ...shop, daysOff });
}
