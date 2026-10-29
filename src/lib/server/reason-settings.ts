/** إعداد «سبب الزيارة» (صاحب العيادة): قراءة وحفظ. */
import { cleanReasonConfig, reasonConfigOf, REASON_SUGGESTIONS, type ReasonConfig } from "../domain/reasons";
import type { Shop } from "../domain/types";
import { getDb } from "./db";
import * as repo from "./repo";

export function reasonSettingsView(shop: Shop) {
  return { config: reasonConfigOf(shop), suggestions: REASON_SUGGESTIONS[shop.kind] ?? [] };
}

export type ReasonSettingsView = ReturnType<typeof reasonSettingsView>;

export async function saveReasonSettings(shop: Shop, body: unknown): Promise<ReasonSettingsView> {
  const reasonCfg: ReasonConfig = cleanReasonConfig(body);
  await repo.updateShop(await getDb(), shop.id, { reasonCfg });
  return reasonSettingsView({ ...shop, reasonCfg });
}
