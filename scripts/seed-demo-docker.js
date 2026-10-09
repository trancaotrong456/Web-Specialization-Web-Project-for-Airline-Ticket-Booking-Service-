'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { assertSeedPasswords } = require('./demo-seed-core');
const SEED_CONFIG_KEYS = ['SEED_ADMIN_PASSWORD', 'SEED_STAFF_PASSWORD', 'SEED_CUSTOMER_PASSWORD', 'SEED_FLIGHT_START_DATE'];

const LOCAL_DOCKER_ENDPOINTS = new Set([
  'npipe:////./pipe/docker_engine',
  'npipe:////./pipe/dockerDesktopLinuxEngine',
  'unix:///var/run/docker.sock',
]);

function assertLocalDockerEndpoint(endpoint) {
  const value = String(endpoint || '');
  const isRootlessUnixSocket = /^unix:\/\/\/run\/user\/\d+\/docker\.sock$/i.test(value);
  if (!LOCAL_DOCKER_ENDPOINTS.has(value) && !isRootlessUnixSocket) {
    throw new Error('Docker context is not a recognized local socket; remote/SSH/TCP Docker contexts are refused.');
  }
  return true;
}

function assertSafeComposeConfig(compose) {
  const api = compose?.services?.api?.environment || {};
  const db = compose?.services?.db?.environment || {};
  if (api.NODE_ENV !== 'development') throw new Error('Compose API must resolve to NODE_ENV=development.');
  if (api.DB_HOST !== 'db') throw new Error('Compose API must resolve to DB_HOST=db.');
  if (api.DB_NAME !== 'airline_booking_docker') throw new Error('Compose API must resolve to DB_NAME=airline_booking_docker.');
  if (String(api.DB_SSL).toLowerCase() !== 'false') throw new Error('Compose API must resolve to DB_SSL=false.');
  if (db.MYSQL_DATABASE !== 'airline_booking_docker') throw new Error('Compose DB must resolve to MYSQL_DATABASE=airline_booking_docker.');
  return true;
}

function assertComposeContainers(apiId, dbId, apiInspection, dbInspection) {
  if (!/^[a-f0-9]{12,64}$/i.test(apiId || '') || !/^[a-f0-9]{12,64}$/i.test(dbId || '')) throw new Error('Could not identify the Compose API and DB containers.');
  const apiLabels = apiInspection?.Config?.Labels || {};
  const dbLabels = dbInspection?.Config?.Labels || {};
  const apiProject = apiLabels['com.docker.compose.project'];
  const dbProject = dbLabels['com.docker.compose.project'];
  if (!apiProject || apiProject !== dbProject || apiLabels['com.docker.compose.service'] !== 'api' || dbLabels['com.docker.compose.service'] !== 'db') {
    throw new Error('API and DB containers are not the api/db services of the same Compose project.');
  }
  if (!apiInspection?.State?.Running || !dbInspection?.State?.Running || dbInspection?.State?.Health?.Status !== 'healthy') {
    throw new Error('The verified local Compose API must be running and its DB service must be healthy.');
  }
  return { project: apiProject };
}

