import { useMemo } from 'react';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
} from './AppIcons';

/**
 * Bản địa hóa các thông điệp lỗi kỹ thuật từ backend sang tiếng Việt lịch sự, dễ hiểu
 */
function localizeMessage(msg) {
  if (typeof msg !== 'string') return msg;

  const raw = msg.trim();

  if (/Booking cannot be paid\. Current status is 'pending_payment', must be 'holding'/i.test(raw)) {
    return 'Đơn đặt chỗ hiện đang trong trạng thái chờ xử lý thanh toán (Pending Payment). Quý khách vui lòng kiểm tra lại giao dịch đang thực hiện hoặc chờ trong giây lát.';
  }
  if (/Booking cannot be paid because a flight is no longer scheduled/i.test(raw)) {
    return 'Đơn đặt chỗ không thể thanh toán vì chuyến bay không còn trong lịch khai thác hiện tại.';
  }
  if (/Booking cannot be paid because a flight has already departed/i.test(raw)) {
    return 'Đơn đặt chỗ không thể thanh toán vì chuyến bay đã khởi hành.';
  }
  if (/Booking cannot be paid/i.test(raw)) {
    return 'Đơn đặt chỗ hiện chưa thể thực hiện thanh toán. Quý khách vui lòng kiểm tra lại trạng thái đơn hoặc liên hệ tổng đài để được hỗ trợ.';
  }
  if (/Booking not found/i.test(raw)) {
    return 'Không tìm thấy thông tin đơn đặt chỗ trong hệ thống.';
  }
  if (/Access denied to this booking/i.test(raw)) {
    return 'Bạn không có quyền truy cập thông tin đơn đặt chỗ này.';
  }
  if (/Invalid email or password|Invalid credentials/i.test(raw)) {
    return 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại thông tin đăng nhập.';
  }
  if (/Failed to fetch|Network Error/i.test(raw)) {
    return 'Không thể kết nối đến máy chủ. Quý khách vui lòng kiểm tra kết nối mạng và thử lại.';
  }

  return msg;
}

export function Notice({ type = 'info', title = null, children, errors = null }) {
  const errorItems = useMemo(() => {
    if (!errors) return [];
    if (Array.isArray(errors)) {
      return errors.map((item) => {
        if (typeof item === 'string') return { message: localizeMessage(item) };
        return {
          field: item.field || item.path || '',
          message: localizeMessage(item.message || item.msg || JSON.stringify(item)),
        };
      });
    }
    if (typeof errors === 'object') {
      return Object.entries(errors).map(([field, message]) => ({
        field,
        message: localizeMessage(String(message)),
      }));
    }
    return [];
  }, [errors]);

  if (!children && !errorItems.length) return null;

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <IconAlertCircle size={20} className="notice-icon-svg" aria-hidden="true" />;
      case 'warning':
        return <IconAlertTriangle size={20} className="notice-icon-svg" aria-hidden="true" />;
      case 'success':
        return <IconCheckCircle size={20} className="notice-icon-svg" aria-hidden="true" />;
      case 'info':
      default:
        return <IconInfo size={20} className="notice-icon-svg" aria-hidden="true" />;
    }
  };

  const renderedChildren = typeof children === 'string' ? localizeMessage(children) : children;

  return (
    <div
      className={`notice notice-${type}`}
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
    >
      <div className="notice-icon-badge" aria-hidden="true">
        {getIcon()}
      </div>
      <div className="notice-content">
        {title ? <h4 className="notice-title">{title}</h4> : null}
        {renderedChildren ? <div className="notice-message">{renderedChildren}</div> : null}
        {errorItems.length > 0 ? (
          <ul className="notice-error-list" aria-label="Danh sách lỗi chi tiết">
            {errorItems.map((item, index) => (
              <li key={index}>
                {item.field ? <strong>{item.field}: </strong> : null}
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
