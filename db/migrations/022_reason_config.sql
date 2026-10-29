-- «سبب الزيارة» يقرّره الطبيب: off | list (قائمة يكتبها) | text (المريض يكتب) — src/lib/domain/reasons.ts
-- null = الإعداد الافتراضي حسب نوع العيادة.
alter table shops add column if not exists reason_cfg jsonb;

-- السبب صار نصّاً حرّاً أحياناً (حتى 120 حرفاً) بعد أن كان رمزاً قصيراً
alter table tickets drop constraint if exists tickets_reason_check;
alter table tickets add constraint tickets_reason_check check (reason is null or char_length(reason) <= 200);
alter table appointments drop constraint if exists appointments_reason_check;
alter table appointments add constraint appointments_reason_check check (reason is null or char_length(reason) <= 200);
alter table wa_verifications drop constraint if exists wa_verifications_reason_check;
alter table wa_verifications add constraint wa_verifications_reason_check check (reason is null or char_length(reason) <= 200);
