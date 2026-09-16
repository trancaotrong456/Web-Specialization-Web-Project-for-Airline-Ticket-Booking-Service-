'use strict';

const airportsData = [
  // Việt Nam (22 sân bay thương mại)
  { iata_code: 'SGN', name: 'Sân bay quốc tế Tân Sơn Nhất', city: 'Hồ Chí Minh', country: 'Việt Nam' },
  { iata_code: 'HAN', name: 'Sân bay quốc tế Nội Bài', city: 'Hà Nội', country: 'Việt Nam' },
  { iata_code: 'DAD', name: 'Sân bay quốc tế Đà Nẵng', city: 'Đà Nẵng', country: 'Việt Nam' },
  { iata_code: 'CXR', name: 'Sân bay quốc tế Cam Ranh', city: 'Nha Trang', country: 'Việt Nam' },
  { iata_code: 'PQC', name: 'Sân bay quốc tế Phú Quốc', city: 'Phú Quốc', country: 'Việt Nam' },
  { iata_code: 'HPH', name: 'Sân bay quốc tế Cát Bi', city: 'Hải Phòng', country: 'Việt Nam' },
  { iata_code: 'VCA', name: 'Sân bay quốc tế Cần Thơ', city: 'Cần Thơ', country: 'Việt Nam' },
  { iata_code: 'VII', name: 'Sân bay quốc tế Vinh', city: 'Vinh', country: 'Việt Nam' },
  { iata_code: 'HUI', name: 'Sân bay quốc tế Phú Bài', city: 'Huế', country: 'Việt Nam' },
  { iata_code: 'THD', name: 'Sân bay Thọ Xuân', city: 'Thanh Hóa', country: 'Việt Nam' },
  { iata_code: 'VDO', name: 'Sân bay quốc tế Vân Đồn', city: 'Quảng Ninh', country: 'Việt Nam' },
  { iata_code: 'PXU', name: 'Sân bay Pleiku', city: 'Pleiku', country: 'Việt Nam' },
  { iata_code: 'UIH', name: 'Sân bay Phù Cát', city: 'Quy Nhơn', country: 'Việt Nam' },
  { iata_code: 'TBB', name: 'Sân bay Tuy Hòa', city: 'Tuy Hòa', country: 'Việt Nam' },
  { iata_code: 'BMV', name: 'Sân bay Buôn Ma Thuột', city: 'Buôn Ma Thuột', country: 'Việt Nam' },
  { iata_code: 'DLI', name: 'Sân bay Liên Khương', city: 'Đà Lạt', country: 'Việt Nam' },
  { iata_code: 'DIN', name: 'Sân bay Điện Biên Phủ', city: 'Điện Biên', country: 'Việt Nam' },
  { iata_code: 'VCS', name: 'Sân bay Côn Đảo', city: 'Côn Đảo', country: 'Việt Nam' },
  { iata_code: 'VKG', name: 'Sân bay Rạch Giá', city: 'Rạch Giá', country: 'Việt Nam' },
  { iata_code: 'CAH', name: 'Sân bay Cà Mau', city: 'Cà Mau', country: 'Việt Nam' },
  { iata_code: 'VCL', name: 'Sân bay Chu Lai', city: 'Quảng Nam', country: 'Việt Nam' },
  { iata_code: 'VDH', name: 'Sân bay Đồng Hới', city: 'Đồng Hới', country: 'Việt Nam' },

  // Quốc tế phổ biến
  { iata_code: 'SIN', name: 'Sân bay Changi Singapore', city: 'Singapore', country: 'Singapore' },
  { iata_code: 'BKK', name: 'Sân bay Suvarnabhumi', city: 'Bangkok', country: 'Thái Lan' },
  { iata_code: 'DMK', name: 'Sân bay Don Mueang', city: 'Bangkok', country: 'Thái Lan' },
  { iata_code: 'KUL', name: 'Sân bay quốc tế Kuala Lumpur', city: 'Kuala Lumpur', country: 'Malaysia' },
  { iata_code: 'ICN', name: 'Sân bay quốc tế Incheon', city: 'Seoul', country: 'Hàn Quốc' },
  { iata_code: 'NRT', name: 'Sân bay quốc tế Narita', city: 'Tokyo', country: 'Nhật Bản' },
  { iata_code: 'HND', name: 'Sân bay Haneda', city: 'Tokyo', country: 'Nhật Bản' },
  { iata_code: 'KIX', name: 'Sân bay quốc tế Kansai', city: 'Osaka', country: 'Nhật Bản' },
  { iata_code: 'HKG', name: 'Sân bay quốc tế Hồng Kông', city: 'Hồng Kông', country: 'Trung Quốc' },
  { iata_code: 'TPE', name: 'Sân bay quốc tế Đào Viên', city: 'Đài Bắc', country: 'Đài Loan' },
  { iata_code: 'DXB', name: 'Sân bay quốc tế Dubai', city: 'Dubai', country: 'UAE' },
  { iata_code: 'DOH', name: 'Sân bay quốc tế Hamad', city: 'Doha', country: 'Qatar' },
  { iata_code: 'CDG', name: 'Sân bay Paris Charles de Gaulle', city: 'Paris', country: 'Pháp' },
  { iata_code: 'LHR', name: 'Sân bay London Heathrow', city: 'London', country: 'Vương quốc Anh' },
  { iata_code: 'FRA', name: 'Sân bay Frankfurt', city: 'Frankfurt', country: 'Đức' },
  { iata_code: 'JFK', name: 'Sân bay John F. Kennedy', city: 'New York', country: 'Hoa Kỳ' },
  { iata_code: 'LAX', name: 'Sân bay Los Angeles', city: 'Los Angeles', country: 'Hoa Kỳ' },
  { iata_code: 'SYD', name: 'Sân bay Sydney Kingsford Smith', city: 'Sydney', country: 'Úc' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = airportsData.map((item, index) => ({
      id: index + 1,
      iata_code: item.iata_code,
      name: item.name,
      city: item.city,
      country: item.country,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('airports', rows, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('airports', null, {});
  },
};
