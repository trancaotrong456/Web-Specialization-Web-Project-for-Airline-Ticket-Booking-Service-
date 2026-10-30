import { describe, expect, it } from 'vitest';
import {
  addVnDays,
  formatVnDate,
  formatVnDayOfWeek,
  getNearbyDates,
  getVn7DaysRange,
  getVnDateParts,
  getVnLastMonthRange,
  getVnPreviousEquivalentRange,
  getVnThisMonthRange,
  getVnTodayRange,
  toVnDateString,
} from './dateUtils';

describe('dateUtils - Vietnam Local Time (Asia/Ho_Chi_Minh)', () => {
  it('correctly resolves Vietnam local date at 00:30 VN time where UTC is previous day', () => {
    // 00:30:00 sáng ngày 26/10/2026 tại Việt Nam (+07:00)
    // Giờ UTC tương ứng là 17:30:00 ngày 25/10/2026
    const simulatedDate = new Date('2026-10-25T17:30:00.000Z');

    // Chứng minh toISOString() cho ra ngày hôm trước (2026-10-25 UTC)
    expect(simulatedDate.toISOString().slice(0, 10)).toBe('2026-10-25');

    // Chứng minh dateUtils dựng từ thành phần ngày địa phương Asia/Ho_Chi_Minh ra đúng ngày 2026-10-26
    const vnParts = getVnDateParts(simulatedDate);
    expect(vnParts).toEqual({ year: 2026, month: 10, day: 26 });
    expect(toVnDateString(simulatedDate)).toBe('2026-10-26');

    // Mốc hôm nay
    expect(getVnTodayRange(simulatedDate)).toEqual({
      from_date: '2026-10-26',
      to_date: '2026-10-26',
      group_by: 'day',
    });

    // Mốc 7 ngày (20/10/2026 đến 26/10/2026)
    expect(getVn7DaysRange(simulatedDate)).toEqual({
      from_date: '2026-10-20',
      to_date: '2026-10-26',
      group_by: 'day',
    });

    // Mốc Tháng này (01/10/2026 đến 26/10/2026)
    expect(getVnThisMonthRange(simulatedDate)).toEqual({
      from_date: '2026-10-01',
      to_date: '2026-10-26',
      group_by: 'day',
    });

    // Mốc Tháng trước (01/09/2026 đến 30/09/2026)
    expect(getVnLastMonthRange(simulatedDate)).toEqual({
      from_date: '2026-09-01',
      to_date: '2026-09-30',
      group_by: 'day',
    });
  });

  it('correctly handles month and year roll-over at 00:30 VN time on New Year day', () => {
    // 00:30:00 ngày 01/01/2027 giờ VN (17:30 ngày 31/12/2026 UTC)
    const newYearDate = new Date('2026-12-31T17:30:00.000Z');

    expect(toVnDateString(newYearDate)).toBe('2027-01-01');
    expect(getVnThisMonthRange(newYearDate)).toEqual({
      from_date: '2027-01-01',
      to_date: '2027-01-01',
      group_by: 'day',
    });
    expect(getVnLastMonthRange(newYearDate)).toEqual({
      from_date: '2026-12-01',
      to_date: '2026-12-31',
      group_by: 'day',
    });
  });

  it('calculates the exact equivalent previous range for comparison', () => {
    // Khoảng 7 ngày: từ 2026-10-20 đến 2026-10-26 (7 ngày)
    // Kỳ trước tương đương phải là 7 ngày trước đó: 2026-10-13 đến 2026-10-19
    const prevRange = getVnPreviousEquivalentRange('2026-10-20', '2026-10-26', 'day');
    expect(prevRange).toEqual({
      from_date: '2026-10-13',
      to_date: '2026-10-19',
      group_by: 'day',
    });
  });

  it('correctly shifts VN dates and generates ±3 nearby dates', () => {
    expect(addVnDays('2026-10-26', -3)).toBe('2026-10-23');
    expect(addVnDays('2026-10-26', 3)).toBe('2026-10-29');

    const nearby = getNearbyDates('2026-10-26', 3);
    expect(nearby).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
  });

  it('formats VN day of week correctly', () => {
    // 2026-10-26 là Thứ Hai
    expect(formatVnDayOfWeek('2026-10-26')).toBe('Th 2');
    // 2026-10-25 là Chủ Nhật
    expect(formatVnDayOfWeek('2026-10-25')).toBe('CN');
    // 2026-10-31 là Thứ Bảy
    expect(formatVnDayOfWeek('2026-10-31')).toBe('Th 7');
  });
});
