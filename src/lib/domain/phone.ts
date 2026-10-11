/**
 * يوحّد أرقام الهاتف الجزائرية (النقّال فقط) إلى الصيغة الدولية +2135XXXXXXXX.
 * يقبل: 0550123456 ، 0550 12 34 56 ، +213550123456 ، 00213550123456 ، 213550123456
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^\+/, "00");
  if (!/^\d+$/.test(digits)) return null;
  let local: string;
  if (digits.startsWith("00213")) local = digits.slice(5);
  else if (digits.startsWith("213")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else return null;
  if (local.startsWith("0")) local = local.slice(1); // +213 0550…
  if (!/^[567]\d{8}$/.test(local)) return null;
  return `+213${local}`;
}

/** للعرض: 0550 12 34 56 */
export function formatPhone(p: string | null): string {
  if (!p) return "";
  const local = "0" + p.replace(/^\+213/, "");
  return `${local.slice(0, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
}

/** للعرض العامّ: 0550 •• •• 56 */
export function maskPhone(p: string | null): string {
  if (!p) return "";
  const f = formatPhone(p);
  return `${f.slice(0, 4)} •• •• ${f.slice(-2)}`;
}
