-- استعادة الرمز السرّي بالبريد الإلكتروني
alter table shops add column if not exists owner_email text
  check (owner_email is null or (char_length(owner_email) <= 254 and owner_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

-- روابط إعادة التعيين: نخزّن بصمة الرابط فقط (لا الرابط نفسه)، صالح 30 دقيقة ولمرّة واحدة
create table if not exists pin_resets (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists pin_resets_shop on pin_resets (shop_id, created_at);
alter table pin_resets enable row level security;
