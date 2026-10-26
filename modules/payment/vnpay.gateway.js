'use strict';

const crypto = require('crypto');
const { getVnpayConfig } = require('../../config/vnpay');

const RESPONSE_KEYS = [
  'vnp_RequestId', 'vnp_ResponseId', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef',
  'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_TransactionStatus',
  'vnp_TransactionType', 'vnp_ResponseCode', 'vnp_Message', 'vnp_BankCode',
  'vnp_PayDate', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount',
  'vnp_SecureHash',
];

function sanitizeResponse(body = {}) {
  return RESPONSE_KEYS.reduce((out, key) => {
    if (body[key] !== undefined && body[key] !== null) out[key] = String(body[key]);
    return out;
  }, {});
}

function hmacPipe(values, secretKey) {
  return crypto.createHmac('sha512', secretKey)
    .update(values.map((value) => String(value ?? '')).join('|'), 'utf8')
    .digest('hex');
}

function merchantRequestHash(payload, secretKey) {
  const fields = payload.vnp_Command === 'refund'
    ? ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TransactionType', 'vnp_TxnRef', 'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_CreateBy', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo']
    : ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_TransactionDate', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'];
  return hmacPipe(fields.map((field) => payload[field]), secretKey);
}

function merchantResponseHash(body, command, secretKey) {
  const fields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo'];
  if (command === 'querydr') fields.push('vnp_PromotionCode', 'vnp_PromotionAmount');
  return hmacPipe(fields.map((field) => body[field]), secretKey);
}

function classifyResponse(body, command = body.vnp_Command) {
  const apiCode = String(body?.vnp_ResponseCode ?? '');
  const transactionStatus = String(body?.vnp_TransactionStatus ?? '');
  if (apiCode !== '00') {
    // A duplicate refund (94) means VNPAY may still be processing the first
    // request. It is not proof of settlement and must not be retried blindly.
    return command === 'refund' && apiCode === '94' ? 'unknown' : (apiCode === '98' || apiCode === '99' ? 'unknown' : 'failed');
  }
  if (!transactionStatus) return 'unknown';
  if (transactionStatus === '00') return 'success';
  if (/^(01|05|06)$/.test(transactionStatus)) return 'pending';
  if (/^(02|04|07|09)$/.test(transactionStatus)) return 'failed';
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
    return `${prefix}${this.clock().getTime()}${crypto.randomBytes(6).toString('hex')}`.slice(0, 32);
  }

  _buildPayload({ command, payment, requestId, reason, transactionDate, transactionNo, createBy, ipAddr = '127.0.0.1' }) {
    const amount = Math.round(Number(payment.amount) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('VNPay amount must be a positive VND integer');
    const originalDate = transactionDate || payment.created_at || payment.createdAt;
    if (!originalDate || Number.isNaN(new Date(originalDate).getTime())) throw new Error('VNPay merchant API requires the original transaction date');
    const payload = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: command,
      vnp_TmnCode: this._config().tmnCode,
      vnp_TxnRef: String(payment.transaction_ref),
      vnp_OrderInfo: String(reason || `${command} ${payment.transaction_ref}`),
      vnp_TransactionDate: this._formatDate(originalDate),
      vnp_CreateDate: this._formatDate(this.clock()),
      vnp_IpAddr: String(ipAddr),
    };
    if (command === 'refund') {
      payload.vnp_TransactionType = '02';
      payload.vnp_Amount = String(amount);
      if (transactionNo) payload.vnp_TransactionNo = String(transactionNo);
      if (!createBy || !String(createBy).trim()) throw new Error('VNPay refund requires the initiating operator');
      payload.vnp_CreateBy = String(createBy).slice(0, 245);
    }
    payload.vnp_SecureHash = merchantRequestHash(payload, this._config().hashSecret);
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
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
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

  _validateResponse(body, payment, command) {
    const safe = sanitizeResponse(body);
    if (!body || body.vnp_TmnCode !== this._config().tmnCode || body.vnp_TxnRef !== String(payment.transaction_ref)) {
      const error = new Error('VNPay response merchant or transaction reference mismatch'); error.outcome = 'failed'; throw error;
    }
    const expectedAmount = Math.round(Number(payment.amount) * 100);
    if (body.vnp_Amount === undefined || String(body.vnp_Amount) !== String(expectedAmount)) {
      const error = new Error('VNPay response amount mismatch'); error.outcome = 'failed'; throw error;
    }
    if (body.vnp_Command && String(body.vnp_Command) !== command) {
      const error = new Error('VNPay response command mismatch'); error.outcome = 'failed'; throw error;
    }
    if (!body.vnp_ResponseId || !body.vnp_SecureHash || merchantResponseHash(body, command, this._config().hashSecret).toLowerCase() !== String(body.vnp_SecureHash).toLowerCase()) {
      const error = new Error('VNPay response signature is invalid'); error.outcome = 'failed'; throw error;
    }
    return { status: classifyResponse(body, command), response: safe, transactionRef: String(body.vnp_TxnRef), transactionNo: body.vnp_TransactionNo ? String(body.vnp_TransactionNo) : null };
  }

  async query({ payment, requestId = this._requestId('QDR') } = {}) {
    if (!payment || !payment.transaction_ref) throw new Error('VNPay QueryDR requires a payment transaction reference');
    const payload = this._buildPayload({ command: 'querydr', payment, requestId, transactionDate: payment.created_at });
    const body = await this._post(payload);
    return this._validateResponse(body, payment, 'querydr');
  }

  async refund({ payment, requestId = this._requestId('RFD'), reason, transactionNo, createBy, ipAddr } = {}) {
    if (!payment || !payment.transaction_ref) throw new Error('VNPay refund requires a payment transaction reference');
    const payload = this._buildPayload({ command: 'refund', payment, requestId, reason, transactionDate: payment.created_at, transactionNo, createBy, ipAddr });
    const body = await this._post(payload);
    return this._validateResponse(body, payment, 'refund');
  }
}

module.exports = { VnpayGateway, sanitizeResponse, classifyResponse, merchantRequestHash, merchantResponseHash };
