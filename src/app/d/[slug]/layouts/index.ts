import type { DisplayStyle } from "@/lib/domain/types";
import { color, light, night } from "./Classic";
import { focus } from "./Focus";
import { board } from "./Board";
import { led } from "./Led";
import { elegant } from "./Elegant";
import { kids } from "./Kids";
import { portrait } from "./Portrait";
import type { LayoutDef } from "./types";

/** كلّ تصاميم شاشة القاعة (الترتيب = ترتيب العرض في الإعدادات). */
export const LAYOUTS: Record<DisplayStyle, LayoutDef> = {
  night,
  light,
  color,
  focus,
  board,
  led,
  elegant,
  kids,
  portrait,
};
