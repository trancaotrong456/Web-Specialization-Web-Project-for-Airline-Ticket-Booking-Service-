'use strict';

const fs = require('fs');
const path = require('path');
const { assertSafeDockerTarget, runDemoSeed } = require('./demo-seed-core');

function parseSeedArgs(argv = []) {
  let apply = false;
  let startDate;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply' && !apply) apply = true;
    else if (argv[index] === '--start-date' && !startDate && /^\d{4}-\d{2}-\d{2}$/.test(argv[index + 1] || '')) {
      startDate = argv[index + 1];
      index += 1;
    } else throw new Error('Only --apply and the internal YYYY-MM-DD --start-date option are supported.');
  }
  return { apply, startDate };
}

async function assertConnectedDatabase(sequelize, expectedDbContainerId) {
  const [rows] = await sequelize.query('SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only');
  const row = rows?.[0];
  if (!row || row.database_name !== 'airline_booking_docker') throw new Error('Connected database is not airline_booking_docker; no data was changed.');
  if (!String(row.server_hostname || '').startsWith(expectedDbContainerId.slice(0, 12))) throw new Error('Connected MySQL server does not match the verified local Compose database container; no data was changed.');
  if (Number(row.server_port) !== 3306 || Number(row.read_only) !== 0) throw new Error('Connected MySQL instance is not the expected writable local Compose service; no data was changed.');
  return true;
}

async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { apply, startDate } = parseSeedArgs(argv);
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
  const result = await runDemoSeed({ models, sequelize: models.sequelize, startDate, apply });
  if (result.mode === 'dry-run') {
    console.log('DRY-RUN: Không ghi dữ liệu vào database.');
    console.log(`Ngày bắt đầu lịch bay dự kiến (giờ Việt Nam): ${result.scheduleStartDate}`);
    console.log(`Lịch bay demo đã có: ${result.flightScheduleExists ? 'có' : 'không'}`);
    console.log(`Dự kiến tạo: ${JSON.stringify(result.wouldCreate)}`);
    console.log(`DEMO_SEED_SUMMARY ${JSON.stringify({ mode: result.mode, scheduleStartDate: result.scheduleStartDate, flightScheduleExists: result.flightScheduleExists, existing: result.existing, wouldCreate: result.wouldCreate })}`);
  } else {
    console.log('APPLY hoàn tất trong transaction. Không có Booking/Payment nào được tạo hoặc sửa.');
    console.log(`Ngày bắt đầu lịch bay (giờ Việt Nam): ${result.scheduleStartDate}`);
    console.log(`Đã tạo: ${JSON.stringify(result.created)}`);
    console.log(`DEMO_SEED_SUMMARY ${JSON.stringify({ mode: result.mode, scheduleStartDate: result.scheduleStartDate, flightScheduleExists: result.flightScheduleExists, existing: result.existing, created: result.created })}`);
  }
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Seed demo bị từ chối hoặc thất bại: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseSeedArgs, assertConnectedDatabase, main };
