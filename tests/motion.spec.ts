import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off", reducedMotion: "no-preference" });

test("reading transitions preserve content and stop when reduced motion is enabled", async ({ page }) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const result = animate.apply(this, args);
      if (this.hasAttribute("data-motion-region")) {
        this.setAttribute("data-motion-count", String(Number(this.getAttribute("data-motion-count")) + 1));
        const frames = result.effect instanceof KeyframeEffect ? result.effect.getKeyframes() : [];
        this.setAttribute("data-motion-start-opacity", String(frames?.[0]?.opacity));
        this.setAttribute("data-motion-duration", String(result.effect?.getTiming().duration));
        result.addEventListener("finish", () => this.setAttribute("data-motion-finished", "true"));
      }
      return result;
    };
  });
  await page.goto("/");
  const region = page.locator("[data-motion-region]");
  await expect(page.getByRole("button", { name: "切换主题" })).toBeEnabled();
  const initialCount = Number(await region.getAttribute("data-motion-count"));
  expect(initialCount).toBeGreaterThan(0);
  await expect(region).toHaveAttribute("data-motion-start-opacity", "0.5");
  await expect(region).toHaveAttribute("data-motion-duration", "220");
  await expect(region).toHaveAttribute("data-motion-finished", "true");
  await page.locator(".public-sidebar a[href='/docs/channels']").click();
  await expect(page).toHaveURL(/\/docs\/channels$/);
  await expect(region).toHaveAttribute("data-motion-count", String(initialCount + 1));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".public-sidebar .sidebar-link.active")).toHaveCSS("box-shadow", "none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => region.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.locator(".public-sidebar a[href='/docs/first-request']").click();
  await expect(page).toHaveURL(/\/docs\/first-request$/);
  await expect(region).toHaveAttribute("data-motion-count", String(initialCount + 1));
  await expect(page.locator(".theme-trigger")).toHaveCSS("transition-duration", "0s");
});

test("animated menus and collapsible settings preserve focus and editor state", async ({ page, context }) => {
  const headers = { Origin: process.env.APP_URL! };
  const login = await context.request.post("/api/auth/login", { headers, data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const response = await context.request.post("/api/documents", { headers, data: { title: `Motion check ${Date.now()}` } });
  expect(response.status()).toBe(201);
  const doc = await response.json();
  try {
    await page.goto(`/admin/${doc.id}`);
    await expect(page.locator(".bn-editor")).toBeVisible();
    await page.locator(".bn-editor").evaluate(element => element.setAttribute("data-instance-check", "original"));
    const settings = page.getByRole("button", { name: "页面设置", exact: true });
    for (let i = 0; i < 2; i++) {
      await settings.click();
      await expect(page.getByRole("textbox", { name: "访问路径" })).toBeVisible();
      await settings.click();
      await expect(page.getByRole("textbox", { name: "访问路径" })).toHaveCount(0);
      await expect.poll(() => page.locator(".ui-collapse").evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    }
    const more = page.getByRole("button", { name: "更多文档操作" });
    await more.click();
    await expect(page.getByRole("menu")).toHaveCSS("animation-name", "ui-surface-in");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page.locator(".bn-editor")).toHaveAttribute("data-instance-check", "original");
    await expect(page.locator(".admin-icon-button").first()).not.toHaveCSS("transition-duration", "0s");
  } finally {
    await context.request.delete(`/api/documents/${doc.id}`, { headers });
  }
});
