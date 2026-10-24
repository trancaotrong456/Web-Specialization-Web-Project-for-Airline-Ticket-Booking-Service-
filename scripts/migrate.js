'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { validateMigrationEnvironment } = require('../config/migrationValidation');

function parseArgs(argv) {
  const envIndex = argv.indexOf('--env');
  const targetEnv = envIndex >= 0 ? argv[envIndex + 1] : (process.env.NODE_ENV || 'development');
  if (!targetEnv || targetEnv.startsWith('-')) throw new Error('--env requires a target environment.');
  return { targetEnv, checkOnly: argv.includes('--check-only') };
}

function run(argv = process.argv.slice(2)) {
  const { targetEnv, checkOnly } = parseArgs(argv);
  const environment = { ...process.env, NODE_ENV: targetEnv };
  validateMigrationEnvironment({ env: environment, targetEnv });
  if (checkOnly) return 0;

  const sequelizeCli = path.resolve(__dirname, '../node_modules/sequelize-cli/lib/sequelize');
  const result = spawnSync(process.execPath, [sequelizeCli, 'db:migrate', '--env', targetEnv, '--config', path.resolve(__dirname, '../config/config.js')], {
    stdio: 'inherit',
    env: environment,
  });
  if (result.error) throw result.error;
  return result.status === 0 ? 0 : (result.status || 1);
}

if (require.main === module) {
  try { process.exitCode = run(); } catch (error) {
    console.error(`[migration preflight] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, run };
