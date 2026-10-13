-- المواعيد (الحجز المسبق) مدمجة مع الطابور الحيّ.
-- اسم وهاتف فقط، كالتذاكر: لا سبب للزيارة ولا أيّ معلومة طبّية.

-- إعدادات الحجز لكلّ عيادة (لا صفّ = القيم الافتراضية، والحجز معطّل)
create table if not exists booking_settings (
  shop_id           uuid primary key references shops (id) on delete cascade,
  enabled           boolean not null default false,
  slot_min          int not null default 15 check (slot_min between 5 and 120),
  per_slot          int not null default 1 check (per_slot between 1 and 10),
  days_ahead        int not null default 14 check (days_ahead between 1 and 60),
  min_lead_min      int not null default 30 check (min_lead_min between 0 and 1440),
  -- null = نفس ساعات أخذ الأرقام (shops.hours)
  hours             jsonb,
  daily_max         int not null default 0 check (daily_max between 0 and 500),
  arrival_grace_min int not null default 20 check (arrival_grace_min between 0 and 120),
  updated_at        timestamptz not null default now()
);

create table if not exists appointments (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops (id) on delete cascade,
  day          text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  time         text not null check (time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  name         text not null check (char_length(name) between 1 and 60),
  phone        text,
  lang         text not null default 'ar' check (lang in ('ar', 'fr')),
  source       text not null check (source in ('online', 'desk')),
  status       text not null default 'booked' check (status in ('booked', 'cancelled', 'arrived', 'no_show')),
  -- التذكرة ذات الأولوية التي صار إليها الموعد عند الوصول
  ticket_id    uuid references tickets (id) on delete set null,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  arrived_at   timestamptz
);
create index if not exists appointments_shop_day on appointments (shop_id, day, time);
-- مسح الغياب (المهمّة اليومية + القراءة)
create index if not exists appointments_booked_day on appointments (day) where status = 'booked';
-- قاعدة: موعد نشط واحد لكلّ هاتف في اليوم لكلّ عيادة
create unique index if not exists appointments_one_active_per_phone_day
  on appointments (shop_id, day, phone) where phone is not null and status in ('booked', 'arrived');

-- تذاكر أصحاب المواعيد: تتقدّم الطابور (بترتيب وصولهم) قبل بقيّة الأرقام
alter table tickets add column if not exists priority boolean not null default false;

alter table booking_settings enable row level security;
alter table appointments     enable row level security;
