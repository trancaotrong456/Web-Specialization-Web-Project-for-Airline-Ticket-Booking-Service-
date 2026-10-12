'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertLocalDockerEndpoint } = require('./seed-demo-docker');
const { ensureLocalComposeEnv, assertMigrationsApplied, readSummary } = require('./demo-setup');
const { defaultDemoStartDate } = require('./demo-seed-core');

const COMPOSE_PREFIX = ['compose', '--env-file', 'docker.env'];
const DEMO_DATABASE = 'airline_booking_docker';
const MARKER_PATH = '/var/lib/serene-demo/bootstrap.json';

function runCommand(command, args, { cwd = process.cwd(), input, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, input, env, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} exited with code ${result.status}.`);
  return result.stdout.trim();
}

function parseEndpoint(value) {
  try { return JSON.parse(value); }
  catch (_error) { return String(value || '').trim().replace(/^['"]|['"]$/g, ''); }
}

function assertLocalDockerOverrides({ env = {}, contextEndpoint, contextName } = {}) {
  const endpoint = parseEndpoint(contextEndpoint);
  const dockerHost = String(env.DOCKER_HOST || '').trim();
  const dockerContext = String(env.DOCKER_CONTEXT || '').trim();
  if (env.DOCKER_TLS_VERIFY || env.DOCKER_CERT_PATH) throw new Error('Docker TLS environment overrides are refused for demo setup; select a verified local Docker Desktop context.');
  if (env.COMPOSE_FILE || env.COMPOSE_PATH_SEPARATOR || env.COMPOSE_PROFILES) throw new Error('Compose file/profile overrides are refused; run demo:up from the repository with its tracked Compose configuration.');
  if (dockerContext && contextName && dockerContext !== contextName) throw new Error('DOCKER_CONTEXT does not match the effective Docker context; refusing ambiguous overrides.');
  if (dockerHost) {
    assertLocalDockerEndpoint(dockerHost);
    if (endpoint && dockerHost !== endpoint) throw new Error('DOCKER_HOST conflicts with the selected Docker context endpoint; refusing ambiguous overrides.');
  }
  assertLocalDockerEndpoint(endpoint || dockerHost);
  return true;
}

function assertDemoComposeConfig(compose, { root } = {}) {
  const services = compose?.services || {};
  const api = services.api || {};
  const bootstrap = services.bootstrap || {};
  const db = services.db || {};
  const apiEnv = api.environment || {};
  const bootstrapEnv = bootstrap.environment || {};
  if (apiEnv.NODE_ENV !== 'development' || apiEnv.DB_HOST !== 'db' || apiEnv.DB_NAME !== DEMO_DATABASE || String(apiEnv.DB_SSL).toLowerCase() !== 'false') {
    throw new Error('Compose API must target development database airline_booking_docker only.');
  }
  if (bootstrapEnv.NODE_ENV !== 'development' || bootstrapEnv.DB_HOST !== 'db' || bootstrapEnv.DB_NAME !== DEMO_DATABASE || String(bootstrapEnv.DB_SSL).toLowerCase() !== 'false') {
    throw new Error('Compose bootstrap must resolve NODE_ENV=development, DB_HOST=db, DB_NAME=airline_booking_docker, and DB_SSL=false.');
  }
  if (db.environment?.MYSQL_DATABASE !== DEMO_DATABASE || !/^mysql(?::|\/)/i.test(db.image || '')) {
    throw new Error('Compose database must be the dedicated local MySQL airline_booking_docker service.');
  }
  if (apiEnv.DEMO_BOOTSTRAP_REQUIRED !== 'true' || apiEnv.DEMO_BOOTSTRAP_STATE_FILE !== MARKER_PATH) {
    throw new Error('Compose API must require the completed local demo bootstrap state.');
  }
  if (api.depends_on?.bootstrap?.condition !== 'service_completed_successfully') {
    throw new Error('Compose API must wait for bootstrap service_completed_successfully before starting.');
  }
  if (bootstrap.depends_on?.db?.condition !== 'service_healthy') throw new Error('Compose bootstrap must wait for the healthy local DB.');
  if ((bootstrap.ports || []).length) throw new Error('Bootstrap service must not expose host ports.');
  if (JSON.stringify(bootstrap.command || []).replace(/[\s"']/g, '') !== '[node,scripts/demo-bootstrap-agent.js]') {
    throw new Error('Compose bootstrap must use the repository host-controlled bootstrap agent command.');
  }
  if (JSON.stringify(api.command || []).replace(/[\s"']/g, '') !== '[node,server.js]') {
    throw new Error('Compose API must use the gated server startup command, not an unverified migration startup.');
  }
  if (api.privileged || bootstrap.privileged || api.devices?.length || bootstrap.devices?.length) {
    throw new Error('API/bootstrap must not be privileged or receive host devices.');
  }
  const volumeSources = JSON.stringify(Object.values(services).map((service) => service.volumes || [])).toLowerCase();
  if (volumeSources.includes('docker.sock') || volumeSources.includes('docker_engine') || volumeSources.includes('dockerdesktoplinuxengine')) {
    throw new Error('Docker socket/engine mounts are forbidden in Compose services.');
  }
  const apiMounts = JSON.stringify(api.volumes || []);
  const bootstrapMounts = JSON.stringify(bootstrap.volumes || []);
  if (!apiMounts.includes('/var/lib/serene-demo') || !bootstrapMounts.includes('/var/lib/serene-demo') || !apiMounts.includes('demo_bootstrap_state') || !bootstrapMounts.includes('demo_bootstrap_state')) {
    throw new Error('API and bootstrap must share the private demo bootstrap state volume.');
  }
  if (root) {
    const expectedContext = path.resolve(root).toLowerCase();
    for (const [name, service] of [['api', api], ['bootstrap', bootstrap]]) {
      const context = service.build?.context;
      if (!context || path.resolve(context).toLowerCase() !== expectedContext) throw new Error(`Compose ${name} build context must be this repository.`);
    }
  }
  return true;
}

function labelsOf(inspection) { return inspection?.Config?.Labels || {}; }
function validId(value) { return /^[a-f0-9]{12,64}$/i.test(value || ''); }

function assertBootstrapContainers(bootstrapId, dbId, bootstrapInspection, dbInspection) {
  if (!validId(bootstrapId) || !validId(dbId)) throw new Error('Could not identify the Compose bootstrap and DB containers.');
  const bootstrapLabels = labelsOf(bootstrapInspection);
  const dbLabels = labelsOf(dbInspection);
  const project = bootstrapLabels['com.docker.compose.project'];
  if (!project || project !== dbLabels['com.docker.compose.project']
    || bootstrapLabels['com.docker.compose.service'] !== 'bootstrap' || dbLabels['com.docker.compose.service'] !== 'db') {
    throw new Error('Bootstrap and DB containers are not bootstrap/db services of the same Compose project.');
  }
  if (!bootstrapInspection?.State?.Running) throw new Error('Verified Compose bootstrap agent must be running.');
  if (!dbInspection?.State?.Running || dbInspection?.State?.Health?.Status !== 'healthy') throw new Error('Verified local Compose DB must be running and healthy.');
  const dbEnv = dbInspection?.Config?.Env || [];
  if (Array.isArray(dbEnv) && !dbEnv.some((entry) => entry === `MYSQL_DATABASE=${DEMO_DATABASE}`)) throw new Error('Verified DB container environment does not identify airline_booking_docker.');
  return { project };
}

function dockerInspection(id, cwd, commandRunner) {
  return JSON.parse(commandRunner('docker', ['inspect', '--format', '{{json .}}', id], { cwd }));
}

function composeArgs(...args) { return [...COMPOSE_PREFIX, ...args]; }
function allZeroCounts(counts) { return counts && Object.values(counts).every((value) => Number(value) === 0); }

function composeExec(root, commandRunner, command, { env = {} } = {}) {
  const flags = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return commandRunner('docker', composeArgs('exec', '-T', ...flags, 'bootstrap', ...command), { cwd: root });
}

async function pollComposeService({ root, service, commandRunner, attempts, interval, sleep, validate }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const id = commandRunner('docker', composeArgs('ps', '-q', service), { cwd: root });
      if (id) {
        const inspection = dockerInspection(id, root, commandRunner);
        const value = validate(id, inspection);
        if (value) return { id, inspection, value };
      }
    } catch (error) {
      if (attempt + 1 >= attempts) throw error;
    }
    if (attempt + 1 < attempts) await sleep(interval);
  }
  throw new Error(`Compose ${service} did not become ready before timeout.`);
}

async function runDemoUp({
  root = process.cwd(), argv = process.argv.slice(2), env = process.env, fsAdapter = fs,
  commandRunner = runCommand, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  stdout = process.stdout, maxHealthAttempts = 60, healthIntervalMs = 2000,
} = {}) {
  if (argv.length) throw new Error('Usage: npm run demo:up');
  ensureLocalComposeEnv({ root, fsAdapter });
  let contextName;
  let endpoint;
  try {
    contextName = commandRunner('docker', ['context', 'show'], { cwd: root, env });
    endpoint = commandRunner('docker', ['context', 'inspect', contextName, '--format', '{{json .Endpoints.docker.Host}}'], { cwd: root, env });
    assertLocalDockerOverrides({ env, contextEndpoint: endpoint, contextName });
    commandRunner('docker', ['info', '--format', '{{.ServerVersion}}'], { cwd: root, env });
  } catch (error) {
    throw new Error(`Local Docker Engine is unavailable or not verifiably local; no Compose services or database work were started. Details: ${error.message}`);
  }

  const services = commandRunner('docker', composeArgs('config', '--services'), { cwd: root, env }).split(/\r?\n/).filter(Boolean);
  if (!services.includes('api') || !services.includes('bootstrap') || !services.includes('db')) throw new Error('Compose must define db, bootstrap, and api services.');
  const compose = JSON.parse(commandRunner('docker', composeArgs('config', '--format', 'json'), { cwd: root, env }));
  assertDemoComposeConfig(compose, { root });

  commandRunner('docker', composeArgs('build', 'api', 'bootstrap'), { cwd: root, env });
  commandRunner('docker', composeArgs('up', '-d', 'db'), { cwd: root, env });
  const dbResult = await pollComposeService({
    root, service: 'db', commandRunner, attempts: maxHealthAttempts, interval: healthIntervalMs, sleep,
    validate(id, inspection) {
      if (labelsOf(inspection)['com.docker.compose.service'] !== 'db') throw new Error('Compose DB service identity mismatch.');
      if (!inspection?.State?.Running || inspection?.State?.Health?.Status !== 'healthy') return null;
      return true;
    },
  });
  const dbId = dbResult.id;
  const project = labelsOf(dbResult.inspection)['com.docker.compose.project'];
  if (!project || (compose.name && compose.name !== project)) throw new Error('Compose project identity does not match the verified database container.');

  commandRunner('docker', composeArgs('stop', 'api'), { cwd: root, env });
  commandRunner('docker', composeArgs('up', '-d', '--force-recreate', 'bootstrap'), { cwd: root, env });
  const bootstrapResult = await pollComposeService({
    root, service: 'bootstrap', commandRunner, attempts: maxHealthAttempts, interval: healthIntervalMs, sleep,
    validate(id, inspection) {
      try { assertBootstrapContainers(id, dbId, inspection, dbResult.inspection); return true; }
      catch (error) { if (/must be running/i.test(error.message)) return null; throw error; }
    },
  });
  const bootstrapId = bootstrapResult.id;
  const identities = assertBootstrapContainers(bootstrapId, dbId, bootstrapResult.inspection, dbResult.inspection);
  if (identities.project !== project) throw new Error('Bootstrap container is not part of the verified local Compose project.');

  composeExec(root, commandRunner, ['node', 'scripts/demo-bootstrap-state.js', 'clear']);
  const scheduleStartDate = defaultDemoStartDate();
  const seedEnv = {
    DEMO_SEED_COMPOSE_PROJECT: project,
    DEMO_SEED_API_CONTAINER_ID: bootstrapId,
    DEMO_SEED_DB_CONTAINER_ID: dbId,
    DEMO_SEED_PROJECT_ROOT: '/app',
  };
  composeExec(root, commandRunner, ['node', 'scripts/verify-demo-db.js', dbId], { env: seedEnv });
  stdout.write(`Read-only MySQL identity preflight passed for ${DEMO_DATABASE}.\n`);
  composeExec(root, commandRunner, ['npx', 'sequelize-cli', 'db:migrate']);
  const migrationStatus = composeExec(root, commandRunner, ['npx', 'sequelize-cli', 'db:migrate:status']);
  assertMigrationsApplied(migrationStatus);

  const seedArgs = ['node', 'scripts/seed-demo-local.js', '--start-date', scheduleStartDate];
  const previewOutput = composeExec(root, commandRunner, seedArgs, { env: seedEnv });
  if (previewOutput) stdout.write(`${previewOutput}\n`);
  const preview = readSummary(previewOutput);
  if (preview.mode !== 'dry-run') throw new Error('Seeder did not remain read-only for the initial preview.');
  stdout.write(`Local Docker '${project}', database ${DEMO_DATABASE}; migration state verified.\n`);
  stdout.write(`Current demo rows: ${JSON.stringify(preview.existing)}\nMissing rows to add: ${JSON.stringify(preview.wouldCreate)}\n`);

  let applySummary = null;
  if (!allZeroCounts(preview.wouldCreate)) {
    const applyOutput = composeExec(root, commandRunner, [...seedArgs, '--apply'], { env: seedEnv });
    if (applyOutput) stdout.write(`${applyOutput}\n`);
    applySummary = readSummary(applyOutput);
    if (applySummary.mode !== 'apply' || applySummary.scheduleStartDate !== preview.scheduleStartDate) {
      throw new Error('Automatic demo seed result differed from the validated preview; bootstrap was not marked complete.');
    }
  }
  const postOutput = composeExec(root, commandRunner, seedArgs, { env: seedEnv });
  if (postOutput) stdout.write(`${postOutput}\n`);
  const postSummary = readSummary(postOutput);
  if (postSummary.mode !== 'dry-run' || !allZeroCounts(postSummary.wouldCreate)) throw new Error('Post-bootstrap dry-run still finds missing demo rows; backend will not be started.');

  composeExec(root, commandRunner, ['node', 'scripts/demo-bootstrap-state.js', 'mark', dbId, project]);
  commandRunner('docker', composeArgs('stop', '-t', '3', 'bootstrap'), { cwd: root, env });
  const stoppedBootstrap = dockerInspection(bootstrapId, root, commandRunner);
  if (stoppedBootstrap?.State?.Status !== 'exited' || Number(stoppedBootstrap?.State?.ExitCode) !== 0) throw new Error('Bootstrap agent did not exit successfully; API will not be started.');
  commandRunner('docker', composeArgs('up', '-d', '--no-deps', 'api'), { cwd: root, env });

  const apiResult = await pollComposeService({
    root, service: 'api', commandRunner, attempts: maxHealthAttempts, interval: healthIntervalMs, sleep,
    validate(id, inspection) {
      const apiProject = labelsOf(inspection)['com.docker.compose.project'];
      if (labelsOf(inspection)['com.docker.compose.service'] !== 'api' || apiProject !== project) throw new Error('API service identity does not match the verified demo Compose project.');
      if (!inspection?.State?.Running || inspection?.State?.Health?.Status !== 'healthy') return null;
      return true;
    },
  });
  commandRunner('docker', composeArgs('exec', '-T', 'api', 'node', '-e', "fetch('http://127.0.0.1:5000/api/v1/health').then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(console.log).catch(()=>process.exit(1))"), { cwd: root, env });
  stdout.write(`Backend healthy at http://localhost:${compose.services.api.ports?.[0]?.published || '5000'}; shared local demo data is ready.\n`);
  return { status: 'complete', project, database: DEMO_DATABASE, dbId, bootstrapId, apiId: apiResult.id, preview, apply: applySummary, postApply: postSummary };
}

if (require.main === module) {
  runDemoUp().catch((error) => {
    console.error(`Demo startup stopped safely: ${error.message}`);
    if (/Local Docker Engine is unavailable/i.test(error.message || '')) {
      console.error('Start Docker Desktop with a local context, then rerun npm run demo:up.');
    }
    process.exitCode = 1;
  });
}

module.exports = { assertLocalDockerOverrides, assertDemoComposeConfig, assertBootstrapContainers, runDemoUp };
