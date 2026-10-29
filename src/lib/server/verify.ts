/**
 * هل نطلب من المريض رمز تحقّق لهاتفه؟
 *  - PHONE_VERIFICATION=off : أبداً.
 *  - PHONE_VERIFICATION=on  : دائماً (حتى بلا وسيلة إرسال — للإعدادات الصارمة).
 *  - غير مضبوط (الافتراضي)  : فقط إن وُجدت وسيلة تُرسل الرمز فعلاً (مزوّد SMS، هاتف العيادة، أو واتساب).
 *    بلا أيّ وسيلة يأخذ المريض رقمه بالاسم والهاتف — بدل أن يُصدّ بـ«التحقّق غير مفعّل» —
 *    ويعود التحقّق تلقائياً حين يربط الطبيب هاتفه.
 */
import { getSms } from "./sms";
import { clinicSendsCodes } from "./smsgate";
import { waConfig } from "./whatsapp";

export async function phoneCheckRequired(shopId: string, o: { whatsapp?: boolean } = {}): Promise<boolean> {
  const mode = process.env.PHONE_VERIFICATION;
  if (mode === "off") return false;
  if (mode === "on") return true;
  if (getSms() !== null) return true;
  if (o.whatsapp && waConfig().enabled) return true;
  return clinicSendsCodes(shopId);
}
