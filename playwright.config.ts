import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const chromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 5"],
    launchOptions: fs.existsSync(chromium) ? { executablePath: chromium } : {},
  },
  webServer: {
    // قاعدة بيانات في الذاكرة + المحلّ التجريبي (demo / 1234)
    command: "npx next start -p 3100",
    env: { DAWRI_PGLITE_DIR: "memory" },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
