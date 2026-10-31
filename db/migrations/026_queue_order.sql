-- السكرتيرة تعيد ترتيب الطابور (↑ ↓): مكان التذكرة في الطابور بدل رقمها (null = رقمها)
-- src/lib/domain/queue.ts (queueOrder، planMove)
alter table tickets add column if not exists queue_pos double precision;
