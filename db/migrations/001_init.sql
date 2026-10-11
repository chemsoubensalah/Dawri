-- دوري — المخطّط الأوّلي
-- يُنفَّذ على Supabase (محرّر SQL) أو عبر: npm run db:migrate
-- لا معلومات طبّية هنا أبداً: اسم ورقم هاتف فقط.

create table if not exists shops (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name            text not null check (char_length(name) between 2 and 80),
  kind            text not null default 'doctor',
  pin_hash        text not null,
  door_code       text not null,
  hours           jsonb not null,
  settings        jsonb not null default '{}'::jsonb,
  default_lang    text not null default 'ar' check (default_lang in ('ar', 'fr')),
  trial_ends_at   timestamptz not null,
  paid_until      timestamptz,
  failed_logins   int not null default 0,
  locked_until    timestamptz,
  session_version int not null default 1,
  created_at      timestamptz not null default now()
);

-- صفّ واحد لكلّ محلّ ولكلّ يوم: عدّاد الأرقام + فتح/غلق الطابور.
-- يُقفل هذا الصفّ (FOR UPDATE) في كلّ عملية تغيّر الطابور، فلا تتعارض ضغطتان.
create table if not exists queue_days (
  shop_id     uuid not null references shops (id) on delete cascade,
  day         text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  last_number int not null default 0,
  closed      boolean not null default false,
  primary key (shop_id, day)
);

create table if not exists tickets (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops (id) on delete cascade,
  day                text not null,
  number             int not null,
  name               text not null check (char_length(name) between 1 and 60),
  phone              text,
  lang               text not null default 'ar',
  source             text not null check (source in ('online', 'desk')),
  status             text not null check (status in (
                       'pending_approval', 'waiting', 'called', 'deferred',
                       'done', 'cancelled', 'no_show', 'expired', 'rejected')),
  held               boolean not null default false,
  created_at         timestamptz not null default now(),
  called_at          timestamptz,
  done_at            timestamptz,
  deferred_at        timestamptz,
  arrived_at         timestamptz,
  confirm_asked_at   timestamptz,
  confirmed_at       timestamptz,
  notified_soon_at   timestamptz,
  closed_at          timestamptz,
  unique (shop_id, day, number)
);

-- قاعدة: تذكرة واحدة لكلّ رقم هاتف في اليوم لكلّ محلّ.
create unique index if not exists tickets_one_per_phone_per_day
  on tickets (shop_id, day, phone) where phone is not null;
create index if not exists tickets_shop_day_status on tickets (shop_id, day, status);

-- سجلّ الغياب: يُمحى بعد شهرين (انظر /api/cron).
create table if not exists no_shows (
  id         bigserial primary key,
  shop_id    uuid not null references shops (id) on delete cascade,
  phone      text not null,
  ticket_id  uuid,
  created_at timestamptz not null default now()
);
create index if not exists no_shows_lookup on no_shows (shop_id, phone, created_at);

-- رموز التحقّق من الهاتف (نحفظ البصمة فقط، لا الرمز).
create table if not exists phone_codes (
  id         bigserial primary key,
  shop_id    uuid not null references shops (id) on delete cascade,
  phone      text not null,
  code_hash  text not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists phone_codes_lookup on phone_codes (shop_id, phone, created_at);

create table if not exists push_subscriptions (
  ticket_id  uuid primary key references tickets (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- الأمان: كلّ الوصول يمرّ عبر خادم التطبيق. نفعّل RLS بلا سياسات،
-- فلا يستطيع مفتاح anon في Supabase قراءة أيّ شيء مباشرة.
alter table shops              enable row level security;
alter table queue_days         enable row level security;
alter table tickets            enable row level security;
alter table no_shows           enable row level security;
alter table phone_codes        enable row level security;
alter table push_subscriptions enable row level security;
