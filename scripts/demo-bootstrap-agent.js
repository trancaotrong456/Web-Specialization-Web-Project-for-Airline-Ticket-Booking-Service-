'use strict';

console.log('[demo] Bootstrap is host-controlled and waiting. Start the local stack with: npm run demo:up');
console.log('[demo] This container has no Docker socket and cannot start migrations or seed by itself.');

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log('[demo] Host bootstrap phase finished; exiting successfully.');
  process.exitCode = 0;
  setImmediate(() => process.exit(0));
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => {}, 60_000);
