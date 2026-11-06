'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ChatService = require('../modules/chat/chat.service');
const ChatController = require('../modules/chat/chat.controller');
const { createChatModule } = require('../modules/chat');

test('ChatService - retrieves relevant baggage chunks', async () => {
  const service = new ChatService();
  const chunks = service.retrieveRelevantChunks('hành lý xách tay được bao nhiêu kg?', 2);
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].id, 'baggage-carry-on');
  assert.ok(chunks[0].content.includes('7kg'));
});

test('ChatService - retrieves 15-minute hold policy chunks', async () => {
  const service = new ChatService();
  const chunks = service.retrieveRelevantChunks('giữ chỗ 15 phút là gì', 2);
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].id, 'booking-15-minute-hold');
});

test('ChatService - processMessage returns answer with citations', async () => {
  const service = new ChatService();
  const result = await service.processMessage({ message: 'Quy định hủy vé và hoàn tiền như thế nào?' });
  assert.equal(result.success, true);
  assert.ok(result.message.includes('Eco Saver'));
  assert.ok(result.citations.length > 0);
  assert.equal(result.citations[0].id, 'cancellation-refund');
});

test('ChatService - processMessage handles greetings', async () => {
  const service = new ChatService();
  const result = await service.processMessage({ message: 'Xin chào' });
  assert.equal(result.success, true);
  assert.ok(result.message.includes('Trợ Lý Ảo'));
});

test('ChatController - returns badRequest on empty message', async () => {
  const service = new ChatService();
  let badRequestCalled = false;
  const mockApiResponse = {
    badRequest: (res, msg) => {
      badRequestCalled = true;
      return { status: 400, msg };
    },
    success: () => {}
  };
  const controller = new ChatController({ service, apiResponse: mockApiResponse });
  const req = { body: { message: '' } };
  const res = {};
  await controller.sendMessage(req, res, () => {});
  assert.equal(badRequestCalled, true);
});

test('createChatModule - mounts router and endpoints', () => {
  const moduleInstance = createChatModule();
  assert.ok(moduleInstance.router);
  assert.ok(moduleInstance.service);
  assert.ok(moduleInstance.controller);
});
