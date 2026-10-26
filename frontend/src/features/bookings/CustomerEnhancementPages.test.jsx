import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { AdminRoute } from '../../app/AdminRoute';
import { BoardingPassCard, generateFlightIcsContent, formatIcsDate, escapeIcsText } from './BoardingPassCard';
import { NotificationsPage } from '../notifications/NotificationsPage';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotFoundPage } from '../../components/NotFoundPage';
import { ForbiddenPage } from '../../components/ForbiddenPage';
import { LoginPage } from '../auth/LoginPage';
import { HoldingReminderBanner } from '../../components/AppHeader';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Đợt 7 & 7b - Cải thiện luồng khách và kiểm chứng', () => {
  describe('Mục 3, 4, 5: Vé điện tử dạng boarding pass và thêm vào lịch .ics', () => {
    const mockBooking = {
      id: 99,
      booking_code: 'SF-ABC123XYZ',
      status: 'confirmed',
      flight: {
        id: 10,
        flight_number: 'VN123',
        departure_time: '2026-11-20T08:30:00.000Z',
        arrival_time: '2026-11-20T10:45:00.000Z',
        airline: { name: 'Vietnam Airlines' },
        departureAirport: { iata_code: 'SGN', name: 'Tân Sơn Nhất', city: 'TP. Hồ Chí Minh' },
        arrivalAirport: { iata_code: 'HAN', name: 'Nội Bài', city: 'Hà Nội' },
      },
      fareClass: { class_name: 'Thương gia' },
      passengers: [
        { id: 1, passenger_name: 'Nguyễn Văn An', passport_no: 'B1234567' },
      ],
      seatAssignments: [
        { booking_passenger_id: 1, seat_no: '2A', leg_order: 1 },
      ],
    };

    it('hiển thị thẻ lên máy bay boarding pass với đầy đủ PNR, hành khách, chặng bay và ghế; vạch barcode ghi rõ là hình trang trí', () => {
      const downloadPdfMock = vi.fn();
      render(
        <MemoryRouter>
          <BoardingPassCard
            booking={mockBooking}
            onDownloadPdf={downloadPdfMock}
            downloadingPdf={false}
          />
        </MemoryRouter>
      );

      // Mã đặt chỗ xuất hiện ở cả thân thẻ chính và cuống vé
      expect(screen.getAllByText('SF-ABC123XYZ').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('VN123').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Nguyễn Văn An').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('SGN').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('HAN').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('2A').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /Tải vé điện tử PDF/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thêm vào lịch/i })).toBeInTheDocument();
      // Nhãn ghi rõ hình ảnh trang trí
      expect(screen.getByText('(Hình minh họa trang trí)')).toBeInTheDocument();
    });

    it('tạo nội dung tệp .ics chuẩn RFC 5545 chứa DTSTART/DTEND dạng UTC hậu tố Z và thoát ký tự RFC 5545', () => {
      const ics = generateFlightIcsContent({
        booking: { ...mockBooking, booking_code: 'SF,123;ABC\\XYZ\nTEST' },
        flight: mockBooking.flight,
        passengers: [{ id: 1, passenger_name: 'Trần; Nam, Hải' }],
        seatInfo: '2A',
      });

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('VN123');
      expect(ics).toContain('END:VCALENDAR');
      // Kiểm tra định dạng ngày giờ UTC đuôi Z
      expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
      expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
      // Kiểm tra thoát ký tự theo RFC 5545
      expect(ics).toContain('SF\\,123\\;ABC\\\\XYZ\\nTEST');
      expect(ics).toContain('Trần\\; Nam\\, Hải');
    });

    it('hàm formatIcsDate chuyển đổi chính xác chuyến bay 00:30 giờ Việt Nam (UTC+7) sang UTC với hậu tố Z', () => {
      // 2026-11-20T00:30:00+07:00 tương đương 2026-11-19T17:30:00Z
      const dateVn = '2026-11-20T00:30:00+07:00';
      const formatted = formatIcsDate(dateVn);
      expect(formatted).toBe('20261119T173000Z');
      expect(formatted.endsWith('Z')).toBe(true);

      // Chuyến bay bay trong 2 tiếng đến 02:30 giờ VN (+07:00) tương đương 19:30 UTC
      const arrivalVn = '2026-11-20T02:30:00+07:00';
      const arrivalFormatted = formatIcsDate(arrivalVn);
      expect(arrivalFormatted).toBe('20261119T193000Z');
    });

    it('hàm escapeIcsText thoát đúng các ký tự RFC 5545: gạch chéo ngược, chấm phẩy, phẩy và xuống dòng', () => {
      const raw = 'Hà Nội, Việt Nam; Chuyến bay\\nội địa\nCửa số 1\r\nHạng vé';
      const escaped = escapeIcsText(raw);
      expect(escaped).toBe('Hà Nội\\, Việt Nam\\; Chuyến bay\\\\nội địa\\nCửa số 1\\nHạng vé');
    });
  });

  describe('Mục 4: Trang thông báo và chuông thông báo', () => {
    it('hiển thị danh sách thông báo phân trang từ API và ghi chú giới hạn phân trang máy chủ', async () => {
      const fetchImpl = vi.fn((url, options) => {
        if (url.includes('/notifications/unread-count')) {
          return Promise.resolve(jsonResponse({ success: true, count: 1 }));
        }
        if (url.includes('/notifications') && (!options?.method || options.method === 'GET')) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                {
                  id: 101,
                  title: 'Đặt chỗ SF-12345 đã được xác nhận',
                  message: 'Thanh toán thành công. Chúc quý khách có chuyến bay tốt đẹp!',
                  related_type: 'booking',
                  related_id: 12,
                  read_at: null,
                  created_at: '2026-10-25T10:00:00.000Z',
                },
                {
                  id: 102,
                  title: 'Chuyến bay thay đổi giờ cất cánh',
                  message: 'Chuyến bay VN123 sẽ khởi hành sớm hơn 10 phút.',
                  related_type: 'flight',
                  related_id: 10,
                  read_at: '2026-10-25T11:00:00.000Z',
                  created_at: '2026-10-25T09:00:00.000Z',
                },
              ],
              pagination: { page: 1, limit: 10, totalPages: 1, total: 2 },
            })
          );
        }
        return Promise.resolve(jsonResponse({ success: true, data: null }));
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/notifications']}>
            <Routes>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(await screen.findByText('Đặt chỗ SF-12345 đã được xác nhận')).toBeInTheDocument();
      expect(screen.getByText('Chuyến bay thay đổi giờ cất cánh')).toBeInTheDocument();
      expect(
        screen.getByText(/Hiển thị theo phân trang máy chủ: tối đa 10 thông báo\/trang/i)
      ).toBeInTheDocument();
    });

    it('cho phép đánh dấu đã đọc một thông báo qua API PATCH /notifications/:id/read', async () => {
      let patchCalled = false;
      const fetchImpl = vi.fn((url, options) => {
        if (url.includes('/notifications/unread-count')) {
          return Promise.resolve(jsonResponse({ success: true, count: 1 }));
        }
        if (url.includes('/notifications/101/read') && options?.method === 'PATCH') {
          patchCalled = true;
          return Promise.resolve(jsonResponse({ success: true, data: { id: 101, read_at: new Date().toISOString() } }));
        }
        if (url.includes('/notifications') && (!options?.method || options.method === 'GET')) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                {
                  id: 101,
                  title: 'Vé máy bay đã xuất',
                  message: 'Vé điện tử đã sẵn sàng tải về.',
                  related_type: 'booking',
                  related_id: 99,
                  read_at: null,
                  created_at: '2026-10-25T10:00:00.000Z',
                },
              ],
              pagination: { page: 1, limit: 10, totalPages: 1, total: 1 },
            })
          );
        }
        return Promise.resolve(jsonResponse({ success: true, data: null }));
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/notifications']}>
            <Routes>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      const markBtn = await screen.findByRole('button', { name: /Đánh dấu thông báo "Vé máy bay đã xuất" là đã đọc/i });
      expect(markBtn).toBeInTheDocument();
      await userEvent.setup().click(markBtn);

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });
    });

    it('trang thông báo có các tab lọc Tất cả, Chưa đọc, Đã đọc', async () => {
      const fetchImpl = vi.fn((url) => {
        if (url.includes('/notifications')) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: [
                {
                  id: 1,
                  title: 'Thông báo chưa đọc',
                  message: 'Chi tiết chưa đọc',
                  read_at: null,
                  created_at: '2026-10-25T10:00:00.000Z',
                },
                {
                  id: 2,
                  title: 'Thông báo đã đọc',
                  message: 'Chi tiết đã đọc',
                  read_at: '2026-10-25T12:00:00.000Z',
                  created_at: '2026-10-25T08:00:00.000Z',
                },
              ],
              pagination: { page: 1, limit: 10, totalPages: 1, total: 2 },
            })
          );
        }
        return Promise.resolve(jsonResponse({ success: true, data: null }));
      });

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/notifications']}>
            <Routes>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(await screen.findByText('Thông báo chưa đọc')).toBeInTheDocument();
      expect(screen.getByText('Thông báo đã đọc')).toBeInTheDocument();

      // Bấm tab "Chưa đọc"
      const unreadTab = screen.getByRole('tab', { name: /Chưa đọc/i });
      await userEvent.setup().click(unreadTab);
      expect(screen.getByText('Thông báo chưa đọc')).toBeInTheDocument();
      expect(screen.queryByText('Thông báo đã đọc')).not.toBeInTheDocument();

      // Bấm tab "Đã đọc"
      const readTab = screen.getByRole('tab', { name: /Đã đọc/i });
      await userEvent.setup().click(readTab);
      expect(screen.getByText('Thông báo đã đọc')).toBeInTheDocument();
      expect(screen.queryByText('Thông báo chưa đọc')).not.toBeInTheDocument();
    });
  });

  describe('Mục 5: Trang 404, 403 thân thiện và thông báo phiên hết hạn', () => {
    it('trang 404 NotFoundPage hiển thị thông điệp thân thiện và các nút điều hướng', () => {
      render(
        <AuthProvider>
          <MemoryRouter>
            <NotFoundPage />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(screen.getByText('MÃ LỖI 404')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy trang')).toBeInTheDocument();
      expect(screen.getAllByText('Về trang chủ').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Tìm chuyến bay').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Tra cứu đặt chỗ').length).toBeGreaterThanOrEqual(1);
    });

    it('trang 403 ForbiddenPage hiển thị thông điệp thân thiện và quyền hạn', () => {
      render(
        <AuthProvider>
          <MemoryRouter>
            <ForbiddenPage />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(screen.getByText('MÃ LỖI 403')).toBeInTheDocument();
      expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
      expect(screen.getAllByText('Về trang chủ').length).toBeGreaterThanOrEqual(1);
    });

    it('trang LoginPage KHÔNG hiển thị thông báo phiên hết hạn cho người mới truy cập bình thường', () => {
      try { sessionStorage.removeItem('airline_session_expired'); } catch {}
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(
        screen.queryByText('Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.')
      ).not.toBeInTheDocument();
    });

    it('trang LoginPage hiển thị thông báo phiên hết hạn khi nhận sessionExpired từ state', () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={[{ pathname: '/login', state: { sessionExpired: true } }]}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      );

      expect(
        screen.getByText('Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.')
      ).toBeInTheDocument();
    });
  });

  describe('Mục 7: Route guard /admin chuyển hướng /login cho người chưa đăng nhập và /forbidden cho sai vai trò', () => {
    it('chuyển hướng người chưa đăng nhập về /login khi truy cập /admin', async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin']}>
            <Routes>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<div>Trang quản trị bí mật</div>} />
              </Route>
              <Route path="/login" element={<div>Trang đăng nhập</div>} />
              <Route path="/forbidden" element={<div>Trang 403 cấm truy cập</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      // Đợi xác thực ẩn danh xong
      expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
      expect(screen.queryByText('Trang quản trị bí mật')).not.toBeInTheDocument();
    });

    it('chuyển hướng người đã đăng nhập nhưng sai vai trò (user thường) về /forbidden', async () => {
      // Mock refresh trả về token và profile user
      const fetchImpl = vi.fn((url) => {
        if (url.includes('/auth/refresh')) {
          return Promise.resolve(jsonResponse({ success: true, accessToken: 'mock-token', refreshToken: 'mock-refresh' }));
        }
        if (url.includes('/auth/me')) {
          return Promise.resolve(jsonResponse({ success: true, user: { id: 1, email: 'khach@test.com', role: 'user' } }));
        }
        return Promise.resolve(jsonResponse({ success: true }));
      });

      // Giả lập đã có refresh token trong storage
      const tokenKey = 'airline_refresh_token';
      window.localStorage.setItem(tokenKey, 'existing-token');

      render(
        <AuthProvider fetchImpl={fetchImpl}>
          <MemoryRouter initialEntries={['/admin']}>
            <Routes>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<div>Trang quản trị bí mật</div>} />
              </Route>
              <Route path="/login" element={<div>Trang đăng nhập</div>} />
              <Route path="/forbidden" element={<div>Trang 403 cấm truy cập</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(await screen.findByText('Trang 403 cấm truy cập')).toBeInTheDocument();
      expect(screen.queryByText('Trang quản trị bí mật')).not.toBeInTheDocument();

      window.localStorage.removeItem(tokenKey);
    });
  });

  describe('Mục 9: Dải nhắc giữ chỗ HoldingReminderBanner trên header', () => {
    it('ẩn dải nhắc giữ chỗ khi người dùng đang ở chính trang thanh toán của đơn đó', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        data: [
          {
            id: 88,
            booking_code: 'SF-HOLD88',
            status: 'holding',
            hold_expires_at: new Date(Date.now() + 600000).toISOString(),
          },
        ],
      });

      const { container } = render(
        <MemoryRouter initialEntries={['/bookings/88/payment']}>
          <HoldingReminderBanner
            request={mockRequest}
            authenticated={true}
            user={{ id: 1, role: 'user' }}
            currentPath="/bookings/88/payment"
          />
        </MemoryRouter>
      );

      // Banner phải ẩn khi ở chính trang /bookings/88/payment
      expect(container.firstChild).toBeNull();
    });

    it('ẩn dải nhắc giữ chỗ khi người dùng có vai trò là admin hoặc staff', async () => {
      const mockRequest = vi.fn();

      const { container } = render(
        <MemoryRouter initialEntries={['/flights/search']}>
          <HoldingReminderBanner
            request={mockRequest}
            authenticated={true}
            user={{ id: 1, role: 'admin' }}
            currentPath="/flights/search"
          />
        </MemoryRouter>
      );

      // Banner hoàn toàn không kích hoạt với admin
      expect(container.firstChild).toBeNull();
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('hiển thị dải nhắc giữ chỗ khi là vai trò khách hàng trên các trang khác', async () => {
      const mockRequest = vi.fn().mockResolvedValue({
        data: [
          {
            id: 88,
            booking_code: 'SF-HOLD88',
            status: 'holding',
            hold_expires_at: new Date(Date.now() + 600000).toISOString(),
          },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/flights/search']}>
          <HoldingReminderBanner
            request={mockRequest}
            authenticated={true}
            user={{ id: 1, role: 'user' }}
            currentPath="/flights/search"
          />
        </MemoryRouter>
      );

      expect(await screen.findByText(/SF-HOLD88/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Thanh toán ngay →/i })).toHaveAttribute(
        'href',
        '/bookings/88/payment'
      );
    });
  });
});

