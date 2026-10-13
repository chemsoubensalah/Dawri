-- النموّ: التقرير اليومي للطبيب + برنامج «ادعُ زميلاً». لا معطيات مرضى هنا (أعداد فقط).

create table if not exists report_settings (
  shop_id uuid primary key references shops (id) on delete cascade,
  daily   boolean not null default true
);

-- تقرير واحد لكلّ عيادة ولكلّ يوم (متكرّر-الآمن)
create table if not exists report_log (
  shop_id uuid not null references shops (id) on delete cascade,
  day     text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  sent_at timestamptz not null default now(),
  primary key (shop_id, day)
);

-- «أرسل لي تقرير الأمس الآن»: للحدّ من التكرار (3 في اليوم)
create table if not exists report_previews (
  id         bigserial primary key,
  shop_id    uuid not null references shops (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists report_previews_shop on report_previews (shop_id, created_at);

create table if not exists referrals_codes (
  shop_id uuid primary key references shops (id) on delete cascade,
  code    text not null unique check (code ~ '^[A-Z0-9]{6,8}$')
);

create table if not exists referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_shop_id uuid not null references shops (id) on delete cascade,
  referred_shop_id uuid not null unique references shops (id) on delete cascade,
  created_at       timestamptz not null default now(),
  rewarded_at      timestamptz,
  reward_days      int not null default 0
);
create index if not exists referrals_referrer on referrals (referrer_shop_id, rewarded_at);

alter table report_settings  enable row level security;
alter table report_log       enable row level security;
alter table report_previews  enable row level security;
alter table referrals_codes  enable row level security;
alter table referrals        enable row level security;
