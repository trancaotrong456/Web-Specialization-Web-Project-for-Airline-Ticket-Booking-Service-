'use strict';

const crypto = require('crypto');
const { signVnpayParams, verifyVnpayChecksum } = require('../../utils/checksum.util');
const { getVnpayConfig } = require('../../config/vnpay');

const RESPONSE_KEYS = [
  'vnp_RequestId', 'vnp_ResponseId', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef',
  'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_TransactionStatus',
  'vnp_ResponseCode', 'vnp_Message', 'vnp_SecureHash',
];

function sanitizeResponse(body = {}) {
  return RESPONSE_KEYS.reduce((out, key) => {
    if (body[key] !== undefined && body[key] !== null) out[key] = String(body[key]);
    return out;
  }, {});
}

function classifyResponse(body) {
  const code = String(body.vnp_ResponseCode || body.vnp_TransactionStatus || '99');
  if (code === '00') return 'success';
  if (/^(02|03|04|05|06|07|09|11|12|13|24|51|65|75|79|99)$/.test(code)) return 'failed';
  return 'unknown';
}

class VnpayGateway {
  constructor({ httpClient = globalThis.fetch, configProvider = getVnpayConfig, clock = () => new Date(), timeoutMs = 15000 } = {}) {
    if (typeof httpClient !== 'function') throw new TypeError('VNPay gateway requires an HTTP client');
    this.httpClient = httpClient;
    this.configProvider = configProvider;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
  }

  _config() {
    const config = this.configProvider(process.env);
    if (!config || config.mode === 'disabled') {
      const error = new Error('VNPay gateway is disabled'); error.code = 'VNPAY_DISABLED'; error.statusCode = 503; throw error;
    }
    if (!config.apiUrl) {
      const error = new Error('VNPay QueryDR/Refund API URL is not configured'); error.code = 'VNPAY_API_NOT_CONFIGURED'; error.statusCode = 503; throw error;
    }
    return config;
  }

  _requestId(prefix = 'REQ') {
    return `${prefix}_${this.clock().getTime()}_${crypto.randomBytes(6).toString('hex')}`.slice(0, 64);
  }

  _buildPayload({ command, payment, requestId, reason, transactionDate, transactionNo }) {
    const amount = Math.round(Number(payment.amount) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('VNPay amount must be a positive VND integer');
    const payload = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: command,
      vnp_TmnCode: this._config().tmnCode,
      vnp_TxnRef: String(payment.transaction_ref),
      vnp_OrderInfo: String(reason || `${command} ${payment.transaction_ref}`),
      vnp_TransactionDate: this._formatDate(transactionDate || payment.paid_at || this.clock()),
      vnp_CreateDate: this._formatDate(this.clock()),
      vnp_IpAddr: '127.0.0.1',
    };
    if (command === 'refund') {
      payload.vnp_TransactionType = '02';
      payload.vnp_Amount = String(amount);
      if (transactionNo) payload.vnp_TransactionNo = String(transactionNo);
    }
    payload.vnp_SecureHash = signVnpayParams(payload, this._config().hashSecret);
    return payload;
  }

  _formatDate(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).reduce((a, p) => (a[p.type] = p.value, a), {});
    return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
  }

  async _post(payload) {
    const config = this._config();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.httpClient(config.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload).toString(), signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch (_) { body = Object.fromEntries(new URLSearchParams(text)); }
      if (!response.ok) { const error = new Error(`VNPay gateway HTTP ${response.status}`); error.outcome = 'unknown'; throw error; }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') { const timeoutError = new Error('VNPay gateway timeout'); timeoutError.outcome = 'unknown'; throw timeoutError; }
      throw error;
    } finally { clearTimeout(timeout); }
  }

  _validateResponse(body, payment, requestId) {
    const safe = sanitizeResponse(body);
    if (!body || body.vnp_TmnCode !== this._config().tmnCode || body.vnp_TxnRef !== String(payment.transaction_ref)) {
      const error = new Error('VNPay response merchant or transaction reference mismatch'); error.outcome = 'failed'; throw error;
    }
    const expectedAmount = Math.round(Number(payment.amount) * 100);
    if (body.vnp_Amount !== undefined && String(body.vnp_Amount) !== String(expectedAmount)) {
      const error = new Error('VNPay response amount mismatch'); error.outcome = 'failed'; throw error;
    }
    if (body.vnp_RequestId && String(body.vnp_RequestId) !== String(requestId)) {
      const error = new Error('VNPay response request id mismatch'); error.outcome = 'failed'; throw error;
    }
    if (!body.vnp_SecureHash || !verifyVnpayChecksum(body, this._config().hashSecret)) {
      const error = new Error('VNPay response signature is invalid'); error.outcome = 'failed'; throw error;
    }
    return { status: classifyResponse(body), response: safe, transactionRef: String(body.vnp_TxnRef), transactionNo: body.vnp_TransactionNo ? String(body.vnp_TransactionNo) : null };
  }

  async query({ payment, requestId = this._requestId('QDR') } = {}) {
    if (!payment || !payment.transaction_ref) throw new Error('VNPay QueryDR requires a payment transaction reference');
    const payload = this._buildPayload({ command: 'querydr', payment, requestId, transactionDate: payment.paid_at });
    const body = await this._post(payload);
    return this._validateResponse(body, payment, requestId);
  }

  async refund({ payment, requestId = this._requestId('RFD'), reason, transactionNo } = {}) {
    if (!payment || !payment.transaction_ref) throw new Error('VNPay refund requires a payment transaction reference');
    const payload = this._buildPayload({ command: 'refund', payment, requestId, reason, transactionDate: payment.paid_at, transactionNo });
    const body = await this._post(payload);
    return this._validateResponse(body, payment, requestId);
  }
}

module.exports = { VnpayGateway, sanitizeResponse, classifyResponse };
