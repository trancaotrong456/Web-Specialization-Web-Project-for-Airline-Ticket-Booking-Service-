const { Op } = require('sequelize');
const { redactString } = require('../../shared/security/redactSensitive');

function sanitizeGatewayError(error) {
  return redactString(error?.message || error || 'Unknown gateway error');
}

class SequelizePaymentRepository {
  constructor({ Payment, PaymentGatewayOperation, PaymentReconciliationCase, ReconciliationWorkerLease, ReconciliationReviewAction, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User } = {}) {
    if (![Payment, Booking, Flight, BookingPassenger, Promotion, User].every(Boolean)) {
      throw new TypeError('Payment repository requires Payment, Booking, Flight, BookingPassenger, Promotion and User');
    }
    Object.assign(this, { Payment, PaymentGatewayOperation, PaymentReconciliationCase, ReconciliationWorkerLease, ReconciliationReviewAction, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User });
  }

  _assertWorkerLeaseModel() {
    if (!this.ReconciliationWorkerLease) throw new TypeError('Reconciliation worker lease model is required');
  }

  async acquirePayosReconciliationOwnership({ owner, now = new Date(), leaseMs = 120000 } = {}, { transaction } = {}) {
    return this.acquireGatewayReconciliationOwnership({ provider: 'payos', owner, now, leaseMs }, { transaction });
  }

