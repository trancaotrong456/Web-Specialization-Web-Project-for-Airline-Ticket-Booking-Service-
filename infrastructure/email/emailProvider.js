// The legacy service remains the single stateful Resend provider. Its client
// is initialized only on the first send, not when the container is built.
const getEmailProvider = () => require('../../services/email.service');

module.exports = { getEmailProvider };
