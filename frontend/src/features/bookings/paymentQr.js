import QRCode from 'qrcode';

const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i;
const RAW_VIETQR = /^000201[\x20-\x7e]{14,}6304([0-9a-f]{4})$/i;

const crc16Ccitt = (value) => {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const parseUrl = (value) => {
  try {
    return new URL(value, window.location.origin);
  } catch {
    return null;
  }
};

const isLocalHost = (url) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

export const isSafeImageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const candidate = value.trim();
  if (IMAGE_DATA_URL.test(candidate)) return true;
  if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) return false;
  const url = parseUrl(candidate);
  return Boolean(url && (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url))));
};

export const isRawVietQrPayload = (value) => {
  if (typeof value !== 'string') return false;
  const match = value.match(RAW_VIETQR);
  if (!match) return false;
  return crc16Ccitt(value.slice(0, -4)) === match[1].toUpperCase();
};

export const classifyQrValue = (value) => {
  if (typeof value !== 'string' || !value.trim()) return { type: 'invalid', value: null };
  if (value !== value.trim()) return { type: 'invalid', value: null };
  const candidate = value;
  if (isSafeImageUrl(candidate)) return { type: 'image', value: candidate };
  if (isRawVietQrPayload(candidate)) return { type: 'payload', value: candidate };
  return { type: 'invalid', value: null };
};

export const isSafeCheckoutUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (!/^[a-z][a-z\d+.-]*:/i.test(value.trim())) return false;
  const url = parseUrl(value.trim());
  return Boolean(url && (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url))));
};

export async function renderQrDataUrl(payload) {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, type: 'image/png' });
}

export { PaymentQr } from './PaymentQr.jsx';
