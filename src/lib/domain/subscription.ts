/**
 * المصدر الوحيد لحالة الاشتراك (بلا قاعدة بيانات، يصلح للخادم والواجهة).
 *
 * - اشتراك الطبيب الواحد (shop): max(trialEndsAt, paidUntil).
 * - اشتراك العيادة متعدّدة الأطبّاء (clinic): max(trialEndsAt, paidUntil) للعيادة.
 * - الطابور «فعّال» إن كان اشتراكه الخاصّ سارياً أو كان عضواً في عيادة اشتراكها سارٍ.
 *   حين يغادر الطبيب العيادة (clinicId = null) يرجع تلقائياً إلى اشتراكه الخاصّ — لا ترحيل بيانات.
 */

const DAY_MS = 86_400_000;

export interface OwnSubscription {
  trialEndsAt: Date;
  paidUntil: Date | null;
}

export interface ShopSubscriptionLike extends OwnSubscription {
  clinicId?: string | null;
  /**
   * نهاية تغطية العيادة لهذا الطابور (من LEFT JOIN في repo، انظر repo.clinicCoverSql)، أو null:
   * مدّتها المدفوعة دائماً، وتجربتها المجّانية فقط للطوابير المُنشأة بعد العيادة (لا لطابور قديم انضمّ إليها).
   */
  clinicUntil?: Date | null;
}

/** نهاية الاشتراك الخاصّ (تجربة أو مدفوع). */
export function ownUntil(s: OwnSubscription): Date {
  return new Date(Math.max(s.trialEndsAt.getTime(), s.paidUntil?.getTime() ?? 0));
}

/** نهاية اشتراك العيادة الذي يغطّي هذا الطابور، أو null إن لم يكن عضواً في عيادة. */
export function clinicCoverUntil(shop: ShopSubscriptionLike): Date | null {
  return shop.clinicId && shop.clinicUntil ? shop.clinicUntil : null;
}

/** النهاية الفعلية = الأبعد بين الاشتراك الخاصّ واشتراك العيادة. */
export function subscriptionUntil(shop: ShopSubscriptionLike): Date {
  const own = ownUntil(shop);
  const clinic = clinicCoverUntil(shop);
  return clinic && clinic > own ? clinic : own;
}

export function isSubscriptionActive(shop: ShopSubscriptionLike, now: Date): boolean {
  return now.getTime() < subscriptionUntil(shop).getTime();
}

/** هل اشتراك العيادة هو ما يُبقي الطابور فعّالاً الآن؟ */
export function coveredByClinic(shop: ShopSubscriptionLike, now: Date): boolean {
  const c = clinicCoverUntil(shop);
  return Boolean(c && c.getTime() > now.getTime());
}

export interface SubscriptionStatus {
  active: boolean;
  /** في التجربة المجّانية (لا مدّة مدفوعة سارية) */
  trial: boolean;
  until: Date;
  paidUntil: Date | null;
  daysLeft: number;
}

/** ملخّص لاشتراك واحد (طابور بمفرده أو عيادة). */
export function subscriptionStatus(s: OwnSubscription, now: Date): SubscriptionStatus {
  const until = ownUntil(s);
  const paidUntil = s.paidUntil && s.paidUntil > now ? s.paidUntil : null;
  const active = until > now;
  return {
    active,
    trial: active && !paidUntil,
    until,
    paidUntil,
    daysLeft: Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS)),
  };
}
