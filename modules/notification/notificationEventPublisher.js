'use strict';

const EVENT_CONTENT = Object.freeze({
  BOOKING_CREATED: ['Đặt chỗ đã được tạo', 'Đặt chỗ {code} đang chờ thanh toán.'],
  BOOKING_CONFIRMED: ['Đặt chỗ đã được xác nhận', 'Đặt chỗ {code} đã được xác nhận.'],
  BOOKING_CANCELLED: ['Đặt chỗ đã bị hủy', 'Đặt chỗ {code} đã được hủy.'],
  PAYMENT_SUCCEEDED: ['Thanh toán thành công', 'Thanh toán cho đặt chỗ {code} đã thành công.'],
  PAYMENT_FAILED: ['Thanh toán chưa thành công', 'Thanh toán cho đặt chỗ {code} chưa thành công.'],
  REFUND_COMPLETED: ['Hoàn tiền đã hoàn tất', 'Yêu cầu hoàn tiền cho đặt chỗ {code} đã được xử lý.'],
  FLIGHT_DELAYED: ['Chuyến bay bị hoãn', 'Chuyến bay {flight} đã bị hoãn.'],
  FLIGHT_CANCELLED: ['Chuyến bay đã bị hủy', 'Chuyến bay {flight} đã bị hủy.'],
  FLIGHT_SCHEDULE_CHANGED: ['Lịch bay đã thay đổi', 'Lịch chuyến bay {flight} đã được cập nhật.'],
});

function render(value, variables) {
  return value.replace(/\{(\w+)\}/g, (_match, key) => String(variables[key] ?? ''));
}

class NotificationEventPublisher {
  constructor({ NotificationOutbox, Notification, User } = {}) {
    if (!NotificationOutbox || !Notification) throw new TypeError('Notification outbox and inbox models are required');
    this.NotificationOutbox = NotificationOutbox;
    this.Notification = Notification;
    this.User = User;
  }

  async publish({ eventKey, eventType, aggregateType, aggregateId = null, recipientUserId = null, recipientEmail = null, relatedType = null, relatedId = null, variables = {} }, { transaction } = {}) {
    if (!eventKey || !eventType || !aggregateType) throw new TypeError('Notification event identity is required');
    const content = EVENT_CONTENT[eventType];
    if (!content) throw new TypeError(`Unsupported notification event type: ${eventType}`);

    const title = render(content[0], variables);
    const message = render(content[1], variables);
    const existing = await this.NotificationOutbox.findOne({ where: { event_key: eventKey }, transaction });
    if (existing) {
      const existingPayload = existing.payload || {};
      const isSameEvent = existing.event_type === eventType
        && existing.aggregate_type === aggregateType
        && String(existing.aggregate_id ?? '') === String(aggregateId ?? '')
        && String(existing.recipient_user_id ?? '') === String(recipientUserId ?? '')
        && existingPayload.title === title
        && existingPayload.message === message
        && String(existingPayload.relatedType ?? '') === String(relatedType ?? '')
        && String(existingPayload.relatedId ?? '') === String(relatedId ?? '');
      if (!isSameEvent) {
        const error = new Error('Notification event key was already used for a different payload');
        error.statusCode = 409;
        throw error;
      }
      const notification = recipientUserId
        ? await this.Notification.findOne({ where: { outbox_id: existing.id, user_id: recipientUserId }, transaction })
        : null;
      return { outbox: existing, notification };
    }
    const recipient = recipientEmail || (recipientUserId && this.User
      ? (await this.User.findByPk(recipientUserId, { attributes: ['email'], transaction }))?.email
      : null);
    const outbox = await this.NotificationOutbox.create({
      event_key: eventKey,
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      recipient_user_id: recipientUserId,
      recipient_email: recipient,
      payload: { title, message, relatedType, relatedId },
      status: 'pending',
      email_status: recipient ? 'pending' : 'skipped',
      realtime_status: recipientUserId ? 'pending' : 'skipped',
    }, { transaction });

    let notification = null;
    if (recipientUserId) {
      notification = await this.Notification.create({
        user_id: recipientUserId,
        outbox_id: outbox.id,
        event_type: eventType,
        title,
        message,
        related_type: relatedType,
        related_id: relatedId,
      }, { transaction });
      outbox.payload = { ...outbox.payload, notificationId: notification.id };
      await outbox.save({ transaction });
    }
    return { outbox, notification };
  }
}

module.exports = { NotificationEventPublisher, EVENT_CONTENT };
