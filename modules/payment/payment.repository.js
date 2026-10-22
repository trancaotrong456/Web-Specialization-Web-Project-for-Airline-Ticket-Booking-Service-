const { Op } = require('sequelize');
const { redactString } = require('../../shared/security/redactSensitive');

function sanitizeGatewayError(error) {
  return redactString(error?.message || error || 'Unknown gateway error');
}

class SequelizePaymentRepository {
  constructor({ Payment, PaymentGatewayOperation, PaymentReconciliationCase, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User } = {}) {
    if (![Payment, Booking, Flight, BookingPassenger, Promotion, User].every(Boolean)) {
      throw new TypeError('Payment repository requires Payment, Booking, Flight, BookingPassenger, Promotion and User');
    }
    Object.assign(this, { Payment, PaymentGatewayOperation, PaymentReconciliationCase, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User });
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
  findPendingPaymentForGatewayFailure(bookingId, transactionRef, transaction) {
    return this.Payment.findOne({ where: { booking_id: bookingId, transaction_ref: transactionRef, status: 'pending' }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findPaymentWithBookingByRef(transactionRef, paymentMethod) {
    const where = { transaction_ref: transactionRef };
    if (paymentMethod) where.payment_method = paymentMethod;
    return this.Payment.findOne({ where, include: [{ model: this.Booking, as: 'booking' }] });
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
