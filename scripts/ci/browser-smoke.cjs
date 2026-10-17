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

    assert.deepEqual(pageErrors, [], 'Browser reported uncaught page errors.');
    await context.tracing.stop();
    console.log('Browser smoke passed: home page, round-trip form, multi-city form, and adding a third itinerary leg.');
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
