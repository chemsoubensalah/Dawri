-- «إيقاف استقبال مرضى جدد»: من أوقفه ومتى (يظهر للطبيب والسكرتيرة في لوحة الطابور)
alter table queue_days add column if not exists closed_at timestamptz;
alter table queue_days add column if not exists closed_by text;
