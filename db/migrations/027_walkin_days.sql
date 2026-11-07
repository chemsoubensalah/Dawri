-- «أيّام مفتوحة بلا حجز إلكتروني»: أيّام أسبوع و/أو تواريخ لا يحجز فيها المريض بنفسه؛
-- الطابور مفتوح، والمواعيد تُسجَّل عند السكرتيرة فقط — src/lib/domain/walkin.ts
alter table shops add column if not exists walkin_days jsonb;
