'use strict';

const crypto = require('crypto');

function getNotificationOutboxId(event) {
  if (!event) return undefined;
  if (event.id !== undefined && event.id !== null) return event.id;
  if (typeof event.get === 'function') {
    const getterValue = event.get('id');
    if (getterValue !== undefined && getterValue !== null) return getterValue;
    const plain = event.get({ plain: true });
    if (plain?.id !== undefined && plain?.id !== null) return plain.id;
  }
  const dataValue = event.dataValues?.id;
  return dataValue === undefined || dataValue === null ? undefined : dataValue;
}

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
    const eventId = getNotificationOutboxId(event);
    if (eventId === undefined || eventId === null) {
      const error = new Error('Notification outbox event is missing primary key id');
      error.code = 'OUTBOX_ID_MISSING';
      throw error;
    }
    const values = typeof event.get === 'function' ? event.get({ plain: true }) : { ...event };
    delete values.id;
    delete values.created_at;
    delete values.updated_at;
    return this.NotificationOutbox.update(values, {
      where: { id: eventId, status: 'processing', lease_token: leaseToken },
    });
  }
}

module.exports = { SequelizeNotificationOutboxRepository, getNotificationOutboxId };
