'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkElasticsearchHealth,
} = require('../infrastructure/elasticsearch/elasticsearchClient');
const {
  INDEX_NAMES,
  COMMON_ANALYSIS_SETTINGS,
  AIRPORTS_INDEX_CONFIG,
  FLIGHTS_INDEX_CONFIG,
  ensureIndicesExist,
} = require('../infrastructure/elasticsearch/indexManager');
const {
  formatAirportDoc,
  formatFlightDoc,
  syncAllAirports,
  syncAllFlights,
  syncAllToElasticsearch,
} = require('../infrastructure/elasticsearch/elasticsearchSync');
const {
  FlightSearchEngine,
  removeVietnameseTones,
} = require('../modules/flight/services/flightSearchEngine.service');
const AirportService = require('../modules/airport/airport.service');
const FlightService = require('../modules/flight/flight.service');

// ─── HELPER: TẠO MOCK ELASTICSEARCH CLIENT ────────────────────────────────────

function createMockEsClient({ shouldFail = false, searchHits = [] } = {}) {
  const operations = [];
  return {
    operations,
    ping: async () => {
      if (shouldFail) throw new Error('Connection refused to Elasticsearch:9200');
      return true;
    },
    info: async () => {
      if (shouldFail) throw new Error('Cluster unavailable');
      return { version: { number: '8.11.0' }, cluster_name: 'docker-cluster' };
    },
    indices: {
      exists: async ({ index }) => {
        operations.push({ action: 'indices.exists', index });
        return false;
      },
      create: async ({ index, body, ...rest }) => {
        operations.push({ action: 'indices.create', index, body: { ...body, ...rest } });
        return { acknowledged: true };
      },
    },
    bulk: async ({ operations: bulkOps, refresh }) => {
      if (shouldFail) throw new Error('Bulk indexing failed');
      operations.push({ action: 'bulk', count: bulkOps.length / 2, refresh });
      return { errors: false, items: [] };
    },
    index: async ({ index, id, document, refresh }) => {
      if (shouldFail) throw new Error('Document indexing failed');
      operations.push({ action: 'index', index, id, document, refresh });
      return { result: 'created', _id: id };
    },
    delete: async ({ index, id, refresh }) => {
      if (shouldFail) throw new Error('Document deletion failed');
      operations.push({ action: 'delete', index, id, refresh });
      return { result: 'deleted', _id: id };
    },
    search: async (params) => {
      if (shouldFail) throw new Error('Elasticsearch search timeout');
      operations.push({ action: 'search', params });
      return {
        hits: {
          total: { value: searchHits.length, relation: 'eq' },
          max_score: 1.5,
          hits: searchHits,
        },
      };
    },
  };
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

test('1. checkElasticsearchHealth reports online and offline states accurately', async () => {
  const onlineClient = createMockEsClient({ shouldFail: false });
  const healthOnline = await checkElasticsearchHealth(onlineClient);
  assert.equal(healthOnline.isAvailable, true);
  assert.equal(healthOnline.status, 'green');
  assert.equal(healthOnline.clusterInfo?.version?.number, '8.11.0');

  const offlineClient = createMockEsClient({ shouldFail: true });
  const healthOffline = await checkElasticsearchHealth(offlineClient);
  assert.equal(healthOffline.isAvailable, false);
  assert.equal(healthOffline.status, 'unavailable');
  assert.match(healthOffline.error, /Connection refused/i);
});

test('2. ensureIndicesExist creates airports and flights indices with vi_analyzer and asciifolding', async () => {
  const mockClient = createMockEsClient();
  const result = await ensureIndicesExist(mockClient);

  assert.deepEqual(result.created, [INDEX_NAMES.AIRPORTS, INDEX_NAMES.FLIGHTS]);
  assert.equal(mockClient.operations.length, 4); // 2 exists checks + 2 creates

  // Kiểm tra mapping & analyzer của airports
  const airportCreateOp = mockClient.operations.find((op) => op.action === 'indices.create' && op.index === 'airports');
  assert.ok(airportCreateOp, 'Phải có thao tác tạo index airports');
  const analyzer = airportCreateOp.body.settings.analysis.analyzer.vi_analyzer;
  assert.equal(analyzer.type, 'custom');
  assert.equal(analyzer.tokenizer, 'standard');
  assert.deepEqual(analyzer.filter, ['lowercase', 'asciifolding']);
  assert.equal(airportCreateOp.body.mappings.properties.iata_code.type, 'keyword');
  assert.equal(airportCreateOp.body.mappings.properties.name.analyzer, 'vi_analyzer');

  // Kiểm tra mapping & analyzer của flights
  const flightCreateOp = mockClient.operations.find((op) => op.action === 'indices.create' && op.index === 'flights');
  assert.ok(flightCreateOp, 'Phải có thao tác tạo index flights');
  assert.equal(flightCreateOp.body.mappings.properties.flight_number.type, 'keyword');
  assert.equal(flightCreateOp.body.mappings.properties.airline_name.analyzer, 'vi_analyzer');
});

test('3. Document formatters preserve database keys and format fields cleanly', () => {
  const airportDoc = formatAirportDoc({
    id: 1,
    iata_code: ' sgn ',
    name: ' Sân bay Tân Sơn Nhất ',
    city: ' TP. Hồ Chí Minh ',
    country: ' Việt Nam ',
  });
  assert.deepEqual(airportDoc, {
    id: 1,
    iata_code: 'SGN',
    name: 'Sân bay Tân Sơn Nhất',
    city: 'TP. Hồ Chí Minh',
    country: 'Việt Nam',
  });

  const flightDoc = formatFlightDoc({
    id: 10,
    flight_number: 'VN123',
    status: 'scheduled',
    airline_id: 2,
    departure_airport_id: 1,
    arrival_airport_id: 3,
    airline: { id: 2, name: 'Vietnam Airlines', iata_code: 'VN' },
    departureAirport: { id: 1, name: 'Tân Sơn Nhất', city: 'Hồ Chí Minh', iata_code: 'SGN' },
    arrivalAirport: { id: 3, name: 'Nội Bài', city: 'Hà Nội', iata_code: 'HAN' },
    fareClasses: [{ class_name: 'Phổ thông' }, { class_name: 'Thương gia' }],
  });
  assert.equal(flightDoc.id, 10);
  assert.equal(flightDoc.flight_number, 'VN123');
  assert.equal(flightDoc.airline_name, 'Vietnam Airlines');
  assert.equal(flightDoc.departure_airport_code, 'SGN');
  assert.equal(flightDoc.arrival_airport_code, 'HAN');
  assert.equal(flightDoc.fare_classes, 'Phổ thông Thương gia');
});

test('4. Bulk sync synchronizes both Airports and Flights into Elasticsearch with stable IDs', async () => {
  const mockClient = createMockEsClient();
  const mockModels = {
    Airport: {
      findAll: async () => [
        { id: 1, iata_code: 'SGN', name: 'Tân Sơn Nhất', city: 'TP. Hồ Chí Minh', country: 'Việt Nam' },
        { id: 2, iata_code: 'HAN', name: 'Nội Bài', city: 'Hà Nội', country: 'Việt Nam' },
      ],
    },
    Flight: {
      findAll: async () => [
        {
          id: 101,
          flight_number: 'VN101',
          status: 'scheduled',
          airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
          departureAirport: { name: 'Tân Sơn Nhất', city: 'TP. Hồ Chí Minh', iata_code: 'SGN' },
          arrivalAirport: { name: 'Nội Bài', city: 'Hà Nội', iata_code: 'HAN' },
          fareClasses: [{ class_name: 'Economy' }],
        },
      ],
    },
  };

  const syncResult = await syncAllToElasticsearch({ models: mockModels, client: mockClient });
  assert.equal(syncResult.airports.total, 2);
  assert.equal(syncResult.airports.indexed, 2);
  assert.equal(syncResult.airports.errors, 0);

  assert.equal(syncResult.flights.total, 1);
  assert.equal(syncResult.flights.indexed, 1);
  assert.equal(syncResult.flights.errors, 0);

  const bulkOps = mockClient.operations.filter((op) => op.action === 'bulk');
  assert.equal(bulkOps.length, 2, 'Phải có 2 lượt bulk sync: 1 cho airport, 1 cho flight');
});

test('5. FlightSearchEngine.searchAirports executes bool.should query with match, fuzziness: AUTO, and match_bool_prefix', async () => {
  const mockClient = createMockEsClient({
    searchHits: [
      {
        _id: '1',
        _score: 3.8,
        _source: { id: 1, iata_code: 'SGN', name: 'Sân bay quốc tế Tân Sơn Nhất', city: 'TP. Hồ Chí Minh' },
      },
    ],
  });

  const engine = new FlightSearchEngine({ client: mockClient });
  const results = await engine.searchAirports('Tan Son Nhat');

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 1);
  assert.equal(results[0].source, 'elasticsearch');
  assert.equal(results.fallback, false);

  const searchOp = mockClient.operations.find((op) => op.action === 'search');
  assert.ok(searchOp, 'Thao tác search phải được gọi trên Elasticsearch client');
  assert.equal(searchOp.params.index, 'airports');

  const boolQuery = searchOp.params.query.bool;
  assert.ok(boolQuery.should.length >= 4, 'Phải có các điều kiện should cho iata_code, name, city');
  assert.equal(boolQuery.minimum_should_match, 1);

  // Kiểm tra có match fuzziness: AUTO và match_bool_prefix
  const hasFuzzyName = boolQuery.should.some((s) => s.match?.name?.fuzziness === 'AUTO');
  const hasPrefixName = boolQuery.should.some((s) => Boolean(s.match_bool_prefix?.name));
  const hasFuzzyCity = boolQuery.should.some((s) => s.match?.city?.fuzziness === 'AUTO');
  const hasPrefixCity = boolQuery.should.some((s) => Boolean(s.match_bool_prefix?.city));

  assert.ok(hasFuzzyName, 'Phải có fuzzy search trên tên sân bay');
  assert.ok(hasPrefixName, 'Phải có match_bool_prefix trên tên sân bay');
  assert.ok(hasFuzzyCity, 'Phải có fuzzy search trên thành phố');
  assert.ok(hasPrefixCity, 'Phải có match_bool_prefix trên thành phố');
});

