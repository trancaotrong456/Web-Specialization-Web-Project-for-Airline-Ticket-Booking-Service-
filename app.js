const { createApp } = require('./application/createApp');

// Preserve the historical Express app export while exposing its factory for tests.
const app = createApp();
app.createApp = createApp;

module.exports = app;
