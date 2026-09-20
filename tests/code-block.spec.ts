import { expect, test } from "@playwright/test";

test("code remains readable when JavaScript is disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/docs/first-request`);
  await expect(page.locator(".code-plain").first()).toContainText("curl");
  await context.close();
});

test("HTTP code copying provides feedback and lazy highlighting preserves code", async ({ page }) => {
  await page.goto("/docs/first-request");
  const code = page.locator(".code-scroll-area").first();
  await code.scrollIntoViewIfNeeded();
  await expect(code.locator(".rs-line-number").first()).toBeVisible();
  await expect(code).toContainText("curl");
  await page.getByRole("button", { name: "复制代码", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "已复制代码", exact: true }).first()).toBeVisible();
});
