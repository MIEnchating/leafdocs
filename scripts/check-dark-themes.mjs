import { chromium } from '@playwright/test';
import { config } from 'dotenv';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({ quiet: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const base = process.env.APP_URL;
await mkdir('.data/design-preview', { recursive: true });
async function snapshot(name) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.data/design-preview/${name}.png`, fullPage: true });
}
async function checkNavigation() {
  return page.evaluate(() => {
    const rgb = text => text.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const link = getComputedStyle(document.querySelector('.sidebar-link:not(.active)'));
    const bg = getComputedStyle(document.body).backgroundColor;
    const a = luminance(link.color), b = luminance(bg);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), font: parseFloat(link.fontSize), overflow: document.documentElement.scrollWidth > innerWidth };
  });
}
await page.goto(base + '/docs/first-request');
for (const [theme, name] of [['paper','纸白 白纸与黑墨'],['stone','浅石 冷灰与留白'],['linen','亚麻 温暖的阅读底色'],['graphite','石墨黑 沉静的中性暗色'],['midnight','午夜蓝 深蓝与冰蓝微光'],['pine','松墨绿 墨绿与柔和薄荷']]) {
  await page.getByRole('button', { name: '切换主题' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '关闭主题选择' }).click();
  await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
  const nav = await checkNavigation();
  assert(nav.ratio >= 4.5, `${theme}: navigation contrast ${nav.ratio}`);
  assert(nav.font >= 14 && !nav.overflow, `${theme}: navigation sizing or page overflow`);
  console.log(`${theme}: menu contrast ${nav.ratio.toFixed(2)}:1`);
  if (['graphite','midnight','pine'].includes(theme)) {
    await snapshot(`reader-${theme}`);
    assert.equal(await page.locator('html').getAttribute('data-appearance'), 'dark');
    assert.notEqual(await page.locator('html').getAttribute('data-code-theme'), 'paper');
  }
}
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'pine');
await page.getByRole('button', { name: '切换主题' }).click();
await page.getByRole('button', { name: '纸白 · GitHub Light', exact: true }).click();
await page.getByRole('button', { name: '关闭主题选择' }).click();
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'pine' && document.documentElement.dataset.codeTheme === 'paper');
await page.getByRole('button', { name: '切换主题' }).click();
await page.getByRole('button', { name: '跟随网站主题', exact: true }).click();
await page.getByRole('button', { name: '关闭主题选择' }).click();
await page.goto(base);
await snapshot('home-pine');
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: '切换主题' }).click();
await snapshot('themes-dark-mobile');
assert(await page.getByRole('button', { name: '跟随网站主题', exact: true }).isVisible());
await page.getByRole('button', { name: '关闭主题选择' }).click();
await page.getByRole('button', { name: '打开文档目录' }).click();
await snapshot('menu-dark-mobile');
await page.getByRole('button', { name: '关闭文档目录' }).click();
await page.goto(base + '/login');
await snapshot('login-dark-mobile');
// No request traces or screenshots with populated login fields.
await page.getByLabel('邮箱地址').fill(process.env.ADMIN_EMAIL);
await page.getByLabel('密码', { exact: true }).fill(process.env.ADMIN_PASSWORD);
await page.getByRole('button', { name: '进入工作台' }).click();
await page.waitForURL('**/admin');
await page.setViewportSize({ width: 1440, height: 1000 });
await page.locator('.bn-editor').first().waitFor();
await page.locator('.bn-container.dark').first().waitFor();
await snapshot('workspace-dark');
await page.reload();
await page.locator('.bn-container.dark').first().waitFor();
assert.equal(await page.locator('html').getAttribute('data-theme'), 'pine');
await browser.close();
assert.deepEqual(errors, []);
console.log('All palettes, code override/persistence, mobile menus, login and dark editor verified.');
