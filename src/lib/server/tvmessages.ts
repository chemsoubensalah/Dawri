/** رسائل شاشة القاعة: نصائح عامّة وتنبيهات يكتبها الطبيب (بلا أيّ معلومات عن المرضى). */
import { DomainError, type Shop } from "../domain/types";
import { now } from "./clock";
import { getDb } from "./db";

export const TV_MAX_ITEMS = 10;
export const TV_MAX_LEN = 160;

function clean(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > TV_MAX_ITEMS) throw new DomainError("tv_invalid");
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") throw new DomainError("tv_invalid");
    // بلا محارف تحكّم أو اتّجاه مخفيّة
    const s = x.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (s.length > TV_MAX_LEN) throw new DomainError("tv_too_long");
    out.push(s);
  }
  return out;
}

export async function getTvMessages(shopId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query<{ items: unknown }>("select items from tv_messages where shop_id = $1", [shopId]);
  const items = rows[0]?.items;
  const arr = typeof items === "string" ? JSON.parse(items) : items;
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
}

export async function saveTvMessages(shop: Shop, items: unknown): Promise<string[]> {
  const list = clean(items);
  const db = await getDb();
  await db.query(
    `insert into tv_messages (shop_id, items, updated_at) values ($1, $2, $3)
     on conflict (shop_id) do update set items = excluded.items, updated_at = excluded.updated_at`,
    [shop.id, JSON.stringify(list), now()],
  );
  return list;
}
