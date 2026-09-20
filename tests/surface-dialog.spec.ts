import { expect, test } from "@playwright/test";

test("keyboard search is immediate and returns focus on Escape", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /搜索文档/ });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "搜索文档", exact: true });
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute("data-instant", "true");
  await expect(page.getByRole("textbox", { name: "搜索文档" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("mobile navigation traps focus, closes on navigation and releases the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "打开文档目录" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "浏览文档目录" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "进入文档工作台" }).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog")?.getAttribute("aria-label"))).toBe("浏览文档目录");
  await menu.locator('a[href^="/docs/"]').first().click();
  await expect(page).toHaveURL(/\/docs\//);
  await expect(menu).not.toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("mobile to desktop breakpoint closes the modal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开文档目录" }).click();
  await expect(page.getByRole("dialog", { name: "浏览文档目录" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog", { name: "浏览文档目录" })).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("theme dialog survives repeated open and close and honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "切换主题" });
  const panel = page.getByRole("dialog", { name: "主题选择" });
  for (let i = 0; i < 3; i++) {
    await trigger.click();
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await page.getByRole("button", { name: "浅石 冷灰与留白" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "stone");
  await expect(page.locator(".library-header")).toBeVisible();
});

test("landing content and guide links remain available without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".library-document").first()).toBeVisible();
  await page.locator(".library-document").first().click();
  await expect(page).toHaveURL(/\/docs\//);
  await context.close();
});
