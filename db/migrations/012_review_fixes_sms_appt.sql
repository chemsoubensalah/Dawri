-- مراجعة: رسائل هاتف العيادة + المواعيد.

-- 1) حدود المحاولات في جدول مستقلّ: «إزالة الربط ثمّ الحفظ» لا تصفّرها، والحدّ يعمل قبل وجود أيّ ربط.
--    المفاتيح: sg:test:<shop> (رسائل تجريبية)، sg:check:<shop> (فحوص الربط)، sg:codes:<shop> (رموز عبر هاتف العيادة)،
--    codes:booking:<shop> (رموز الحجز)، ip:<نوع>:<بصمة> (رموز لكلّ عميل — بصمة مُجزّأة، لا عنوان IP صريح).
--    لا أرقام هواتف هنا أبداً: أوقات المحاولات فقط. الصفوف القديمة (يومان) تُحذف تلقائياً.
create table if not exists rate_limits (
  key        text primary key check (char_length(key) between 1 and 120),
  hits       timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists rate_limits_updated on rate_limits (updated_at);
alter table rate_limits enable row level security;

-- ننقل سجلّات الساعة الأخيرة من sms_gateways (لا يُصفَّر الحدّ مع التحديث).
-- العمودان test_log وcheck_log باقيان للتوافق فقط ولم يعودا يُستعملان.
insert into rate_limits (key, hits, updated_at)
  select 'sg:test:' || shop_id::text, test_log, updated_at from sms_gateways where cardinality(test_log) > 0
  on conflict (key) do nothing;
insert into rate_limits (key, hits, updated_at)
  select 'sg:check:' || shop_id::text, check_log, updated_at from sms_gateways where cardinality(check_log) > 0
  on conflict (key) do nothing;

-- 2) أولوية أصحاب المواعيد بترتيب وصولهم الفعلي: لحظة منح الأولوية (لا لحظة أخذ الرقم العادي قبلها).
alter table tickets add column if not exists priority_at timestamptz;
update tickets t
   set priority_at = coalesce((select min(a.arrived_at) from appointments a where a.ticket_id = t.id), t.created_at)
 where t.priority and t.priority_at is null;
