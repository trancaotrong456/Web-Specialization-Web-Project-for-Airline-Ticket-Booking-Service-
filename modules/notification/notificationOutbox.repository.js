'use strict';

const crypto = require('crypto');

class SequelizeNotificationOutboxRepository {
  constructor({ NotificationOutbox, sequelize, Op, now = () => new Date(), leaseMs = 30000 } = {}) {
    if (!NotificationOutbox || !sequelize || !Op) throw new TypeError('Outbox model, Sequelize and Op are required');
    this.NotificationOutbox = NotificationOutbox;
    this.sequelize = sequelize;
    this.Op = Op;
    this.now = now;
    this.leaseMs = leaseMs;
  }

  async claimNext() {
    const now = this.now();
    return this.sequelize.transaction(async (transaction) => {
      const event = await this.NotificationOutbox.findOne({
        where: {
          [this.Op.or]: [
            { status: 'pending', available_at: { [this.Op.lte]: now } },
            { status: 'processing', lease_expires_at: { [this.Op.lte]: now } },
          ],
        },
        order: [['created_at', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      if (!event) return null;
      const leaseToken = crypto.randomBytes(24).toString('hex');
      event.status = 'processing';
      event.lease_token = leaseToken;
      event.lease_expires_at = new Date(now.getTime() + this.leaseMs);
      await event.save({ transaction });
      return { event, leaseToken };
    });
  }

  async saveClaimed(event, leaseToken) {
    const values = typeof event.get === 'function' ? event.get({ plain: true }) : { ...event };
    delete values.id;
    delete values.created_at;
    delete values.updated_at;
    return this.NotificationOutbox.update(values, {
      where: { id: event.id, status: 'processing', lease_token: leaseToken },
    });
  }
}

module.exports = { SequelizeNotificationOutboxRepository };
