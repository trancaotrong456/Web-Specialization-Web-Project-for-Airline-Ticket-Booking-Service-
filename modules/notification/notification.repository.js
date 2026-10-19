'use strict';

const NOTIFICATION_ATTRIBUTES = [
  'id', 'event_type', 'title', 'message', 'related_type', 'related_id', 'read_at', 'created_at',
];

class SequelizeNotificationRepository {
  constructor({ Notification, now = () => new Date() } = {}) {
    if (!Notification) throw new TypeError('Notification model is required');
    this.Notification = Notification;
    this.now = now;
  }

  listForUser(userId, { page, limit }) {
    return this.Notification.findAndCountAll({
      where: { user_id: userId },
      limit,
      offset: (page - 1) * limit,
      order: [['created_at', 'DESC']],
      attributes: NOTIFICATION_ATTRIBUTES,
    });
  }

  countUnreadForUser(userId) {
    return this.Notification.count({ where: { user_id: userId, read_at: null } });
  }

  async markReadForUser(userId, notificationId) {
    const notification = await this.Notification.findOne({ where: { id: notificationId, user_id: userId } });
    if (!notification) return null;
    if (!notification.read_at) await notification.update({ read_at: this.now() });
    return notification;
  }
}

module.exports = { SequelizeNotificationRepository, NOTIFICATION_ATTRIBUTES };
