'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.CI_FRONTEND_URL || 'http://127.0.0.1:5173';
const artifactDirectory = path.resolve('artifacts/e2e');

async function main() {
  await fs.mkdir(artifactDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 20000 });

    const roundTrip = page.getByRole('tab', { name: 'Khứ hồi' });
    await roundTrip.click();
    assert.equal(await roundTrip.getAttribute('aria-selected'), 'true');
    await page.getByText('Ngày về', { exact: false }).first().waitFor({ state: 'visible' });

    const multiCity = page.getByRole('tab', { name: 'Nhiều chặng' });
    await multiCity.click();
    assert.equal(await multiCity.getAttribute('aria-selected'), 'true');
    await page.getByRole('group', { name: 'Chặng 1' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /thêm chặng/i }).click();
    await page.getByRole('group', { name: 'Chặng 3' }).waitFor({ state: 'visible' });

    // The same booking entry point must remain usable at a phone viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
    const mobileMenu = page.getByRole('button', { name: 'Mở menu' });
    await mobileMenu.click();
    await page.getByRole('navigation', { name: 'Điều hướng tài khoản' }).getByRole('link', { name: 'Trang chủ' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Đóng menu' }).click();
    await page.getByRole('tab', { name: 'Khứ hồi' }).click();
    await page.getByText('Ngày về', { exact: false }).first().waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true,
      'Mobile booking entry must not overflow the viewport horizontally.');

    assert.deepEqual(pageErrors, [], 'Browser reported uncaught page errors.');
    await context.tracing.stop();
    console.log('Browser smoke passed: desktop itinerary modes and mobile navigation, round-trip form, and viewport fit.');
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDirectory, 'browser-failure.png'), fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: path.join(artifactDirectory, 'browser-failure-trace.zip') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
