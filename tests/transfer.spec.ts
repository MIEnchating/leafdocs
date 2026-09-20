import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { DocumentArchive } from "../src/lib/transfer";

test.use({ trace: "off", screenshot: "off", video: "off", ignoreHTTPSErrors: true });
const prefix = `transfer-${randomUUID().slice(0, 8)}`;
const origin = process.env.APP_URL!;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const imageUrl = `/api/uploads/${"a".repeat(48)}.png`;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text, styles: {} }] });

function fixture(): DocumentArchive {
  return { format: "leafdocs", version: 1, documents: [
    { id: "child", title: "子文档", slug: `${prefix}-child`, icon: "📄", parentId: "parent", position: 0, content: [paragraph("子文档内容")] },
    { id: "parent", title: "父文档", slug: `${prefix}-parent`, icon: "📁", parentId: null, position: 1, content: [
      paragraph("父文档内容"), { type: "image", props: { url: imageUrl, caption: "测试图片" } },
      { type: "paragraph", content: [{ type: "link", href: `/docs/${prefix}-child`, content: [{ type: "text", text: "子文档", styles: {} }] }] },
    ] },
  ], assets: [{ url: imageUrl, data: png.toString("base64") }] };
}

async function importArchive(request: APIRequestContext, data: unknown) {
  return request.post("/api/documents/import", { headers: { Origin: origin }, data });
}

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/auth/login", { headers: { Origin: origin }, data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  expect(response.status()).toBe(200);
});

test.afterEach(async ({ request }) => {
  const response = await request.get("/api/documents");
  if (!response.ok()) return;
  let docs = (await response.json()).filter((doc: { slug: string; title: string }) => doc.slug.startsWith(prefix) || doc.title.startsWith(prefix));
  while (docs.length) {
    const leaves = docs.filter((doc: { id: string }) => !docs.some((child: { parentId: string }) => child.parentId === doc.id));
    if (!leaves.length) break;
    for (const doc of leaves) await request.delete(`/api/documents/${doc.id}`, { headers: { Origin: origin } });
    docs = docs.filter((doc: { id: string }) => !leaves.some((leaf: { id: string }) => leaf.id === doc.id));
  }
});

