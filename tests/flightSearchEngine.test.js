'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FlightSearchEngine,
  removeVietnameseTones,
  getSearchEngine,
} = require('../modules/flight/services/flightSearchEngine.service');

test('removeVietnameseTones correctly strips accents and preserves base characters', () => {
  assert.equal(removeVietnameseTones('Tân Sơn Nhất'), 'Tan Son Nhat');
  assert.equal(removeVietnameseTones('Đà Nẵng'), 'Da Nang');
  assert.equal(removeVietnameseTones('Hà Nội'), 'Ha Noi');
  assert.equal(removeVietnameseTones('Thành phố Hồ Chí Minh'), 'Thanh pho Ho Chi Minh');
  assert.equal(removeVietnameseTones(''), '');
  assert.equal(removeVietnameseTones(null), '');
});

test('Test 1: Gõ không dấu "tan son nhat" vẫn tìm ra "Sân bay quốc tế Tân Sơn Nhất (SGN)"', () => {
  const engine = new FlightSearchEngine();
  engine.indexAirports([
    { id: 1, iata_code: 'SGN', name: 'Sân bay quốc tế Tân Sơn Nhất (SGN)', city: 'TP. Hồ Chí Minh', country: 'Việt Nam' },
    { id: 2, iata_code: 'HAN', name: 'Sân bay quốc tế Nội Bài', city: 'Hà Nội', country: 'Việt Nam' },
    { id: 3, iata_code: 'DAD', name: 'Sân bay quốc tế Đà Nẵng (DAD)', city: 'Đà Nẵng', country: 'Việt Nam' },
  ]);

  const results = engine.searchAirports('tan son nhat');
  assert.ok(results.length > 0, 'Phải tìm thấy ít nhất một kết quả');
  assert.equal(results[0].id, 1);
  assert.equal(results[0].iata_code, 'SGN');
  assert.match(results[0].name, /Tân Sơn Nhất/i);
});

test('Test 2: Gõ sai chính tả "Vjetjet" (sai chữ j) vẫn tìm ra hãng "Vietjet Air"', () => {
  const engine = new FlightSearchEngine();
  engine.indexAirlines([
    { id: 1, iata_code: 'VN', name: 'Vietnam Airlines' },
    { id: 2, iata_code: 'VJ', name: 'Vietjet Air' },
    { id: 3, iata_code: 'QH', name: 'Bamboo Airways' },
  ]);

  const results = engine.searchAirlines('Vjetjet');
  assert.ok(results.length > 0, 'Phải tìm thấy hãng bay khi gõ sai');
  assert.equal(results[0].id, 2);
  assert.equal(results[0].iata_code, 'VJ');
  assert.equal(results[0].name, 'Vietjet Air');
});

test('Test 3: Gõ tiền tố "Dan" vẫn gợi ý ra "Đà Nẵng (DAD)"', () => {
  const engine = new FlightSearchEngine();
  engine.indexAirports([
    { id: 1, iata_code: 'SGN', name: 'Sân bay quốc tế Tân Sơn Nhất', city: 'TP. Hồ Chí Minh', country: 'Việt Nam' },
    { id: 2, iata_code: 'HAN', name: 'Sân bay quốc tế Nội Bài', city: 'Hà Nội', country: 'Việt Nam' },
    { id: 3, iata_code: 'DAD', name: 'Sân bay quốc tế Đà Nẵng (DAD)', city: 'Đà Nẵng', country: 'Việt Nam' },
  ]);

  const results = engine.searchAirports('Dan');
  assert.ok(results.length > 0, 'Phải gợi ý được sân bay theo tiền tố');
  assert.equal(results[0].id, 3);
  assert.equal(results[0].iata_code, 'DAD');
  assert.equal(results[0].city, 'Đà Nẵng');
});

test('Flight search engine indexes and searches flights with unaccented query and flight numbers', () => {
  const engine = new FlightSearchEngine();
  engine.indexFlights([
    {
      id: 101,
      flight_number: 'VN123',
      departure_airport_id: 1,
      arrival_airport_id: 2,
      airline_id: 1,
      departureAirport: { iata_code: 'SGN', city: 'TP. Hồ Chí Minh', name: 'Tân Sơn Nhất' },
      arrivalAirport: { iata_code: 'HAN', city: 'Hà Nội', name: 'Nội Bài' },
      airline: { iata_code: 'VN', name: 'Vietnam Airlines' },
      fareClasses: [{ class_name: 'Economy' }, { class_name: 'Business' }],
    },
    {
      id: 102,
      flight_number: 'VJ456',
      departure_airport_id: 2,
      arrival_airport_id: 3,
      airline_id: 2,
      departureAirport: { iata_code: 'HAN', city: 'Hà Nội', name: 'Nội Bài' },
      arrivalAirport: { iata_code: 'DAD', city: 'Đà Nẵng', name: 'Đà Nẵng' },
      airline: { iata_code: 'VJ', name: 'Vietjet Air' },
      fareClasses: [{ class_name: 'Eco' }],
    },
  ]);

  // Tìm theo số hiệu chuyến bay
  const byFlightNo = engine.searchFlights('VN123');
  assert.equal(byFlightNo[0].id, 101);

  // Tìm theo tên thành phố không dấu
  const byCity = engine.searchFlights('ha noi');
  assert.ok(byCity.length >= 1);

  // Tìm theo tên hãng mờ
  const byAirline = engine.searchFlights('Vjetjet');
  assert.equal(byAirline[0].id, 102);
});

test('getSearchEngine returns a stable singleton instance', () => {
  const instance1 = getSearchEngine();
  const instance2 = getSearchEngine();
  assert.equal(instance1, instance2);
});
