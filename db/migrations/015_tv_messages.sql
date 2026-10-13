-- رسائل ونصائح يكتبها الطبيب وتظهر بالتناوب على شاشة القاعة
create table if not exists tv_messages (
  shop_id    uuid primary key references shops (id) on delete cascade,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table tv_messages enable row level security;
