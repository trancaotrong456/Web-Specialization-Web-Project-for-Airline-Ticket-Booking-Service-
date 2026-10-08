const labels = {
  active: 'Đang hoạt động', locked: 'Đã khóa', scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Hoàn tất',
  holding: 'Đang giữ chỗ', pending_payment: 'Chờ thanh toán', confirmed: 'Đã xác nhận', expired: 'Hết hạn',
  pending: 'Đang chờ', success: 'Thành công', failed: 'Thất bại', refunded: 'Đã refund',
};

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
