// Preserve the legacy getter so modules resolve Socket.IO only when emitting.
const { getIO } = require('../../sockets');

module.exports = { getSocket: getIO };
