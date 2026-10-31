-- «طباعة التذاكر» (طابعة الاستقبال الحرارية): عرض الورق، حجم الكتابة، رمز QR — src/lib/domain/printing.ts
-- null = الافتراضي (80 مم، عادي، مع QR).
alter table shops add column if not exists print_cfg jsonb;
