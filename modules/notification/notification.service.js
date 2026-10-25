'use strict';

class NotificationService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('A Notification repository is required');
    this.repository = repository;
  }

  async listForUser(userId, { page = 1, limit = 20 } = {}) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedPage) || parsedPage < 1
      || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      const error = new Error('page must be >= 1 and limit must be between 1 and 100');
      error.statusCode = 400;
      throw error;
    }
    const { count, rows } = await this.repository.listForUser(userId, {
      page: parsedPage,
      limit: parsedLimit,
    });
    return { total: count, page: parsedPage, limit: parsedLimit, data: rows };
  }

  unreadCountForUser(userId) {
    return this.repository.countUnreadForUser(userId);
  }

  async markReadForUser(userId, notificationId) {
    const notification = await this.repository.markReadForUser(userId, notificationId);
    if (!notification) {
      const error = new Error('Notification not found');
      error.statusCode = 404;
      throw error;
    }
    return notification;
  }
}

module.exports = NotificationService;
