-- سبب الزيارة: رمز من قائمة ثابتة حسب نوع العيادة (src/lib/domain/reasons.ts) — بلا نصّ حرّ،
-- فلا تُخزَّن تفاصيل طبّية. يبقى بعد إخفاء الاسم والهاتف (لا يدلّ على شخص) لإحصاءات الطبيب.
alter table tickets add column if not exists reason text check (reason is null or char_length(reason) <= 20);
alter table appointments add column if not exists reason text check (reason is null or char_length(reason) <= 20);
alter table wa_verifications add column if not exists reason text check (reason is null or char_length(reason) <= 20);
