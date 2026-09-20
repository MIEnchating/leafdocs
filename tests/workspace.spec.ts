import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off", reducedMotion: "reduce" });
const headers = () => ({ Origin: process.env.APP_URL! });

async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { headers: headers(), data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  expect(response.status()).toBe(200);
}
async function create(request: APIRequestContext, title: string) {
  const response = await request.post("/api/documents", { headers: headers(), data: { title } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function menu(page: Page, label: string) {
  await page.getByRole("button", { name: "更多文档操作" }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

test("document title, icon, publishing, preview, history and confirmation share consistent state", async ({ page, context }) => {
  await login(context.request);
  const doc = await create(context.request, `UI workflow ${Date.now()}`);
  const title = `界面回归 ${Date.now()}`;
  try {
    await page.goto(`/admin/${doc.id}`);
    await expect(page.locator(".bn-editor")).toBeVisible();
    await page.getByRole("textbox", { name: "文档标题" }).fill(title);
    await page.getByRole("button", { name: "文档图标", exact: true }).click();
    await page.getByRole("button", { name: "导航", exact: true }).click();
    await expect(page.getByText("所有更改已保存", { exact: true })).toBeVisible();
    await expect.poll(async () => (await (await context.request.get(`/api/documents/${doc.id}`)).json()).icon).toBe("compass");
    await page.getByRole("button", { name: "页面设置", exact: true }).click();
    await page.getByRole("combobox", { name: "所属目录" }).click();
    await expect(page.getByRole("option", { name: title, exact: true })).toHaveCount(0);
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "所属目录" })).toBeFocused();
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await expect(page.getByRole("button", { name: "已发布", exact: true })).toBeDisabled();
    const reader = await context.newPage();
    await reader.goto(`/docs/${doc.slug}`);
    await expect(reader.getByRole("heading", { level: 1 })).toHaveText(title);
    const published = await (await context.request.get(`/api/documents/${doc.id}`)).json();
    expect(published.version).toBe(published.publishedVersion);
    await page.getByRole("textbox", { name: "文档标题" }).fill(`${title} 草稿`);
    await expect(page.getByText("所有更改已保存", { exact: true })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.getByRole("button", { name: "预览", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "草稿预览" });
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText(`${title} 草稿`);
    expect(await preview.locator(".bn-editor").count()).toBe(0);
    await page.keyboard.press("Escape");
    await menu(page, "历史版本");
    const history = page.getByRole("dialog", { name: "历史版本" });
    await history.getByRole("button", { name: "恢复", exact: true }).last().click();
    let confirm = page.getByRole("alertdialog", { name: "恢复历史版本？" });
    await expect(confirm.getByRole("button", { name: "取消" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(history).toBeVisible();
    await expect(confirm).not.toBeVisible();
    await history.getByRole("button", { name: "恢复", exact: true }).last().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "恢复草稿" }).click();
    await expect(history).not.toBeVisible();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toHaveValue(doc.title);
    await menu(page, "删除文档");
    confirm = page.getByRole("alertdialog", { name: "删除文档？" });
    await confirm.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("button", { name: "更多文档操作" })).toBeFocused();
    await menu(page, "删除文档");
    await page.getByRole("alertdialog").getByRole("button", { name: "删除文档", exact: true }).click();
    await expect.poll(async () => (await context.request.get(`/api/documents/${doc.id}`)).status()).toBe(404);
    await reader.close();
  } finally {
    await context.request.delete(`/api/documents/${doc.id}`, { headers: headers() });
  }
});

test("site settings persist across public and admin pages, nested icon picker and optimistic conflicts", async ({ page, context, playwright, baseURL }) => {
  await login(context.request);
  const baseline = await (await context.request.get("/api/settings")).json();
  const title = `知识文库 ${Date.now()}`;
  try {
    await page.goto("/admin");
    await page.getByRole("button", { name: "站点设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "站点设置", exact: true });
    await expect(dialog.getByRole("textbox", { name: "文档站名称" })).toBeEnabled();
    await dialog.getByRole("textbox", { name: "文档站名称" }).fill(title);
    await dialog.getByRole("button", { name: "站点图标", exact: true }).click();
    await page.getByRole("button", { name: "提示", exact: true }).click();
    await dialog.getByRole("button", { name: "保存设置" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".admin-desktop-sidebar .admin-brand")).toHaveText(title);
    const saved = await (await context.request.get("/api/settings")).json();
    expect(saved.icon).toBe("idea");
    expect((await context.request.patch("/api/settings", { headers: headers(), data: { title: "stale", icon: baseline.icon, description: baseline.description, version: baseline.version } })).status()).toBe(409);
    const anonymous = await playwright.request.newContext({ baseURL });
    expect((await anonymous.get("/api/settings")).status()).toBe(401);
    expect((await anonymous.patch("/api/settings", { headers: headers(), data: { title: "unauthorized", icon: "book", description: "", version: saved.version } })).status()).toBe(401);
    await anonymous.dispose();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page).toHaveTitle(title);
    await page.goto("/admin");
    await page.getByRole("button", { name: "站点设置", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "文档站名称" })).toBeEnabled();
    await dialog.getByRole("textbox", { name: "文档站名称" }).fill("discard me");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "放弃站点设置修改？" });
    await confirm.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await confirm.getByRole("button", { name: "放弃修改" }).click();
    await expect(dialog).not.toBeVisible();
  } finally {
    const current = await (await context.request.get("/api/settings")).json();
    const restored = await context.request.patch("/api/settings", { headers: headers(), data: { title: baseline.title, icon: baseline.icon, description: baseline.description, version: current.version } });
    expect(restored.status()).toBe(200);
  }
});

test("mobile workspace navigation traps focus, closes on selection and stays within 320px", async ({ page, context }) => {
  await login(context.request);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/admin");
  await expect(page.locator(".bn-editor")).toBeVisible();
  const trigger = page.getByRole("button", { name: "打开文档导航" });
  await trigger.click();
  const nav = page.getByRole("dialog", { name: "工作台文档导航" });
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "退出登录", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog")?.getAttribute("aria-label"))).toBe("工作台文档导航");
  await nav.locator(".tree-document").first().click();
  await expect(nav).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await trigger.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(nav).not.toBeVisible();
});

test("switching documents flushes pending changes and summaries exclude content", async ({ page, context }) => {
  await login(context.request);
  const first = await create(context.request, `Navigation A ${Date.now()}`);
  const second = await create(context.request, `Navigation B ${Date.now()}`);
  try {
    const summaries = await (await context.request.get("/api/documents")).json();
    expect(summaries.every((doc: Record<string, unknown>) => !Object.hasOwn(doc, "content") && !Object.hasOwn(doc, "publishedContent"))).toBe(true);
    await page.goto(`/admin/${first.id}`);
    await page.getByRole("textbox", { name: "文档标题" }).fill("Pending navigation change");
    await page.locator(".admin-desktop-sidebar .tree-document").filter({ hasText: second.title }).click();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toHaveValue(second.title);
    await page.getByRole("textbox", { name: "文档标题" }).fill("Pending browser back change");
    await page.goBack();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toHaveValue("Pending navigation change");
    await expect.poll(async () => (await (await context.request.get(`/api/documents/${second.id}`)).json()).title).toBe("Pending browser back change");
  } finally {
    await context.request.delete(`/api/documents/${second.id}`, { headers: headers() });
    await context.request.delete(`/api/documents/${first.id}`, { headers: headers() });
  }
});

test("failed document loading offers retry without presenting an empty workspace", async ({ page, context }) => {
  await login(context.request);
  const doc = await create(context.request, `Load recovery ${Date.now()}`);
  let fail = true;
  try {
    await page.route(`**/api/documents/${doc.id}`, route => fail
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "连接暂时不可用" }) })
      : route.continue());
    await page.goto(`/admin/${doc.id}`);
    await expect(page.getByRole("heading", { name: "文档未能加载" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "创建第一篇文档" })).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "重新加载文档" }).click();
    await expect(page.getByRole("textbox", { name: "文档标题" })).toHaveValue(doc.title);
    await expect(page.locator(".bn-editor")).toBeVisible();
  } finally { await context.request.delete(`/api/documents/${doc.id}`, { headers: headers() }); }
});

