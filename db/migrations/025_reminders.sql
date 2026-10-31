-- تذكير صباح يوم الموعد برسالة من هاتف العيادة (src/lib/server/reminders.ts)
-- مفعّل افتراضياً لمن ربط هاتف العيادة؛ الطبيب يوقفه من «رسائل SMS».
alter table sms_gateways add column if not exists send_reminder boolean not null default true;
-- رسالة واحدة لكلّ موعد: يُحجز قبل الإرسال، ويُفرَّغ إن فشل الإرسال فشلاً مؤكَّداً (يُعاد لاحقاً)
alter table appointments add column if not exists reminded_at timestamptz;