test('6. FlightSearchEngine.searchFlights executes bool.should query on flight_number, airline, and airports with fuzzy and prefix', async () => {
  const mockClient = createMockEsClient({
    searchHits: [
      {
        _id: '101',
        _score: 4.5,
        _source: { id: 101, flight_number: 'VN123', airline_name: 'Vietnam Airlines', departure_airport_city: 'TP. Hồ Chí Minh', arrival_airport_city: 'Hà Nội' },
      },
    ],
  });

  const engine = new FlightSearchEngine({ client: mockClient });
  const results = await engine.searchFlights('Vjetjet'); // Gõ sai

  assert.equal(results.length, 1);
  assert.equal(results[0].id, 101);
  assert.equal(results[0].source, 'elasticsearch');

  const searchOp = mockClient.operations.find((op) => op.action === 'search');
  assert.ok(searchOp);
  assert.equal(searchOp.params.index, 'flights');

  const boolQuery = searchOp.params.query.bool;
  const hasFuzzyAirline = boolQuery.should.some((s) => s.match?.airline_name?.fuzziness === 'AUTO');
  const hasPrefixFlightNo = boolQuery.should.some((s) => Boolean(s.match_bool_prefix?.flight_number));

  assert.ok(hasFuzzyAirline, 'Phải có fuzzy search trên tên hãng');
  assert.ok(hasPrefixFlightNo, 'Phải có match_bool_prefix trên số hiệu chuyến bay');
});

