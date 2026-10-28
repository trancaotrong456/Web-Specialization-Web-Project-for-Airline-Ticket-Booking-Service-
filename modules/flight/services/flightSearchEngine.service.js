'use strict';

const MiniSearch = require('minisearch');

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
 * Chuyển đổi an toàn từ Sequelize Model instance hoặc plain object thành plain JS object.
 */
function toPlain(doc) {
  if (!doc || typeof doc !== 'object') return {};
  if (typeof doc.get === 'function') return doc.get({ plain: true });
  if (typeof doc.toJSON === 'function') return doc.toJSON();
  return { ...doc };
}

const DEFAULT_SEARCH_OPTIONS = {
  fuzzy: 0.2,
  prefix: true,
  processTerm: (term) => removeVietnameseTones(term).toLowerCase().trim(),
};

class FlightSearchEngine {
  constructor(options = {}) {
    this.options = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    this.airportIndex = new MiniSearch({
      fields: ['iata_code', 'name', 'city', 'country'],
      storeFields: ['id', 'iata_code', 'name', 'city', 'country'],
      processTerm: (term) => removeVietnameseTones(term).toLowerCase().trim(),
      searchOptions: this.options,
    });

    this.airlineIndex = new MiniSearch({
      fields: ['name', 'iata_code'],
      storeFields: ['id', 'name', 'iata_code', 'logo_url'],
      processTerm: (term) => removeVietnameseTones(term).toLowerCase().trim(),
      searchOptions: this.options,
    });

    this.flightIndex = new MiniSearch({
      fields: [
        'flight_number',
        'departure_airport_code',
        'departure_airport_city',
        'departure_airport_name',
        'arrival_airport_code',
        'arrival_airport_city',
        'arrival_airport_name',
        'airline_name',
        'airline_code',
        'fare_classes',
      ],
      storeFields: [
        'id',
        'flight_number',
        'departure_airport_id',
        'arrival_airport_id',
        'airline_id',
      ],
      processTerm: (term) => removeVietnameseTones(term).toLowerCase().trim(),
      searchOptions: this.options,
    });
  }

  // ─── AIRPORTS ───────────────────────────────────────────────────────────────

  indexAirports(airports = []) {
    this.airportIndex.removeAll();
    const docs = airports.map((item) => {
      const p = toPlain(item);
      return {
        id: p.id,
        iata_code: p.iata_code || '',
        name: p.name || '',
        city: p.city || '',
        country: p.country || '',
      };
    });
    if (docs.length > 0) {
      this.airportIndex.addAll(docs);
    }
  }

  addAirport(airport) {
    const p = toPlain(airport);
    if (!p.id) return;
    if (this.airportIndex.has(p.id)) {
      this.airportIndex.discard(p.id);
    }
    this.airportIndex.add({
      id: p.id,
      iata_code: p.iata_code || '',
      name: p.name || '',
      city: p.city || '',
      country: p.country || '',
    });
  }

  removeAirport(id) {
    if (this.airportIndex.has(id)) {
      this.airportIndex.discard(id);
    }
  }

  searchAirports(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    return this.airportIndex.search(query.trim(), {
      ...this.options,
      ...options,
    });
  }

  // ─── AIRLINES ───────────────────────────────────────────────────────────────

  indexAirlines(airlines = []) {
    this.airlineIndex.removeAll();
    const docs = airlines.map((item) => {
      const p = toPlain(item);
      return {
        id: p.id,
        name: p.name || '',
        iata_code: p.iata_code || '',
        logo_url: p.logo_url || '',
      };
    });
    if (docs.length > 0) {
      this.airlineIndex.addAll(docs);
    }
  }

  addAirline(airline) {
    const p = toPlain(airline);
    if (!p.id) return;
    if (this.airlineIndex.has(p.id)) {
      this.airlineIndex.discard(p.id);
    }
    this.airlineIndex.add({
      id: p.id,
      name: p.name || '',
      iata_code: p.iata_code || '',
      logo_url: p.logo_url || '',
    });
  }

  removeAirline(id) {
    if (this.airlineIndex.has(id)) {
      this.airlineIndex.discard(id);
    }
  }

  searchAirlines(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    return this.airlineIndex.search(query.trim(), {
      ...this.options,
      ...options,
    });
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
    this.flightIndex.removeAll();
    const docs = flights.map((f) => this._formatFlightDoc(f));
    if (docs.length > 0) {
      this.flightIndex.addAll(docs);
    }
  }

  addFlight(flight) {
    const doc = this._formatFlightDoc(flight);
    if (!doc.id) return;
    if (this.flightIndex.has(doc.id)) {
      this.flightIndex.discard(doc.id);
    }
    this.flightIndex.add(doc);
  }

  removeFlight(id) {
    if (this.flightIndex.has(id)) {
      this.flightIndex.discard(id);
    }
  }

  searchFlights(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) return [];
    return this.flightIndex.search(query.trim(), {
      ...this.options,
      ...options,
    });
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
