'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FlightSearchEngine,
  removeVietnameseTones,
  getSearchEngine,
} = require('../modules/flight/services/flightSearchEngine.service');

function createMockEsClient(hits = []) {
  return {
    ping: async () => true,
    info: async () => ({ version: { number: '8.11.0' } }),
    indices: {
      exists: async () => true,
      create: async () => ({ acknowledged: true }),
    },
    index: async () => ({ result: 'created' }),
    delete: async () => ({ result: 'deleted' }),
    bulk: async () => ({ errors: false, items: [] }),
    search: async (params) => ({
      hits: {
        total: { value: hits.length, relation: 'eq' },
        max_score: 1.0,
        hits,
      },
    }),
  };
}

test('removeVietnameseTones correctly strips accents and preserves base characters', () => {
  assert.equal(removeVietnameseTones('Tân Sơn Nhất'), 'Tan Son Nhat');
  assert.equal(removeVietnameseTones('Đà Nẵng'), 'Da Nang');
  assert.equal(removeVietnameseTones('Hà Nội'), 'Ha Noi');
  assert.equal(removeVietnameseTones('Thành phố Hồ Chí Minh'), 'Thanh pho Ho Chi Minh');
  assert.equal(removeVietnameseTones(''), '');
  assert.equal(removeVietnameseTones(null), '');
});

test('Test 1: Gõ không dấu "tan son nhat" vẫn tìm ra "Sân bay quốc tế Tân Sơn Nhất (SGN)" qua Elasticsearch', async () => {
  const mockClient = createMockEsClient([
    {
      _id: '1',
      _score: 4.2,
      _source: { id: 1, iata_code: 'SGN', name: 'Sân bay quốc tế Tân Sơn Nhất (SGN)', city: 'TP. Hồ Chí Minh', country: 'Việt Nam' },
    },
  ]);

  const engine = new FlightSearchEngine({ client: mockClient });
  const results = await engine.searchAirports('tan son nhat');

  assert.ok(results.length > 0, 'Phải tìm thấy ít nhất một kết quả');
  assert.equal(results[0].id, 1);
  assert.equal(results[0].iata_code, 'SGN');
  assert.match(results[0].name, /Tân Sơn Nhất/i);
  assert.equal(results.source, 'elasticsearch');
});

test('Test 2: Gõ sai chính tả "Vjetjet" (sai chữ j) vẫn tìm ra chuyến bay hãng "Vietjet Air" qua Elasticsearch fuzzy', async () => {
  const mockClient = createMockEsClient([
    {
      _id: '2',
      _score: 3.5,
      _source: { id: 2, flight_number: 'VJ456', airline_name: 'Vietjet Air', departure_airport_city: 'Hà Nội', arrival_airport_city: 'Đà Nẵng' },
    },
  ]);

  const engine = new FlightSearchEngine({ client: mockClient });
  const results = await engine.searchFlights('Vjetjet');

  assert.ok(results.length > 0, 'Phải tìm thấy chuyến bay của hãng khi gõ sai');
  assert.equal(results[0].id, 2);
  assert.equal(results[0].flight_number, 'VJ456');
  assert.equal(results[0].airline_name, 'Vietjet Air');
});

test('Test 3: Gõ tiền tố "Dan" vẫn gợi ý ra "Đà Nẵng (DAD)" qua Elasticsearch match_bool_prefix', async () => {
  const mockClient = createMockEsClient([
    {
      _id: '3',
      _score: 3.1,
      _source: { id: 3, iata_code: 'DAD', name: 'Sân bay quốc tế Đà Nẵng (DAD)', city: 'Đà Nẵng', country: 'Việt Nam' },
    },
  ]);

  const engine = new FlightSearchEngine({ client: mockClient });
  const results = await engine.searchAirports('Dan');

  assert.ok(results.length > 0, 'Phải gợi ý được sân bay theo tiền tố');
  assert.equal(results[0].id, 3);
  assert.equal(results[0].iata_code, 'DAD');
  assert.equal(results[0].city, 'Đà Nẵng');
});

test('Flight search engine searches flights with flight number via Elasticsearch', async () => {
  const mockClient = createMockEsClient([
    {
      _id: '101',
      _score: 5.0,
      _source: { id: 101, flight_number: 'VN123', airline_name: 'Vietnam Airlines', departure_airport_city: 'TP. Hồ Chí Minh', arrival_airport_city: 'Hà Nội' },
    },
  ]);

  const engine = new FlightSearchEngine({ client: mockClient });

  const byFlightNo = await engine.searchFlights('VN123');
  assert.equal(byFlightNo[0].id, 101);
  assert.equal(byFlightNo[0].flight_number, 'VN123');
});

test('getSearchEngine returns a stable singleton instance', () => {
  const instance1 = getSearchEngine();
  const instance2 = getSearchEngine();
  assert.equal(instance1, instance2);
});
