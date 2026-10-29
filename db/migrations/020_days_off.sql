-- أيّام العطل (أعياد وطنية ودينية، إجازات): لا أرقام ولا مواعيد في هذه الأيّام.
-- [{ "day": "2026-11-01", "label": "عيد الثورة" }] — الأيّام الماضية تُحذف عند كلّ حفظ.
alter table shops add column if not exists days_off jsonb not null default '[]'::jsonb;
