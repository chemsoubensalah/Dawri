-- اشتراك العيادة متعدّدة الأطبّاء: منفصل عن اشتراك الطبيب الواحد (وأغلى).
-- طابور الطبيب يعمل إن كان اشتراكه الخاصّ ساريًا أو (كان عضواً في عيادة واشتراك العيادة ساريٌ).

-- 1) تجربة العيادة ومدّتها المدفوعة
alter table clinics add column if not exists trial_ends_at timestamptz;
alter table clinics add column if not exists paid_until timestamptz;

-- العيادات الموجودة: 60 يوماً من إنشائها، أو أطول تجربة لأحد أطبّائها إن كانت أبعد
update clinics c
   set trial_ends_at = greatest(
         c.created_at + interval '60 days',
         coalesce((select max(s.trial_ends_at) from shops s where s.clinic_id = c.id), c.created_at + interval '60 days'))
 where c.trial_ends_at is null;

alter table clinics alter column trial_ends_at set default (now() + interval '60 days');
alter table clinics alter column trial_ends_at set not null;

-- 2) مدفوعات العيادة: الدفعة لطابور (shop_id) أو لعيادة (clinic_id) — واحد فقط
alter table payments add column if not exists clinic_id uuid references clinics (id) on delete cascade;
alter table payments alter column shop_id drop not null;
alter table payments drop constraint if exists payments_one_payer;
alter table payments add constraint payments_one_payer check ((shop_id is null) <> (clinic_id is null));
create index if not exists payments_clinic on payments (clinic_id, created_at) where clinic_id is not null;
