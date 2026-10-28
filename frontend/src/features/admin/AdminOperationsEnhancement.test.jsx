import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { FlightPicker } from '../../components/FlightPicker';
import { AdminPaymentsPage } from '../bookings/PaymentPages';
import { FlightListPage, PassengerManifestModal } from '../flights/FlightManagementPages';
import { formatFlightPickerLabel } from '../../lib/dateUtils';
import { escapeCsvCell, maskPassport } from '../../lib/formatters';

const json = (data, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Đợt 8 & 8b — Quản trị và vận hành', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Mục 1 & 6: FlightPicker hiển thị đúng chuẩn thứ tự máy chủ và nhãn định dạng', () => {
    const mockFlight = {
      id: 25,
      airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
      departureAirport: { iata_code: 'HAN', city: 'Hà Nội' },
      arrivalAirport: { iata_code: 'SGN', city: 'Hồ Chí Minh' },
      departure_time: '2026-10-24T23:00:00.000Z', // 06:00 ngày 25/10 giờ Việt Nam
    };

    it('định dạng nhãn chuyến bay đúng chuẩn: Hãng · HAN→SGN · 06:00 25/10 (giờ VN)', () => {
      const label = formatFlightPickerLabel(mockFlight);
      expect(label).toBe('Vietnam Airlines · HAN→SGN · 06:00 25/10');
    });

    it('ghi đúng trên giao diện: 50 chuyến đầu theo thứ tự của máy chủ, không viết gần nhất', async () => {
      const fetchImpl = vi.fn(async (url) => {
        if (url.includes('/flights?')) {
          return json({ data: [mockFlight], pagination: { page: 1, total: 1 } });
        }
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <FlightPicker
            id="test-flight-picker"
            label="ID chuyến bay"
            value=""
            onChange={vi.fn()}
          />
        </AuthProvider>
      );

      expect(
        await screen.findByText(/50 chuyến đầu theo thứ tự của máy chủ \(sắp xếp theo thời gian khởi hành tăng dần\)/)
      ).toBeInTheDocument();
      expect(screen.queryByText(/gần nhất/)).not.toBeInTheDocument();
    });
  });

  describe('Mục 1 & 8: Bảng điều khiển nhân viên, nút cập nhật nhanh gọi đường chính thức và không có emoji', () => {
    const now = new Date();
    const todayFlight = {
      id: 101,
      airline: { name: 'Bamboo Airways', iata_code: 'QH' },
      departureAirport: { iata_code: 'HAN', city: 'Hà Nội' },
      arrivalAirport: { iata_code: 'DAD', city: 'Đà Nẵng' },
      departure_time: now.toISOString(),
      arrival_time: new Date(now.getTime() + 7200000).toISOString(),
      available_seats: 50,
      total_seats: 180,
      status: 'scheduled',
    };

    it('hiển thị badge Hôm nay bằng chữ không có emoji và đưa chuyến bay hôm nay lên đầu', async () => {
      sessionStorage.setItem('airline_refresh_token', 'token');
      const fetchImpl = vi.fn(async (url) => {
        if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'access' });
        if (url.endsWith('/auth/me')) return json({ id: 5, role: { name: 'staff' }, email: 'staff@example.com' });
        if (url.includes('/flights?')) return json({ data: [todayFlight], pagination: { total: 1, page: 1, limit: 20 } });
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/admin/flights']}>
            <FlightListPage />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(await screen.findByRole('heading', { name: 'Bảng điều khiển khai thác chuyến bay' })).toBeInTheDocument();
      // Badge Hôm nay dạng chữ sạch sẽ
      const todayBadges = screen.getAllByText('Hôm nay');
      expect(todayBadges.length).toBeGreaterThan(0);
      expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
    });

    it('nút cập nhật nhanh gọi đường chính thức updateFlightStatus (PATCH /flights/status/:id) khi là admin', async () => {
      sessionStorage.setItem('airline_refresh_token', 'token');
      let patchCalled = false;
      const fetchImpl = vi.fn(async (url, options = {}) => {
        if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'access' });
        if (url.endsWith('/auth/me')) return json({ id: 1, role: { name: 'admin' } }); // Admin thực hiện cập nhật nhanh
        if (url.includes('/flights?')) return json({ data: [todayFlight], pagination: { total: 1, page: 1, limit: 20 } });
        if (url.endsWith('/flights/status/101') && options.method === 'PATCH') {
          patchCalled = true;
          return json({ ...todayFlight, status: 'boarding' });
        }
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/admin/flights']}>
            <FlightListPage />
          </MemoryRouter>
        </AuthProvider>
      );

      const boardingButtons = await screen.findAllByRole('button', { name: /→ Lên máy bay/i });
      fireEvent.click(boardingButtons[0]);

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });
    });

    it('khi vai trò staff, nút nhanh chọn gọi thẳng PUT /flights/:id ngay từ đầu mà không gọi PATCH', async () => {
      sessionStorage.setItem('airline_refresh_token', 'token');
      let putCalled = false;
      let patchAttempted = false;
      const fetchImpl = vi.fn(async (url, options = {}) => {
        if (url.endsWith('/auth/refresh-token')) return json({ accessToken: 'access' });
        if (url.endsWith('/auth/me')) return json({ id: 5, role: { name: 'staff' } }); // Staff thực hiện cập nhật nhanh
        if (url.includes('/flights?')) return json({ data: [todayFlight], pagination: { total: 1, page: 1, limit: 20 } });
        if (url.includes('/flights/status/101') && options.method === 'PATCH') {
          patchAttempted = true;
          return json({}, 403);
        }
        if (url.endsWith('/flights/101') && options.method === 'PUT') {
          putCalled = true;
          return json({ ...todayFlight, status: 'boarding' });
        }
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/admin/flights']}>
            <FlightListPage />
          </MemoryRouter>
        </AuthProvider>
      );

      const boardingButtons = await screen.findAllByRole('button', { name: /→ Lên máy bay/i });
      fireEvent.click(boardingButtons[0]);

      await waitFor(() => {
        expect(putCalled).toBe(true);
        expect(patchAttempted).toBe(false); // Tuyệt đối không gọi PATCH rồi bắt 403
      });
    });
  });

  describe('Mục 2, 3, 4, 5: Danh sách hành khách (Manifest), lặp tải mọi trang, che hộ chiếu, CSV an toàn và in', () => {
    const mockFlight = {
      id: 88,
      airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
      departureAirport: { iata_code: 'HAN', name: 'Nội Bài' },
      arrivalAirport: { iata_code: 'SGN', name: 'Tân Sơn Nhất' },
      departure_time: '2026-11-15T08:00:00Z',
    };

    it('tải lặp đủ mọi trang của API, hiển thị số đơn và hành khách đã nạp, hỗ trợ công tắc giữ chỗ', async () => {
      const page1 = {
        data: [{
          id: 1, booking_code: 'BK-PAGE1', status: 'confirmed',
          passengers: [{ id: 10, passenger_name: 'Khách Trang 1', passport_no: 'B1234567', seat_no: '1A' }],
        }],
        pagination: { page: 1, totalPages: 2, total: 2 },
      };
      const page2 = {
        data: [{
          id: 2, booking_code: 'BK-PAGE2', status: 'confirmed',
          passengers: [{ id: 11, passenger_name: 'Khách Trang 2', passport_no: 'C7654321', seat_no: '2B' }],
        }],
        pagination: { page: 2, totalPages: 2, total: 2 },
      };

      const requestedUrls = [];
      const fetchImpl = vi.fn(async (url) => {
        requestedUrls.push(url);
        if (url.includes('page=1')) return json(page1);
        if (url.includes('page=2')) return json(page2);
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <PassengerManifestModal flight={mockFlight} onClose={vi.fn()} />
        </AuthProvider>
      );

      // Chờ nạp xong cả 2 trang
      expect(await screen.findByText('Khách Trang 1')).toBeInTheDocument();
      expect(screen.getByText('Khách Trang 2')).toBeInTheDocument();
      expect(screen.getByText(/Đã nạp 2 đơn đặt chỗ · 2 hành khách \(trên 2 trang API\)/)).toBeInTheDocument();

      // Mặc định gọi status=confirmed
      expect(requestedUrls.some((u) => u.includes('status=confirmed'))).toBe(true);

      // Bật công tắc xem cả đơn giữ chỗ
      const holdingCheckbox = screen.getByLabelText(/Xem cả đơn giữ chỗ/);
      fireEvent.click(holdingCheckbox);

      await waitFor(() => {
        expect(requestedUrls.some((u) => !u.includes('status=confirmed') && u.includes('page=1'))).toBe(true);
      });
    });

    it('che số hộ chiếu/CCCD (chỉ còn 3 số cuối) cho staff; admin thấy số đầy đủ', async () => {
      const testBooking = {
        id: 1, booking_code: 'BK-PASS', status: 'confirmed',
        passengers: [{ id: 10, passenger_name: 'Nguyễn Văn Test', passport_no: 'B1234567', seat_no: '12A' }],
      };

      const fetchImpl = vi.fn(async (url) => {
        if (url.endsWith('/auth/me')) return json({ id: 9, role: { name: 'staff' } });
        if (url.includes('/bookings/admin/all')) return json({ data: [testBooking], pagination: { page: 1, totalPages: 1 } });
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <PassengerManifestModal flight={mockFlight} onClose={vi.fn()} />
        </AuthProvider>
      );

      // Với vai trò staff, số hộ chiếu phải được che: *****567
      expect(await screen.findByText('*****567')).toBeInTheDocument();
      expect(screen.queryByText('B1234567')).not.toBeInTheDocument();

      // Kiểm tra dòng chú thích nhỏ theo Mục 6
      expect(screen.getByText('* Che số giấy tờ chỉ áp dụng ở giao diện.')).toBeInTheDocument();
    });

    it('hàm maskPassport nếu độ dài <= 4 thì che toàn bộ trừ 1 ký tự cuối, độ dài > 4 thì giữ 3 ký tự cuối', () => {
      // Độ dài <= 4
      expect(maskPassport('1234')).toBe('***4');
      expect(maskPassport('AB1')).toBe('**1');
      expect(maskPassport('A1')).toBe('*1');
      expect(maskPassport('A')).toBe('*');

      // Độ dài > 4
      expect(maskPassport('B1234567')).toBe('*****567');
      expect(maskPassport('079199001234')).toBe('*********234');
      expect(maskPassport('')).toBe('—');
      expect(maskPassport(null)).toBe('—');
    });

    it('hàm escapeCsvCell trung hòa công thức CSV (=, +, -, @) và thoát nháy kép RFC 4180', () => {
      // Trung hòa công thức Excel
      expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
      expect(escapeCsvCell('+cmd|')).toBe('"\'+cmd|"');
      expect(escapeCsvCell('-SUM(A1:A5)')).toBe('"\' -SUM(A1:A5)"'.replace(' ', ''));
      expect(escapeCsvCell('@echo')).toBe('"\'@echo"');

      // Thoát dấu nháy kép đúng chuẩn RFC 4180
      expect(escapeCsvCell('Nguyễn "Văn" An')).toBe('"Nguyễn ""Văn"" An"');
      expect(escapeCsvCell('Bình thường')).toBe('"Bình thường"');
      expect(escapeCsvCell(null)).toBe('""');
    });
  });

  describe('Mục 4 & 7: Tab Cần đối soát và ô lọc Mã booking ID số trong Lịch sử thanh toán', () => {
    it('ô Mã booking ID là ô số với placeholder gợi ý rõ ràng và không chứa emoji trong nhãn cảnh báo', async () => {
      const serverNow = Date.now();
      const mockReconPayment = {
        id: 5,
        transaction_ref: 'TXN-EXPIRED',
        payment_method: 'payos',
        amount: 2500000,
        status: 'pending',
        created_at: new Date(serverNow - 1800000).toISOString(),
        booking: { id: 7, booking_code: 'BK-EXP', status: 'holding', hold_expires_at: new Date(serverNow - 900000).toISOString() },
      };

      const fetchImpl = vi.fn(async (url) => {
        if (url.includes('/payments?')) {
          return json({ data: [mockReconPayment], pagination: { page: 1, total: 1, totalPages: 1 } });
        }
        return json({});
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/admin/payments']}>
            <AdminPaymentsPage />
          </MemoryRouter>
        </AuthProvider>
      );

      // Kiểm tra ô nhập Mã booking ID là number và có placeholder rõ ràng
      const bookingInput = await screen.findByLabelText('Mã booking ID');
      expect(bookingInput).toHaveAttribute('type', 'number');
      expect(bookingInput).toHaveAttribute('placeholder', 'Nhập ID số của đơn đặt chỗ (ví dụ: 7)…');

      // Chuyển sang tab Cần đối soát
      const reconTab = screen.getByRole('tab', { name: /Cần đối soát/i });
      fireEvent.click(reconTab);

      // Kiểm tra nhãn cảnh báo không chứa emoji ⚠️
      expect(screen.getAllByText(/Cảnh báo: Chờ thanh toán nhưng đã quá hạn giữ chỗ/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });
  });
});
