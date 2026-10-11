-- واتساب: المريض يراسلنا أوّلاً (رابط wa.me) فنتحقّق من رقمه ونرسل له تنبيهاته.
alter table tickets add column if not exists wa_code text;
alter table tickets add column if not exists wa_user_id text;
alter table tickets add column if not exists wa_phone text;
alter table tickets add column if not exists wa_window_until timestamptz;
alter table tickets add column if not exists wa_opt_out boolean not null default false;
-- رقم «دوري» واحد لكلّ العيادات ← الرمز فريد في اليوم على مستوى المنصّة
create unique index if not exists tickets_wa_code_per_day on tickets (day, wa_code) where wa_code is not null;
create index if not exists tickets_wa_user on tickets (wa_user_id) where wa_user_id is not null;

-- تحقّق من الهاتف عبر واتساب (بديل مجّاني عن رمز SMS)
create table if not exists wa_verifications (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops (id) on delete cascade,
  code        text not null unique,
  name        text not null,
  phone       text not null,
  lang        text not null default 'ar',
  at_door     boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  verified_at timestamptz,
  ticket_id   uuid references tickets (id) on delete set null
);
create index if not exists wa_verifications_phone on wa_verifications (shop_id, phone, created_at);

-- رسائل واتساب الواردة (منع المعالجة المكرّرة)
create table if not exists wa_inbound (
  id         text primary key,
  created_at timestamptz not null default now()
);

-- مدفوعات الاشتراك (Chargily أو تحويل يدوي)
create table if not exists payments (
  id          bigserial primary key,
  shop_id     uuid not null references shops (id) on delete cascade,
  provider    text not null check (provider in ('chargily', 'manual')),
  checkout_id text unique,
  amount      int not null,
  months      int not null check (months between 1 and 24),
  status      text not null check (status in ('pending', 'paid', 'failed')),
  note        text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists payments_shop on payments (shop_id, created_at);

alter table wa_verifications enable row level security;
alter table wa_inbound       enable row level security;
alter table payments         enable row level security;
