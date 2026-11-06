'use strict';

const { Client } = require('@elastic/elasticsearch');

/**
 * Chuẩn hóa và loại bỏ dấu tiếng Việt (diacritics), chuyển ký tự đ/Đ thành d/D.
 * Giúp tìm kiếm không phân biệt có dấu và không dấu (VD: 'ha noi' khớp 'Hà Nội').
 *
 * @param {string} str - Chuỗi đầu vào
 * @returns {string} - Chuỗi đã loại bỏ dấu tiếng Việt
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));
}

/**
 * Tính khoảng cách Levenshtein giữa 2 chuỗi để hỗ trợ tìm kiếm mờ (Fuzzy matching).
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Chuyển đổi an toàn từ Sequelize Model instance hoặc plain object thành plain JS object.
 */
function toPlain(doc) {
  if (!doc || typeof doc !== 'object') return {};
  if (typeof doc.get === 'function') return doc.get({ plain: true });
  if (typeof doc.toJSON === 'function') return doc.toJSON();
  return { ...doc };
}

/**
 * Kiểm tra xem một chuỗi truy vấn có khớp với văn bản đích hay không:
 * 1. Khớp chuỗi con trực tiếp (Substring)
 * 2. Khớp tiền tố (Prefix)
 * 3. Khớp mờ (Fuzzy - khoảng cách Levenshtein <= 2 khi độ dài từ >= 4)
 */
function matchScore(normalizedQuery, targetText) {
  if (!targetText || !normalizedQuery) return 0;
  const normalizedTarget = removeVietnameseTones(targetText).toLowerCase();

  // Khớp chính xác hoặc chứa toàn bộ
  if (normalizedTarget.includes(normalizedQuery)) {
    return 100 - (normalizedTarget.length - normalizedQuery.length);
  }

  // Khớp chuỗi nối liền không khoảng trắng (VD: 'dan' khớp 'da nang' -> 'danang')
  const compactTarget = normalizedTarget.replace(/[\s,()/-]+/g, '');
  const compactQuery = normalizedQuery.replace(/[\s,()/-]+/g, '');
  if (compactQuery && compactTarget.includes(compactQuery)) {
    return 80 - (compactTarget.length - compactQuery.length);
  }

  // Khớp từng từ hoặc tiền tố của từ
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const targetWords = normalizedTarget.split(/[\s,()/-]+/).filter(Boolean);

  let totalScore = 0;
  for (const q of queryTokens) {
    let bestTokenScore = 0;
    for (const w of targetWords) {
      if (w === q) {
        bestTokenScore = Math.max(bestTokenScore, 50);
      } else if (w.startsWith(q)) {
        bestTokenScore = Math.max(bestTokenScore, 40);
      } else if (q.startsWith(w) && w.length >= 2) {
        bestTokenScore = Math.max(bestTokenScore, 30);
      } else if (q.length >= 3 && w.length >= 3) {
        const dist = levenshtein(q, w);
        if (dist <= 1) {
          bestTokenScore = Math.max(bestTokenScore, 35);
        } else if (dist <= 2 && q.length >= 5) {
          bestTokenScore = Math.max(bestTokenScore, 20);
        }
      }
    }
    if (bestTokenScore === 0) return 0; // Tất cả các từ truy vấn đều phải tìm thấy sự liên quan
    totalScore += bestTokenScore;
  }

  return totalScore;
}

class FlightSearchEngine {
  constructor(options = {}) {
    this.options = options;
    this.esNode = options.node || process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

    // Khởi tạo Elasticsearch Client
    this.esClient = new Client({
      node: this.esNode,
      maxRetries: 1,
      requestTimeout: 2000,
    });

    this.airports = new Map();
    this.airlines = new Map();
    this.flights = new Map();
  }

  /**
   * Kiểm tra tình trạng kết nối Elasticsearch cluster
   */
  async pingElasticsearch() {
    try {
      return await this.esClient.ping();
    } catch {
      return false;
    }
  }

  // ─── AIRPORTS ───────────────────────────────────────────────────────────────

  indexAirports(airports = []) {
    this.airports.clear();
    for (const item of airports) {
      this.addAirport(item);
    }
  }

  addAirport(airport) {
    const p = toPlain(airport);
    if (!p.id) return;
    const doc = {
      id: p.id,
      iata_code: p.iata_code || '',
      name: p.name || '',
      city: p.city || '',
      country: p.country || '',
    };
    this.airports.set(p.id, doc);

    // Gửi index sang Elasticsearch trong background nếu server khả dụng
    this.esClient.index({
      index: 'airports',
      id: String(p.id),
      document: doc,
    }).catch(() => {});
  }

  removeAirport(id) {
    this.airports.delete(id);
    this.esClient.delete({
      index: 'airports',
      id: String(id),
    }).catch(() => {});
  }

  searchAirports(query) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    const normalizedQuery = removeVietnameseTones(query).toLowerCase().trim();

