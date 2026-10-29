/**
 * سبب الزيارة: يختاره المريض من قائمة قصيرة حسب نوع العيادة.
 * قائمة ثابتة بلا نصّ حرّ: تكفي الطبيب والسكرتيرة للتحضير، دون تخزين تفاصيل طبّية.
 */
import { DomainError, type ShopKind } from "./types";

export type VisitReason =
  | "consult"
  | "followup"
  | "results"
  | "prescription"
  | "certificate"
  | "treatment"
  | "urgent"
  | "sample"
  | "pickup"
  | "other";

const BY_KIND: Record<ShopKind, readonly VisitReason[]> = {
  doctor: ["consult", "followup", "results", "prescription", "certificate", "other"],
  dentist: ["consult", "treatment", "urgent", "other"],
  lab: ["sample", "pickup", "other"],
  barber: [],
  other: [],
};

/** أسباب هذا النوع من العيادات (فارغة = لا يُسأل المريض). */
export function reasonsFor(kind: ShopKind): readonly VisitReason[] {
  return BY_KIND[kind] ?? [];
}

/** يقبل غياب السبب (نسخ قديمة من الصفحة، أو السكرتيرة)، ويرفض ما ليس في قائمة هذه العيادة. */
export function cleanReason(kind: ShopKind, v: unknown): VisitReason | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !reasonsFor(kind).includes(v as VisitReason)) throw new DomainError("invalid_reason");
  return v as VisitReason;
}
