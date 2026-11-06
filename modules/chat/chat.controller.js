'use strict';

const ApiResponse = require('../../utils/apiResponse');

class ChatController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Chat service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }

  async sendMessage(req, res, next) {
    try {
      const { message, history } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return this.apiResponse.badRequest(res, 'Vui lòng cung cấp nội dung tin nhắn.');
      }
      const result = await this.service.processMessage({ message: message.trim(), history });
      return this.apiResponse.success(res, result, 'Trả lời tin nhắn thành công');
    } catch (error) {
      next(error);
    }
  }

  async getSuggestions(req, res, next) {
    try {
      const suggestions = this.service.getQuickPrompts();
      return this.apiResponse.success(res, { suggestions }, 'Lấy danh sách câu hỏi gợi ý thành công');
    } catch (error) {
      next(error);
    }
  }

  async getPolicies(req, res, next) {
    try {
      const policies = this.service.getPolicies();
      return this.apiResponse.success(res, { policies }, 'Lấy danh sách chính sách thành công');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ChatController;
