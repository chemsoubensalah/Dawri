-- «حدود التسجيل» يقرّرها الطبيب (src/lib/domain/limits.ts):
-- مهلة بين تسجيلين لنفس الهاتف (المواعيد فقط أو المواعيد والطابور)، وهل تتجاوز السكرتيرة الحدود.
-- الحدّ اليوميّ لكلّ حالة يُحفظ مع اختيارات «سبب الزيارة» (reason_cfg.caps). null = الافتراضي (بلا حدود).
alter table shops add column if not exists limits_cfg jsonb;

-- عدّ الحالات في اليوم والبحث عن تسجيلات الهاتف الأخيرة
create index if not exists tickets_shop_phone_day on tickets (shop_id, phone, day) where phone is not null;
create index if not exists appointments_shop_phone on appointments (shop_id, phone) where phone is not null;
