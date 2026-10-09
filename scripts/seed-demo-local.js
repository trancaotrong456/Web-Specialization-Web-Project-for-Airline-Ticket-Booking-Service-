'use strict';

const fs = require('fs');
const path = require('path');
const { assertSafeDockerTarget, runDemoSeed } = require('./demo-seed-core');

function readConfigFromStdin(input = '') {
  if (!input.trim()) return {};
  const config = JSON.parse(input);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Seed configuration input must be a JSON object.');
  return config;
}

async function assertConnectedDatabase(sequelize, expectedDbContainerId) {
  const [rows] = await sequelize.query('SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only');
  const row = rows?.[0];
  if (!row || row.database_name !== 'airline_booking_docker') throw new Error('Connected database is not airline_booking_docker; no data was changed.');
  if (!String(row.server_hostname || '').startsWith(expectedDbContainerId.slice(0, 12))) throw new Error('Connected MySQL server does not match the verified local Compose database container; no data was changed.');
  if (Number(row.server_port) !== 3306 || Number(row.read_only) !== 0) throw new Error('Connected MySQL instance is not the expected writable local Compose service; no data was changed.');
  return true;
}

async function main({ argv = process.argv.slice(2), stdin = process.stdin, env = process.env } = {}) {
  const apply = argv.includes('--apply');
  if (argv.some((arg) => arg !== '--apply')) throw new Error('Only the optional --apply flag is supported.');
  const input = await new Promise((resolve, reject) => {
    let content = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => { content += chunk; });
    stdin.on('end', () => resolve(content));
    stdin.on('error', reject);
  });
  const config = readConfigFromStdin(input);
  const runtime = {
    isDockerContainer: fs.existsSync('/.dockerenv'),
    composeProject: env.DEMO_SEED_COMPOSE_PROJECT,
    apiContainerId: env.DEMO_SEED_API_CONTAINER_ID,
    dbContainerId: env.DEMO_SEED_DB_CONTAINER_ID,
    hostname: env.HOSTNAME,
  };
  assertSafeDockerTarget(env, runtime);

  // Load models only after the local Docker and database environment has passed its safety checks.
  const projectRoot = path.resolve(env.DEMO_SEED_PROJECT_ROOT || path.join(__dirname, '..'));
  if (runtime.isDockerContainer && projectRoot !== '/app') throw new Error('Demo seed project root must be the verified API application directory.');
  const models = require(path.join(projectRoot, 'models'));
  await models.sequelize.authenticate();
  await assertConnectedDatabase(models.sequelize, runtime.dbContainerId);
  const result = await runDemoSeed({ models, sequelize: models.sequelize, config, apply });
  if (result.mode === 'dry-run') {
    console.log('DRY-RUN: Không ghi dữ liệu vào database.');
    console.log(`Ngày bắt đầu lịch bay cố định: ${result.scheduleStartDate}`);
    console.log(`Lịch bay demo đã có: ${result.flightScheduleExists ? 'có' : 'không'}`);
    console.log(`Dự kiến tạo: ${JSON.stringify(result.wouldCreate)}`);
  } else {
    console.log('APPLY hoàn tất trong transaction. Không có Booking/Payment nào được tạo hoặc sửa.');
    console.log(`Ngày bắt đầu lịch bay cố định: ${result.scheduleStartDate}`);
    console.log(`Đã tạo: ${JSON.stringify(result.created)}`);
  }
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Seed demo bị từ chối hoặc thất bại: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readConfigFromStdin, assertConnectedDatabase, main };
