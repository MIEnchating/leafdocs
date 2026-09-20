import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 720 }, reducedMotion: "reduce" });

test("outline follows reading position, anchors, bottom and document changes", async ({ page }) => {
  await page.goto("/docs/first-request");
  const outline = page.getByRole("navigation", { name: "本页内容" });
  await expect(outline).toHaveCSS("overflow-x", "hidden");
  expect(await outline.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  const links = outline.getByRole("link");
  const active = outline.locator('[aria-current="location"]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveText(await links.first().innerText());
  await expect(page.locator(".page-breadcrumb,.article-header .eyebrow,.site-footer,.sidebar-bottom")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "相邻文档" })).toBeVisible();
  await expect(page.getByText(/篇公开文档/)).toHaveCount(0);
  const secondHash = await links.nth(1).getAttribute("href");
  await page.evaluate(hash => {
    const heading = document.getElementById(decodeURIComponent(hash!.slice(1)))!;
    const main = document.querySelector<HTMLElement>(".public-main")!;
    main.scrollTo({ top: main.scrollTop + heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 16, behavior: "instant" });
  }, secondHash);
  await expect(active).toHaveAttribute("href", secondHash!);
  await page.locator(".public-main").evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  await expect(active).toHaveText(await links.last().innerText());
  await links.first().click();
  await expect(active).toHaveText(await links.first().innerText());
  await expect.poll(() => outline.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(80);
  await links.nth(1).click();
  await page.reload();
  await expect(active).toHaveAttribute("href", secondHash!);
  await page.locator('.public-sidebar a[href="/docs/channels"]').click();
  await expect(page).toHaveURL(/\/docs\/channels$/);
  await expect(active).toHaveCount(1);
  await expect(active).toHaveText(await links.first().innerText());
});

test("outline anchors remain usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 720 } });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/docs/first-request`);
    const link = page.getByRole("navigation", { name: "本页内容" }).getByRole("link").nth(1);
    const hash = await link.getAttribute("href");
    await link.click();
    expect(new URL(page.url()).hash).toBe(hash);
  } finally { await context.close(); }
});
