import { DomainError } from "@/lib/domain/types";
import { isAdmin } from "@/lib/server/admin";
import { getMailer } from "@/lib/server/email";
import { handle, readJson } from "@/lib/server/http";

/** لوحة المؤسّس: رسالة تجريبية + سبب الفشل كما يردّه المزوّد (لا يكشف المفتاح). */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new DomainError("unauthorized", 401);
    const to = String((await readJson(req)).to ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 254) throw new DomainError("invalid_email");
    const key = process.env.BREVO_API_KEY ?? "";
    const config = {
      provider: process.env.EMAIL_PROVIDER ?? null,
      from: process.env.EMAIL_FROM ?? null,
      brevoKey: key ? (key.trim() !== key ? "spaces" : key.startsWith("xkeysib-") ? "ok" : "bad_prefix") : "missing",
    };
    const mailer = getMailer();
    if (!mailer) return { ok: false, config, error: "no_mailer" };
    try {
      await mailer.send({ to, subject: "Dawri — test", text: "Test OK ✓", html: "<p>Test OK ✓ — Dawri</p>" });
      return { ok: true, config };
    } catch (e) {
      return { ok: false, config, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    }
  });
}