test("save failures retain recovery controls while editing and publishing preserves the editor", async ({ page, context }) => {
  await login(context.request);
  const doc = await create(context.request, `Save recovery ${Date.now()}`);
  let fail = true;
  let patchRequests = 0;
  try {
    await page.goto(`/admin/${doc.id}`);
    await expect(page.locator(".bn-editor")).toBeVisible();
    await page.locator(".bn-editor").evaluate(element => element.setAttribute("data-instance-check", "original"));
    await page.route(`**/api/documents/${doc.id}`, route => {
      if (route.request().method() === "PATCH") {
        patchRequests++;
        expect(route.request().postDataJSON()).not.toHaveProperty("content");
        if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "保存暂时不可用" }) });
      }
      return route.continue();
    });
    const title = page.getByRole("textbox", { name: "文档标题" });
    await title.fill("第一次修改");
    await expect(page.getByRole("button", { name: "重试保存" })).toBeVisible();
    await title.fill("继续修改也能恢复");
    await expect(page.getByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(page.getByRole("button", { name: "下载当前草稿" })).toBeVisible();
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载当前草稿" }).click();
    expect((await downloadReady).suggestedFilename()).toBe(`${doc.slug}-draft.json`);
    expect(patchRequests).toBe(1);
    fail = false;
    await page.getByRole("button", { name: "重试保存" }).click();
    await expect(page.locator(".admin-save-state")).toHaveAttribute("aria-label", "所有更改已保存");
    expect((await (await context.request.get(`/api/documents/${doc.id}`)).json()).title).toBe("继续修改也能恢复");
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await expect(page.getByRole("button", { name: "已发布", exact: true })).toBeDisabled();
    await expect(page.locator(".bn-editor")).toHaveAttribute("data-instance-check", "original");
  } finally { await context.request.delete(`/api/documents/${doc.id}`, { headers: headers() }); }
});
