-- مظهر العيادة: لون التطبيق وتصميم شاشة القاعة (يختارهما الطبيب من الإعدادات)
alter table shops add column if not exists look jsonb not null default '{}'::jsonb;
