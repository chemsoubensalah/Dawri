-- أدوار الطبيب/السكرتيرة + عيادات بعدّة أطبّاء
-- رمز السكرتيرة (اختياري): يدير الطابور فقط، دون الإعدادات أو الاشتراك
alter table shops add column if not exists assistant_pin_hash text;
alter table shops add column if not exists assistant_version int not null default 1;

-- عيادة = مجموعة أطبّاء (لكلّ طبيب طابوره واشتراكه). مدير العيادة يدخل برمزه.
create table if not exists clinics (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name            text not null check (char_length(name) between 2 and 80),
  owner_email     text check (owner_email is null or (char_length(owner_email) <= 254 and owner_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  pin_hash        text not null,
  session_version int not null default 1,
  failed_logins   int not null default 0,
  locked_until    timestamptz,
  look            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
alter table clinics enable row level security;

alter table shops add column if not exists clinic_id uuid references clinics (id) on delete set null;
alter table shops add column if not exists room text check (room is null or char_length(room) <= 30);
create index if not exists shops_clinic on shops (clinic_id) where clinic_id is not null;
