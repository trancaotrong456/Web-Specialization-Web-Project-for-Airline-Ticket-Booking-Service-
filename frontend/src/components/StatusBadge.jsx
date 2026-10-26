import { Badge } from './Badge';

const labels = {
  active: 'Đang hoạt động', locked: 'Đã khóa', scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Hoàn tất',
  holding: 'Giữ chỗ / Chờ thanh toán', pending_payment: 'Đang xử lý thanh toán', confirmed: 'Đã xác nhận', expired: 'Hết hạn',
  pending: 'Thanh toán chờ xử lý', success: 'Thanh toán thành công', failed: 'Thanh toán thất bại', refunded: 'Đã hoàn tiền',
};

const statusToVariant = {
  active: 'brand',
  scheduled: 'brand',
  confirmed: 'success',
  success: 'success',
  completed: 'success',
  holding: 'warning',
  pending_payment: 'warning',
  pending: 'warning',
  cancelled: 'danger',
  expired: 'danger',
  failed: 'danger',
  locked: 'danger',
  refunded: 'info',
};

export function StatusBadge({ status, className = '', ...rest }) {
  const variant = statusToVariant[status] || 'neutral';
  return (
    <Badge
      variant={variant}
      className={`status-badge status-${status} ${className}`.trim()}
      {...rest}
    >
      {statusLabel(status)}
    </Badge>
  );
}

export const statusLabel = (status) => labels[status] || status;