test('7. Empty search returns empty results without querying Elasticsearch', async () => {
  const mockClient = createMockEsClient();
  const engine = new FlightSearchEngine({ client: mockClient });

  const airports = await engine.searchAirports('   ');
  const flights = await engine.searchFlights('');

  assert.deepEqual(airports, []);
  assert.deepEqual(flights, []);
  assert.equal(mockClient.operations.length, 0, 'Không được gọi Elasticsearch khi từ khóa rỗng');
});

test('8. Elasticsearch offline triggers seamless Database Fallback without crash', async () => {
  const failingClient = createMockEsClient({ shouldFail: true });
  const engine = new FlightSearchEngine({ client: failingClient });

  // 1. Kiểm tra Airport Search Fallback
  const airportRes = await engine.searchAirports('Da Nang');
  assert.equal(airportRes.fallback, true);
  assert.equal(airportRes.source, 'database');
  assert.match(airportRes.error, /Elasticsearch search timeout/);

  // 2. Kiểm tra Flight Search Fallback
  const flightRes = await engine.searchFlights('VN123');
  assert.equal(flightRes.fallback, true);
  assert.equal(flightRes.source, 'database');
  assert.match(flightRes.error, /Elasticsearch search timeout/);
});

test('9. AirportService and FlightService delegate to Elasticsearch when available and fallback to Database LIKE when offline', async () => {
  // TH1: Elasticsearch HOẠT ĐỘNG
  const onlineClient = createMockEsClient({
    searchHits: [
      { _id: '1', _score: 2.0, _source: { id: 1 } },
      { _id: '2', _score: 1.8, _source: { id: 2 } },
    ],
  });
  const onlineEngine = new FlightSearchEngine({ client: onlineClient });

  let recordedAirportQuery = null;
  const mockAirportRepo = {
    findPage: async (q) => {
      recordedAirportQuery = q;
      return { count: 2, rows: [{ id: 1, name: 'SGN' }, { id: 2, name: 'HAN' }] };
    },
  };

  const airportService = new AirportService({
    repository: mockAirportRepo,
    searchEngine: onlineEngine,
  });

  const airportPage = await airportService.getAll({ page: 1, limit: 10, search: 'noi bai' });
  assert.equal(airportPage.total, 2);
  assert.equal(recordedAirportQuery.fromElasticsearch, true);
  assert.deepEqual(recordedAirportQuery.matchingIds, [1, 2]);

  // TH2: Elasticsearch GẶP SỰ CỐ -> FALLBACK SANG DATABASE
  const offlineClient = createMockEsClient({ shouldFail: true });
  const offlineEngine = new FlightSearchEngine({ client: offlineClient });

  let fallbackAirportQuery = null;
  const mockFallbackAirportRepo = {
    findPage: async (q) => {
      fallbackAirportQuery = q;
      return { count: 1, rows: [{ id: 3, name: 'DAD' }] };
    },
  };

  const fallbackAirportService = new AirportService({
    repository: mockFallbackAirportRepo,
    searchEngine: offlineEngine,
  });

  const fallbackPage = await fallbackAirportService.getAll({ page: 1, limit: 10, search: 'da nang' });
  assert.equal(fallbackPage.total, 1);
  assert.equal(fallbackAirportQuery.fromDatabaseFallback, true);
  assert.equal(fallbackAirportQuery.fromElasticsearch, undefined);
  assert.equal(fallbackAirportQuery.matchingIds, undefined);
});

