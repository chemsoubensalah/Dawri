// يطبّق ملفّات db/migrations/*.sql على DATABASE_URL (Supabase).
// الاستعمال: DATABASE_URL=postgres://... npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL غير معرَّف");
  process.exit(1);
}
const u = new URL(url);
const local = ["localhost", "127.0.0.1"].includes(u.hostname) || u.searchParams.get("sslmode") === "disable";
u.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
const dir = path.join(process.cwd(), "db", "migrations");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  if (done.has(f)) {
    console.log(`✓ ${f} (مطبَّق سابقاً)`);
    continue;
  }
  await client.query("begin");
  try {
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into _migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log(`✓ ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`✗ ${f}:`, e.message);
    process.exit(1);
  }
}
await client.end();
