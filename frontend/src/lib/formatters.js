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
