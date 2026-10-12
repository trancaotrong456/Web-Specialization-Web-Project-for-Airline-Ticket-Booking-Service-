const labels = {
  active: 'Đang hoạt động', locked: 'Đã khóa', scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Hoàn tất',
  holding: 'Giữ chỗ / Chờ thanh toán', pending_payment: 'Đang xử lý thanh toán', confirmed: 'Đã xác nhận', expired: 'Hết hạn',
  pending: 'Thanh toán chờ xử lý', success: 'Thanh toán thành công', failed: 'Thanh toán thất bại', refunded: 'Đã hoàn tiền',
};

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>;
}

export const statusLabel = (status) => labels[status] || status;
