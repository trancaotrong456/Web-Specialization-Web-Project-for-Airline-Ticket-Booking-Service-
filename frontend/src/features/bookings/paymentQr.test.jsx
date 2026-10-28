import { describe, expect, it } from 'vitest';
import { classifyQrValue, isSafeCheckoutUrl, renderQrDataUrl } from './paymentQr';

const rawVietQr = '00020101021238570010A000000727012700069704220113VINASUNBANK0208QRIBFTTA530370454061000005802VN63042B25';

describe('payOS QR value handling', () => {
  it('classifies a raw VietQR payload without changing it', () => {
    expect(classifyQrValue(rawVietQr)).toEqual({ type: 'payload', value: rawVietQr });
  });

  it.each([
    'data:image/png;base64,AA==',
    'data:image/jpeg;base64,AA==',
    'data:image/webp;base64,AA==',
    'https://pay.example.test/qr',
  ])('accepts supported image value %s', (value) => {
    expect(classifyQrValue(value).type).toBe('image');
  });

  it.each(['', null, 'javascript:alert(1)', 'file:///tmp/qr.png', 'blob:https://example.test/id', 'data:image/svg+xml;base64,AA==', 'not-a-payload'])('rejects unsafe or malformed value %s', (value) => {
    expect(classifyQrValue(value).type).toBe('invalid');
  });

  it('generates an image data URL from the exact raw payload', async () => {
    const image = await renderQrDataUrl(rawVietQr);
    expect(image).toMatch(/^data:image\/png;base64,/);
  });

  it('allows HTTPS checkout links and local development HTTP only', () => {
    expect(isSafeCheckoutUrl('https://pay.example.test/checkout')).toBe(true);
    expect(isSafeCheckoutUrl('http://localhost:5173/checkout')).toBe(true);
    expect(isSafeCheckoutUrl('http://evil.example/checkout')).toBe(false);
    expect(isSafeCheckoutUrl('javascript:alert(1)')).toBe(false);
  });
});
