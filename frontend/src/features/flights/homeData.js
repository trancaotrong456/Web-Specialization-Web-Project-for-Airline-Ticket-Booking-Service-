// Dữ liệu hiển thị trang chủ Serene Flightways

export const homeOperationalNotice = {
  kicker: 'LỊCH BAY & ĐẶT CHỖ TRỰC TIẾP',
  line: 'Thanh toán qua VNPay · Vé điện tử gửi qua email',
};

export const homeDestinations = [
  {
    code: 'DAD',
    city: 'Đà Nẵng',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Miền Trung',
    note: 'Sân bay Quốc tế Đà Nẵng, kết nối Hội An và bờ biển miền Trung.',
    image: '/images/destinations/da-nang.jpg',
  },
  {
    code: 'PQC',
    city: 'Phú Quốc',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Đảo Phú Quốc',
    note: 'Sân bay Quốc tế Phú Quốc, điểm đến nghỉ dưỡng phía Nam.',
    image: '/images/destinations/phu-quoc.jpg',
  },
  {
    code: 'CXR',
    city: 'Nha Trang',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Khánh Hòa',
    note: 'Sân bay Quốc tế Cam Ranh, cách trung tâm Nha Trang 35km.',
    image: '/images/destinations/nha-trang.jpg',
  },
  {
    code: 'NRT',
    city: 'Tokyo Narita',
    country: 'NHẬT BẢN',
    tag: 'international',
    badge: 'Quốc tế',
    note: 'Sân bay Quốc tế Narita, cửa ngõ kết nối vùng đô thị Tokyo.',
    image: '/images/destinations/tokyo.jpg',
  },
  {
    code: 'HAN',
    city: 'Hà Nội',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Thủ đô Hà Nội',
    note: 'Sân bay Quốc tế Nội Bài, trung tâm hàng không phía Bắc.',
    image: '/images/destinations/hanoi.jpg',
  },
  {
    code: 'SGN',
    city: 'TP. Hồ Chí Minh',
    country: 'VIỆT NAM',
    tag: 'domestic',
    badge: 'Miền Nam',
    note: 'Sân bay Quốc tế Tân Sơn Nhất, đầu mối vận tải lớn nhất phía Nam.',
    image: '/images/destinations/ho-chi-minh-city.jpg',
  },
];

export const homeCabinClasses = [
  {
    id: 'business',
    badge: 'BUSINESS',
    tagText: 'Ghế ngả phẳng 180°',
    title: 'Hạng Thương gia',
    desc: 'Không gian riêng với quầy làm thủ tục ưu tiên và định mức hành lý 32kg.',
    image: '/images/cabins/business-class.jpg',
    features: [
      'Ghế ngả phẳng 180° thành giường nằm',
      'Quầy thủ tục và lối đi ưu tiên tại sân bay',
      '2 kiện hành lý ký gửi (tối đa 32kg/kiện)',
    ],
    ctaText: 'Xem chuyến bay Thương gia',
  },
  {
    id: 'economy-plus',
    badge: 'ECONOMY PLUS',
    tagText: 'Khoảng để chân 34 inch',
    title: 'Hạng Phổ thông đặc biệt',
    desc: 'Tăng khoảng để chân và định mức hành lý phù hợp cho chuyến bay thoải mái hơn.',
    image: '/images/cabins/economy-plus.jpg',
    features: [
      'Khoảng cách giữa hai hàng ghế 34 inch',
      '1 kiện hành lý xách tay 12kg và 1 kiện ký gửi 23kg',
      'Hành lý xách tay/ký gửi theo chính sách hạng vé',
    ],
    ctaText: 'Xem chuyến bay Phổ thông',
  },
];

export const homeWorkflows = [
  {
    step: '01',
    title: 'Tra cứu lịch bay',
    desc: 'Xem giờ bay, tình trạng chỗ và giá vé thực tế theo từng ngày.',
    actionText: 'Tìm chuyến',
    href: '#flight-search-form',
  },
  {
    step: '02',
    title: 'Giữ chỗ 15 phút',
    desc: 'Hệ thống giữ nguyên giá và chỗ trong 15 phút để bạn hoàn tất thông tin.',
    actionText: 'Quy trình vé',
    to: '/bookings/lookup',
  },
  {
    step: '03',
    title: 'Thanh toán & Nhận vé',
    desc: 'Thanh toán qua VNPay, VietQR hoặc thẻ ngân hàng; vé gửi ngay về email.',
    actionText: 'Tra cứu vé',
    to: '/bookings/lookup',
  },
];

export const homeTrustPoints = [
  {
    id: 'hold',
    title: 'Giữ chỗ 15 phút sau khi đặt',
    desc: 'Vé được giữ nguyên giá trong 15 phút để bạn điền thông tin và thanh toán an toàn.',
  },
  {
    id: 'expiry',
    title: 'Tự động hoàn chỗ khi hết hạn',
    desc: 'Đơn đặt chỗ chưa thanh toán sẽ tự động hoàn lại hệ thống cho hành khách khác.',
  },
  {
    id: 'transparency',
    title: 'Giá vé hiển thị rõ ràng',
    desc: 'Giá vé đã bao gồm đầy đủ thuế và phí sân bay theo quy định hiện hành.',
  },
];

export const paymentMethods = [
  { name: 'VNPay', label: 'Cổng VNPay' },
  { name: 'VietQR', label: 'VietQR / payOS' },
];
