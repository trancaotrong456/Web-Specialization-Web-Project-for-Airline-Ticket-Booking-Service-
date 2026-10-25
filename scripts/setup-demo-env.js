'use strict';
/**
 * setup-demo-env.js
 * Tu dong tao demo-seed.local.env neu file chua ton tai.
 * Chay lan dau sau khi pull repo hoac truoc khi seed demo Docker.
 *
 * Usage: node scripts/setup-demo-env.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'demo-seed.local.env');
const EXAMPLE_FILE = path.join(ROOT, 'demo-seed.local.env.example');

// Tinh ngay mai theo gio Viet Nam (UTC+7)
function tomorrowVietnam() {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const tomorrow = new Date(vnNow);
  tomorrow.setUTCDate(vnNow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

// Mat khau demo mac dinh - khop voi default trong docker-compose.yml
// KHONG dung tren production.
const DEFAULTS = {
  SEED_ADMIN_PASSWORD:    process.env.SEED_ADMIN_PASSWORD    || 'Demo@Admin2026!',
  SEED_STAFF_PASSWORD:    process.env.SEED_STAFF_PASSWORD    || 'Demo@Staff2026!',
  SEED_CUSTOMER_PASSWORD: process.env.SEED_CUSTOMER_PASSWORD || 'Demo@Customer2026!',
  SEED_FLIGHT_START_DATE: tomorrowVietnam(),
};

if (fs.existsSync(ENV_FILE)) {
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const missing = Object.keys(DEFAULTS).filter((k) => !content.includes(k + '='));
  if (missing.length === 0) {
    console.log('demo-seed.local.env da ton tai va du config. Khong can tao lai.');
  } else {
    const appended = missing.map((k) => k + '=' + DEFAULTS[k]).join('\n');
    fs.appendFileSync(ENV_FILE, '\n# Duoc them tu dong boi setup-demo-env.js\n' + appended + '\n', 'utf8');
    console.log('Da bo sung vao demo-seed.local.env: ' + missing.join(', '));
  }
  printAccounts();
  process.exit(0);
}

let baseContent = '';
if (fs.existsSync(EXAMPLE_FILE)) {
  baseContent = fs.readFileSync(EXAMPLE_FILE, 'utf8')
    .replace(/^SEED_ADMIN_PASSWORD=.*$/m,    'SEED_ADMIN_PASSWORD=' + DEFAULTS.SEED_ADMIN_PASSWORD)
    .replace(/^SEED_STAFF_PASSWORD=.*$/m,    'SEED_STAFF_PASSWORD=' + DEFAULTS.SEED_STAFF_PASSWORD)
    .replace(/^SEED_CUSTOMER_PASSWORD=.*$/m, 'SEED_CUSTOMER_PASSWORD=' + DEFAULTS.SEED_CUSTOMER_PASSWORD)
    .replace(/^SEED_FLIGHT_START_DATE=.*$/m, 'SEED_FLIGHT_START_DATE=' + DEFAULTS.SEED_FLIGHT_START_DATE);
} else {
  baseContent = [
    '# Demo credentials - duoc tao tu dong boi scripts/setup-demo-env.js',
    '# CHI dung cho moi truong Docker dev local. KHONG commit file nay.',
    'SEED_ADMIN_PASSWORD=' + DEFAULTS.SEED_ADMIN_PASSWORD,
    'SEED_STAFF_PASSWORD=' + DEFAULTS.SEED_STAFF_PASSWORD,
    'SEED_CUSTOMER_PASSWORD=' + DEFAULTS.SEED_CUSTOMER_PASSWORD,
    '',
    '# Ngay bat dau lich bay demo (tu dong = ngay mai theo gio VN)',
    'SEED_FLIGHT_START_DATE=' + DEFAULTS.SEED_FLIGHT_START_DATE,
    '',
  ].join('\n');
}

fs.writeFileSync(ENV_FILE, baseContent, { encoding: 'utf8', mode: 0o600 });
console.log('Da tao demo-seed.local.env voi credentials demo mac dinh.');
printAccounts();

function printAccounts() {
  console.log('');
  console.log('=== TAI KHOAN DEMO (dung de test API) ===');
  console.log('  Admin    : admin@airline-booking.local  /  ' + DEFAULTS.SEED_ADMIN_PASSWORD);
  console.log('  Staff    : staff.demo@airline-booking.local  /  ' + DEFAULTS.SEED_STAFF_PASSWORD);
  console.log('  Customer : customer.demo@airline-booking.local  /  ' + DEFAULTS.SEED_CUSTOMER_PASSWORD);
  console.log('');
  console.log('Tiep theo chay: npm run seed:demo:docker -- --apply');
}
