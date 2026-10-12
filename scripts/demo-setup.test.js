'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { ensureLocalComposeEnv, runDemoSetup, assertMigrationsApplied } = require('./demo-setup');

function withTempRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serene-demo-setup-'));
  try { return run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('copies the committed example only when docker.env is absent', () => withTempRoot((root) => {
  const template = 'MYSQL_DATABASE=airline_booking_docker\n';
  fs.writeFileSync(path.join(root, 'docker.env.example'), template);

  assert.deepEqual(ensureLocalComposeEnv({ root }), { created: true });
  assert.equal(fs.readFileSync(path.join(root, 'docker.env'), 'utf8'), template);
}));

test('preserves existing docker.env byte-for-byte', () => withTempRoot((root) => {
  const existing = Buffer.from('LOCAL_SETTING=keep-this\r\n');
  fs.writeFileSync(path.join(root, 'docker.env'), existing);
  fs.writeFileSync(path.join(root, 'docker.env.example'), 'MYSQL_DATABASE=airline_booking_docker\n');

  assert.deepEqual(ensureLocalComposeEnv({ root }), { created: false });
  assert.deepEqual(fs.readFileSync(path.join(root, 'docker.env')), existing);
}));

test('fails clearly when docker.env.example is missing', () => withTempRoot((root) => {
  assert.throws(() => ensureLocalComposeEnv({ root }), /docker\.env\.example.*missing/i);
  assert.equal(fs.existsSync(path.join(root, 'docker.env')), false);
}));

const composeConfig = JSON.stringify({ services: {
  api: { environment: { NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' } },
  db: { environment: { MYSQL_DATABASE: 'airline_booking_docker' } },
} });
const id = (letter) => letter.repeat(64);
function composeInspect(service) {
  return JSON.stringify({
    Config: { Labels: { 'com.docker.compose.project': 'serene-local', 'com.docker.compose.service': service } },
    State: { Running: true, ...(service === 'db' ? { Health: { Status: 'healthy' } } : { Health: { Status: 'healthy' } }) },
  });
}
function makeRunner({ endpoint = 'npipe:////./pipe/docker_engine', migrationStatus = 'up 20260915184724-seed-roles', apiHealth = 'healthy', seedSummaries = [] } = {}) {
  const calls = [];
  let summaryIndex = 0;
  const runner = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === 'docker' && args[0] === 'context' && args[1] === 'show') return 'desktop-linux';
    if (command === 'docker' && args[0] === 'context' && args[1] === 'inspect') return JSON.stringify(endpoint);
    if (command === 'docker' && args.includes('config') && args.includes('--services')) return 'db\napi';
    if (command === 'docker' && args.includes('config') && args.includes('--format')) return composeConfig;
    if (command === 'docker' && args.includes('up')) return '';
    if (command === 'docker' && args.includes('ps') && args.includes('api')) return id('a');
    if (command === 'docker' && args.includes('ps') && args.includes('db')) return id('b');
    if (command === 'docker' && args[0] === 'inspect') {
      const service = args[args.length - 1] === id('a') ? 'api' : 'db';
      const value = JSON.parse(composeInspect(service));
      if (service === 'api') value.State.Health.Status = apiHealth;
      return JSON.stringify(value);
    }
    if (command === 'docker' && args.includes('db:migrate:status')) return migrationStatus;
    if (command === process.execPath && args.includes('scripts/seed-demo-docker.js')) return seedSummaries[summaryIndex++] || '';
    throw new Error(`Unexpected command ${command} ${args.join(' ')}`);
  };
  return { runner, calls };
}
const preview = 'DRY-RUN\nDEMO_SEED_SUMMARY {"mode":"dry-run","scheduleStartDate":"2026-10-13","flightScheduleExists":false,"existing":{"roles":0,"airlines":0,"airports":0,"users":0,"flights":0,"fareClasses":0,"promotions":0},"wouldCreate":{"roles":3,"airlines":20,"airports":40,"users":3,"flights":50,"fareClasses":100,"promotions":10}}';
const zeroPreview = 'DEMO_SEED_SUMMARY {"mode":"dry-run","scheduleStartDate":"2026-10-13","flightScheduleExists":true,"existing":{"roles":3,"airlines":20,"airports":40,"users":3,"flights":50,"fareClasses":100,"promotions":10},"wouldCreate":{"roles":0,"airlines":0,"airports":0,"users":0,"flights":0,"fareClasses":0,"promotions":0}}';
const applied = 'DEMO_SEED_SUMMARY {"mode":"apply","scheduleStartDate":"2026-10-13","flightScheduleExists":false,"existing":{},"created":{"roles":3,"airlines":20,"airports":40,"users":3,"flights":50,"fareClasses":100,"promotions":10}}';
function setupRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serene-demo-setup-flow-'));
  fs.writeFileSync(path.join(root, 'docker.env.example'), 'MYSQL_DATABASE=airline_booking_docker\n');
  return root;
}

