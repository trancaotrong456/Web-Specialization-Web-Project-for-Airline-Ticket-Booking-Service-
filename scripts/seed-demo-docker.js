'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const DEMO_FIXTURE_FILES = [
  ['coreSource', 'scripts', 'demo-seed-core.js'],
  ['localSource', 'scripts', 'seed-demo-local.js'],
  ['prerequisiteSource', 'scripts', 'demo-seed-prerequisites.js'],
  ['fixturesSource', 'seeders', 'demo-fixtures.js'],
];
const DEMO_SEEDER_FILES = [
  'DatabaseSeeder.js', 'RoleSeeder.js', 'UserSeeder.js', 'AirlineSeeder.js',
  'AirportSeeder.js', 'FlightSeeder.js', 'FareClassSeeder.js', 'PromotionSeeder.js', 'seederUtils.js',
];
const COMPOSE_PREFIX = ['compose', '--env-file', 'docker.env'];

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
  if (!apiInspection?.State?.Running || apiInspection?.State?.Health?.Status !== 'healthy') {
    throw new Error('The verified local Compose API must be running and healthy (migrations complete).');
  }
  if (!dbInspection?.State?.Running || dbInspection?.State?.Health?.Status !== 'healthy') {
    throw new Error('The verified local Compose DB service must be running and healthy.');
  }
  return { project: apiProject };
}