  async acquireGatewayReconciliationOwnership({ provider = 'payos', owner, now = new Date(), leaseMs = 120000 } = {}, { transaction } = {}) {
    this._assertWorkerLeaseModel();
    if (!transaction) throw new TypeError('A transaction is required to acquire reconciliation ownership');
    if (!owner || !String(owner).trim()) throw new TypeError('A reconciliation lease owner is required');
    const leaseName = `${provider}-reconciliation`;
    const [lease] = await this.ReconciliationWorkerLease.findOrCreate({
      where: { lease_name: leaseName },
      defaults: { lease_name: leaseName, owner_id: null, lease_expires_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const currentOwner = lease.owner_id && String(lease.owner_id);
    const expiresAt = lease.lease_expires_at ? new Date(lease.lease_expires_at).getTime() : 0;
    if (currentOwner && currentOwner !== String(owner) && expiresAt > new Date(now).getTime()) return false;
    lease.owner_id = String(owner).slice(0, 128);
    lease.lease_expires_at = new Date(new Date(now).getTime() + Math.max(1000, Number(leaseMs) || 120000));
    await lease.save({ transaction });
    return true;
  }

  async renewPayosReconciliationOwnership({ owner, now = new Date(), leaseMs = 120000 } = {}, { transaction } = {}) {
    return this.renewGatewayReconciliationOwnership({ provider: 'payos', owner, now, leaseMs }, { transaction });
  }

  async renewGatewayReconciliationOwnership({ provider = 'payos', owner, now = new Date(), leaseMs = 120000 } = {}, { transaction } = {}) {
    this._assertWorkerLeaseModel();
    if (!transaction) throw new TypeError('A transaction is required to renew reconciliation ownership');
    const lease = await this.ReconciliationWorkerLease.findOne({
      where: { lease_name: `${provider}-reconciliation` }, lock: transaction.LOCK.UPDATE, transaction,
    });
    if (!lease || lease.owner_id !== String(owner)
      || !lease.lease_expires_at || new Date(lease.lease_expires_at).getTime() <= new Date(now).getTime()) return false;
    lease.lease_expires_at = new Date(new Date(now).getTime() + Math.max(1000, Number(leaseMs) || 120000));
    await lease.save({ transaction });
    return true;
  }

  async releasePayosReconciliationOwnership({ owner } = {}, { transaction } = {}) {
    return this.releaseGatewayReconciliationOwnership({ provider: 'payos', owner }, { transaction });
  }

  async releaseGatewayReconciliationOwnership({ provider = 'payos', owner } = {}, { transaction } = {}) {
    this._assertWorkerLeaseModel();
    if (!transaction) throw new TypeError('A transaction is required to release reconciliation ownership');
    const [updated] = await this.ReconciliationWorkerLease.update({ owner_id: null, lease_expires_at: null }, {
      where: { lease_name: `${provider}-reconciliation`, owner_id: String(owner) }, transaction,
    });
    return updated === 1;
  }

  findPayosReconciliationOwnership(options) {
    this._assertWorkerLeaseModel();
    return this.ReconciliationWorkerLease.findOne({ where: { lease_name: 'payos-reconciliation' }, ...options });
  }

  findGatewayReconciliationOwnership(provider, options) {
    this._assertWorkerLeaseModel();
    return this.ReconciliationWorkerLease.findOne({ where: { lease_name: `${provider}-reconciliation` }, ...options });
  }

  _assertReconciliationCaseModel() {
    if (!this.PaymentReconciliationCase) throw new TypeError('Payment reconciliation case model is required');
  }

  async createOrFindCase({ paymentId, bookingId, provider, maxAttempts = 6, nextAttemptAt = new Date() } = {}, { transaction } = {}) {
    this._assertReconciliationCaseModel();
    if (!transaction) throw new TypeError('A transaction is required to create reconciliation cases');
    if (!/^[1-9]\d*$/.test(String(paymentId)) || !/^[1-9]\d*$/.test(String(bookingId))) {
      throw new TypeError('paymentId and bookingId must be positive integers');
    }
    if (!['payos', 'vnpay'].includes(provider)) throw new TypeError('provider must be payos or vnpay');
    const [reconciliationCase] = await this.PaymentReconciliationCase.findOrCreate({
      where: { payment_id: paymentId },
      defaults: { payment_id: paymentId, booking_id: bookingId, provider, max_attempts: maxAttempts, next_attempt_at: nextAttemptAt },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
    if (String(reconciliationCase.booking_id) !== String(bookingId)
      || reconciliationCase.provider !== provider) {
      const error = new Error('Reconciliation case already belongs to a different booking or provider');
      error.code = 'RECONCILIATION_CASE_MISMATCH';
      throw error;
    }
    return reconciliationCase;
  }

  async markCaseManualReview(id, reason, { lastGatewayStatus = null, transaction } = {}) {
    this._assertReconciliationCaseModel();
    if (!transaction) throw new TypeError('A transaction is required to update reconciliation cases');
    const row = await this.PaymentReconciliationCase.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
    if (!row) return null;
    if (row.state !== 'manual_review' && row.state !== 'resolved' && row.state !== 'closed') row.state = 'manual_review';
    row.manual_review_reason = sanitizeGatewayError(reason);
    row.last_checked_at = new Date();
    if (lastGatewayStatus != null) row.last_gateway_status = String(lastGatewayStatus).slice(0, 32);
    row.lease_owner = null;
    row.lease_expires_at = null;
    await row.save({ transaction });
    return row;
  }

  findPendingPaymentsWithoutCase(provider, cutoff, limit = 100) {
    return this.Payment.findAll({
      where: {
        payment_method: provider, status: 'pending', created_at: { [Op.lt]: cutoff },
        [Op.and]: [this.PaymentReconciliationCase.sequelize.literal('NOT EXISTS (SELECT 1 FROM payment_reconciliation_cases AS prc WHERE prc.payment_id = Payment.id)')],
      },
      include: [{ model: this.Booking, as: 'booking', where: { status: { [Op.in]: ['pending_payment', 'expired', 'cancelled'] } }, required: true }],
      order: [['created_at', 'ASC']], limit,
    });
  }

  async claimDueCases({ owner, provider, now = new Date(), leaseMs = 60000, limit = 10 } = {}, { transaction } = {}) {
    this._assertReconciliationCaseModel();
    if (!transaction) throw new TypeError('A transaction is required to claim reconciliation cases');
    if (!owner || !String(owner).trim()) throw new TypeError('A reconciliation lease owner is required');
    if (provider != null && !['payos', 'vnpay'].includes(provider)) throw new TypeError('provider must be payos or vnpay');
    const leaseExpiresAt = new Date(new Date(now).getTime() + Math.max(1000, Number(leaseMs) || 60000));
    const where = {
        state: 'active',
        attempt_count: { [Op.lt]: this.PaymentReconciliationCase.sequelize.literal('max_attempts') },
        next_attempt_at: { [Op.lte]: now },
        [Op.or]: [{ lease_expires_at: null }, { lease_expires_at: { [Op.lte]: now } }],
    };
    if (provider) where.provider = provider;
    const rows = await this.PaymentReconciliationCase.findAll({
      where,
      order: [['next_attempt_at', 'ASC'], ['id', 'ASC']],
      limit: Math.max(1, Math.min(100, Number(limit) || 10)),
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    for (const reconciliationCase of rows) {
      reconciliationCase.lease_owner = String(owner).slice(0, 128);
      reconciliationCase.lease_expires_at = leaseExpiresAt;
      reconciliationCase.attempt_count += 1;
      reconciliationCase.last_attempt_at = now;
      await reconciliationCase.save({ transaction });
    }
    return rows;
  }

  async _lockOwnedCase(id, owner, transaction) {
    this._assertReconciliationCaseModel();
    if (!transaction) throw new TypeError('A transaction is required for reconciliation case updates');
    const reconciliationCase = await this.PaymentReconciliationCase.findOne({
      where: { id }, lock: transaction.LOCK.UPDATE, transaction,
    });
    const now = Date.now();
    if (!reconciliationCase || reconciliationCase.state !== 'active'
      || reconciliationCase.lease_owner !== String(owner)
      || !reconciliationCase.lease_expires_at
      || new Date(reconciliationCase.lease_expires_at).getTime() <= now) return null;
    return reconciliationCase;
  }

  async completeAttempt(id, owner, { lastGatewayStatus = null, lastError = null, nextAttemptAt = new Date() } = {}, { transaction } = {}) {
    const reconciliationCase = await this._lockOwnedCase(id, owner, transaction);
    if (!reconciliationCase) return null;
    reconciliationCase.last_checked_at = new Date();
    reconciliationCase.last_gateway_status = lastGatewayStatus == null ? null : String(lastGatewayStatus).slice(0, 32);
    reconciliationCase.last_error = lastError == null ? null : sanitizeGatewayError(lastError);
    reconciliationCase.next_attempt_at = nextAttemptAt;
    reconciliationCase.lease_owner = null;
    reconciliationCase.lease_expires_at = null;
    await reconciliationCase.save({ transaction });
    return reconciliationCase;
  }

  async markManualReview(id, owner, reason, { transaction } = {}) {
    const reconciliationCase = await this._lockOwnedCase(id, owner, transaction);
    if (!reconciliationCase) return null;
    reconciliationCase.state = 'manual_review';
    reconciliationCase.manual_review_reason = sanitizeGatewayError(reason);
    reconciliationCase.last_checked_at = new Date();
    reconciliationCase.lease_owner = null;
    reconciliationCase.lease_expires_at = null;
    await reconciliationCase.save({ transaction });
    return reconciliationCase;
  }

  async resolveCase(id, owner, { resolvedAt = new Date(), lastGatewayStatus = null } = {}, { transaction } = {}) {
    const reconciliationCase = await this._lockOwnedCase(id, owner, transaction);
    if (!reconciliationCase) return null;
    reconciliationCase.state = 'resolved';
    reconciliationCase.resolved_at = resolvedAt;
    reconciliationCase.last_checked_at = new Date();
    if (lastGatewayStatus != null) reconciliationCase.last_gateway_status = String(lastGatewayStatus).slice(0, 32);
    reconciliationCase.lease_owner = null;
    reconciliationCase.lease_expires_at = null;
    await reconciliationCase.save({ transaction });
    return reconciliationCase;
  }

  async releaseExpiredLease({ now = new Date() } = {}, { transaction } = {}) {
    this._assertReconciliationCaseModel();
    if (!transaction) throw new TypeError('A transaction is required to release reconciliation leases');
    return this.PaymentReconciliationCase.update(
      { lease_owner: null, lease_expires_at: null },
      { where: { state: 'active', lease_expires_at: { [Op.lte]: now } }, transaction },
    );
  }


  findGatewayOperation(options) { return this.PaymentGatewayOperation.findOne(options); }
  createGatewayOperation(values, options) { return this.PaymentGatewayOperation.create(values, options); }
  findLockedGatewayOperation(id, transaction) { return this.PaymentGatewayOperation.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction }); }
  findRefundGatewayOperation(paymentId, transaction) {
    return this.PaymentGatewayOperation.findOne({ where: { payment_id: paymentId, operation_type: 'refund', status: { [Op.in]: ['pending', 'unknown', 'success'] } }, order: [['id', 'DESC']], lock: transaction.LOCK.UPDATE, transaction });
  }

  findPayment(options) { return this.Payment.findOne(options); }
  findPaymentByIdempotencyKey(key, transaction) {
    const options = { where: { idempotency_key: key } };
    if (transaction) {
      options.lock = transaction.LOCK.UPDATE;
      options.transaction = transaction;
    }
    return this.Payment.findOne(options);
  }
  findPaymentByPk(id, options) { return this.Payment.findByPk(id, options); }
  findAndCountPayments(options) { return this.Payment.findAndCountAll(options); }
  findPayments(options) { return this.Payment.findAll(options); }
  findPendingPayosPaymentsWithoutCase(cutoff, limit = 100) {
    return this.Payment.findAll({
      where: {
        payment_method: 'payos', status: 'pending', created_at: { [Op.lt]: cutoff },
        [Op.and]: [this.PaymentReconciliationCase.sequelize.literal('NOT EXISTS (SELECT 1 FROM payment_reconciliation_cases AS prc WHERE prc.payment_id = Payment.id)')],
      },
      include: [
        { model: this.Booking, as: 'booking', where: { status: { [Op.in]: ['pending_payment', 'expired', 'cancelled'] } }, required: true },
      ],
      order: [['created_at', 'ASC']], limit,
    });
  }
  sumPayments(field, options) { return this.Payment.sum(field, options); }
  createPayment(values, options) { return this.Payment.create(values, options); }
  findBooking(options) { return this.Booking.findOne(options); }
  findFlight(options) { return this.Flight.findOne(options); }
  findPromotion(options) { return this.Promotion.findOne(options); }
  save(instance, options) { return instance.save(options); }
  destroy(instance, options) { return instance.destroy(options); }
  decrement(instance, field, options) { return instance.decrement(field, options); }

  findLockedPaymentById(id, transaction) {
    return this.Payment.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findLockedBookingWithPassengers(id, transaction) {
    return this.Booking.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction, include: [{ model: this.BookingPassenger, as: 'passengers' }] });
  }
  findLockedBooking(id, transaction) {
    return this.Booking.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findLatestPaymentAttempt(bookingId, transaction) {
    // Caller holds the Booking lock before the first consistent read in this
    // transaction. Initiation also holds that lock until the attempt commits.
    // Do not lock another Payment here: competing callbacks lock their own
    // Payment before Booking, so locking a sibling would create a lock cycle.
    return this.Payment.findOne({
      where: { booking_id: bookingId }, order: [['id', 'DESC']], transaction,
    });
  }
  findPendingPaymentForGatewayFailure(bookingId, transactionRef, transaction) {
    return this.Payment.findOne({ where: { booking_id: bookingId, transaction_ref: transactionRef, status: 'pending' }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findPaymentWithBookingByRef(transactionRef, paymentMethod) {
    const where = { transaction_ref: transactionRef };
    if (paymentMethod) where.payment_method = paymentMethod;
    return this.Payment.findOne({ where, include: [{ model: this.Booking, as: 'booking' }] });
  }

  // One read query keeps Booking, attempts and reconciliation projections from
  // being assembled from contradictory multi-query snapshots. No row lock is
  // needed because this endpoint never mutates payment or booking state.
  findCustomerPaymentStatus(bookingId) {
    return this.Booking.findByPk(bookingId, {
      attributes: ['id', 'booking_code', 'status', 'user_id', 'guest_email', 'total_amount', 'hold_expires_at'],
      include: [{
        model: this.Payment,
        as: 'payments',
        attributes: ['id', 'payment_method', 'status', 'amount', 'transaction_ref', 'paid_at'],
        required: false,
        order: [['id', 'DESC']],
        include: this.PaymentReconciliationCase ? [{
          model: this.PaymentReconciliationCase,
          as: 'reconciliationCase',
          attributes: ['state'],
          required: false,
        }] : [],
      }],
    });
  }
  findLockedFlight(id, transaction) {
    return this.Flight.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findBookingSegments(bookingId, transaction) {
    if (!this.BookingSegment) return Promise.resolve([]);
    return this.BookingSegment.findAll({ where: { booking_id: bookingId }, order: [['leg_order', 'ASC']], transaction });
  }
  findLockedPromotion(id, transaction) {
    return this.Promotion.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findRefundBooking(id, transaction) {
    return this.Booking.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction, include: [
      { model: this.BookingPassenger, as: 'passengers' },
    ] });
  }
  findSuccessfulPaymentsForRefund(bookingId, transaction) {
    return this.Payment.findAll({
      where: { booking_id: bookingId, status: 'success' },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  }
  listPayments({ where, limit, offset }) {
    return this.Payment.findAndCountAll({ where, limit, offset, order: [['created_at', 'DESC']], include: [{
      model: this.Booking, as: 'booking', attributes: ['id', 'booking_code', 'status', 'user_id', 'guest_email', 'total_amount'],
      include: [{ model: this.User, as: 'user', attributes: ['id', 'full_name', 'email'], required: false }],
    }] });
  }
  findPaymentDetail(id) {
    return this.Payment.findByPk(id, { include: [{
      model: this.Booking, as: 'booking', attributes: ['id', 'booking_code', 'status', 'user_id', 'guest_email', 'total_amount'],
      include: [{ model: this.User, as: 'user', attributes: ['id', 'full_name', 'email'], required: false }],
    }] });
  }
  listReconciliationCases({ where = {}, limit, offset, order = [['created_at', 'DESC']] } = {}) {
    return this.PaymentReconciliationCase.findAndCountAll({
      where,
      limit,
      offset,
      order,
      attributes: [
        'id', 'provider', 'state', 'payment_id', 'booking_id', 'attempt_count', 'max_attempts',
        'last_gateway_status', 'last_checked_at', 'next_attempt_at', 'manual_review_reason',
        'created_at', 'updated_at',
      ],
      include: [
        { model: this.Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paid_at'], required: true },
        { model: this.Booking, as: 'booking', attributes: ['id', 'booking_code', 'status'], required: true },
      ],
    });
  }
  findReconciliationCaseDetail(id) {
    return this.PaymentReconciliationCase.findByPk(id, {
      attributes: [
        'id', 'provider', 'state', 'payment_id', 'booking_id', 'attempt_count', 'max_attempts',
        'last_attempt_at', 'last_checked_at', 'last_gateway_status', 'last_error',
        'manual_review_reason', 'next_attempt_at', 'lease_expires_at', 'resolved_at',
        'created_at', 'updated_at',
      ],
      include: [
        { model: this.Payment, as: 'payment', attributes: ['id', 'status', 'amount', 'paid_at'], required: true },
        { model: this.Booking, as: 'booking', attributes: ['id', 'booking_code', 'status'], required: true },
        { model: this.ReconciliationReviewAction, as: 'reviewAction', required: false, attributes: ['id', 'action', 'reason', 'outcome_reference', 'operator_user_id', 'created_at'], include: [{ model: this.User, as: 'operator', attributes: ['id', 'full_name'], required: false }] },
      ],
    });
  }

  async createManualReviewAction(caseId, operatorUserId, { action, reason, outcomeReference = null } = {}, { transaction } = {}) {
    if (!this.ReconciliationReviewAction) throw new TypeError('Reconciliation review action model is required');
    if (!transaction) throw new TypeError('A transaction is required to record manual review actions');
    const reviewCase = await this.PaymentReconciliationCase.findOne({ where: { id: caseId }, lock: transaction.LOCK.UPDATE, transaction });
    if (!reviewCase) { const error = new Error('Reconciliation case not found'); error.statusCode = 404; throw error; }
    if (reviewCase.state !== 'manual_review') { const error = new Error('Only manual-review cases can receive an operational resolution'); error.statusCode = 409; throw error; }
    const existing = await this.ReconciliationReviewAction.findOne({ where: { case_id: caseId }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) {
      if (existing.action === action && String(existing.operator_user_id) === String(operatorUserId)) return existing;
      const error = new Error('This reconciliation case already has a conflicting manual-review resolution'); error.statusCode = 409; throw error;
    }
    return this.ReconciliationReviewAction.create({ case_id: caseId, operator_user_id: operatorUserId, action, reason: String(reason).slice(0, 500), outcome_reference: outcomeReference ? String(outcomeReference).slice(0, 191) : null }, { transaction });
  }
  async getReconciliationMetrics({ pendingSince } = {}) {
    const unresolvedWhere = { state: { [Op.in]: ['active', 'manual_review'] } };
    const [activeCases, manualReviewCases, oldest, pendingPaymentsBeyondSla, retryExhaustionCases, latePaidCases, gatewayTimeoutCases] = await Promise.all([
      this.PaymentReconciliationCase.count({ where: { state: 'active' } }),
      this.PaymentReconciliationCase.count({ where: { state: 'manual_review' } }),
      this.PaymentReconciliationCase.findOne({ where: unresolvedWhere, attributes: ['created_at'], order: [['created_at', 'ASC']], raw: true }),
      this.Payment.count({ where: { payment_method: 'payos', status: 'pending', ...(pendingSince ? { created_at: { [Op.lt]: pendingSince } } : {}) } }),
      this.PaymentReconciliationCase.count({ where: { state: 'manual_review', attempt_count: { [Op.gte]: this.PaymentReconciliationCase.sequelize.col('max_attempts') } } }),
      this.PaymentReconciliationCase.count({ where: { manual_review_reason: { [Op.like]: '%LATE%' } } }),
      this.PaymentReconciliationCase.count({ where: { last_error: { [Op.like]: '%timeout%' } } }),
    ]);
    return { activeCases, manualReviewCases, oldestUnresolvedAt: oldest?.created_at || null, pendingPaymentsBeyondSla, retryExhaustionCases, latePaidCases, gatewayTimeoutCases };
  }
  async aggregateRevenue({ startDate, endDate, groupBy, sequelize }) {
    const where = { status: 'success', [Op.and]: [
      sequelize.literal(`paid_at >= '${startDate}'`),
      sequelize.literal(`paid_at < '${endDate}'`),
    ] };
    let rows;
    if (groupBy === 'day') {
      const dateExpression = sequelize.fn('DATE', sequelize.col('paid_at'));
      rows = await this.Payment.findAll({
        attributes: [[dateExpression, 'date'], [sequelize.fn('SUM', sequelize.col('amount')), 'revenue']],
        where, group: [dateExpression], order: [[dateExpression, 'ASC']], raw: true,
      });
    } else {
      const monthExpression = sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), '%Y-%m');
      rows = await this.Payment.findAll({
        attributes: [[monthExpression, 'month'], [sequelize.fn('SUM', sequelize.col('amount')), 'revenue']],
        where, group: [monthExpression], order: [[monthExpression, 'ASC']], raw: true,
      });
    }
    const totalRevenue = await this.Payment.sum('amount', { where });
    return { rows, totalRevenue };
  }
}

module.exports = { SequelizePaymentRepository };
