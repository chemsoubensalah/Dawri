/** إعداد «طباعة التذاكر» (صاحب العيادة): قراءة وحفظ. */
import { cleanPrintConfig, readPrintConfig, type PrintConfig } from "../domain/printing";
import type { Shop } from "../domain/types";
import { getDb } from "./db";
import * as repo from "./repo";

export const printConfigOf = (shop: Pick<Shop, "printCfg">): PrintConfig => readPrintConfig(shop.printCfg);

export function printSettingsView(shop: Shop) {
  return { config: printConfigOf(shop) };
}

export type PrintSettingsView = ReturnType<typeof printSettingsView>;

export async function savePrintSettings(shop: Shop, body: unknown): Promise<PrintSettingsView> {
  const printCfg = cleanPrintConfig(body);
  await repo.updateShop(await getDb(), shop.id, { printCfg });
  return printSettingsView({ ...shop, printCfg });
}
