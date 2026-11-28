import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Version du site (le commit déployé). Les réponses /api la renvoient dans « x-dawri-build » et chaque page
 * la connaît : une page restée ouverte longtemps (télévision, tableau de bord) voit qu'une nouvelle version est
 * en ligne et se recharge, avant de redemander d'anciens fichiers de style qui n'existent plus.
 */
function buildId(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.DAWRI_BUILD_ID;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().slice(0, 12) || "dev";
  } catch {
    return "dev";
  }
}
const BUILD_ID = buildId();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "x-dawri-build", value: BUILD_ID }] }];
  },
  // تُحمَّل في وقت التشغيل على الخادم فقط، لا تُجمَّع.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "web-push"],
  poweredByHeader: false,
  // ملفّات SQL تُقرأ وقت التشغيل للتحديث التلقائي للجداول
  outputFileTracingIncludes: { "/**": ["./db/migrations/**/*.sql"] },
};

export default nextConfig;