    const scored = [];
    for (const doc of this.airports.values()) {
      const targetStr = `${doc.iata_code} ${doc.name} ${doc.city} ${doc.country}`;
      const score = matchScore(normalizedQuery, targetStr);
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.doc);
  }

  // ─── AIRLINES ───────────────────────────────────────────────────────────────

  indexAirlines(airlines = []) {
    this.airlines.clear();
    for (const item of airlines) {
      this.addAirline(item);
    }
  }

  addAirline(airline) {
    const p = toPlain(airline);
    if (!p.id) return;
    const doc = {
      id: p.id,
      name: p.name || '',
      iata_code: p.iata_code || '',
      logo_url: p.logo_url || '',
    };
    this.airlines.set(p.id, doc);

    this.esClient.index({
      index: 'airlines',
      id: String(p.id),
      document: doc,
    }).catch(() => {});
  }

  removeAirline(id) {
    this.airlines.delete(id);
    this.esClient.delete({
      index: 'airlines',
      id: String(id),
    }).catch(() => {});
  }

  searchAirlines(query) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    const normalizedQuery = removeVietnameseTones(query).toLowerCase().trim();

    const scored = [];
    for (const doc of this.airlines.values()) {
      const targetStr = `${doc.name} ${doc.iata_code}`;
      const score = matchScore(normalizedQuery, targetStr);
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.doc);
  }

  // ─── FLIGHTS ────────────────────────────────────────────────────────────────

  _formatFlightDoc(flight) {
    const p = toPlain(flight);
    const depAirport = toPlain(p.departureAirport);
    const arrAirport = toPlain(p.arrivalAirport);
    const airline = toPlain(p.airline);
    const fareClasses = Array.isArray(p.fareClasses)
      ? p.fareClasses.map((f) => toPlain(f).class_name).filter(Boolean).join(' ')
      : '';

    return {
      id: p.id,
      flight_number: p.flight_number || '',
      departure_airport_id: p.departure_airport_id,
      arrival_airport_id: p.arrival_airport_id,
      airline_id: p.airline_id,
      departure_airport_code: depAirport.iata_code || '',
      departure_airport_city: depAirport.city || '',
      departure_airport_name: depAirport.name || '',
      arrival_airport_code: arrAirport.iata_code || '',
      arrival_airport_city: arrAirport.city || '',
      arrival_airport_name: arrAirport.name || '',
      airline_name: airline.name || '',
      airline_code: airline.iata_code || '',
      fare_classes: fareClasses,
    };
  }

  indexFlights(flights = []) {
    this.flights.clear();
    for (const item of flights) {
      this.addFlight(item);
    }
  }

  addFlight(flight) {
    const doc = this._formatFlightDoc(flight);
    if (!doc.id) return;
    this.flights.set(doc.id, doc);

    this.esClient.index({
      index: 'flights',
      id: String(doc.id),
      document: doc,
    }).catch(() => {});
  }

  removeFlight(id) {
    this.flights.delete(id);
    this.esClient.delete({
      index: 'flights',
      id: String(id),
    }).catch(() => {});
  }

  searchFlights(query) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    const normalizedQuery = removeVietnameseTones(query).toLowerCase().trim();

    const scored = [];
    for (const doc of this.flights.values()) {
      const targetStr = `${doc.flight_number} ${doc.departure_airport_code} ${doc.departure_airport_city} ${doc.departure_airport_name} ${doc.arrival_airport_code} ${doc.arrival_airport_city} ${doc.arrival_airport_name} ${doc.airline_name} ${doc.airline_code} ${doc.fare_classes}`;
      const score = matchScore(normalizedQuery, targetStr);
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.doc);
  }

  // ─── DATABASE SYNC ──────────────────────────────────────────────────────────

  async syncFromDatabase(models) {
    if (!models) return;
    try {
      if (models.Airport) {
        const airports = await models.Airport.findAll();
        this.indexAirports(airports);
      }
      if (models.Airline) {
        const airlines = await models.Airline.findAll();
        this.indexAirlines(airlines);
      }
      if (models.Flight) {
        const flights = await models.Flight.findAll({
          include: [
            models.Airline ? { model: models.Airline, as: 'airline' } : null,
            models.Airport ? { model: models.Airport, as: 'departureAirport' } : null,
            models.Airport ? { model: models.Airport, as: 'arrivalAirport' } : null,
            models.FareClass ? { model: models.FareClass, as: 'fareClasses' } : null,
          ].filter(Boolean),
        });
        this.indexFlights(flights);
      }
    } catch (_err) {
      // Bỏ qua lỗi kết nối DB tạm thời khi chạy offline hoặc unit tests
    }
  }
}

// Singleton instance dùng chung trong ứng dụng
let defaultInstance = null;

function getSearchEngine(options) {
  if (!defaultInstance) {
    defaultInstance = new FlightSearchEngine(options);
  }
  return defaultInstance;
}

module.exports = {
  FlightSearchEngine,
  getSearchEngine,
  removeVietnameseTones,
};
