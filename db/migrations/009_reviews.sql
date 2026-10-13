-- التقييمات ودليل العيادات
-- الولاية (رمز 1–58 حالياً؛ نسمح حتى 69 تحسّباً للتقسيم الإداري الجديد)
alter table shops add column if not exists wilaya smallint
  check (wilaya is null or (wilaya between 1 and 69));
create index if not exists shops_wilaya on shops (wilaya);

-- تقييم واحد لكلّ تذكرة. لا اسم ولا هاتف: يبقى بعد تجهيل التذكرة.
create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops (id) on delete cascade,
  ticket_id   uuid unique references tickets (id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 300),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reviews_shop on reviews (shop_id, created_at desc);
alter table reviews enable row level security;

-- إعدادات الظهور: الطبيب يقرّر (مخفيّ افتراضياً)
create table if not exists review_settings (
  shop_id  uuid primary key references shops (id) on delete cascade,
  public   boolean not null default false,
  listed   boolean not null default false
);
create index if not exists review_settings_listed on review_settings (shop_id) where listed;
alter table review_settings enable row level security;
