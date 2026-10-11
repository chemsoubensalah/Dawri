-- ملفّ العيادة الظاهر للمرضى (كلّه اختياري) — لا معلومات طبّية عن المرضى.
alter table shops add column if not exists doctor_name text check (doctor_name is null or char_length(doctor_name) <= 80);
alter table shops add column if not exists specialty   text check (specialty is null or char_length(specialty) <= 80);
alter table shops add column if not exists address     text check (address is null or char_length(address) <= 160);
alter table shops add column if not exists phone       text check (phone is null or char_length(phone) <= 20);
alter table shops add column if not exists maps_url    text check (maps_url is null or (maps_url ~ '^https://' and char_length(maps_url) <= 500));
