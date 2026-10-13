-- إصلاحات المراجعة (النموّ): تقرير يومي قابل للاستئناف + منع استغلال «ادعُ زميلاً».

-- 1) report_log: «الحجز» منفصل عن «الإرسال الناجح».
--    claimed_at = متى حجزت مهمّة ما هذا التقرير؛ sent_at = يُثبَّت فقط بعد نجاح الإرسال.
--    حجز أقدم من 10 دقائق بلا sent_at (مهمّة انقطعت) يُعاد حجزه في التشغيل التالي.
alter table report_log add column if not exists claimed_at timestamptz;
update report_log set claimed_at = coalesce(sent_at, now()) where claimed_at is null;
alter table report_log alter column claimed_at set default now();
alter table report_log alter column claimed_at set not null;
alter table report_log alter column sent_at drop default;
alter table report_log alter column sent_at drop not null;
create index if not exists report_log_unsent on report_log (day) where sent_at is null;

-- 2) مفتاح البريد الموحَّد: أحرف صغيرة، بلا «+وسم»، وبلا نقاط في Gmail
--    (D.r+2@googlemail.com و dr@gmail.com = نفس الصندوق).
create or replace function dawri_email_key(e text) returns text
language sql immutable as $$
  select case
    when x.l = '' or x.d = '' then null
    when x.d in ('gmail.com', 'googlemail.com') then nullif(replace(x.l, '.', ''), '') || '@gmail.com'
    else x.l || '@' || x.d
  end
  from (select split_part(split_part(lower(btrim(e)), '@', 1), '+', 1) as l,
               split_part(lower(btrim(e)), '@', 2) as d) x
$$;

-- كلّ بريد استُعمل يوماً لعيادة (يبقى بعد تغيير البريد أو حذف العيادة):
-- مكافأة التجربة لا تُمنح لبريد سبق استعماله، والدعوة الذاتية تُكشف ولو غيّر الداعي بريده.
create table if not exists shop_email_keys (
  email_key  text not null,
  shop_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (email_key, shop_id)
);
create index if not exists shop_email_keys_shop on shop_email_keys (shop_id);
alter table shop_email_keys enable row level security;

create or replace function dawri_record_email_key() returns trigger
language plpgsql as $$
begin
  if new.owner_email is not null and dawri_email_key(new.owner_email) is not null then
    insert into shop_email_keys (email_key, shop_id)
    values (dawri_email_key(new.owner_email), new.id)
    on conflict do nothing;
  end if;
  return null;
end
$$;

drop trigger if exists shops_email_keys on shops;
create trigger shops_email_keys
  after insert or update of owner_email on shops
  for each row execute function dawri_record_email_key();

insert into shop_email_keys (email_key, shop_id)
select dawri_email_key(owner_email), id from shops
where owner_email is not null and dawri_email_key(owner_email) is not null
on conflict do nothing;
