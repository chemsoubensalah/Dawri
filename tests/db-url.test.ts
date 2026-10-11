import { describe, expect, it } from "vitest";
import { normalizeDbUrl } from "@/lib/server/db";

const HOST = "aws-1-eu-central-1.pooler.supabase.com:6543";
const ok = (pass: string) => `postgresql://postgres.abc:${pass}@${HOST}/postgres`;

describe("normalizeDbUrl — أخطاء لصق رابط Supabase", () => {
  it("يترك الرابط السليم كما هو", () => {
    expect(normalizeDbUrl(ok("Secret123"))).toBe(ok("Secret123"));
  });

  it("يرمّز الرموز الخاصّة في كلمة السرّ", () => {
    const fixed = normalizeDbUrl(`postgresql://postgres.abc:pa#s/s?w@rd%@${HOST}/postgres`);
    const u = new URL(fixed);
    expect(decodeURIComponent(u.password)).toBe("pa#s/s?w@rd%");
    expect(u.host).toBe(HOST);
    expect(u.username).toBe("postgres.abc");
    expect(u.pathname).toBe("/postgres");
  });

  it("لا يرمّز مرّتين كلمة سرّ مُرمَّزة مسبقاً", () => {
    expect(normalizeDbUrl(ok("pa%23ss"))).toBe(ok("pa%23ss"));
  });

  it("يزيل المسافات وعلامات التنصيص و DATABASE_URL= والأقواس", () => {
    expect(normalizeDbUrl(`  "${ok("Secret123")}"\n`)).toBe(ok("Secret123"));
    expect(normalizeDbUrl(`DATABASE_URL=${ok("Secret123")}`)).toBe(ok("Secret123"));
    expect(normalizeDbUrl(ok("[Secret123]"))).toBe(ok("Secret123"));
  });

  it("ينبّه إن بقيت [YOUR-PASSWORD]", () => {
    expect(() => normalizeDbUrl(ok("[YOUR-PASSWORD]"))).toThrow("YOUR-PASSWORD");
  });

  it("يحافظ على معاملات الرابط", () => {
    expect(new URL(normalizeDbUrl(`${ok("a#b")}?sslmode=require`)).searchParams.get("sslmode")).toBe("require");
  });
});

describe("describeDbUrl — وصف البنية دون كشف المحتوى", async () => {
  const { describeDbUrl } = await import("@/lib/server/http");
  it("يحدّد موضع الخطأ", () => {
    expect(describeDbUrl(undefined)).toBe("empty");
    expect(describeDbUrl(ok("Secret123"))).toBe("structure_ok");
    expect(describeDbUrl("postgres.abc:x@db.abc.supabase.co:5432/postgres")).toBe("no_scheme,not_pooler_host,no_port_6543");
    expect(describeDbUrl(ok("Sec ret"))).toBe("has_space");
    expect(describeDbUrl(ok("Secret123"))).not.toContain("Secret");
  });
  it("يزيل أسطراً جديدة دخلت أثناء اللصق", () => {
    expect(normalizeDbUrl(`postgresql://postgres.abc:Secret123@aws-1-eu-central-1.pooler.\nsupabase.com:6543/postgres`)).toBe(ok("Secret123"));
  });
});
