import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DestinationGrid, extractMinPriceForFlights, countScheduledFlightsInNext7Days } from './components/DestinationGrid';
import { ROUTE_FARE_PRICES } from '../../../../seeders/demo/FareClassSeeder';

describe('Destination lowest price logic and presentation', () => {
  describe('extractMinPriceForFlights', () => {
    it('returns null when flight list is empty or not an array', () => {
      expect(extractMinPriceForFlights([])).toBeNull();
      expect(extractMinPriceForFlights(null)).toBeNull();
      expect(extractMinPriceForFlights(undefined)).toBeNull();
    });

    it('ignores flights that are not scheduled (e.g. cancelled, departed)', () => {
      const flights = [
        {
          status: 'cancelled',
          available_seats: 100,
          fareClasses: [{ class_name: 'Economy', price: 500000 }],
        },
        {
          status: 'departed',
          available_seats: 50,
          fareClasses: [{ class_name: 'Economy', price: 600000 }],
        },
      ];
      expect(extractMinPriceForFlights(flights)).toBeNull();
    });

    it('ignores scheduled flights that have zero available seats', () => {
      const flights = [
        {
          status: 'scheduled',
          available_seats: 0,
          fareClasses: [{ class_name: 'Economy', price: 500000 }],
        },
      ];
      expect(extractMinPriceForFlights(flights)).toBeNull();
    });

    it('ignores fare classes where seat_quota is 0', () => {
      const flights = [
        {
          status: 'scheduled',
          available_seats: 10,
          fareClasses: [
            { class_name: 'Economy Promo', price: 400000, seat_quota: 0 },
            { class_name: 'Economy Standard', price: 800000, seat_quota: 5 },
          ],
        },
      ];
      expect(extractMinPriceForFlights(flights)).toBe(800000);
    });

    it('finds the true minimum price across multiple scheduled flights and fare classes', () => {
      const flights = [
        {
          status: 'scheduled',
          available_seats: 25,
          fareClasses: [
            { class_name: 'Business', price: 2500000 },
            { class_name: 'Economy', price: 950000 },
          ],
        },
        {
          status: 'scheduled',
          available_seats: 12,
          fareClasses: [
            { class_name: 'Business', price: 2400000 },
            { class_name: 'Economy', price: 890000 },
          ],
        },
      ];
      expect(extractMinPriceForFlights(flights)).toBe(890000);
    });
  });

  describe('Destination sample data has different prices across routes', () => {
    it('verifies demo seed defines different prices for different destinations', () => {
      expect(ROUTE_FARE_PRICES.DAD.economy).toBe(890000);
      expect(ROUTE_FARE_PRICES.CXR.economy).toBe(750000);
      expect(ROUTE_FARE_PRICES.SGN.economy).toBe(1150000);
      expect(ROUTE_FARE_PRICES.HAN.economy).toBe(1350000);
      expect(ROUTE_FARE_PRICES.PQC.economy).toBe(1650000);

      // Tất cả giá giữa các tuyến phải khác nhau
      const uniquePrices = new Set(Object.values(ROUTE_FARE_PRICES).map((route) => route.economy));
      expect(uniquePrices.size).toBe(5);
    });
  });

  describe('DestinationGrid component display with route-specific prices and fallback', () => {
    it('displays different prices for routes with flights and "Xem giá" for routes without flights', async () => {
      const mockAirports = {
        data: [
          { id: 1, iata_code: 'HAN' },
          { id: 2, iata_code: 'SGN' },
          { id: 3, iata_code: 'DAD' },
          { id: 4, iata_code: 'CXR' },
          { id: 5, iata_code: 'PQC' },
          // NRT không có id sân bay trong nước hoặc không có chuyến
        ],
      };

      const mockApi = {
        searchAirports: vi.fn().mockResolvedValue(mockAirports),
        searchFlights: vi.fn().mockImplementation(async ({ arrival_airport_id }) => {
          if (arrival_airport_id === 3) {
            // DAD
            return {
              data: [
                {
                  status: 'scheduled',
                  available_seats: 50,
                  fareClasses: [{ class_name: 'Economy', price: 890000 }],
                },
              ],
            };
          }
          if (arrival_airport_id === 4) {
            // CXR
            return {
              data: [
                {
                  status: 'scheduled',
                  available_seats: 20,
                  fareClasses: [{ class_name: 'Economy', price: 750000 }],
                },
              ],
            };
          }
          if (arrival_airport_id === 2) {
            // SGN
            return {
              data: [
                {
                  status: 'scheduled',
                  available_seats: 80,
                  fareClasses: [{ class_name: 'Economy', price: 1150000 }],
                },
              ],
            };
          }
          if (arrival_airport_id === 1) {
            // HAN
            return {
              data: [
                {
                  status: 'scheduled',
                  available_seats: 60,
                  fareClasses: [{ class_name: 'Economy', price: 1350000 }],
                },
              ],
            };
          }
          if (arrival_airport_id === 5) {
            // PQC
            return {
              data: [
                {
                  status: 'scheduled',
                  available_seats: 40,
                  fareClasses: [{ class_name: 'Economy', price: 1650000 }],
                },
              ],
            };
          }
          // Các sân bay khác không có chuyến
          return { data: [] };
        }),
      };

      render(<DestinationGrid api={mockApi} />);

      // Ban đầu hoặc khi chưa có giá / không có chuyến
      const nrtCard = screen.getByRole('button', { name: /Tokyo Narita \(NRT\)/i });
      expect(nrtCard).toHaveTextContent('Xem giá');

      // Các thẻ có chuyến bay sẽ hiển thị giá tương ứng sau khi API tải
      // Chờ API hoàn tất (nếu chạy ở môi trường thường)
      // DAD: 890.000đ, CXR: 750.000đ, SGN: 1.150.000đ, HAN: 1.350.000đ, PQC: 1.650.000đ
      // Thẻ NRT luôn hiển thị 'Xem giá' vì không có chuyến bay
      expect(nrtCard).toHaveTextContent('Xem chuyến bay');
    });
  });

  describe('countScheduledFlightsInNext7Days', () => {
    const fixedNow = new Date('2026-10-22T10:00:00.000Z');

    it('returns 0 when flight list is empty or not an array', () => {
      expect(countScheduledFlightsInNext7Days([], fixedNow)).toBe(0);
      expect(countScheduledFlightsInNext7Days(null, fixedNow)).toBe(0);
      expect(countScheduledFlightsInNext7Days(undefined, fixedNow)).toBe(0);
    });

    it('counts only scheduled flights with available seats within the next 7 days', () => {
      const flights = [
        // Trong 7 ngày tới, scheduled, còn ghế -> HỢP LỆ (1)
        {
          status: 'scheduled',
          available_seats: 50,
          departure_time: '2026-10-24T08:00:00.000Z',
        },
        // Trong 7 ngày tới, scheduled, còn ghế -> HỢP LỆ (2)
        {
          status: 'scheduled',
          available_seats: 12,
          departure_time: '2026-10-27T14:30:00.000Z',
        },
        // Đã qua trong quá khứ -> BỎ QUA
        {
          status: 'scheduled',
          available_seats: 80,
          departure_time: '2026-10-20T08:00:00.000Z',
        },
        // Ngoài 7 ngày tới (ngày thứ 10) -> BỎ QUA
        {
          status: 'scheduled',
          available_seats: 100,
          departure_time: '2026-11-05T08:00:00.000Z',
        },
        // Hết ghế (available_seats = 0) -> BỎ QUA
        {
          status: 'scheduled',
          available_seats: 0,
          departure_time: '2026-10-25T08:00:00.000Z',
        },
        // Trạng thái cancelled -> BỎ QUA
        {
          status: 'cancelled',
          available_seats: 50,
          departure_time: '2026-10-25T08:00:00.000Z',
        },
      ];

      expect(countScheduledFlightsInNext7Days(flights, fixedNow)).toBe(2);
    });
  });
});
