-- التجربة المجّانية صارت شهراً واحداً (= TRIAL_DAYS في src/lib/pricing.ts). الصفوف الموجودة لا تتغيّر.
alter table clinics alter column trial_ends_at set default (now() + interval '30 days');
