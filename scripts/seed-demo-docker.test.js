'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertLocalDockerEndpoint, assertSafeComposeConfig, assertComposeContainers, resolveDemoConfig, parseDockerSeedArgs, buildExecutionPayload, buildContainerBootstrap } = require('./seed-demo-docker');

const compose = {
  services: {
    api: { environment: { NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' } },
    db: { environment: { MYSQL_DATABASE: 'airline_booking_docker' } },
  },
};
const id = (char) => char.repeat(64);
const inspection = (project, service) => ({
  Config: { Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': service } },
  State: { Running: true, Health: { Status: 'healthy' } },
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
  assert.throws(() => assertComposeContainers(id('a'), id('b'), { ...inspection('airline-demo', 'api'), State: { Running: true, Health: { Status: 'starting' } } }, inspection('airline-demo', 'db')), /API.*healthy/i);
  assert.throws(() => assertComposeContainers('', id('b'), inspection('airline-demo', 'api'), inspection('airline-demo', 'db')), /identify/i);
});

test('execution payload stages the setup dependency tree and contains no member-specific credentials', () => {
  const root = path.resolve(__dirname, '..');
  const payload = buildExecutionPayload({ root, apply: true });
  assert.match(payload.localSource, /assertSafeDockerTarget/);
  assert.match(payload.coreSource, /runDemoSeed/);
  assert.match(payload.prerequisiteSource, /ensureDemoPrerequisites/);
  assert.match(payload.fixturesSource, /airline-booking\.local/);
  assert.equal(payload.apply, true);
  assert.equal(payload.startDate, null);
  assert.equal(Object.keys(payload).sort().join(','), 'apply,coreSource,fixturesSource,localSource,prerequisiteSource,startDate');
});

test('Docker seeder accepts only a valid internal schedule anchor and apply flag', () => {
  assert.deepEqual(parseDockerSeedArgs(['--start-date', '2026-10-13']), { apply: false, startDate: '2026-10-13' });
  assert.deepEqual(parseDockerSeedArgs(['--apply', '--start-date', '2026-10-13']), { apply: true, startDate: '2026-10-13' });
  assert.throws(() => parseDockerSeedArgs(['--start-date', 'yesterday']), /usage/i);
  assert.throws(() => parseDockerSeedArgs(['--apply', '--apply']), /usage/i);
});

test('container bootstrap uses a private temporary directory and removes it after execution', () => {
  const bootstrap = buildContainerBootstrap();
  assert.match(bootstrap, /mkdtempSync/);
  assert.match(bootstrap, /airline-demo-seed-/);
  assert.match(bootstrap, /mode:\s*0o600/);
  assert.match(bootstrap, /rmSync\(tempDirectory,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
  assert.match(bootstrap, /readInput\(\)/);
});

test('container bootstrap resolves dependencies from the app node_modules when scripts run from a temp directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-module-resolution-'));
  const nodeModules = path.join(root, 'app', 'node_modules');
  const packageDirectory = path.join(nodeModules, 'bcryptjs');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, 'index.js'), "module.exports = { resolvedFromApp: true };\n");

  try {
    const localSource = "exports.main=async()=>{const bcrypt=require('bcryptjs');const fixture=require('../seeders/demo-fixtures');if(!bcrypt.resolvedFromApp||!fixture.demoAccounts)throw new Error('Wrong staged import');process.stdout.write(require.resolve('bcryptjs'));};";
    const child = spawnSync(process.execPath, ['-e', buildContainerBootstrap({ nodeModulesPath: nodeModules })], {
      input: JSON.stringify({ coreSource: 'module.exports = {};', localSource, prerequisiteSource: 'module.exports = {};', fixturesSource: 'exports.demoAccounts=[];', apply: false }),
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

test('container bootstrap reads its source payload from stdin and removes staged files after execution', () => {
  const localSource = [
    "exports.main=async ({argv,env})=>{if(argv[0]!=='--apply'||env.DEMO_SEED_COMPOSE_PROJECT!=='safe-project')throw new Error('test payload mismatch');process.stdout.write(__dirname);};",
  ].join('');
  const child = spawnSync(process.execPath, ['-e', buildContainerBootstrap()], {
    input: JSON.stringify({ coreSource: 'module.exports = {};', localSource, prerequisiteSource: 'module.exports = {};', fixturesSource: 'exports.demoAccounts=[];', apply: true }),
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, DEMO_SEED_COMPOSE_PROJECT: 'safe-project' },
  });
  assert.equal(child.status, 0, child.stderr);
  const scriptsDirectory = child.stdout.trim();
  assert.equal(path.basename(scriptsDirectory), 'scripts');
  const tempDirectory = path.dirname(scriptsDirectory);
  assert.match(path.basename(tempDirectory), /^airline-demo-seed-/);
  assert.equal(fs.existsSync(tempDirectory), false);
  assert.equal(child.stderr.includes('stdin-only-secret'), false);
});

test('legacy local seed config is ignored; fixed credentials and schedule need no member env file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-seed-config-test-'));
  try {
    fs.writeFileSync(path.join(root, 'demo-seed.local.env'), 'SEED_ADMIN_PASSWORD=admin-demo\nSEED_STAFF_PASSWORD=staff-demo\nSEED_CUSTOMER_PASSWORD=customer-demo\nSEED_FLIGHT_START_DATE=2026-10-10\nMYSQL_PASSWORD=database-secret\nPAYOS_API_KEY=payment-secret\n');
    assert.deepEqual(resolveDemoConfig({ apply: true, root }), {});
    assert.deepEqual(resolveDemoConfig({ apply: false, root }), {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Docker build context excludes bulky workspaces and secrets but keeps runtime migration and seed code', () => {
  const root = path.resolve(__dirname, '..');
  const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/).map((line) => line.trim());
  for (const excluded of ['frontend', 'docs', 'designs', '.codex-remote-attachments', '.superpowers', '.tmp', 'tmp', 'demo-seed.local.env', 'docker.env']) {
    assert.ok(ignore.includes(excluded), `Expected .dockerignore to exclude ${excluded}`);
  }
  for (const retained of ['migrations', 'seeders', 'scripts']) {
    assert.equal(ignore.includes(retained), false, `Runtime directory ${retained} must remain in the build context`);
  }
});
