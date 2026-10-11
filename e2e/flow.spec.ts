import { expect, test, type Browser, type Page } from "@playwright/test";

let phoneSeq = 20;

async function takeNumber(page: Page, name: string, url = "/s/demo") {
  await page.goto(url);
  await page.getByLabel("اسمك").fill(name);
  await page.getByLabel("رقم هاتفك").fill(`0661 00 00 ${phoneSeq++}`);
  await page.getByRole("button", { name: "أرسل رمز التحقّق" }).click();
  const code = await page.locator("b.num").first().textContent();
  await page.getByLabel("رمز التحقّق").fill(code!.trim());
  await page.getByRole("button", { name: "تأكيد وأخذ الرقم" }).click();
  await page.waitForURL(/\/t\//);
  return Number(await page.getByTestId("my-number").textContent());
}

async function staffPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/staff/demo");
  await page.getByLabel("أدخل الرمز").fill("1234");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByTestId("next")).toBeVisible();
  return page;
}

test("رحلة كاملة: رقم ← نداء ← غياب ← عودة ← خدمة", async ({ page, browser }) => {
  // زبون 1 يأخذ رقماً من هاتفه
  const n1 = await takeNumber(page, "أحمد");
  await expect(page.getByTestId("status")).toContainText("أنت التالي");
  await page.screenshot({ path: "test-results/ticket-waiting.png", fullPage: true });

  // زبون 2 في نافذة أخرى
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  const n2 = await takeNumber(p2, "فاطمة");
  expect(n2).toBe(n1 + 1);
  await expect(p2.getByTestId("status")).toContainText("أمامك شخص واحد");

  // السكرتيرة
  const staff = await staffPage(browser);
  await expect(staff.getByTestId("queue")).toContainText("أحمد");
  await staff.getByRole("button", { name: /أضف|إضافة شخص/ }).first().click();
  await staff.getByTestId("add-name").fill("الحاج محمد");
  await staff.getByRole("button", { name: "أضف", exact: true }).click();
  await expect(staff.getByText(/أُضيف برقم/)).toBeVisible();
  await staff.screenshot({ path: "test-results/staff.png", fullPage: true });

  // نادِ الأوّل ← هاتف أحمد يعرض «دورك الآن»
  await staff.getByTestId("next").click();
  await expect(staff.getByTestId("current-number")).toHaveText(String(n1));
  await expect(page.getByTestId("status")).toContainText("دورك الآن", { timeout: 15_000 });

  // لم يحضر ← نافذة تأكيد ← يُؤجَّل وتُنادى فاطمة
  await staff.getByTestId("no-show").click();
  await staff.getByTestId("confirm-yes").click();
  await expect(staff.getByTestId("current-number")).toHaveText(String(n2));
  await expect(staff.getByText("مؤجَّلون")).toBeVisible();
  await expect(page.getByTestId("status")).toContainText("دورك مؤجَّل");
  await expect(p2.getByTestId("status")).toContainText("دورك الآن");

  // أحمد يصل ويمسح رمز الباب ← «وصلت» ← يدخل بعد الحالي
  await page.goto("/s/demo?c=door-demo");
  await page.getByRole("button", { name: "وصلت ✔" }).click();
  await page.waitForURL(/\/t\//);
  // أمامه فقط من في الداخل الآن (فاطمة)، قبل الحاج محمد
  await expect(page.getByTestId("status")).toContainText("أمامك شخص واحد");
  await expect(page.getByText("في القاعة ✔")).toBeVisible();

  await staff.getByTestId("next").click();
  await expect(staff.getByTestId("current-number")).toHaveText(String(n1));
  await staff.getByTestId("next").click(); // خُدم أحمد ← الحاج محمد
  await expect(page.getByTestId("status")).toContainText("انتهى دورك");
  await expect(p2.getByTestId("status")).toContainText("انتهى دورك");
});

test("الواجهة بالفرنسية", async ({ page }) => {
  await page.goto("/s/demo?lang=fr");
  await expect(page.getByRole("heading", { name: "Prendre un numéro" })).toBeVisible();
  await page.goto("/s/demo");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Prendre un numéro" })).toBeVisible();
  await page.screenshot({ path: "test-results/shop-fr.png", fullPage: true });
});

test("رمز باب خاطئ لا يسجّل الوصول", async ({ page }) => {
  await takeNumber(page, "سمير");
  await page.goto("/s/demo?c=wrong");
  await page.getByRole("button", { name: "وصلت ✔" }).click();
  await expect(page.getByText(/رمز الباب غير صحيح/)).toBeVisible();
});

test("ملصق QR وشاشة القاعة", async ({ browser }) => {
  const staff = await staffPage(browser);
  await staff.goto("/staff/demo/qr");
  await expect(staff.locator("svg").first()).toBeVisible();
  await staff.screenshot({ path: "test-results/poster.png", fullPage: true });
  await staff.goto("/d/demo");
  await expect(staff.getByText("الرقم الحالي")).toBeVisible();
  const manifest = await staff.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await staff.request.get("/icons/192")).headers()["content-type"]).toContain("image/png");
});

test("الأصوات: زبون جديد، أخذ الرقم، التالي، دورك", async ({ page, browser }) => {
  const sounds = (p: Page) => p.evaluate(() => (window as unknown as { __dawriSoundLog?: string[] }).__dawriSoundLog ?? []);
  const staff = await staffPage(browser);
  // ننهي ما بقي من الاختبارات السابقة كي يكون الزبون الجديد هو التالي
  while (await staff.getByTestId("next").isEnabled()) {
    await staff.getByTestId("next").click();
    await staff.waitForTimeout(300);
    if ((await staff.getByTestId("queue").count()) === 0) break;
  }

  // 1) الزبون يأخذ رقماً ← نغمة التأكيد على هاتفه
  const n = await takeNumber(page, "صوت");
  await expect.poll(() => sounds(page)).toContain("taken");

  // 2) شاشة السكرتيرة تسمع «زبون جديد» وتعرض رسالة
  await expect(staff.getByTestId("newcomer")).toContainText(`${n}`, { timeout: 15_000 });
  await expect.poll(() => sounds(staff)).toContain("new");

  // 3) «التالي» ← دينغ-دونغ عند السكرتيرة، وإنذار «دورك» على هاتف الزبون
  if ((await staff.getByTestId("current-number").textContent())?.trim() !== String(n)) {
    await staff.getByTestId("next").click();
  }
  await expect(staff.getByTestId("current-number")).toHaveText(String(n));
  await expect.poll(() => sounds(staff)).toContain("next");
  await expect(page.getByTestId("status")).toContainText("دورك الآن", { timeout: 15_000 });
  await expect.poll(() => sounds(page)).toContain("alarm");

  // زرّ الكتم يعمل ويُحفظ
  await staff.getByTestId("mute-toggle").click();
  expect(await staff.evaluate(() => localStorage.getItem("dawri:muted"))).toBe("1");
});
