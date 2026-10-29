/**
 * مقارنة اسمين كما يكتبهما الناس: بلا فرق بين الحروف الكبيرة والصغيرة، ولا التشكيل والتطويل،
 * ولا أشكال الألف والهمزة، ولا ى/ي وة/ه، ولا المسافات والرموز.
 * تُستعمل حين لا رمز تحقّق: من يعرف هاتف مريض لا يفتح تذكرته إلّا بنفس الاسم.
 */
export function nameKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
