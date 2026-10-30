import { HomePage } from './HomePage';

/**
 * Trang tìm kiếm chuyến bay đa chặng (Nhiều chặng)
 * Đồng bộ hoàn toàn 100% với giao diện Khứ hồi và Một chiều của Serene Flightways.
 */
export function MultiCitySearchPage() {
  return <HomePage forcedTripType="multi_city" />;
}