test("exports require login and imports require the configured origin", async ({ request, playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  try {
    expect((await anonymous.get("/api/documents/export")).status()).toBe(401);
    expect((await anonymous.post("/api/documents/import", { headers: { Origin: origin }, data: fixture() })).status()).toBe(401);
    expect((await request.post("/api/documents/import", { headers: { Origin: "https://untrusted.example.com" }, data: fixture() })).status()).toBe(403);
  } finally { await anonymous.dispose(); }
});

test("JSON round trip preserves hierarchy and images as new drafts without overwriting originals", async ({ request }) => {
  const imported = await importArchive(request, fixture());
  expect(imported.status()).toBe(201);
  expect(await imported.json()).toMatchObject({ count: 2, renamed: 0 });
  let docs = await (await request.get("/api/documents")).json();
  const parent = docs.find((doc: { slug: string }) => doc.slug === `${prefix}-parent`);
  const child = docs.find((doc: { slug: string }) => doc.slug === `${prefix}-child`);
  expect(child.parentId).toBe(parent.id);
  expect(parent.publishedAt).toBeNull(); expect(child.publishedVersion).toBeNull();
  expect((await (await request.get(`/api/documents/${parent.id}/revisions`)).json()).length).toBe(1);
  const before = await (await request.get(`/api/documents/${parent.id}`)).json();
  const exported = await request.get("/api/documents/export");
  expect(exported.headers()["cache-control"]).toBe("no-store");
  const archive: DocumentArchive = await exported.json();
  archive.documents = archive.documents.filter(doc => [parent.id, child.id].includes(doc.id));
  expect(archive.assets.some(asset => asset.data === png.toString("base64"))).toBe(true);
  expect(JSON.stringify(archive)).not.toContain("passwordHash");
  const importedAgain = await importArchive(request, archive);
  expect(importedAgain.status()).toBe(201);
  expect(await importedAgain.json()).toMatchObject({ count: 2, renamed: 2 });
  docs = await (await request.get("/api/documents")).json();
  const secondParent = docs.find((doc: { id: string; title: string }) => doc.title === parent.title && doc.id !== parent.id);
  const secondChild = docs.find((doc: { parentId: string }) => doc.parentId === secondParent.id);
  expect(secondParent.publishedAt).toBeNull();
  const detail = await (await request.get(`/api/documents/${secondParent.id}`)).json();
  const newImageUrl = detail.content.find((block: { type: string }) => block.type === "image").props.url;
  expect(newImageUrl).not.toBe(before.content.find((block: { type: string }) => block.type === "image").props.url);
  expect(await (await request.get(newImageUrl)).body()).toEqual(png);
  expect(detail.content[2].content[0].href).toBe(`/docs/${secondChild.slug}`);
  expect(await (await request.get(`/api/documents/${parent.id}`)).json()).toEqual(before);
  expect((await request.get(`/docs/${secondParent.slug}`)).status()).toBe(404);
});

test("invalid archives are rejected atomically", async ({ request }) => {
  const before = await (await request.get("/api/documents")).json();
  const cycle = fixture(); cycle.documents[1].parentId = "child";
  const missingParent = fixture(); missingParent.documents[0].parentId = "missing";
  const missingImage = fixture(); missingImage.assets = [];
  const invalidImage = fixture(); invalidImage.assets[0].data = Buffer.from("not a PNG").toString("base64");
  const unsafeLink = fixture(); unsafeLink.documents[0].content = [{ type: "paragraph", content: [{ type: "link", href: "javascript:alert(1)", content: [] }] }];
  for (const archive of [cycle, missingParent, missingImage, invalidImage, unsafeLink, { ...fixture(), version: 99 }]) {
    expect((await importArchive(request, archive)).status()).toBe(400);
    expect(await (await request.get("/api/documents")).json()).toEqual(before);
  }
});

test("workspace imports Markdown and exports the latest edited draft in both formats", async ({ page, request, context }) => {
  await context.addCookies((await request.storageState()).cookies);
  await page.goto("/admin");
  await page.getByRole("button", { name: "导入与导出", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "导入与导出" });
  await dialog.getByLabel("选择导入文件").setInputFiles({ name: `${prefix}.md`, mimeType: "text/markdown", buffer: Buffer.from(`# ${prefix}\n\n这是 **加粗** 内容。\n\n- 列表项目\n\n\`\`\`js\nconsole.log('hello');\n\`\`\`\n`) });
  await expect(dialog.getByText("将导入 1 篇文档")).toBeVisible();
  await dialog.getByRole("button", { name: "导入为草稿" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("文档标题")).toHaveValue(prefix);
  await page.getByLabel("文档标题").fill(`${prefix} 最新修改 *版本*`);
  await page.getByRole("button", { name: "导入与导出", exact: true }).click();
  await dialog.getByRole("button", { name: "导出文档", exact: true }).click();
  const [jsonDownload] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "导出并下载" }).click()]);
  const jsonStream = await jsonDownload.createReadStream(); const jsonChunks = [];
  for await (const chunk of jsonStream!) jsonChunks.push(chunk);
  const archive = JSON.parse(Buffer.concat(jsonChunks).toString());
  expect(archive.documents[0].title).toBe(`${prefix} 最新修改 *版本*`);
  expect(archive.documents[0].content.some((block: { type: string }) => block.type === "codeBlock")).toBe(true);
  await dialog.getByLabel("导出格式").selectOption("markdown");
  const [mdDownload] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "导出并下载" }).click()]);
  const mdStream = await mdDownload.createReadStream(); const mdChunks = [];
  for await (const chunk of mdStream!) mdChunks.push(chunk);
  const markdown = Buffer.concat(mdChunks).toString();
  expect(markdown).toContain(`# ${prefix} 最新修改 \\*版本\\*`);
  expect(markdown).toContain("**加粗**");
  expect(markdown).toContain("console.log('hello');");
  await dialog.getByRole("button", { name: "导入文档", exact: true }).click();
  await dialog.getByLabel("选择导入文件").setInputFiles({ name: "round-trip.md", mimeType: "text/markdown", buffer: Buffer.from(markdown) });
  await expect(dialog.getByText(`${prefix} 最新修改 *版本*`, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "导入为草稿" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("文档标题")).toHaveValue(`${prefix} 最新修改 *版本*`);
});
