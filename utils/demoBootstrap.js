'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEMO_DATABASE = 'airline_booking_docker';
const CONTAINER_ID = /^[a-f0-9]{12,64}$/i;

function validateRecord(record) {
  if (!record || record.version !== 1 || record.status !== 'complete' || record.database !== DEMO_DATABASE
    || !String(record.composeProject || '').trim() || !CONTAINER_ID.test(record.dbContainerId || '')) {
    throw new Error('Demo bootstrap state is missing or invalid; run npm run demo:up before using the local API.');
  }
  return record;
}

function readBootstrapRecord(markerPath, fsAdapter = fs) {
  let record;
  try { record = JSON.parse(fsAdapter.readFileSync(markerPath, 'utf8')); }
  catch (_error) { throw new Error('Demo bootstrap is incomplete; run npm run demo:up before using the local API.'); }
  return validateRecord(record);
}

function writeBootstrapRecord(markerPath, record, fsAdapter = fs) {
  validateRecord(record);
  const directory = path.dirname(markerPath);
  fsAdapter.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${markerPath}.${process.pid}.tmp`;
  fsAdapter.writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fsAdapter.renameSync(temporaryPath, markerPath);
  return record;
}

function clearBootstrapRecord(markerPath, fsAdapter = fs) {
  try { fsAdapter.unlinkSync(markerPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function assertBootstrapReady({ env = process.env, markerPath, databaseRow, fsAdapter = fs } = {}) {
  if (env.DEMO_BOOTSTRAP_REQUIRED !== 'true') return true;
  if (env.NODE_ENV !== 'development' || env.DB_HOST !== 'db' || env.DB_NAME !== DEMO_DATABASE || String(env.DB_SSL).toLowerCase() !== 'false') {
    throw new Error('Demo bootstrap readiness is only supported for the local development database configuration.');
  }
  const record = readBootstrapRecord(markerPath || env.DEMO_BOOTSTRAP_STATE_FILE, fsAdapter);
  if (!databaseRow || databaseRow.database_name !== DEMO_DATABASE
    || !String(databaseRow.server_hostname || '').startsWith(record.dbContainerId.slice(0, 12))
    || Number(databaseRow.server_port) !== 3306 || Number(databaseRow.read_only) !== 0) {
    throw new Error('The running MySQL identity does not match the completed local demo bootstrap; run npm run demo:up.');
  }
  return true;
}

module.exports = { DEMO_DATABASE, validateRecord, readBootstrapRecord, writeBootstrapRecord, clearBootstrapRecord, assertBootstrapReady };
