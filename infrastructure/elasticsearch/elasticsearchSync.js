'use strict';

const { INDEX_NAMES, ensureIndicesExist } = require('./indexManager');

/**
 * Chuyển đổi instance Sequelize hoặc object bất kỳ thành plain JavaScript object an toàn.
 */
function toPlain(doc) {
  if (!doc || typeof doc !== 'object') return {};
  if (typeof doc.get === 'function') return doc.get({ plain: true });
  if (typeof doc.toJSON === 'function') return doc.toJSON();
  return { ...doc };
}

/**
 * Định dạng document sân bay để đưa vào index Elasticsearch.
 */
function formatAirportDoc(airport) {
  const p = toPlain(airport);
  return {
    id: Number(p.id),
    iata_code: (p.iata_code || '').trim().toUpperCase(),
    name: (p.name || '').trim(),
    city: (p.city || '').trim(),
    country: (p.country || '').trim(),
  };
}

/**
 * Định dạng document chuyến bay để đưa vào index Elasticsearch.
 */
function formatFlightDoc(flight) {
  const p = toPlain(flight);
  const depAirport = toPlain(p.departureAirport);
  const arrAirport = toPlain(p.arrivalAirport);
  const airline = toPlain(p.airline);
  const fareClasses = Array.isArray(p.fareClasses)
    ? p.fareClasses.map((f) => toPlain(f).class_name).filter(Boolean).join(' ')
    : '';

  const flightNumber = p.flight_number
    ? String(p.flight_number).trim()
    : airline.iata_code && p.id
      ? `${airline.iata_code}${p.id}`
      : `#${p.id}`;

  return {
    id: Number(p.id),
    flight_number: flightNumber,
    status: p.status || 'scheduled',
    airline_id: Number(p.airline_id) || null,
    departure_airport_id: Number(p.departure_airport_id) || null,
    arrival_airport_id: Number(p.arrival_airport_id) || null,
    airline_name: (airline.name || '').trim(),
    airline_code: (airline.iata_code || '').trim().toUpperCase(),
    departure_airport_code: (depAirport.iata_code || '').trim().toUpperCase(),
    departure_airport_name: (depAirport.name || '').trim(),
    departure_airport_city: (depAirport.city || '').trim(),
    arrival_airport_code: (arrAirport.iata_code || '').trim().toUpperCase(),
    arrival_airport_name: (arrAirport.name || '').trim(),
    arrival_airport_city: (arrAirport.city || '').trim(),
    fare_classes: fareClasses,
  };
}

/**
 * Đồng bộ toàn bộ Sân bay sang Elasticsearch bằng Bulk API.
 *
 * @param {object} params
 * @param {object} params.models - Sequelize models
 * @param {import('@elastic/elasticsearch').Client} params.client
 * @returns {Promise<{ total: number, indexed: number, errors: number }>}
 */
async function syncAllAirports({ models, client }) {
  if (!models?.Airport) {
    throw new Error('Model Airport is required for syncAllAirports');
  }

  const airports = await models.Airport.findAll();
  if (!airports || airports.length === 0) {
    return { total: 0, indexed: 0, errors: 0 };
  }

  const operations = [];
  for (const item of airports) {
    const doc = formatAirportDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.AIRPORTS, _id: String(doc.id) } });
    operations.push(doc);
  }

  const bulkResponse = await client.bulk({
    refresh: true,
    operations,
  });

  let errorCount = 0;
  if (bulkResponse?.errors) {
    const items = bulkResponse.items || [];
    for (const action of items) {
      const operation = action.index || action.create || action.update;
      if (operation?.error) {
        errorCount += 1;
        console.error(`[Elasticsearch Sync Airport] Lỗi ID ${operation._id}:`, operation.error);
      }
    }
  }

  const indexedCount = airports.length - errorCount;
  return { total: airports.length, indexed: indexedCount, errors: errorCount };
}

/**
 * Đồng bộ toàn bộ Chuyến bay sang Elasticsearch bằng Bulk API.
 *
 * @param {object} params
 * @param {object} params.models - Sequelize models
 * @param {import('@elastic/elasticsearch').Client} params.client
 * @returns {Promise<{ total: number, indexed: number, errors: number }>}
 */
async function syncAllFlights({ models, client }) {
  if (!models?.Flight) {
    throw new Error('Model Flight is required for syncAllFlights');
  }

  const flights = await models.Flight.findAll({
    include: [
      models.Airline ? { model: models.Airline, as: 'airline' } : null,
      models.Airport ? { model: models.Airport, as: 'departureAirport' } : null,
      models.Airport ? { model: models.Airport, as: 'arrivalAirport' } : null,
      models.FareClass ? { model: models.FareClass, as: 'fareClasses' } : null,
    ].filter(Boolean),
  });

  if (!flights || flights.length === 0) {
    return { total: 0, indexed: 0, errors: 0 };
  }

  const operations = [];
  for (const item of flights) {
    const doc = formatFlightDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.FLIGHTS, _id: String(doc.id) } });
    operations.push(doc);
  }

  const bulkResponse = await client.bulk({
    refresh: true,
    operations,
  });

  let errorCount = 0;
  if (bulkResponse?.errors) {
    const items = bulkResponse.items || [];
    for (const action of items) {
      const operation = action.index || action.create || action.update;
      if (operation?.error) {
        errorCount += 1;
        console.error(`[Elasticsearch Sync Flight] Lỗi ID ${operation._id}:`, operation.error);
      }
    }
  }

  const indexedCount = flights.length - errorCount;
  return { total: flights.length, indexed: indexedCount, errors: errorCount };
}

/**
 * Đảm bảo index tồn tại và đồng bộ toàn bộ dữ liệu từ database sang Elasticsearch.
 *
 * @param {object} params
 * @param {object} params.models
 * @param {import('@elastic/elasticsearch').Client} params.client
 */
async function syncAllToElasticsearch({ models, client }) {
  await ensureIndicesExist(client);

  const airportStats = await syncAllAirports({ models, client });
  const flightStats = await syncAllFlights({ models, client });

  return {
    airports: airportStats,
    flights: flightStats,
  };
}

module.exports = {
  toPlain,
  formatAirportDoc,
  formatFlightDoc,
  syncAllAirports,
  syncAllFlights,
  syncAllToElasticsearch,
};

