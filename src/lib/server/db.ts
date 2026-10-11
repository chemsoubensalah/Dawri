/**
 * طبقة قاعدة البيانات: واجهة صغيرة (query + tx) بتنفيذين:
 *  - pg: للإنتاج (Supabase Postgres عبر DATABASE_URL).
 *  - PGlite: Postgres داخل العمليّة — للتطوير المحلّي بلا إعداد وللاختبارات.
 * نفس ملفّات SQL تعمل على الاثنين.
 */
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, unknown>;

export interface Q {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Q {
  tx<R>(fn: (q: Q) => Promise<R>): Promise<R>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: "pg" | "pglite";
}

/**
 * يصلح أخطاء اللصق الشائعة في رابط Supabase قبل قراءته:
 * مسافات أو علامات تنصيص زائدة، «DATABASE_URL=» في البداية، أقواس [ ] حول كلمة السرّ،
 * ورموز غير مُرمَّزة في كلمة السرّ (# / ? @ %…).
 */
export function normalizeDbUrl(raw: string): string {
  let s = raw.replace(/[\r\n\t]/g, "").trim().replace(/^DATABASE_URL\s*=\s*/i, "").trim();
  s = s.replace(/^["'](.*)["']$/s, "$1").trim();
  // الفاصل بين كلمة السرّ والعنوان هو آخر @ (العنوان لا يحتوي @)
  const m = /^(postgres(?:ql)?:\/\/)([^:@/]+):(.*)@([^@/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?$/s.exec(s);
  if (!m) return s;
  const [, scheme, user, rawPass, host, path = "", query = ""] = m;
  let pass = rawPass;
  if (/^\[.*\]$/.test(pass)) pass = pass.slice(1, -1); // [كلمة السرّ] ← كلمة السرّ
  if (pass === "YOUR-PASSWORD") throw new Error("DATABASE_URL still contains the [YOUR-PASSWORD] placeholder");
  try {
    pass = decodeURIComponent(pass); // إن كانت مُرمَّزة مسبقاً لا نرمّزها مرّتين
  } catch {}
  return `${scheme}${user}:${encodeURIComponent(pass)}@${host}${path}${query}`;
}

export async function createPgDb(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const u = new URL(normalizeDbUrl(url));
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.searchParams.get("sslmode") === "disable";
  u.searchParams.delete("sslmode");
  const ssl = local
    ? false
    : process.env.DATABASE_CA
      ? { ca: process.env.DATABASE_CA }
      : { rejectUnauthorized: false };
  const pool = new Pool({
    connectionString: u.toString(),
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000, // لا نترك الطلب معلّقاً إن تعذّر الوصول إلى القاعدة
  });
  return {
    kind: "pg",
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows as T[];
    },
    async tx<R>(fn: (q: Q) => Promise<R>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const res = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params as unknown[])).rows as T[];
          },
        });
        await client.query("commit");
        return res;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  return {
    kind: "pglite",
    async query<T>(sql: string, params?: unknown[]) {
      return (await pg.query(sql, params)).rows as T[];
    },
    async tx<R>(fn: (q: Q) => Promise<R>) {
      return pg.transaction(async (t) =>
        fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await t.query(sql, params)).rows as T[];
          },
        }),
      );
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async close() {
      await pg.close();
    },
  };
}

export function migrationsDir() {
  return path.join(process.cwd(), "db", "migrations");
}

function migrationFiles(): string[] {
  return fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * يطبّق ملفّات db/migrations/*.sql التي لم تُطبَّق بعد.
 * كلّ الملفّات مكتوبة لتُعاد بأمان (if not exists)، فلا ضرر إن طُبّق ملفّ يدوياً من محرّر Supabase.
 */
export async function migrate(db: Db) {
  if (db.kind === "pglite") {
    await db.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await db.query<{ name: string }>("select name from _migrations")).map((r) => r.name));
    for (const f of migrationFiles()) {
      if (done.has(f)) continue;
      await db.exec(fs.readFileSync(path.join(migrationsDir(), f), "utf8"));
      await db.query("insert into _migrations (name) values ($1)", [f]);
    }
    return;
  }
  // Postgres الحقيقي: عدّة خوادم قد تبدأ معاً ← قفل استشاري داخل معاملة واحدة
  await db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock(7461001)");
    await q.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await q.query<{ name: string }>("select name from _migrations")).map((r) => r.name));
    for (const f of migrationFiles()) {
      if (done.has(f)) continue;
      await q.query(fs.readFileSync(path.join(migrationsDir(), f), "utf8"));
      await q.query("insert into _migrations (name) values ($1) on conflict do nothing", [f]);
    }
  });
}

type G = { __dawriDb?: Promise<Db> };
const g = globalThis as G;

/** قاعدة البيانات المشتركة (مرّة واحدة لكلّ عمليّة). */
export function getDb(): Promise<Db> {
  if (!g.__dawriDb) {
    g.__dawriDb = (async () => {
      const url = process.env.DATABASE_URL;
      if (url) {
        const db = await createPgDb(url);
        // تحديث الجداول تلقائياً عند أوّل اتّصال (يمكن تعطيله بـ AUTO_MIGRATE=off)
        if (process.env.AUTO_MIGRATE !== "off") await migrate(db);
        return db;
      }
      if (process.env.VERCEL) throw new Error("DATABASE_URL is required on Vercel (see README)");
      // وضع التطوير/التجربة: Postgres مضمَّن، مع ترحيل تلقائي وبيانات تجريبية.
      const dir = process.env.DAWRI_PGLITE_DIR ?? ".pglite";
      const db = await createPgliteDb(dir === "memory" ? undefined : dir);
      await migrate(db);
      const { seedDemo } = await import("./seed");
      await seedDemo(db);
      return db;
    })();
    g.__dawriDb.catch(() => {
      g.__dawriDb = undefined;
    });
  }
  return g.__dawriDb;
}

/** للاختبارات فقط. */
export function setDb(db: Db | undefined) {
  g.__dawriDb = db ? Promise.resolve(db) : undefined;
}
