'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertLocalDockerOverrides,
  assertDemoComposeConfig,
  assertBootstrapContainers,
  runDemoUp,
} = require('./demo-up');

const validCompose = {
  name: 'demo',
  services: {
    db: { image: 'mysql:8.0', environment: { MYSQL_DATABASE: 'airline_booking_docker' } },
    bootstrap: {
      build: { context: 'C:/demo' },
      depends_on: { db: { condition: 'service_healthy' } },
      command: ['node', 'scripts/demo-bootstrap-agent.js'],
      environment: { NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' },
      ports: [],
      volumes: ['demo_bootstrap_state:/var/lib/serene-demo'],
    },
    api: {
      build: { context: 'C:/demo' },
      command: ['node', 'server.js'],
      environment: {
        NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false',
        DEMO_BOOTSTRAP_REQUIRED: 'true', DEMO_BOOTSTRAP_STATE_FILE: '/var/lib/serene-demo/bootstrap.json',
      },
      depends_on: { bootstrap: { condition: 'service_completed_successfully' } },
      volumes: ['demo_bootstrap_state:/var/lib/serene-demo'],
    },
  },
};
const id = (char) => char.repeat(64);
const inspect = (project, service, { running = true, healthy = true } = {}) => ({
  Config: { Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': service }, Env: service === 'db' ? ['MYSQL_DATABASE=airline_booking_docker'] : [] },
  State: { Running: running, Health: healthy ? { Status: 'healthy' } : undefined, Status: running ? 'running' : 'exited', ExitCode: running ? 0 : 0 },
});

test('accepts only a verified local Docker endpoint and rejects ambiguous or remote overrides', () => {
  assert.equal(assertLocalDockerOverrides({ env: {}, contextEndpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' }), true);
  assert.equal(assertLocalDockerOverrides({ env: { DOCKER_HOST: 'npipe:////./pipe/docker_engine' }, contextEndpoint: 'npipe:////./pipe/docker_engine' }), true);
  assert.throws(() => assertLocalDockerOverrides({ env: { DOCKER_HOST: 'tcp://remote:2376' }, contextEndpoint: 'tcp://remote:2376' }), /remote|local socket/i);
  assert.throws(() => assertLocalDockerOverrides({ env: { DOCKER_CONTEXT: 'prod' }, contextEndpoint: 'ssh://prod' }), /remote|local socket/i);
  assert.throws(() => assertLocalDockerOverrides({ env: { DOCKER_HOST: 'npipe:////./pipe/docker_engine', DOCKER_CONTEXT: 'prod' }, contextEndpoint: 'ssh://prod' }), /conflict|remote|local socket|ambiguous/i);
  assert.throws(() => assertLocalDockerOverrides({ env: { DOCKER_TLS_VERIFY: '1' }, contextEndpoint: 'npipe:////./pipe/docker_engine' }), /TLS|override/i);
  assert.throws(() => assertLocalDockerOverrides({ env: { COMPOSE_FILE: 'other.yml' }, contextEndpoint: 'npipe:////./pipe/docker_engine' }), /Compose file/i);
  assert.throws(() => assertLocalDockerOverrides({ env: {}, contextEndpoint: '' }), /unknown|local socket/i);
});

test('requires Compose API to depend on successful bootstrap and confines bootstrap to the demo DB', () => {
  assert.equal(assertDemoComposeConfig(validCompose), true);
  const wrongDb = structuredClone(validCompose);
  wrongDb.services.bootstrap.environment.DB_NAME = 'production';
  assert.throws(() => assertDemoComposeConfig(wrongDb), /DB_NAME/i);
  const exposedBootstrap = structuredClone(validCompose);
  exposedBootstrap.services.bootstrap.ports = ['5001:5000'];
  assert.throws(() => assertDemoComposeConfig(exposedBootstrap), /must not expose|ports/i);
  const noGate = structuredClone(validCompose);
  delete noGate.services.api.depends_on;
  assert.throws(() => assertDemoComposeConfig(noGate), /service_completed_successfully|bootstrap/i);
  const noState = structuredClone(validCompose);
  noState.services.api.environment.DEMO_BOOTSTRAP_REQUIRED = 'false';
  assert.throws(() => assertDemoComposeConfig(noState), /bootstrap/i);
  const socketMount = structuredClone(validCompose);
  socketMount.services.bootstrap.volumes.push('/var/run/docker.sock:/var/run/docker.sock');
  assert.throws(() => assertDemoComposeConfig(socketMount), /socket/i);
});

test('accepts only running bootstrap and healthy DB containers from one Compose project', () => {
  assert.deepEqual(assertBootstrapContainers(id('a'), id('b'), inspect('demo', 'bootstrap', { healthy: false }), inspect('demo', 'db')), { project: 'demo' });
  assert.throws(() => assertBootstrapContainers(id('a'), id('b'), inspect('other', 'bootstrap'), inspect('demo', 'db')), /same Compose project/i);
  assert.throws(() => assertBootstrapContainers(id('a'), id('b'), inspect('demo', 'api'), inspect('demo', 'db')), /bootstrap\/db services/i);
  assert.throws(() => assertBootstrapContainers(id('a'), id('b'), inspect('demo', 'bootstrap'), inspect('demo', 'db', { healthy: false })), /healthy/i);
});

test('migration failure prevents API startup and never asks for a confirmation', async () => {
  const commands = [];
  const runner = (command, args) => {
    commands.push(args.join(' '));
    if (args.includes('context')) return args.includes('show') ? 'desktop-linux' : '"npipe:////./pipe/dockerDesktopLinuxEngine"';
    if (args.includes('info')) return 'Engine';
    if (args.includes('config') && args.includes('--services')) return 'db\nbootstrap\napi';
    if (args.includes('--format') && args.includes('json')) return JSON.stringify(validCompose);
    if (args.includes('build')) return '';
    if (args.includes('ps') && args.includes('-q')) return id(args.at(-1) === 'db' ? 'b' : 'a');
      if (command === 'docker' && args[0] === 'inspect') return JSON.stringify(inspect('demo', args.at(-1) === id('b') ? 'db' : 'bootstrap', { healthy: args.at(-1) === id('b') }));
    if (args.includes('up')) return '';
    if (args.includes('stop')) return '';
    if (args.includes('exec') && args.includes('clear')) return '';
    if (args.includes('exec') && args.some((argument) => argument.includes('verify-demo-db.js'))) return 'DEMO_DB_IDENTITY verified';
    if (args.includes('db:migrate')) throw new Error('migration failed');
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };
  await assert.rejects(runDemoUp({ root: 'C:/demo', argv: [], env: {}, commandRunner: runner, fsAdapter: { existsSync: () => true }, sleep: async () => {}, maxHealthAttempts: 1, stdout: { write() {} } }), /migration failed/i);
  assert.equal(commands.some((command) => command.includes('up -d api')), false);
  assert.equal(commands.some((command) => command.includes('seed-demo-local.js --apply')), false);
});

test('database identity or Seeder failure stops the run before API startup', async () => {
  for (const failurePoint of ['database identity', 'Seeder']) {
    const commands = [];
    const runner = (command, args) => {
      commands.push(args.join(' '));
      if (args.includes('context')) return args.includes('show') ? 'desktop-linux' : '"npipe:////./pipe/dockerDesktopLinuxEngine"';
      if (args.includes('info')) return 'Engine';
      if (args.includes('config') && args.includes('--services')) return 'db\nbootstrap\napi';
      if (args.includes('--format') && args.includes('json')) return JSON.stringify(validCompose);
      if (args.includes('build')) return '';
      if (args[0] === 'inspect') return JSON.stringify(inspect('demo', args.at(-1) === id('b') ? 'db' : 'bootstrap', { healthy: args.at(-1) === id('b') }));
      if (args.includes('ps') && args.includes('-q')) return id(args.at(-1) === 'db' ? 'b' : 'a');
      if (args.includes('up') || args.includes('stop')) return '';
      if (args.includes('exec') && args.includes('clear')) return '';
      if (args.some((argument) => argument.includes('verify-demo-db.js'))) {
        if (failurePoint === 'database identity') throw new Error('database identity invalid');
        return 'verified';
      }
      if (args.includes('db:migrate:status')) return 'up 20261001000000-create-demo-schema.js';
      if (args.includes('db:migrate')) return 'up 20261001000000-create-demo-schema.js';
      if (args.some((argument) => argument.includes('seed-demo-local.js'))) throw new Error('Seeder failed safely');
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    };
    const expected = failurePoint === 'database identity' ? /identity invalid/i : /Seeder failed safely/i;
    await assert.rejects(runDemoUp({ root: 'C:/demo', env: {}, commandRunner: runner, fsAdapter: { existsSync: () => true }, sleep: async () => {}, maxHealthAttempts: 1, stdout: { write() {} } }), expected);
    assert.equal(commands.some((command) => command.includes('up -d api')), false);
  }
});

test('first run applies only missing demo rows and rerun is idempotent; API starts only after bootstrap', async () => {
  const commands = [];
  const running = { api: false, bootstrap: false };
  let runNumber = 0;
  const counts = { roles: 0, airlines: 0, airports: 0, users: 0, flights: 0, fareClasses: 0, promotions: 0 };
  const summary = (mode, scheduleStartDate, wouldCreate) => `DEMO_SEED_SUMMARY ${JSON.stringify({ mode, scheduleStartDate, existing: {}, wouldCreate, created: wouldCreate })}`;
  const runner = (command, args) => {
    const joined = args.join(' ');
    commands.push(joined);
    if (args.includes('context')) return args.includes('show') ? 'desktop-linux' : '"npipe:////./pipe/dockerDesktopLinuxEngine"';
    if (args.includes('info')) return 'Engine';
    if (args.includes('config') && args.includes('--services')) return 'db\nbootstrap\napi';
    if (args.includes('--format') && args.includes('json')) return JSON.stringify(validCompose);
    if (args.includes('build')) return '';
    if (args[0] === 'inspect') {
      const inspectedId = args.at(-1);
      const service = inspectedId === id('b') ? 'db' : inspectedId === id('a') ? 'bootstrap' : 'api';
      if (service === 'db') return JSON.stringify(inspect('demo', 'db'));
      if (service === 'bootstrap') return JSON.stringify(inspect('demo', 'bootstrap', { running: running.bootstrap, healthy: false }));
      return JSON.stringify(inspect('demo', 'api', { running: running.api, healthy: true }));
    }
    if (args.includes('ps') && args.includes('-q')) return id(args.at(-1) === 'db' ? 'b' : args.at(-1) === 'bootstrap' ? 'a' : 'c');
    if (args.includes('stop') && args.includes('api')) { running.api = false; return ''; }
    if (args.includes('stop') && args.includes('bootstrap')) { running.bootstrap = false; return ''; }
    if (args.includes('up') && args.includes('bootstrap')) {
      running.bootstrap = true;
      return '';
    }
    if (args.includes('up') && args.includes('api')) {
      if (!args.includes('--no-deps')) {
        running.bootstrap = true;
        throw new Error('Compose restarted the stopped bootstrap dependency');
      }
      if (running.bootstrap) throw new Error('API attempted to start before bootstrap completed');
      running.api = true;
      return '';
    }
    if (args.includes('up') && args.includes('db')) return '';
    if (args.includes('exec') && args.includes('clear')) return '';
    if (args.includes('exec') && args.some((argument) => argument.includes('verify-demo-db.js'))) return 'DEMO_DB_IDENTITY verified';
    if (args.includes('exec') && args.includes('db:migrate:status')) return 'up 20261001000000-create-demo-schema.js';
    if (args.includes('exec') && args.includes('db:migrate')) return '';
    if (args.includes('exec') && args.includes('scripts/seed-demo-local.js')) {
      const apply = args.includes('--apply');
      const scheduleDate = args[args.indexOf('--start-date') + 1];
      if (apply) return summary('apply', scheduleDate, { ...counts, users: 3 });
      runNumber += 1;
      const wouldCreate = runNumber === 1 ? { ...counts, users: 3 } : counts;
      return summary('dry-run', scheduleDate, wouldCreate);
    }
    if (args.includes('exec') && args.some((argument) => argument.includes('demo-bootstrap-state.js'))) return '';
    if (args.includes('exec') && args.includes('api')) return '{"status":"ok"}';
    throw new Error(`Unexpected command: ${joined}`);
  };
  const run = () => runDemoUp({
    root: 'C:/demo', argv: [], env: {}, commandRunner: runner, fsAdapter: { existsSync: () => true },
    sleep: async () => {}, maxHealthAttempts: 1, stdout: { write() {} },
  });

  await run();
  assert.ok(commands.findIndex((command) => command.includes('build api bootstrap')) < commands.findIndex((command) => command.includes('up -d db')));
  assert.ok(commands.findIndex((command) => command.includes('verify-demo-db.js')) < commands.findIndex((command) => command.includes('db:migrate')));
  assert.ok(commands.findIndex((command) => command.includes('db:migrate')) < commands.findIndex((command) => command.includes('scripts/seed-demo-local.js --start-date')));
  assert.ok(commands.findIndex((command) => command.includes('demo-bootstrap-state.js mark')) < commands.findIndex((command) => command.includes('stop -t 3 bootstrap')));
  assert.ok(commands.findIndex((command) => command.includes('stop -t 3 bootstrap')) < commands.findIndex((command) => command.includes('up -d --no-deps api')));
  assert.equal(commands.filter((command) => command.includes('scripts/seed-demo-local.js --start-date') && command.includes('--apply')).length, 1);
  assert.equal(running.api, true);

  commands.length = 0;
  await run();
  assert.equal(commands.some((command) => command.includes('scripts/seed-demo-local.js --start-date') && command.includes('--apply')), false);
  assert.equal(running.api, true);
});

test('engine unavailable is reported before any Compose startup or database action', async () => {
  const commands = [];
  await assert.rejects(runDemoUp({
    root: 'C:/demo', argv: [], env: {}, fsAdapter: { existsSync: () => true },
    commandRunner(command, args) {
      commands.push(args.join(' '));
      if (args.includes('context') && args.includes('show')) return 'desktop-linux';
      if (args.includes('context') && args.includes('inspect')) return '"npipe:////./pipe/dockerDesktopLinuxEngine"';
      if (args.includes('info')) throw new Error('Docker Engine unavailable');
      throw new Error('Compose must not run');
    }, stdout: { write() {} },
  }), /engine.*unavailable|Docker Engine unavailable/i);
  assert.equal(commands.some((command) => command.startsWith('compose')), false);
});
