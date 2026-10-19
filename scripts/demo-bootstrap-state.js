'use strict';

const { clearBootstrapRecord, writeBootstrapRecord } = require('../utils/demoBootstrap');

function main(argv = process.argv.slice(2), env = process.env) {
  const markerPath = env.DEMO_BOOTSTRAP_STATE_FILE || '/var/lib/serene-demo/bootstrap.json';
  if (argv.length === 1 && argv[0] === 'clear') return clearBootstrapRecord(markerPath);
  if (argv.length === 3 && argv[0] === 'mark') {
    const [, dbContainerId, composeProject] = argv;
    return writeBootstrapRecord(markerPath, {
      version: 1,
      status: 'complete',
      database: 'airline_booking_docker',
      dbContainerId,
      composeProject,
      completedAt: new Date().toISOString(),
    });
  }
  throw new Error('Usage: node scripts/demo-bootstrap-state.js clear | mark <db-container-id> <compose-project>');
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(`Local demo bootstrap state refused: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
