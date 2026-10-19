'use strict';

const ApiResponse = require('../../utils/apiResponse');

class NotificationController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Notification service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }

  async list(req, res, next) {
    try { return this.apiResponse.paginated(res, await this.service.listForUser(req.user.id, req.query)); }
    catch (error) { next(error); }
  }

  async unreadCount(req, res, next) {
    try { return this.apiResponse.success(res, { count: await this.service.unreadCountForUser(req.user.id) }); }
    catch (error) { next(error); }
  }

  async markRead(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.markReadForUser(req.user.id, req.params.id), 'Notification marked as read'); }
    catch (error) { next(error); }
  }
}

module.exports = NotificationController;
