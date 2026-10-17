const { Op } = require('sequelize');

class SequelizePaymentRepository {
  constructor({ Payment, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User } = {}) {
    if (![Payment, Booking, Flight, BookingPassenger, Promotion, User].every(Boolean)) {
      throw new TypeError('Payment repository requires Payment, Booking, Flight, BookingPassenger, Promotion and User');
    }
    Object.assign(this, { Payment, Booking, BookingSegment, Flight, BookingPassenger, Promotion, User });
  }

  findPayment(options) { return this.Payment.findOne(options); }
  findPaymentByPk(id, options) { return this.Payment.findByPk(id, options); }
  findAndCountPayments(options) { return this.Payment.findAndCountAll(options); }
  findPayments(options) { return this.Payment.findAll(options); }
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
