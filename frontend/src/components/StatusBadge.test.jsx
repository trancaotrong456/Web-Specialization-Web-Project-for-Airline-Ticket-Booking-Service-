import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('booking and payment labels in the submitted report', () => {
  it.each([
    ['holding', 'Giữ chỗ / Chờ thanh toán'],
    ['pending_payment', 'Đang xử lý thanh toán'],
    ['confirmed', 'Đã xác nhận'],
    ['pending', 'Thanh toán chờ xử lý'],
    ['success', 'Thanh toán thành công'],
    ['failed', 'Thanh toán thất bại'],
    ['refunded', 'Đã hoàn tiền'],
  ])('renders %s as %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
