'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const frontendUrl = process.env.CI_FRONTEND_URL || 'http://127.0.0.1:5173';
const artifactDirectory = path.resolve('artifacts/e2e');
const ciPassword = 'CiOnly!Pass123';

async function login(page, email) {
  await page.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(ciPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20000 });
}

async function chooseLeg(page, expectedLegCount, itinerary) {
  const params = new URLSearchParams({ trip_type: expectedLegCount === 2 ? 'round_trip' : 'multi_city', passengers: '1', legs: JSON.stringify(itinerary.map(({ departureAirportId, arrivalAirportId, departureDate }) => ({ departure_airport_id: departureAirportId, arrival_airport_id: arrivalAirportId, departure_date: departureDate }))) });
  await page.goto(`${frontendUrl}/flights/search?${params}`, { waitUntil: 'domcontentloaded' });
  for (let index = 0; index < itinerary.length; index += 1) {
    await page.getByRole('heading', { name: `Chọn chuyến cho chặng ${index + 1}/${itinerary.length}` }).waitFor({ state: 'visible', timeout: 20000 });
    const fareResponsePromise = page.waitForResponse((response) => /\/fare-classes\/flight\/\d+(?:\?|$)/.test(response.url()), { timeout: 20000 })
      .then(async (response) => ({ status: response.status(), url: response.url(), body: (await response.text()).slice(0, 1500) }))
      .catch((error) => ({ error: error.message }));
    const selectFlight = page.getByRole('button', { name: 'Chọn chuyến bay' }).first();
    try { await selectFlight.waitFor({ state: 'visible', timeout: 20000 }); }
    catch { throw new Error(`No selectable flight for leg ${index + 1}/${itinerary.length} at ${page.url()}: ${(await page.locator('main').innerText()).slice(0, 3000)}`); }
    await selectFlight.click();
    const fareResponse = await fareResponsePromise;
    const economyFare = page.getByRole('radio', { name: /Economy/ });
    try { await economyFare.waitFor({ state: 'visible', timeout: 15000 }); }
    catch { throw new Error(`Economy fare did not render for leg ${index + 1}/${itinerary.length} at ${page.url()}; fare API: ${JSON.stringify(fareResponse)}; page: ${(await page.locator('main').innerText()).slice(0, 3000)}`); }
    await economyFare.check();
    const next = index + 1 < itinerary.length ? 'Tiếp tục chọn chặng sau' : 'Tiếp tục nhập hành khách';
    await page.getByRole('button', { name: next }).click();
  }
  await page.getByRole('heading', { name: 'Thông tin hành khách' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText(`${expectedLegCount} chặng`, { exact: false }).first().waitFor({ state: 'visible' });
  await page.getByLabel('Họ tên', { exact: true }).fill(`CI ${expectedLegCount}-leg passenger`);
  await page.getByRole('button', { name: 'Tạo đặt chỗ và tiếp tục thanh toán' }).click();
  await page.waitForURL(/\/bookings\/\d+\/payment/, { timeout: 30000 });
  await page.getByRole('heading', { name: 'Thanh toán đặt chỗ' }).waitFor({ state: 'visible' });
  await page.getByText('Các chặng tiếp theo').waitFor({ state: 'visible' });
}

async function main() {
  const fixturePath = path.resolve(process.env.CI_E2E_FIXTURE || 'artifacts/e2e/fixture.json');
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  await fs.mkdir(artifactDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    const admin = await context.newPage();
    admin.on('pageerror', (error) => errors.push(`admin: ${error.message}`));
    await login(admin, fixture.adminEmail);
    await admin.goto(`${frontendUrl}/admin/flights/${fixture.adminFlightId}`);
    await admin.getByRole('heading', { name: 'Trạng thái và lịch sử' }).waitFor({ state: 'visible' });
    await admin.locator('#flight-status-update').selectOption('delayed');
    await admin.locator('#flight-status-reason').fill('CI browser delay scenario');
    await admin.getByRole('button', { name: 'Cập nhật trạng thái' }).click();
    const statusSaved = admin.getByText('Trạng thái chuyến bay đã được cập nhật.', { exact: true });
    const statusError = admin.locator('[role="alert"]').first();
    await Promise.race([
      statusSaved.waitFor({ state: 'visible', timeout: 30000 }),
      statusError.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    if (await statusError.isVisible()) assert.fail(`Admin flight-status update failed: ${await statusError.innerText()}`);
    await statusSaved.waitFor({ state: 'visible' });
    await admin.locator('.flight-status-history').getByText('CI browser delay scenario', { exact: true }).waitFor({ state: 'visible' });

    const customer = await context.newPage();
    customer.on('pageerror', (error) => errors.push(`customer: ${error.message}`));
    await login(customer, fixture.customerEmail);

    const { oneWay } = fixture;
    const search = new URLSearchParams({ departure_airport_id: String(oneWay.departureAirportId), arrival_airport_id: String(oneWay.arrivalAirportId), departure_date: oneWay.departureDate, min_seats: '1', sort_by: 'price_low' });
    await customer.goto(`${frontendUrl}/flights/search?${search}`);
    await customer.getByRole('heading', { name: 'Chuyến bay phù hợp' }).waitFor({ state: 'visible' });
    await customer.getByRole('link', { name: 'Chọn chuyến bay' }).first().click();
    await customer.getByRole('radio', { name: /Economy/ }).check();
    await customer.getByRole('button', { name: 'Tiếp tục' }).click();
    await customer.getByRole('heading', { name: 'Thông tin hành khách' }).waitFor({ state: 'visible' });
    await customer.getByRole('button', { name: '1A, trống' }).click();
    await customer.getByRole('checkbox', { name: /CI Baggage/ }).check();
    await customer.getByLabel('Họ tên', { exact: true }).fill('CI Passenger One');
    await customer.getByRole('button', { name: 'Tạo đặt chỗ và tiếp tục thanh toán' }).click();
    await customer.waitForURL(/\/bookings\/\d+\/payment/, { timeout: 30000 });
    await customer.getByRole('radio', { name: /payOS/ }).check();
    await customer.getByRole('button', { name: 'Tiếp tục thanh toán' }).click();
    await customer.getByRole('button', { name: 'Mô phỏng xác nhận demo' }).waitFor({ state: 'visible', timeout: 30000 });
    await customer.getByRole('button', { name: 'Mô phỏng xác nhận demo' }).click();
    await customer.getByRole('heading', { name: 'Kiểm tra trạng thái đặt chỗ' }).waitFor({ state: 'visible', timeout: 30000 });

    await customer.goto(`${frontendUrl}/bookings/my`);
    await customer.getByRole('heading', { name: 'Đặt chỗ của tôi' }).waitFor({ state: 'visible', timeout: 20000 });
    await customer.getByRole('link', { name: 'Chi tiết' }).first().click();
    await customer.locator('.passenger-summary').getByText('CI Passenger One', { exact: true }).waitFor({ state: 'visible' });
    await customer.getByRole('button', { name: /Thông báo/ }).click();
    await customer.getByRole('region', { name: 'Thông báo' }).getByText(/đặt chỗ|thanh toán/i).first().waitFor({ state: 'visible', timeout: 20000 });

    await chooseLeg(customer, 2, fixture.roundTrip);
    await chooseLeg(customer, 3, fixture.multiCity);

    const cancelledSearch = new URLSearchParams({ departure_airport_id: String(fixture.cancelled.departureAirportId), arrival_airport_id: String(fixture.cancelled.arrivalAirportId), departure_date: fixture.cancelled.departureDate, min_seats: '1' });
    await customer.goto(`${frontendUrl}/flights/search?${cancelledSearch}`);
    await customer.getByRole('heading', { name: 'Chuyến bay phù hợp' }).waitFor({ state: 'visible' });
    await assert.rejects(customer.getByRole('button', { name: 'Chọn chuyến bay' }).first().waitFor({ state: 'visible', timeout: 1500 }), 'Cancelled fixture must not be offered as bookable.');
    assert.deepEqual(errors, [], 'Browser reported uncaught JavaScript errors.');
    await context.tracing.stop({ path: path.join(artifactDirectory, 'browser-e2e-trace.zip') });
    console.log('Browser E2E passed: Admin flight status, customer search, seat and ancillary selection, demo payment, Manage Booking, notifications, round-trip and multi-city itinerary selection, cancelled-flight exclusion.');
  } catch (error) {
    const page = context.pages().at(-1);
    if (page) await page.screenshot({ path: path.join(artifactDirectory, 'browser-e2e-failure.png'), fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: path.join(artifactDirectory, 'browser-e2e-failure-trace.zip') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
