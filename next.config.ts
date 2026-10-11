import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // تُحمَّل في وقت التشغيل على الخادم فقط، لا تُجمَّع.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "web-push"],
  poweredByHeader: false,
  // ملفّات SQL تُقرأ وقت التشغيل للتحديث التلقائي للجداول
  outputFileTracingIncludes: { "/**": ["./db/migrations/**/*.sql"] },
};

export default nextConfig;