test('10. FlightService search preserves business filters when using Elasticsearch or Database Fallback', async () => {
  // TH1: Elasticsearch trả về 1 chuyến bay khớp keyword
  const onlineClient = createMockEsClient({
    searchHits: [{ _id: '101', _score: 3.0, _source: { id: 101 } }],
  });
  const onlineEngine = new FlightSearchEngine({ client: onlineClient });

  let repoFlightQuery = null;
  const mockFlightRepo = {
    searchPage: async (q) => {
      repoFlightQuery = q;
      return { count: 1, rows: [{ id: 101, flight_number: 'VN101' }] };
    },
  };

  const flightService = new FlightService({
    repository: mockFlightRepo,
    searchEngine: onlineEngine,
  });

  await flightService.searchFlights({
    search: 'VN101',
    departure_airport_id: 1,
    arrival_airport_id: 2,
    min_seats: 2,
    departure_date: '2026-11-10',
  });

  assert.equal(repoFlightQuery.fromElasticsearch, true);
  assert.deepEqual(repoFlightQuery.matchingFlightIds, [101]);
  assert.equal(repoFlightQuery.departure_airport_id, 1);
  assert.equal(repoFlightQuery.arrival_airport_id, 2);
  assert.equal(repoFlightQuery.min_seats, 2);

  // TH2: Elasticsearch lỗi -> Fallback sang Database LIKE
  const offlineClient = createMockEsClient({ shouldFail: true });
  const offlineEngine = new FlightSearchEngine({ client: offlineClient });

  let fallbackFlightQuery = null;
  const mockFallbackFlightRepo = {
    searchPage: async (q) => {
      fallbackFlightQuery = q;
      return { count: 1, rows: [{ id: 102, flight_number: 'VN102' }] };
    },
  };

  const fallbackFlightService = new FlightService({
    repository: mockFallbackFlightRepo,
    searchEngine: offlineEngine,
  });

  await flightService.searchFlights.call(fallbackFlightService, {
    q: 'VN102',
    min_seats: 1,
  });

  assert.equal(fallbackFlightQuery.fromDatabaseFallback, true);
  assert.equal(fallbackFlightQuery.searchKeyword, 'VN102');
  assert.equal(fallbackFlightQuery.fromElasticsearch, undefined);
});

