/**
 * Cache des lectures « chaudes » (src/lib/server/db.ts) : les écrans qui se rafraîchissent partagent une lecture,
 * mais une écriture, une transaction ou l'expiration rendent toujours la donnée à jour.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { clearReadCache, createPgDb, createPgliteDb, dbStats, READ_CACHE_MS, type Db } from "@/lib/server/db";

let db: Db;
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  db = url ? await createPgDb(url) : await createPgliteDb();
  await db.exec("drop table if exists cache_probe; create table cache_probe (id int primary key, v text)");
  await db.query("insert into cache_probe values (1, 'a')");
});
afterAll(async () => {
  await db.exec("drop table if exists cache_probe");
  await db.close();
});

const read = () => db.query<{ v: string }>("select v from cache_probe where id = $1", [1], { cache: true }).then((r) => r[0].v);

it("une lecture répétée est servie par le cache, une écriture le vide aussitôt", async () => {
  expect(READ_CACHE_MS).toBeGreaterThan(0);
  clearReadCache();
  const q0 = dbStats.queries;
  expect(await read()).toBe("a");
  expect(await read()).toBe("a");
  expect(await read()).toBe("a");
  expect(dbStats.queries - q0).toBe(1); // une seule lecture réelle
  await db.query("update cache_probe set v = 'b' where id = 1");
  expect(await read()).toBe("b");
  // sans opts.cache : toujours la base
  const q1 = dbStats.queries;
  await db.query("select v from cache_probe where id = 1");
  await db.query("select v from cache_probe where id = 1");
  expect(dbStats.queries - q1).toBe(2);
});

it("une transaction lit la base (jamais le cache) et son commit vide le cache", async () => {
  clearReadCache();
  expect(await read()).toBe("b");
  await db.tx(async (q) => {
    await q.query("update cache_probe set v = 'c' where id = 1");
    const inside = await q.query<{ v: string }>("select v from cache_probe where id = 1", [], { cache: true });
    expect(inside[0].v).toBe("c");
  });
  expect(await read()).toBe("c");
  await db.exec("update cache_probe set v = 'd' where id = 1");
  expect(await read()).toBe("d");
});

it("les paramètres font partie de la clé, et la lecture expire après READ_CACHE_MS", async () => {
  clearReadCache();
  await db.query("insert into cache_probe values (2, 'x') on conflict (id) do nothing");
  const byId = (id: number) => db.query<{ v: string }>("select v from cache_probe where id = $1", [id], { cache: true }).then((r) => r[0]?.v);
  expect(await byId(1)).toBe("d");
  expect(await byId(2)).toBe("x");
  const realNow = Date.now;
  try {
    const t = realNow();
    Date.now = () => t + READ_CACHE_MS + 1;
    const q0 = dbStats.queries;
    await byId(1);
    expect(dbStats.queries - q0).toBe(1);
  } finally {
    Date.now = realNow;
  }
});
