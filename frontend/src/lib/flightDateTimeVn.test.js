import { describe, expect, it } from 'vitest';
import { isoToVnDateTimeInput, vnDateTimeInputToIso } from './dateUtils';

describe('Vietnam Flight DateTime Conversion (vnDateTimeInputToIso & isoToVnDateTimeInput)', () => {
  it('converts datetime-local input string (VN time) to exact ISO UTC string regardless of runtime timezone', () => {
    // 06:30 sáng ngày 05/11/2026 giờ Việt Nam (UTC+7) -> 23:30 tối ngày 04/11/2026 UTC
    expect(vnDateTimeInputToIso('2026-11-05T06:30')).toBe('2026-11-04T23:30:00.000Z');
    // 08:30 sáng ngày 05/11/2026 giờ Việt Nam (UTC+7) -> 01:30 sáng ngày 05/11/2026 UTC
    expect(vnDateTimeInputToIso('2026-11-05T08:30')).toBe('2026-11-05T01:30:00.000Z');
    // Có giây
    expect(vnDateTimeInputToIso('2026-11-05T06:30:45')).toBe('2026-11-04T23:30:45.000Z');
  });

  it('preserves ISO string if string already has timezone specifier', () => {
    expect(vnDateTimeInputToIso('2026-11-04T23:30:00.000Z')).toBe('2026-11-04T23:30:00.000Z');
    expect(vnDateTimeInputToIso('2026-11-05T06:30:00+07:00')).toBe('2026-11-04T23:30:00.000Z');
  });

  it('converts ISO string from API back to datetime-local input string in VN time', () => {
    // 23:30 UTC ngày 04/11 -> 06:30 ngày 05/11 giờ VN
    expect(isoToVnDateTimeInput('2026-11-04T23:30:00.000Z')).toBe('2026-11-05T06:30');
    // 01:30 UTC ngày 05/11 -> 08:30 ngày 05/11 giờ VN
    expect(isoToVnDateTimeInput('2026-11-05T01:30:00.000Z')).toBe('2026-11-05T08:30');
  });

  it('guarantees bidirectional lossless roundtrip between ISO and VN datetime-local', () => {
    const originalIso = '2026-11-05T06:30:00.000Z';
    const formInput = isoToVnDateTimeInput(originalIso);
    const roundtripIso = vnDateTimeInputToIso(formInput);
    expect(roundtripIso).toBe(originalIso);
  });

  it('handles null, undefined, empty string and invalid inputs gracefully', () => {
    expect(vnDateTimeInputToIso('')).toBe('');
    expect(vnDateTimeInputToIso(null)).toBe('');
    expect(vnDateTimeInputToIso(undefined)).toBe('');
    expect(isoToVnDateTimeInput('')).toBe('');
    expect(isoToVnDateTimeInput(null)).toBe('');
    expect(isoToVnDateTimeInput(undefined)).toBe('');
  });
});
