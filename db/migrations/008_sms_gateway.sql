-- رسائل SMS من هاتف العيادة نفسه (تطبيق «SMS Gateway for Android» — sms-gate.app).
-- إعداد واحد لكلّ عيادة. لا معطيات للمرضى هنا أبداً: بيانات الربط، وعدّاد شهري، وأوقات المحاولات فقط.
-- كلمة سرّ التطبيق مشفّرة (AES-256-GCM بمفتاح مشتقّ من SESSION_SECRET) ولا تُرسل إلى المتصفّح.
create table if not exists sms_gateways (
  shop_id        uuid primary key references shops (id) on delete cascade,
  provider       text not null default 'smsgate' check (provider in ('smsgate')),
  base_url       text not null check (char_length(base_url) between 10 and 200),
  username       text not null check (char_length(username) between 1 and 64),
  password_enc   text not null check (char_length(password_enc) between 1 and 600),
  enabled        boolean not null default true,
  send_called    boolean not null default true,
  send_soon      boolean not null default true,
  send_codes     boolean not null default true,
  device_name    text check (device_name is null or char_length(device_name) <= 80),
  last_ok_at     timestamptz,
  last_error     text check (last_error is null or char_length(last_error) <= 40),
  last_error_at  timestamptz,
  sent_month     text check (sent_month is null or sent_month ~ '^\d{4}-\d{2}$'),
  sent_count     int not null default 0 check (sent_count >= 0),
  -- أوقات الرسائل التجريبية وفحوص الربط (لحدّ «5 في الساعة») — بلا أرقام هواتف
  test_log       timestamptz[] not null default '{}',
  check_log      timestamptz[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table sms_gateways enable row level security;