test('11. CRUD operations on Airport and Flight index and delete documents in Elasticsearch', async () => {
  const mockClient = createMockEsClient();
  const engine = new FlightSearchEngine({ client: mockClient });

  // 1. Thêm Airport
  await engine.addAirport({ id: 5, iata_code: 'PQC', name: 'Phú Quốc', city: 'Kiên Giang' });
  const addAirportOp = mockClient.operations.find((op) => op.action === 'index' && op.index === 'airports');
  assert.ok(addAirportOp);
  assert.equal(addAirportOp.id, '5');
  assert.equal(addAirportOp.document.iata_code, 'PQC');

  // 2. Xóa Airport
  await engine.removeAirport(5);
  const deleteAirportOp = mockClient.operations.find((op) => op.action === 'delete' && op.index === 'airports');
  assert.ok(deleteAirportOp);
  assert.equal(deleteAirportOp.id, '5');

  // 3. Thêm Flight
  await engine.addFlight({
    id: 99,
    flight_number: 'QH99',
    status: 'scheduled',
    airline: { name: 'Bamboo Airways', iata_code: 'QH' },
    departureAirport: { city: 'Hà Nội', iata_code: 'HAN' },
    arrivalAirport: { city: 'Phú Quốc', iata_code: 'PQC' },
  });
  const addFlightOp = mockClient.operations.find((op) => op.action === 'index' && op.index === 'flights');
  assert.ok(addFlightOp);
  assert.equal(addFlightOp.id, '99');
  assert.equal(addFlightOp.document.flight_number, 'QH99');

  // 4. Xóa Flight
  await engine.removeFlight(99);
  const deleteFlightOp = mockClient.operations.find((op) => op.action === 'delete' && op.index === 'flights');
  assert.ok(deleteFlightOp);
  assert.equal(deleteFlightOp.id, '99');
});

