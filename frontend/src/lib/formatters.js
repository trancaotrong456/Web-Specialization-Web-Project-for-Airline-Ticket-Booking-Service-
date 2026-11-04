/**
 * Serene Flightways - Shared Formatters
 * Định dạng tiền tệ thống nhất toàn ứng dụng theo kiểu "1.250.000₫" (giống trang chủ).
 */

export function formatCurrency(value) {
  const num = Number(value || 0);
  const safeNum = Number.isFinite(num) ? num : 0;
  return `${new Intl.NumberFormat('vi-VN').format(safeNum)}₫`;
}

export const money = formatCurrency;
export const formatPrice = formatCurrency;

/**
 * Che số hộ chiếu/CCCD: chỉ giữ lại 3 ký tự cuối, các ký tự trước thay bằng *
 */
export function maskPassport(passportNo) {
  if (!passportNo || typeof passportNo !== 'string') return '—';
  const trimmed = passportNo.trim();
  if (!trimmed) return '—';
  const len = trimmed.length;
  if (len <= 4) {
    if (len <= 1) return '*';
    return `${'*'.repeat(len - 1)}${trimmed.slice(-1)}`;
  }
  const visible = trimmed.slice(-3);
  const maskedPrefix = '*'.repeat(len - 3);
  return `${maskedPrefix}${visible}`;
}

/**
 * Thoát ô CSV và trung hòa tấn công chèn công thức (CSV/Excel Formula Injection).
 * Các ô bắt đầu bằng =, +, -, @ sẽ được thêm tiền tố dấu nháy đơn '.
 * Dấu nháy kép " được nhân đôi thành "".
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}
