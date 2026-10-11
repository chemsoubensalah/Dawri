import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // تُحمَّل في وقت التشغيل على الخادم فقط، لا تُجمَّع.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "web-push"],
  poweredByHeader: false,
};

export default nextConfig;