function run(command, args, { input, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} exited with code ${result.status}.`);
  return result.stdout.trim();
}

function dockerJson(format, id, cwd = process.cwd()) {
  return JSON.parse(run('docker', ['inspect', '--format', format, id], { cwd }));
}

function resolveDemoConfig({ apply, root = process.cwd(), envFile = 'demo-seed.local.env', exampleFile = 'demo-seed.local.env.example' }) {
  const configPath = path.join(root, envFile);
  if (apply) {
    if (!fs.existsSync(configPath)) throw new Error(`Missing ${envFile}; copy ${exampleFile} and configure demo passwords before --apply.`);
    const parsed = dotenv.parse(fs.readFileSync(configPath));
    const config = Object.fromEntries(SEED_CONFIG_KEYS.filter((key) => parsed[key] !== undefined).map((key) => [key, parsed[key]]));
    assertSeedPasswords(config);
    return config;
  }
  if (!fs.existsSync(configPath)) return {};
  const parsed = dotenv.parse(fs.readFileSync(configPath));
  return parsed.SEED_FLIGHT_START_DATE ? { SEED_FLIGHT_START_DATE: parsed.SEED_FLIGHT_START_DATE } : {};
}

function buildExecutionPayload({ root = process.cwd(), config = {}, apply = false }) {
  const rootPath = fs.realpathSync(root);
  const scriptsPath = path.join(rootPath, 'scripts');
  const sources = {};
  for (const [key, fileName] of [['coreSource', 'demo-seed-core.js'], ['localSource', 'seed-demo-local.js']]) {
    const filePath = path.join(scriptsPath, fileName);
    const metadata = fs.lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || path.dirname(fs.realpathSync(filePath)) !== scriptsPath) {
      throw new Error(`Refusing unsafe demo-seed source path: ${fileName}`);
    }
    sources[key] = fs.readFileSync(filePath, 'utf8');
  }
  const safeConfig = Object.fromEntries(SEED_CONFIG_KEYS.filter((key) => config[key] !== undefined).map((key) => [key, config[key]]));
  return { ...sources, config: safeConfig, apply: Boolean(apply) };
}

function buildContainerBootstrap({ nodeModulesPath = '/app/node_modules' } = {}) {
  return [
    "'use strict';",
    "const fs=require('fs'),os=require('os'),path=require('path'),{Readable}=require('stream');",
    "async function readInput(){let raw='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)raw+=chunk;return JSON.parse(raw);}",
    `async function run(){process.env.NODE_PATH=[${JSON.stringify(nodeModulesPath)},process.env.NODE_PATH].filter(Boolean).join(path.delimiter);require('module').Module._initPaths();const payload=await readInput();const tempDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'airline-demo-seed-'));`,
    "try{fs.writeFileSync(path.join(tempDirectory,'demo-seed-core.js'),payload.coreSource,{encoding:'utf8',mode:0o600});fs.writeFileSync(path.join(tempDirectory,'seed-demo-local.js'),payload.localSource,{encoding:'utf8',mode:0o600});const {main}=require(path.join(tempDirectory,'seed-demo-local.js'));await main({argv:payload.apply?['--apply']:[],stdin:Readable.from([JSON.stringify(payload.config)]),env:process.env});}",
    "finally{const tempRoot=path.resolve(os.tmpdir());const resolved=path.resolve(tempDirectory);if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('airline-demo-seed-'))throw new Error('Refusing unsafe temporary seed-script cleanup path.');fs.rmSync(tempDirectory,{recursive:true,force:true});}}",
    "run().catch(error=>{console.error('Seed demo bị từ chối hoặc thất bại an toàn:',error.message);process.exitCode=1;});",
  ].join('\n');
}

function prepareDockerTarget({ root = process.cwd(), dockerRun = run } = {}) {
  const services = dockerRun('docker', ['compose', 'config', '--services'], { cwd: root }).split(/\r?\n/).filter(Boolean);
  if (!services.includes('api') || !services.includes('db')) throw new Error('Current Compose project must define both api and db services.');
  const compose = JSON.parse(dockerRun('docker', ['compose', 'config', '--format', 'json'], { cwd: root }));
  assertSafeComposeConfig(compose);
  const contextName = dockerRun('docker', ['context', 'show'], { cwd: root });
  const endpoint = dockerRun('docker', ['context', 'inspect', contextName, '--format', '{{json .Endpoints.docker.Host}}'], { cwd: root });
  assertLocalDockerEndpoint(JSON.parse(endpoint));

  const apiId = dockerRun('docker', ['compose', 'ps', '-q', 'api'], { cwd: root });
  const dbId = dockerRun('docker', ['compose', 'ps', '-q', 'db'], { cwd: root });
  const apiInspection = dockerJson('{{json .}}', apiId, root);
  const dbInspection = dockerJson('{{json .}}', dbId, root);
  const identities = assertComposeContainers(apiId, dbId, apiInspection, dbInspection);
  return { project: identities.project, apiId, dbId };
}

function main(argv = process.argv.slice(2), root = process.cwd()) {
  if (argv.some((arg) => arg !== '--apply')) throw new Error('Usage: npm run seed:demo:docker [-- --apply]');
  const apply = argv.includes('--apply');
  const config = resolveDemoConfig({ apply, root });
  const target = prepareDockerTarget({ root });
  const payload = buildExecutionPayload({ root, config, apply });
  const bootstrap = buildContainerBootstrap();
  const args = ['compose', 'exec', '-T', '-e', `DEMO_SEED_COMPOSE_PROJECT=${target.project}`, '-e', `DEMO_SEED_API_CONTAINER_ID=${target.apiId}`, '-e', `DEMO_SEED_DB_CONTAINER_ID=${target.dbId}`, '-e', 'DEMO_SEED_PROJECT_ROOT=/app', 'api', 'node', '-e', bootstrap];
  // Current workspace seed code and allowlisted secrets travel in stdin, never in CLI args or logs.
  const result = spawnSync('docker', args, { cwd: root, input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not start the demo seed command: ${result.error.message}`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Demo seed command exited with code ${result.status}.`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(`Docker demo seed refused or failed safely: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertLocalDockerEndpoint, assertSafeComposeConfig, assertComposeContainers, resolveDemoConfig, buildExecutionPayload, buildContainerBootstrap, prepareDockerTarget, main };
