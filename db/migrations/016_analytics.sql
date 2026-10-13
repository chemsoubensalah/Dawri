-- إحصائيات الزيارات (لوحة المؤسّس): مجهولة الهويّة — لا عنوان IP ولا كوكي.
-- vid = بصمة يومية (sha256 لسرّ + اليوم + IP + المتصفّح) تتغيّر كلّ يوم: نعدّ الزوّار دون تتبّعهم.
create table if not exists visits (
  day      text not null,
  vid      text not null,
  section  text not null,
  shop     text not null default '',
  device   text not null,
  source   text not null,
  hour     smallint not null,
  views    int not null default 1,
  primary key (day, vid, section, shop)
);
create index if not exists visits_day on visits (day);
alter table visits enable row level security;
