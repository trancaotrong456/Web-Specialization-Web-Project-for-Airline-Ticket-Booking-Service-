'use strict';

const { getNotificationOutboxId } = require('./notificationOutbox.repository');

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

function isTransientDeliveryError(error) {
  if (error?.retryable === false) return false;
  const status = Number(error?.statusCode || error?.status || 0);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

class NotificationDeliveryWorker {
  constructor({ repository, emailProvider, emailConfigured = () => Boolean(process.env.RESEND_API_KEY), getSocket, logger = console, maxAttempts = MAX_ATTEMPTS, now = () => new Date() } = {}) {
    if (!repository) throw new TypeError('Notification outbox repository is required');
    this.repository = repository;
    this.emailProvider = emailProvider;
    this.emailConfigured = emailConfigured;
    this.getSocket = getSocket;
    this.logger = logger;
    this.maxAttempts = maxAttempts;
    this.now = now;
  }

  async runOne() {
    const claim = await this.repository.claimNext();
    if (!claim) return false;
    const { event, leaseToken } = claim;
    const eventId = getNotificationOutboxId(event);
    if (eventId === undefined || eventId === null) {
      this.logger.error?.('[Notifications] Claimed outbox event missing id', {
        eventType: event?.event_type || null,
        status: event?.status || null,
        hasLeaseToken: Boolean(leaseToken),
      });
      const error = new Error('Notification outbox event is missing primary key id');
      error.code = 'OUTBOX_ID_MISSING';
      throw error;
    }
    const payload = event.payload || {};
    const failures = [];

    if (event.realtime_status === 'pending') {
      event.realtime_attempts += 1;
      try {
        const io = this.getSocket();
        io.to(`user:${event.recipient_user_id}`).emit('notification:new', {
          notificationId: payload.notificationId || null,
          eventType: event.event_type,
        });
        event.realtime_status = 'sent';
      } catch (error) {
        failures.push({ channel: 'realtime', error });
      }
    }

    if (event.email_status === 'pending') {
      event.email_attempts += 1;
      try {
        if (!event.recipient_email || !this.emailProvider || !this.emailConfigured()) {
          event.email_status = 'skipped';
        } else if (event.event_type === 'BOOKING_CONFIRMED' || event.event_type === 'PAYMENT_SUCCEEDED') {
          // The canonical Payment flow already sends the ticket/PDF confirmation email.
          event.email_status = 'skipped';
        } else if (typeof this.emailProvider.sendMail !== 'function') {
          event.email_status = 'skipped';
        } else {
          const title = escapeHtml(payload.title || 'Thông báo Serene Flightways');
          const message = escapeHtml(payload.message || 'Bạn có cập nhật mới.');
          await this.emailProvider.sendMail({ to: event.recipient_email, subject: title, html: `<p>${message}</p>` });
          event.email_status = 'sent';
        }
      } catch (error) {
        failures.push({ channel: 'email', error });
      }
    }

    if (failures.length) {
      const retryable = failures.some(({ channel, error }) => isTransientDeliveryError(error)
        && event[`${channel}_attempts`] < this.maxAttempts);
      for (const { channel, error } of failures) {
        if (!isTransientDeliveryError(error) || event[`${channel}_attempts`] >= this.maxAttempts) event[`${channel}_status`] = 'failed';
        else event[`${channel}_status`] = 'pending';
        event.last_error = String(error.message || error).slice(0, 2000);
      }
      event.status = retryable ? 'pending' : 'failed';
      const backoffMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** Math.max(0, Math.max(event.email_attempts, event.realtime_attempts) - 1)));
      event.available_at = new Date(this.now().getTime() + backoffMs);
      this.logger.error?.('[Notifications] Delivery attempt failed', event.last_error);
    } else {
      event.status = event.email_status === 'failed' || event.realtime_status === 'failed' ? 'failed' : 'processed';
      event.processed_at = this.now();
      event.lease_token = null;
      event.lease_expires_at = null;
      event.last_error = null;
    }

    await this.repository.saveClaimed(event, leaseToken);
    return true;
  }

  async runBatch(limit = 25) {
    let processed = 0;
    while (processed < limit && await this.runOne()) processed += 1;
    return processed;
  }
}

module.exports = { NotificationDeliveryWorker, MAX_ATTEMPTS, BASE_BACKOFF_MS, MAX_BACKOFF_MS, isTransientDeliveryError };
