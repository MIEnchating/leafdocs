import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 960, height: 700 }, reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await page.goto("/docs/first-request");
  await expect(page.locator(".code-scroll-area .rs-line-number").first()).toBeVisible();
  await page.locator(".code-scroll-area").evaluate((area) => {
    const main = document.querySelector<HTMLElement>(".public-main")!;
    main.scrollTo({ top: area.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 16, behavior: "instant" });
  });
});

// Firefox may center the target during Playwright hover; measure wheel deltas after that positioning.
test("Shift + wheel scrolls the command without moving the document", async ({ page, browserName }) => {
  // Chromium maps Shift + vertical wheel to horizontal; other engines use deltaX gestures.
  test.skip(browserName !== "chromium", "Native Shift-to-horizontal mapping is browser-specific.");
  const area = page.locator(".code-scroll-area");
  await area.hover();
  const before = await page.locator(".public-main").evaluate(el => el.scrollTop);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Shift");
  await expect.poll(() => area.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.locator(".public-main").evaluate(el => el.scrollTop)).toBe(before);
});

test("vertical wheel over code scrolls the document without cancelling passive events", async ({ page }) => {
  const passiveErrors: string[] = [];
  page.on("console", (message) => {
    if (/passive.*event|preventDefault/i.test(message.text())) passiveErrors.push(message.text());
  });
  const area = page.locator(".code-scroll-area");
  await area.hover();
  const before = await page.locator(".public-main").evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.locator(".public-main").evaluate(el => el.scrollTop)).toBeGreaterThan(before + 100);
  expect(await area.evaluate((el) => el.scrollLeft)).toBe(0);
  expect(passiveErrors).toEqual([]);
});

test("horizontal wheel stays inside the code block", async ({ page }) => {
  const area = page.locator(".code-scroll-area");
  await area.hover();
  const before = await page.locator(".public-main").evaluate(el => el.scrollTop);
  await page.mouse.wheel(120, 0);
  await expect.poll(() => area.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.locator(".public-main").evaluate(el => el.scrollTop)).toBe(before);
});

test("vertical wheel still works at the horizontal end of a long command", async ({ page }) => {
  const area = page.locator(".code-scroll-area");
  const end = await area.evaluate((el) => { el.scrollLeft = el.scrollWidth; return el.scrollLeft; });
  await area.hover();
  const before = await page.locator(".public-main").evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.locator(".public-main").evaluate(el => el.scrollTop)).toBeLessThan(before - 100);
  expect(await area.evaluate((el) => el.scrollLeft)).toBe(end);
});

test("code in an independently scrolling panel scrolls that panel instead of the document", async ({ page }) => {
  const area = page.locator(".code-scroll-area");
  // Reuse the mounted component in a bounded panel to exercise its ancestor contract.
  await area.evaluate((el) => {
    const panel = document.createElement("div");
    panel.dataset.testPanel = "true";
    Object.assign(panel.style, { height: "250px", overflowY: "auto", overscrollBehavior: "contain" });
    el.parentElement!.before(panel);
    panel.append(el.parentElement!);
    const trailingSpace = document.createElement("div");
    trailingSpace.style.height = "600px";
    panel.append(trailingSpace);
    const main = document.querySelector<HTMLElement>(".public-main")!;
    main.scrollTo({ top: panel.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 16, behavior: "instant" });
  });
  await area.hover({ position: { x: 90, y: 50 } });
  const before = await page.locator(".public-main").evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.locator("[data-test-panel]").evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect(await page.locator(".public-main").evaluate(el => el.scrollTop)).toBe(before);
});

test("mobile reading keeps long commands inside one horizontal scrolling surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await page.locator(".code-scroll-area").evaluate((el) => ({
    horizontalRange: el.scrollWidth - el.clientWidth,
    verticalRange: el.scrollHeight - el.clientHeight,
    pageHorizontalRange: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nestedScrollers: Array.from(el.querySelectorAll("*"))
      .filter((child) => /(auto|scroll)/.test(getComputedStyle(child).overflowX) && child.scrollWidth > child.clientWidth).length,
  }));
  expect(geometry.horizontalRange).toBeGreaterThan(0);
  expect(geometry.verticalRange).toBeLessThanOrEqual(1);
  expect(geometry.pageHorizontalRange).toBe(0);
  expect(geometry.nestedScrollers).toBe(0);
});
