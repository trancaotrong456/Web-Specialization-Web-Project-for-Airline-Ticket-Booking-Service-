'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertLocalDockerEndpoint, assertSafeComposeConfig, assertComposeContainers, resolveDemoConfig, buildExecutionPayload, buildContainerBootstrap } = require('./seed-demo-docker');

const compose = {
  services: {
    api: { environment: { NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' } },
    db: { environment: { MYSQL_DATABASE: 'airline_booking_docker' } },
  },
};
const id = (char) => char.repeat(64);
const inspection = (project, service) => ({
  Config: { Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': service } },
  State: { Running: true, ...(service === 'db' ? { Health: { Status: 'healthy' } } : {}) },
});

test('accepts only a development Compose config pointing at the dedicated internal demo DB', () => {
  assert.equal(assertSafeComposeConfig(compose), true);
  assert.throws(() => assertSafeComposeConfig({ ...compose, services: { ...compose.services, api: { environment: { ...compose.services.api.environment, NODE_ENV: 'production' } } } }), /development/i);
  assert.throws(() => assertSafeComposeConfig({ ...compose, services: { ...compose.services, api: { environment: { ...compose.services.api.environment, DB_HOST: 'prod.example' } } } }), /DB_HOST=db/i);
  assert.throws(() => assertSafeComposeConfig({ ...compose, services: { ...compose.services, db: { environment: { MYSQL_DATABASE: 'airline_booking_prod' } } } }), /MYSQL_DATABASE/i);
});

test('rejects remote Docker contexts and accepts local Windows/Linux sockets', () => {
  assert.equal(assertLocalDockerEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine'), true);
  assert.equal(assertLocalDockerEndpoint('unix:///var/run/docker.sock'), true);
  assert.throws(() => assertLocalDockerEndpoint('tcp://prod.example:2376'), /remote\/SSH\/TCP/i);
  assert.throws(() => assertLocalDockerEndpoint('ssh://docker.example'), /remote\/SSH\/TCP/i);
});

test('requires running API and healthy DB containers from the same Compose project', () => {
  assert.deepEqual(assertComposeContainers(id('a'), id('b'), inspection('airline-demo', 'api'), inspection('airline-demo', 'db')), { project: 'airline-demo' });
  assert.throws(() => assertComposeContainers(id('a'), id('b'), inspection('project-one', 'api'), inspection('project-two', 'db')), /same Compose project/i);
  assert.throws(() => assertComposeContainers(id('a'), id('b'), inspection('airline-demo', 'api'), { ...inspection('airline-demo', 'db'), State: { Running: true, Health: { Status: 'starting' } } }), /healthy/i);
  assert.throws(() => assertComposeContainers('', id('b'), inspection('airline-demo', 'api'), inspection('airline-demo', 'db')), /identify/i);
});

test('execution payload stages only the two current seed scripts and whitelisted configuration', () => {
  const root = path.resolve(__dirname, '..');
  const config = { SEED_ADMIN_PASSWORD: 'only-on-stdin', SEED_FLIGHT_START_DATE: '2026-10-10', MYSQL_PASSWORD: 'not-for-seeder' };
  const payload = buildExecutionPayload({ root, config, apply: true });
  assert.match(payload.localSource, /assertSafeDockerTarget/);
  assert.match(payload.coreSource, /runDemoSeed/);
  assert.deepEqual(payload.config, { SEED_ADMIN_PASSWORD: 'only-on-stdin', SEED_FLIGHT_START_DATE: '2026-10-10' });
  assert.equal(payload.apply, true);
  assert.equal(Object.keys(payload).sort().join(','), 'apply,config,coreSource,localSource');
});

test('container bootstrap uses a private temporary directory and removes it after execution', () => {
  const bootstrap = buildContainerBootstrap();
  assert.match(bootstrap, /mkdtempSync/);
  assert.match(bootstrap, /airline-demo-seed-/);
  assert.match(bootstrap, /mode:\s*0o600/);
  assert.match(bootstrap, /rmSync\(tempDirectory,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
  assert.match(bootstrap, /Readable\.from/);
});

test('container bootstrap resolves dependencies from the app node_modules when scripts run from a temp directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-module-resolution-'));
  const nodeModules = path.join(root, 'app', 'node_modules');
  const packageDirectory = path.join(nodeModules, 'bcryptjs');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, 'index.js'), "module.exports = { resolvedFromApp: true };\n");

  try {
    const localSource = "exports.main=async()=>{const bcrypt=require('bcryptjs');if(!bcrypt.resolvedFromApp)throw new Error('Wrong bcryptjs module');process.stdout.write(require.resolve('bcryptjs'));};";
    const child = spawnSync(process.execPath, ['-e', buildContainerBootstrap({ nodeModulesPath: nodeModules })], {
      input: JSON.stringify({ coreSource: 'module.exports = {};', localSource, config: {}, apply: false }),
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, NODE_PATH: '' },
    });

    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), path.join(packageDirectory, 'index.js'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('container bootstrap passes config on stdin and removes staged files even after local execution', () => {
  const localSource = [
    "exports.main=async ({argv,stdin})=>{let raw='';for await(const part of stdin)raw+=part;const config=JSON.parse(raw);if(argv[0]!=='--apply'||config.SEED_ADMIN_PASSWORD!=='stdin-only-secret')throw new Error('test payload mismatch');process.stdout.write(__dirname);};",
  ].join('');
  const child = spawnSync(process.execPath, ['-e', buildContainerBootstrap()], {
    input: JSON.stringify({ coreSource: 'module.exports = {};', localSource, config: { SEED_ADMIN_PASSWORD: 'stdin-only-secret' }, apply: true }),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(child.status, 0, child.stderr);
  const tempDirectory = child.stdout.trim();
  assert.match(path.basename(tempDirectory), /^airline-demo-seed-/);
  assert.equal(fs.existsSync(tempDirectory), false);
  assert.equal(child.stderr.includes('stdin-only-secret'), false);
});

test('local config loader never forwards unrelated environment secrets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-config-test-'));
  try {
    fs.writeFileSync(path.join(root, 'demo-seed.local.env'), 'SEED_ADMIN_PASSWORD=admin-demo\nSEED_STAFF_PASSWORD=staff-demo\nSEED_CUSTOMER_PASSWORD=customer-demo\nSEED_FLIGHT_START_DATE=2026-10-10\nMYSQL_PASSWORD=database-secret\nPAYOS_API_KEY=payment-secret\n');
    assert.deepEqual(resolveDemoConfig({ apply: true, root }), {
      SEED_ADMIN_PASSWORD: 'admin-demo', SEED_STAFF_PASSWORD: 'staff-demo', SEED_CUSTOMER_PASSWORD: 'customer-demo', SEED_FLIGHT_START_DATE: '2026-10-10',
    });
    assert.deepEqual(resolveDemoConfig({ apply: false, root }), { SEED_FLIGHT_START_DATE: '2026-10-10' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Docker build context excludes bulky workspaces and secrets but keeps runtime migration and seed code', () => {
  const root = path.resolve(__dirname, '..');
  const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/).map((line) => line.trim());
  for (const excluded of ['frontend', 'docs', 'designs', '.codex-remote-attachments', '.superpowers', '.tmp', 'tmp', 'demo-seed.local.env']) {
    assert.ok(ignore.includes(excluded), `Expected .dockerignore to exclude ${excluded}`);
  }
  for (const retained of ['migrations', 'seeders', 'scripts']) {
    assert.equal(ignore.includes(retained), false, `Runtime directory ${retained} must remain in the build context`);
  }
});