function run(command, args, { input, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} exited with code ${result.status}.`);
  return result.stdout.trim();
}

function dockerJson(format, id, cwd = process.cwd(), dockerRun = run) {
  return JSON.parse(dockerRun('docker', ['inspect', '--format', format, id], { cwd }));
}

function resolveDemoConfig() {
  return {};
}

function buildExecutionPayload({ root = process.cwd(), apply = false, startDate }) {
  const rootPath = fs.realpathSync(root);
  const sources = {};
  for (const [key, directory, fileName] of DEMO_FIXTURE_FILES) {
    const sourceDirectory = path.join(rootPath, directory);
    const filePath = path.join(sourceDirectory, fileName);
    const metadata = fs.lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || path.dirname(fs.realpathSync(filePath)) !== sourceDirectory) {
      throw new Error(`Refusing unsafe demo-seed source path: ${directory}/${fileName}`);
    }
    sources[key] = fs.readFileSync(filePath, 'utf8');
  }
  const demoSeederSources = {};
  for (const fileName of DEMO_SEEDER_FILES) {
    const sourceDirectory = path.join(rootPath, 'seeders', 'demo');
    const filePath = path.join(sourceDirectory, fileName);
    const metadata = fs.lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || path.dirname(fs.realpathSync(filePath)) !== sourceDirectory) {
      throw new Error(`Refusing unsafe demo-seeder source path: seeders/demo/${fileName}`);
    }
    demoSeederSources[fileName] = fs.readFileSync(filePath, 'utf8');
  }
  return { ...sources, demoSeederSources, apply: Boolean(apply), startDate: startDate || null };
}

function buildContainerBootstrap({ nodeModulesPath = '/app/node_modules' } = {}) {
  return [
    "'use strict';",
    "const fs=require('fs'),os=require('os'),path=require('path');",
    "async function readInput(){let raw='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)raw+=chunk;return JSON.parse(raw);}",
    `async function run(){process.env.NODE_PATH=[${JSON.stringify(nodeModulesPath)},process.env.NODE_PATH].filter(Boolean).join(path.delimiter);require('module').Module._initPaths();const payload=await readInput();const tempDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'airline-demo-seed-'));`,
    "try{const scripts=path.join(tempDirectory,'scripts'),seeders=path.join(tempDirectory,'seeders'),demoSeeders=path.join(seeders,'demo');fs.mkdirSync(scripts,{mode:0o700});fs.mkdirSync(seeders,{mode:0o700});fs.mkdirSync(demoSeeders,{mode:0o700});fs.writeFileSync(path.join(scripts,'demo-seed-core.js'),payload.coreSource,{encoding:'utf8',mode:0o600});fs.writeFileSync(path.join(scripts,'seed-demo-local.js'),payload.localSource,{encoding:'utf8',mode:0o600});fs.writeFileSync(path.join(scripts,'demo-seed-prerequisites.js'),payload.prerequisiteSource,{encoding:'utf8',mode:0o600});fs.writeFileSync(path.join(seeders,'demo-fixtures.js'),payload.fixturesSource,{encoding:'utf8',mode:0o600});for(const [name,source] of Object.entries(payload.demoSeederSources||{})){if(!/^[A-Za-z]+Seeder\\.js$/.test(name)&&name!=='seederUtils.js')throw new Error('Unexpected staged demo seeder filename.');fs.writeFileSync(path.join(demoSeeders,name),source,{encoding:'utf8',mode:0o600});}const {main}=require(path.join(scripts,'seed-demo-local.js'));const argv=payload.apply?['--apply']:[];if(payload.startDate)argv.push('--start-date',payload.startDate);await main({argv,env:process.env});}",
    "finally{const tempRoot=path.resolve(os.tmpdir());const resolved=path.resolve(tempDirectory);if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('airline-demo-seed-'))throw new Error('Refusing unsafe temporary seed-script cleanup path.');fs.rmSync(tempDirectory,{recursive:true,force:true});}}",
    "run().catch(error=>{console.error('Seed demo bị từ chối hoặc thất bại an toàn:',error.message);process.exitCode=1;});",
  ].join('\n');
}

function prepareDockerTarget({ root = process.cwd(), dockerRun = run } = {}) {
  const services = dockerRun('docker', [...COMPOSE_PREFIX, 'config', '--services'], { cwd: root }).split(/\r?\n/).filter(Boolean);
  if (!services.includes('api') || !services.includes('db')) throw new Error('Current Compose project must define both api and db services.');
  const compose = JSON.parse(dockerRun('docker', [...COMPOSE_PREFIX, 'config', '--format', 'json'], { cwd: root }));
  assertSafeComposeConfig(compose);
  const contextName = dockerRun('docker', ['context', 'show'], { cwd: root });
  const endpoint = dockerRun('docker', ['context', 'inspect', contextName, '--format', '{{json .Endpoints.docker.Host}}'], { cwd: root });
  assertLocalDockerEndpoint(JSON.parse(endpoint));

  const apiId = dockerRun('docker', [...COMPOSE_PREFIX, 'ps', '-q', 'api'], { cwd: root });
  const dbId = dockerRun('docker', [...COMPOSE_PREFIX, 'ps', '-q', 'db'], { cwd: root });
  const apiInspection = dockerJson('{{json .}}', apiId, root, dockerRun);
  const dbInspection = dockerJson('{{json .}}', dbId, root, dockerRun);
  const identities = assertComposeContainers(apiId, dbId, apiInspection, dbInspection);
  return { project: identities.project, apiId, dbId };
}

function parseDockerSeedArgs(argv = []) {
  let apply = false;
  let startDate;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply' && !apply) apply = true;
    else if (argv[index] === '--start-date' && !startDate && /^\d{4}-\d{2}-\d{2}$/.test(argv[index + 1] || '')) {
      startDate = argv[index + 1];
      index += 1;
    } else throw new Error('Usage: npm run seed:demo:docker [-- --apply]');
  }
  return { apply, startDate };
}

function main(argv = process.argv.slice(2), root = process.cwd()) {
  const { apply, startDate } = parseDockerSeedArgs(argv);
  const target = prepareDockerTarget({ root });
  const payload = buildExecutionPayload({ root, apply, startDate });
  const bootstrap = buildContainerBootstrap();
  const args = [...COMPOSE_PREFIX, 'exec', '-T', '-e', `DEMO_SEED_COMPOSE_PROJECT=${target.project}`, '-e', `DEMO_SEED_API_CONTAINER_ID=${target.apiId}`, '-e', `DEMO_SEED_DB_CONTAINER_ID=${target.dbId}`, '-e', 'DEMO_SEED_PROJECT_ROOT=/app', 'api', 'node', '-e', bootstrap];
  // Fixed public demo fixtures travel through stdin; no private/local environment credentials are forwarded.
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

module.exports = { assertLocalDockerEndpoint, assertSafeComposeConfig, assertComposeContainers, resolveDemoConfig, parseDockerSeedArgs, buildExecutionPayload, buildContainerBootstrap, prepareDockerTarget, main };
