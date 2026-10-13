import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // على Postgres حقيقي مشترك (TEST_DATABASE_URL) تتصادم الملفّات المتوازية على نفس الجداول: ملفّاً بعد ملفّ.
    // مع PGlite (الافتراضي) لكلّ ملفّ قاعدته في الذاكرة فيبقى التوازي.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
