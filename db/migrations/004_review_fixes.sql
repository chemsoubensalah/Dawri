-- سبب فشل التحقّق عبر واتساب (لعرضه على صفحة المريض)
alter table wa_verifications add column if not exists failed_reason text;
-- جدول الترحيلات نفسه مقفل أيضاً أمام مفتاح Supabase العامّ
alter table _migrations enable row level security;