test('12. Offline Catch-up Sync: buffers CRUD operations when ES is down and flushes idempotently on recovery', async () => {
  // BƯỚC 1: Elasticsearch offline -> Thao tác CRUD được lưu vào hàng đợi bù
  const offlineClient = createMockEsClient({ shouldFail: true });
  const engine = new FlightSearchEngine({ client: offlineClient });

  assert.equal(engine.getPendingQueueSize(), 0);

  // Tạo Airport mới khi offline
  await engine.addAirport({ id: 101, iata_code: 'VDO', name: 'Sân bay Vân Đồn', city: 'Quảng Ninh' });
  assert.equal(engine.getPendingQueueSize(), 1);

  // Tạo Flight mới khi offline
  await engine.addFlight({
    id: 501,
    flight_number: 'VN501',
    status: 'scheduled',
    airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
    departureAirport: { city: 'Hà Nội', iata_code: 'HAN' },
    arrivalAirport: { city: 'Vân Đồn', iata_code: 'VDO' },
  });
  assert.equal(engine.getPendingQueueSize(), 2);

  // Cập nhật trạng thái Flight nhiều lần khi offline -> tự gộp vào trạng thái mới nhất (không trùng lặp)
  await engine.addFlight({
    id: 501,
    flight_number: 'VN501',
    status: 'delayed',
    airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
    departureAirport: { city: 'Hà Nội', iata_code: 'HAN' },
    arrivalAirport: { city: 'Vân Đồn', iata_code: 'VDO' },
  });
  // Vẫn là 2 bản ghi vì id 501 được cập nhật đè trạng thái mới nhất
  assert.equal(engine.getPendingQueueSize(), 2);
  const flightItem = engine.getPendingQueue().find((item) => item.id === 501);
  assert.equal(flightItem.data.status, 'delayed');

  // Xóa Airport khi offline -> chuyển thành hành động delete
  await engine.removeAirport(101);
  assert.equal(engine.getPendingQueueSize(), 2);
  const airportItem = engine.getPendingQueue().find((item) => item.id === 101);
  assert.equal(airportItem.action, 'delete');

  // BƯỚC 2: Elasticsearch phục hồi -> Gọi flushPendingSyncQueue
  const onlineClient = createMockEsClient({ shouldFail: false });
  engine.esClient = onlineClient;

  const flushResult = await engine.flushPendingSyncQueue();
  assert.equal(flushResult.processed, 2);
  assert.equal(flushResult.remaining, 0);
  assert.equal(engine.getPendingQueueSize(), 0);

  // Kiểm tra Elasticsearch đã nhận đúng các thao tác
  const deleteAirportEs = onlineClient.operations.find((op) => op.action === 'delete' && op.id === '101');
  const indexFlightEs = onlineClient.operations.find((op) => op.action === 'index' && op.id === '501');
  assert.ok(deleteAirportEs);
  assert.ok(indexFlightEs);
  assert.equal(indexFlightEs.document.status, 'delayed');

  // Chạy lại flush lần nữa không gây lỗi (idempotent)
  const rerunResult = await engine.flushPendingSyncQueue();
  assert.equal(rerunResult.processed, 0);
  assert.equal(rerunResult.remaining, 0);
});

test('13. Offline Catch-up Sync: searchAirports and searchFlights auto-flush pending queue before searching', async () => {
  const offlineClient = createMockEsClient({ shouldFail: true });
  const engine = new FlightSearchEngine({ client: offlineClient });

  // Tạo flight lúc offline -> đưa vào hàng đợi
  await engine.addFlight({
    id: 777,
    flight_number: 'VJ777',
    status: 'scheduled',
    airline: { name: 'Vietjet Air', iata_code: 'VJ' },
  });
  assert.equal(engine.getPendingQueueSize(), 1);

  // ES phục hồi: thay client online và có kết quả tìm kiếm
  const onlineClient = createMockEsClient({
    shouldFail: false,
    searchHits: [
      {
        _id: '777',
        _score: 9.5,
        _source: { id: 777, flight_number: 'VJ777', airline_name: 'Vietjet Air' },
      },
    ],
  });
  engine.esClient = onlineClient;

  // Người dùng thực hiện tìm kiếm -> engine tự động flush trước khi tìm
  const results = await engine.searchFlights('VJ777');

  // Hàng đợi đã được flush sạch
  assert.equal(engine.getPendingQueueSize(), 0);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 777);
  assert.equal(results[0].flight_number, 'VJ777');
  assert.equal(results[0]._score, 9.5);
});

