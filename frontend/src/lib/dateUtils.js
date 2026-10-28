/**
 * Utility functions for Vietnam Local Date (Asia/Ho_Chi_Minh) calculations.
 * Always builds dates from local date components, NEVER using toISOString().slice(0, 10).
 */

export function getVnDateParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const year = Number(map.year);
  const month = Number(map.month); // 1-12
  const day = Number(map.day);     // 1-31
  return { year, month, day };
}

export function formatVnDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toVnDateString(date = new Date()) {
  const { year, month, day } = getVnDateParts(date);
  return formatVnDate(year, month, day);
}

export function getVnTodayRange(date = new Date()) {
  const s = toVnDateString(date);
  return { from_date: s, to_date: s, group_by: 'day' };
}

export function getVn7DaysRange(date = new Date()) {
  const { year, month, day } = getVnDateParts(date);
  const todayStr = formatVnDate(year, month, day);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() - 6);
  const fromStr = formatVnDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  return { from_date: fromStr, to_date: todayStr, group_by: 'day' };
}

export function getVnThisMonthRange(date = new Date()) {
  const { year, month, day } = getVnDateParts(date);
  const fromStr = formatVnDate(year, month, 1);
  const toStr = formatVnDate(year, month, day);
  return { from_date: fromStr, to_date: toStr, group_by: 'day' };
}

export function getVnLastMonthRange(date = new Date()) {
  const { year, month } = getVnDateParts(date);
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const fromStr = formatVnDate(prevYear, prevMonth, 1);
  const toStr = formatVnDate(prevYear, prevMonth, daysInPrevMonth);
  return { from_date: fromStr, to_date: toStr, group_by: 'day' };
}

export function getVnPreviousEquivalentRange(fromStr, toStr, groupBy = 'day') {
  const [fYear, fMonth, fDay] = fromStr.split('-').map(Number);
  const [tYear, tMonth, tDay] = toStr.split('-').map(Number);
  const fromUtc = Date.UTC(fYear, fMonth - 1, fDay);
  const toUtc = Date.UTC(tYear, tMonth - 1, tDay);
  const diffTime = toUtc - fromUtc;

  const prevToUtc = new Date(fromUtc - 24 * 60 * 60 * 1000);
  const prevFromUtc = new Date(prevToUtc.getTime() - diffTime);

  return {
    from_date: formatVnDate(prevFromUtc.getUTCFullYear(), prevFromUtc.getUTCMonth() + 1, prevFromUtc.getUTCDate()),
    to_date: formatVnDate(prevToUtc.getUTCFullYear(), prevToUtc.getUTCMonth() + 1, prevToUtc.getUTCDate()),
    group_by: groupBy,
  };
}

export function addVnDays(dateOrString, daysOffset = 0) {
  let baseDate;
  if (typeof dateOrString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrString)) {
    const [y, m, d] = dateOrString.split('-').map(Number);
    baseDate = new Date(Date.UTC(y, m - 1, d));
  } else {
    const { year, month, day } = getVnDateParts(dateOrString);
    baseDate = new Date(Date.UTC(year, month - 1, day));
  }
  baseDate.setUTCDate(baseDate.getUTCDate() + daysOffset);
  return formatVnDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, baseDate.getUTCDate());
}

export function getNearbyDates(dateStr, offsetDays = 3) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  const list = [];
  for (let i = -offsetDays; i <= offsetDays; i += 1) {
    list.push(addVnDays(dateStr, i));
  }
  return list;
}

export function formatVnDayOfWeek(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const days = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];
  return days[day] || '';
}

export function formatVnDateTime(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(d);
}

export function formatTime(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatDay(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function isTodayVn(date) {
  if (!date) return false;
  const targetStr = toVnDateString(date);
  const todayStr = toVnDateString(new Date());
  return targetStr === todayStr;
}

export function formatFlightPickerLabel(flight) {
  if (!flight) return '';
  const airline = flight.airline?.name || flight.airline?.iata_code || `Chuyến #${flight.id}`;
  const origin = flight.departureAirport?.iata_code || '???';
  const dest = flight.arrivalAirport?.iata_code || '???';
  if (!flight.departure_time) {
    return `${airline} · ${origin}→${dest} · #${flight.id}`;
  }
  const d = flight.departure_time instanceof Date ? flight.departure_time : new Date(flight.departure_time);
  if (isNaN(d.getTime())) {
    return `${airline} · ${origin}→${dest} · #${flight.id}`;
  }
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeParts = timeFormatter.formatToParts(d);
  const hour = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const { month, day } = getVnDateParts(d);
  const timeStr = `${hour}:${minute}`;
  const dateStr = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  return `${airline} · ${origin}→${dest} · ${timeStr} ${dateStr}`;
}

/**
 * Chuyển đổi chuỗi datetime-local (định dạng YYYY-MM-DDTHH:mm theo giờ Việt Nam UTC+7)
 * sang chuỗi ISO 8601 chuẩn UTC (kết thúc bằng Z).
 * Hoàn toàn độc lập với múi giờ của máy trạm người dùng hay môi trường kiểm thử CI.
 */
export function vnDateTimeInputToIso(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const [, y, m, d, h, min, s] = match;
  const utcMillis = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    s ? Number(s) : 0
  ) - 7 * 60 * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

/**
 * Chuyển đổi chuỗi ISO từ API (hoặc Date object) sang định dạng YYYY-MM-DDTHH:mm theo giờ Việt Nam (UTC+7).
 * Dùng để hiển thị trong ô input type="datetime-local" khi mở biểu mẫu chỉnh sửa chuyến bay.
 * Hoàn toàn độc lập với múi giờ của máy trạm người dùng hay môi trường kiểm thử CI.
 */
export function isoToVnDateTimeInput(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  const hour = String(vnTime.getUTCHours()).padStart(2, '0');
  const minute = String(vnTime.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

