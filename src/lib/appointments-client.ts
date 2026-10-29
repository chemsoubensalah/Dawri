/**
 * مواعيد هذا الهاتف (محفوظة محلّياً) — لعرض «موعدك القادم» وتسجيل الوصول من رمز الباب.
 * لا شيء يُرسل إلى الخادم من هنا؛ رابط الموعد نفسه هو المفتاح.
 */
export interface SavedAppt {
  id: string;
  day: string;
  time: string;
}

const KEY = "dawri:appts";
const PROFILE = "dawri:profile";

export function todayAlgiers(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
}

function readAll(): Record<string, SavedAppt[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** مواعيد هذه العيادة من اليوم فصاعداً، الأقرب أوّلاً. */
export function savedAppts(slug: string): SavedAppt[] {
  const today = todayAlgiers();
  const list = readAll()[slug];
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a.id === "string" && typeof a.day === "string" && a.day >= today)
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
}

/** مواعيد كلّ العيادات على هذا الهاتف (لبطاقة «موعدك» في الصفحة الرئيسية)، الأقرب أوّلاً. */
export function allSavedAppts(): (SavedAppt & { slug: string })[] {
  return Object.keys(readAll())
    .flatMap((slug) => savedAppts(slug).map((a) => ({ ...a, slug })))
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
}

export function saveAppt(slug: string, a: SavedAppt) {
  try {
    const all = readAll();
    const today = todayAlgiers();
    const list = (Array.isArray(all[slug]) ? all[slug] : []).filter((x) => x.id !== a.id && x.day >= today);
    all[slug] = [...list, a].slice(-10);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function forgetAppt(slug: string, id: string) {
  try {
    const all = readAll();
    if (!Array.isArray(all[slug])) return;
    all[slug] = all[slug].filter((x) => x.id !== id);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

/** الاسم والهاتف المحفوظان (نفس مفتاح صفحة أخذ الرقم). */
export function loadProfile(): { name: string; phone: string } {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE) ?? "{}");
    return { name: typeof p.name === "string" ? p.name : "", phone: typeof p.phone === "string" ? p.phone : "" };
  } catch {
    return { name: "", phone: "" };
  }
}

export function saveProfile(name: string, phone: string) {
  try {
    localStorage.setItem(PROFILE, JSON.stringify({ name, phone }));
  } catch {}
}
