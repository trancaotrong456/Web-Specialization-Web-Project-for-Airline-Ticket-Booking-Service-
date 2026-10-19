'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertLocalDockerEndpoint, assertSafeComposeConfig, prepareDockerTarget } = require('./seed-demo-docker');
const { defaultDemoStartDate } = require('./demo-seed-core');

const COMPOSE_PREFIX = ['compose', '--env-file', 'docker.env'];
const CONFIRMATION = 'CHO PHÉP APPLY DEMO SEED';

function ensureLocalComposeEnv({ root = process.cwd(), fsAdapter = fs } = {}) {
  const localPath = path.join(root, 'docker.env');
  const examplePath = path.join(root, 'docker.env.example');

  if (fsAdapter.existsSync(localPath)) return { created: false };
  if (!fsAdapter.existsSync(examplePath)) {
    throw new Error('docker.env.example is missing; restore the tracked local Docker template first.');
  }

  try {
    fsAdapter.copyFileSync(examplePath, localPath, fsAdapter.constants.COPYFILE_EXCL);
    return { created: true };
  } catch (error) {
    if (error.code === 'EEXIST') return { created: false };
    throw new Error(`Could not create local docker.env without overwriting existing configuration: ${error.message}`);
  }
}

function runCommand(command, args, { cwd = process.cwd(), input, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, input, env, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} exited with code ${result.status}.`);
  return result.stdout.trim();
}

function assertMigrationsApplied(output) {
  const statuses = String(output || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(up|down)\s+/i.test(line));
  if (!statuses.length) throw new Error('Could not verify database migration status; setup stopped before seeding.');
  if (statuses.some((line) => /^down\s+/i.test(line))) throw new Error('Database migrations are pending; setup stopped before seeding.');
  return true;
}

function readSummary(output) {
  const line = String(output || '').split(/\r?\n/).find((item) => item.startsWith('DEMO_SEED_SUMMARY '));
  if (!line) throw new Error('Seeder did not return a machine-readable dry-run summary.');
  try { return JSON.parse(line.slice('DEMO_SEED_SUMMARY '.length)); }
  catch (_error) { throw new Error('Seeder returned an invalid summary; setup stopped safely.'); }
}

function allZeroCounts(counts) {
  return counts && Object.values(counts).every((value) => Number(value) === 0);
}

async function readConfirmation(stdin) {
  let input = '';
  for await (const chunk of stdin) {
    input += chunk;
    if (input.includes('\n')) break;
  }
  return input.split(/\r?\n/, 1)[0].trim();
}

function isPortConflict(error) {
  return /address already in use|port.+already allocated|bind for.+failed|ports are not available/i.test(error.message || '');
}

async function runDemoSetup({
  root = process.cwd(), argv = process.argv.slice(2), stdin = process.stdin, stdout = process.stdout,
  commandRunner = runCommand, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  env = process.env, maxHealthAttempts = 60, healthIntervalMs = 2000,
} = {}) {
  if (argv.length) throw new Error('Usage: npm run demo:setup');
  ensureLocalComposeEnv({ root });

  let contextName;
  let endpointOutput;
  try {
    contextName = commandRunner('docker', ['context', 'show'], { cwd: root });
    endpointOutput = commandRunner('docker', ['context', 'inspect', contextName, '--format', '{{json .Endpoints.docker.Host}}'], { cwd: root });
  } catch (error) {
    throw new Error(`Docker CLI or local engine is unavailable; no Compose startup or seeding was attempted. Details: ${error.message}`);
  }
  assertLocalDockerEndpoint(JSON.parse(endpointOutput));

  const services = commandRunner('docker', [...COMPOSE_PREFIX, 'config', '--services'], { cwd: root }).split(/\r?\n/).filter(Boolean);
  if (!services.includes('api') || !services.includes('db')) throw new Error('Compose project must define both api and db services.');
  const composeConfig = JSON.parse(commandRunner('docker', [...COMPOSE_PREFIX, 'config', '--format', 'json'], { cwd: root }));
  assertSafeComposeConfig(composeConfig);

  try {
    commandRunner('docker', [...COMPOSE_PREFIX, 'up', '-d', '--build', 'api', 'db'], { cwd: root });
  } catch (error) {
    if (isPortConflict(error)) throw new Error(`A required local port is already in use. Stop the conflicting project manually and rerun; no process was stopped. Details: ${error.message}`);
    throw error;
  }

  let target;
  let ready = false;
  for (let attempt = 0; attempt < maxHealthAttempts; attempt += 1) {
    try {
      target = prepareDockerTarget({ root, dockerRun: commandRunner });
      ready = true;
      break;
    } catch (error) {
      if (!/must be running|must be healthy|could not identify/i.test(error.message || '')) throw error;
      if (attempt + 1 < maxHealthAttempts) await sleep(healthIntervalMs);
    }
  }
  if (!ready) throw new Error('Docker Compose services did not become healthy before the setup timeout; seeding was not started.');

  const migrationStatus = commandRunner('docker', [...COMPOSE_PREFIX, 'exec', '-T', 'api', 'npx', 'sequelize-cli', 'db:migrate:status'], { cwd: root });
  assertMigrationsApplied(migrationStatus);

  const sessionStartDate = defaultDemoStartDate();
  stdout.write(`Đích đã xác minh: Docker Compose local '${target.project}', database airline_booking_docker.\n`);
  const seedArgs = ['scripts/seed-demo-docker.js', '--start-date', sessionStartDate];
  const dryRunOutput = commandRunner(process.execPath, seedArgs, { cwd: root, env });
  if (dryRunOutput) stdout.write(`${dryRunOutput}\n`);
  const preview = readSummary(dryRunOutput);
  if (preview.mode !== 'dry-run') throw new Error('Seeder did not remain in read-only dry-run mode.');

  stdout.write(`Đã có: ${JSON.stringify(preview.existing)}\nDự kiến bổ sung: ${JSON.stringify(preview.wouldCreate)}\n`);
  stdout.write(`Chỉ ghi dữ liệu khi nhập chính xác: ${CONFIRMATION}\n`);
  if (!stdin?.isTTY) return { status: 'confirmation-required', target, preview };
  const confirmation = await readConfirmation(stdin);
  if (confirmation !== CONFIRMATION) return { status: 'cancelled', target, preview };

  const applyOutput = commandRunner(process.execPath, [...seedArgs, '--apply'], { cwd: root, env });
  if (applyOutput) stdout.write(`${applyOutput}\n`);
  const applySummary = readSummary(applyOutput);
  if (applySummary.mode !== 'apply' || applySummary.scheduleStartDate !== preview.scheduleStartDate) {
    throw new Error('Apply result differed from the reviewed dry-run schedule; inspect the database before retrying.');
  }

  const postOutput = commandRunner(process.execPath, seedArgs, { cwd: root, env });
  if (postOutput) stdout.write(`${postOutput}\n`);
  const postSummary = readSummary(postOutput);
  if (postSummary.mode !== 'dry-run' || !allZeroCounts(postSummary.wouldCreate)) {
    throw new Error('Post-apply dry-run still finds missing demo rows; do not rerun apply until reviewed.');
  }
  return { status: 'complete', target, preview, apply: applySummary, postApply: postSummary };
}

if (require.main === module) {
  runDemoSetup().then((result) => {
    if (result.status === 'confirmation-required') console.log('Không có terminal tương tác; database chưa được ghi. Chạy lại từ terminal tương tác để xác nhận.');
    if (result.status === 'cancelled') console.log('Đã hủy theo lựa chọn; database chưa được ghi.');
  }).catch((error) => {
    console.error(`Demo setup dừng an toàn: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { ensureLocalComposeEnv, assertMigrationsApplied, readSummary, runDemoSetup };