test('migration status parser rejects unapplied or empty migrations', () => {
  assert.equal(assertMigrationsApplied('up 20260101000000-init'), true);
  assert.throws(() => assertMigrationsApplied('up 1-init\ndown 2-new'), /pending/i);
  assert.throws(() => assertMigrationsApplied(''), /could not verify/i);
});

test('rejects a remote Docker endpoint before compose up', async () => {
  const root = setupRoot();
  try {
    const { runner, calls } = makeRunner({ endpoint: 'tcp://remote.example:2376' });
    await assert.rejects(runDemoSetup({ root, commandRunner: runner, stdin: Readable.from([]), stdout: { write() {} } }), /remote/i);
    assert.equal(calls.some((call) => call.args.includes('up')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('reports Docker CLI or engine unavailable before Compose startup and seeding', async () => {
  const root = setupRoot();
  try {
    const calls = [];
    const unavailable = (command, args) => {
      calls.push({ command, args });
      throw new Error('permission denied while connecting to npipe docker_engine');
    };
    await assert.rejects(runDemoSetup({ root, commandRunner: unavailable, stdin: Readable.from([]), stdout: { write() {} } }), /Docker.*unavailable/i);
    assert.equal(calls.some((call) => call.args.includes('up')), false);
    assert.equal(calls.some((call) => call.command === process.execPath), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifies Compose before starting only api and db', async () => {
  const root = setupRoot();
  try {
    const { runner, calls } = makeRunner({ seedSummaries: [preview] });
    const stdin = Readable.from([]); stdin.isTTY = false;
    await runDemoSetup({ root, commandRunner: runner, stdin, stdout: { write() {} }, maxHealthAttempts: 1 });
    const up = calls.find((call) => call.args.includes('up'));
    assert.deepEqual(up.args.slice(-2), ['api', 'db']);
    assert.equal(calls.findIndex((call) => call.args.includes('config')) < calls.indexOf(up), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stops before seeding when migrations are pending', async () => {
  const root = setupRoot();
  try {
    const { runner, calls } = makeRunner({ migrationStatus: 'up 1-init\ndown 2-pending' });
    await assert.rejects(runDemoSetup({ root, commandRunner: runner, stdin: Readable.from([]), stdout: { write() {} }, maxHealthAttempts: 1 }), /pending/i);
    assert.equal(calls.some((call) => call.command === process.execPath), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prints verified target and dry-run counts before requesting confirmation', async () => {
  const root = setupRoot();
  try {
    const { runner } = makeRunner({ seedSummaries: [preview] });
    const output = [];
    const stdin = Readable.from([]); stdin.isTTY = false;
    const result = await runDemoSetup({ root, commandRunner: runner, stdin, stdout: { write(value) { output.push(value); } }, maxHealthAttempts: 1 });
    assert.equal(result.status, 'confirmation-required');
    assert.match(output.join(''), /airline_booking_docker/);
    assert.match(output.join(''), /"flights":50/);
    assert.match(output.join(''), /CHO PHÉP APPLY DEMO SEED/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('does not apply on EOF or a wrong confirmation phrase', async () => {
  for (const input of ['', 'yes\n']) {
    const root = setupRoot();
    try {
      const { runner, calls } = makeRunner({ seedSummaries: [preview] });
      const stdin = Readable.from([input]); stdin.isTTY = true;
      const result = await runDemoSetup({ root, commandRunner: runner, stdin, stdout: { write() {} }, maxHealthAttempts: 1 });
      assert.equal(result.status, 'cancelled');
      assert.equal(calls.some((call) => call.args.includes('--apply')), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('applies only after exact confirmation and verifies with a zero-count dry-run', async () => {
  const root = setupRoot();
  try {
    const { runner, calls } = makeRunner({ seedSummaries: [preview, applied, zeroPreview] });
    const stdin = Readable.from(['CHO PHÉP APPLY DEMO SEED\n']); stdin.isTTY = true;
    const result = await runDemoSetup({ root, commandRunner: runner, stdin, stdout: { write() {} }, maxHealthAttempts: 1 });
    assert.equal(result.status, 'complete');
    assert.equal(calls.filter((call) => call.command === process.execPath).length, 3);
    assert.equal(calls.some((call) => call.args.includes('--apply')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('reports occupied host ports without stopping unrelated containers', async () => {
  const root = setupRoot();
  try {
    const { runner, calls } = makeRunner();
    const occupied = (command, args, options) => {
      if (args.includes('up')) throw new Error('Ports are not available: address already in use');
      return runner(command, args, options);
    };
    await assert.rejects(runDemoSetup({ root, commandRunner: occupied, stdin: Readable.from([]), stdout: { write() {} } }), /port.*already in use/i);
    assert.equal(calls.some((call) => call.args.includes('down')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
