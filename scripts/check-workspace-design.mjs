import { chromium } from '@playwright/test';
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

config({ quiet: true });
const baseURL = process.env.APP_URL;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => localStorage.setItem('new-api-site-theme-v2', 'graphite'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const headers = { Origin: baseURL };
const output = '.data/design-preview';
await mkdir(output, { recursive: true });
let doc;
async function snapshot(name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${name}: horizontal overflow`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
try {
  const login = await context.request.post('/api/auth/login', { headers, data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  assert.equal(login.status(), 200);
  await page.goto('/');
  await page.getByRole('button', { name: '切换主题' }).waitFor();
  await snapshot('library-graphite');
  await page.goto('/admin');
  await page.locator('.bn-editor').waitFor();
  await page.getByRole('button', { name: '更多文档操作' }).click();
  await page.getByRole('menu').waitFor();
  await snapshot('workspace-menu-graphite');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '站点设置', exact: true }).click();
  await page.getByRole('dialog', { name: '站点设置', exact: true }).waitFor();
  await page.getByRole('button', { name: '站点图标', exact: true }).click();
  await page.getByRole('button', { name: '导航', exact: true }).waitFor();
  await snapshot('site-settings-icon-picker');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭站点设置' }).click();
  const response = await context.request.post('/api/documents', { headers, data: { title: '移动端布局验证' } });
  assert.equal(response.status(), 201);
  doc = await response.json();
  const longTitle = '长标题应当完整换行并保持图标和正文互不遮挡'.repeat(5);
  await context.request.patch(`/api/documents/${doc.id}`, { headers, data: { version: doc.version, title: longTitle, icon: 'compass' } });
  await page.goto(`/admin/${doc.id}`);
  await page.locator('.bn-editor').waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('textbox', { name: '文档标题' }).waitFor();
    assert(await page.getByRole('textbox', { name: '文档标题' }).evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'long title is clipped');
    await snapshot(`workspace-long-title-${width}`);
    await page.getByRole('button', { name: '打开文档导航' }).click();
    await page.getByRole('dialog', { name: '工作台文档导航' }).waitFor();
    await snapshot(`workspace-navigation-${width}`);
    await page.keyboard.press('Escape');
  }
  await page.goto('/docs/first-request');
  await page.locator('.code-scroll-area').scrollIntoViewIfNeeded();
  await page.locator('.rs-line-number').first().waitFor();
  await snapshot('reader-code-graphite-mobile');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/workspace-check.json`, JSON.stringify({ checks: ['menu', 'nested icon picker', 'mobile 390/320', 'long titles', 'code scrolling'], pageErrors: errors }, null, 2));
  console.log('Workspace menus, nested icon picker, long titles and 390/320px layouts verified.');
} finally {
  if (doc) await context.request.delete(`/api/documents/${doc.id}`, { headers });
  await browser.close();
}
