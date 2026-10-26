const express = require('express');
const authenticate = require('../middlewares/auth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { reconciliationCaseIdValidator, reconciliationCaseListValidator, reconciliationReviewActionValidator } = require('../validators/payment.validator');
const { getDefaultPaymentModule } = require('../modules/payment');

const router = express.Router();
const controller = getDefaultPaymentModule().controller;

router.get('/', authenticate, authorize('admin', 'staff'), reconciliationCaseListValidator, validate, controller.getReconciliationCases);
router.get('/metrics', authenticate, authorize('admin', 'staff'), controller.getReconciliationMetrics);
router.get('/:id', authenticate, authorize('admin', 'staff'), reconciliationCaseIdValidator, validate, controller.getReconciliationCaseById);
router.post('/:id/manual-review', authenticate, authorize('admin', 'staff'), reconciliationReviewActionValidator, validate, controller.recordManualReviewAction);

module.exports = router;