test('14. Relevance _score ordering preservation: database results maintain Elasticsearch ranking', async () => {
  const { SequelizeAirportRepository } = require('../modules/airport/airport.repository');
  const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
  const Sequelize = require('sequelize');

  // 1. Kiểm tra Airport Repository
  // Thứ tự _score từ Elasticsearch: [3 (Đà Nẵng), 2 (Hà Nội), 1 (Hồ Chí Minh)]
  const matchingAirportIds = [3, 2, 1];
  const unorderedDbAirports = [
    { id: 2, name: 'Nội Bài', city: 'Hà Nội' },
    { id: 1, name: 'Tân Sơn Nhất', city: 'Hồ Chí Minh' },
    { id: 3, name: 'Đà Nẵng', city: 'Đà Nẵng' },
  ];

  const airportRepo = new SequelizeAirportRepository({
    Airport: {
      findAndCountAll: async () => ({ count: 3, rows: [...unorderedDbAirports] }),
    },
    Op: Sequelize.Op,
  });

  const airportResult = await airportRepo.findPage({
    page: 1,
    limit: 10,
    matchingIds: matchingAirportIds,
    fromElasticsearch: true,
  });

  // Xác nhận kết quả trả về đã được sắp xếp đúng theo thứ tự matchingIds [3, 2, 1]
  assert.deepEqual(airportResult.rows.map((r) => r.id), [3, 2, 1]);

  // 2. Kiểm tra Flight Repository
  // Thứ tự _score từ Elasticsearch: [99, 10, 50]
  const matchingFlightIds = [99, 10, 50];
  const unorderedDbFlights = [
    { id: 10, flight_number: 'VN10' },
    { id: 50, flight_number: 'VJ50' },
    { id: 99, flight_number: 'QH99' },
  ];

  const flightRepo = new SequelizeFlightRepository({
    sequelize: {},
    Flight: {
      findAndCountAll: async () => ({ count: 3, rows: [...unorderedDbFlights] }),
    },
    Airline: {},
    Airport: {},
    FareClass: {},
    Booking: {},
    Op: Sequelize.Op,
  });

  const flightResult = await flightRepo.searchPage({
    page: 1,
    limit: 10,
    matchingFlightIds,
    fromElasticsearch: true,
    sort_by: 'relevance',
  });

  // Xác nhận kết quả chuyến bay bảo toàn thứ tự xếp hạng của Elasticsearch
  assert.deepEqual(flightResult.rows.map((r) => r.id), [99, 10, 50]);
});

test('15. Business filters preservation: Flight search retains all business constraints when using Elasticsearch', async () => {
  const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
  const Sequelize = require('sequelize');

  let capturedOptions = null;
  const flightRepo = new SequelizeFlightRepository({
    sequelize: {},
    Flight: {
      findAndCountAll: async (options) => {
        capturedOptions = options;
        return { count: 1, rows: [{ id: 42 }] };
      },
    },
    Airline: {},
    Airport: {},
    FareClass: {},
    Booking: {},
    Op: Sequelize.Op,
  });

  await flightRepo.searchPage({
    departure_airport_id: 1,
    arrival_airport_id: 2,
    airline_id: 5,
    min_seats: 2,
    min_price: '500000',
    max_price: '2000000',
    fare_class: 'Economy',
    departure_time_from: '06:00',
    departure_time_to: '12:00',
    min_duration_minutes: 60,
    max_duration_minutes: 180,
    matchingFlightIds: [42, 88, 99],
    fromElasticsearch: true,
    page: 1,
    limit: 10,
  });

  assert.ok(capturedOptions);
  // 1. Điều kiện ID thuộc Elasticsearch matchingFlightIds
  assert.deepEqual(capturedOptions.where.id[Sequelize.Op.in], [42, 88, 99]);
  // 2. Điều kiện sân bay đi, đến, hãng bay
  assert.equal(capturedOptions.where.departure_airport_id, 1);
  assert.equal(capturedOptions.where.arrival_airport_id, 2);
  assert.equal(capturedOptions.where.airline_id, 5);
  assert.equal(capturedOptions.where.status, 'scheduled');
  // 3. Điều kiện ghế khả dụng
  assert.equal(capturedOptions.where.available_seats[Sequelize.Op.gte], 2);
  // 4. Điều kiện giá và hạng vé
  const fareInclude = capturedOptions.include.find((inc) => inc.as === 'fareClasses');
  assert.ok(fareInclude);
  assert.equal(fareInclude.where.class_name, 'Economy');
  assert.equal(fareInclude.where.price[Sequelize.Op.gte], '500000');
  assert.equal(fareInclude.where.price[Sequelize.Op.lte], '2000000');
  // 5. Điều kiện thời gian khởi hành và thời lượng
  assert.ok(capturedOptions.where[Sequelize.Op.and].length >= 2);
});

