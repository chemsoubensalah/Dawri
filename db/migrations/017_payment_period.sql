-- نهاية الفترة التي يغطّيها كلّ دفع (= paid_until بعد التمديد): لنعرف هل الاشتراك الحالي مدفوع فعلاً أم «هدية».
alter table payments add column if not exists period_end timestamptz;

-- الدفعات القديمة: آخر دفعة لكلّ طابور/عيادة تنتهي عند paid_until الحالي؛ البقيّة تقريباً (تاريخ الدفع + المدّة)
update payments p set period_end = s.paid_until
  from shops s
 where p.period_end is null and p.shop_id = s.id and s.paid_until is not null
   and p.id = (select max(x.id) from payments x where x.shop_id = s.id and x.status = 'paid');
update payments p set period_end = c.paid_until
  from clinics c
 where p.period_end is null and p.clinic_id = c.id and c.paid_until is not null
   and p.id = (select max(x.id) from payments x where x.clinic_id = c.id and x.status = 'paid');
update payments set period_end = coalesce(paid_at, created_at) + make_interval(months => months)
 where period_end is null and status = 'paid';
