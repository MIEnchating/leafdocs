import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("reader navigation responds while the destination is still loading", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.goto("/docs/first-request");
    await expect(page.getByRole("button", { name: "切换主题" })).toBeEnabled();
    await page.route("**/docs/channels?*", async route => { await waiting; await route.continue(); });
    await page.locator(".public-sidebar a[href='/docs/channels']").click();
    await expect(page.getByRole("status", { name: "正在打开文档" })).toBeVisible();
    await expect(page.locator(".reader-article")).toBeVisible();
    release();
    await expect(page).toHaveURL(/\/docs\/channels$/);
    await expect(page.getByRole("status", { name: "正在打开文档" })).toHaveCount(0);
  } finally { release(); }
});

test("workspace fetches during navigation and retains the previous editor until ready", async ({ page, context }) => {
  const headers = { Origin: process.env.APP_URL! };
  expect((await context.request.post("/api/auth/login", { headers, data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })).ok()).toBeTruthy();
  const docs: { id: string; title: string }[] = [];
  let releaseRoute!: () => void;
  let releaseDetail!: () => void;
  const routeReady = new Promise<void>(resolve => { releaseRoute = resolve; });
  const detailReady = new Promise<void>(resolve => { releaseDetail = resolve; });
  let detailRequests = 0;
  try {
    for (const name of ["Source", "Destination"]) {
      const result = await context.request.post("/api/documents", { headers, data: { title: `${name} navigation ${Date.now()}` } });
      expect(result.status()).toBe(201);
      docs.push(await result.json());
    }
    const [source, destination] = docs;
    await page.goto(`/admin/${source.id}`);
    await expect(page.locator(".bn-editor")).toBeVisible();
    await page.locator(".bn-editor").evaluate(element => element.setAttribute("data-original-editor", "true"));
    await page.route(`**/admin/${destination.id}?*`, async route => { await routeReady; await route.continue(); });
    await page.route(`**/api/documents/${destination.id}`, async route => {
      if (route.request().method() === "GET") { detailRequests++; await detailReady; }
      await route.continue();
    });
    await page.getByRole("textbox", { name: "文档标题" }).fill(`${source.title} edited`);
    await page.locator(".admin-desktop-sidebar .tree-document").filter({ hasText: destination.title }).click();
    await expect.poll(() => detailRequests).toBe(1);
    await expect(page.locator(".bn-editor")).toHaveAttribute("data-original-editor", "true");
    releaseRoute();
    await expect(page).toHaveURL(new RegExp(`/admin/${destination.id}$`));
    await expect(page.locator(".admin-editor-scroll")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".bn-editor")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toBeDisabled();
    releaseDetail();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toHaveValue(destination.title);
    await expect(page.getByRole("textbox", { name: "文档标题" })).toBeEnabled();
    expect(detailRequests).toBe(1);
    const saved = await (await context.request.get(`/api/documents/${source.id}`)).json();
    expect(saved.title).toBe(`${source.title} edited`);
  } finally {
    releaseRoute(); releaseDetail();
    for (const doc of docs) await context.request.delete(`/api/documents/${doc.id}`, { headers });
  }
});
