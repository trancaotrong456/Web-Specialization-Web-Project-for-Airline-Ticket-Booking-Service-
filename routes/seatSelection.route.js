'use strict';
const express = require('express');
const router = express.Router();
router.use((req, res, next) => require('../application/buildContainer').getDefaultSeatSelectionModule().router(req, res, next));
module.exports = router;
