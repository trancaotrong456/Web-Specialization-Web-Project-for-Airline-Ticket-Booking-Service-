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
async function bulkSendInChunks(client, operations, chunkSize = 500) {
  let errorCount = 0;
  for (let i = 0; i < operations.length; i += chunkSize * 2) {
    const chunk = operations.slice(i, i + chunkSize * 2);
    if (!chunk.length) break;
    const bulkResponse = await client.bulk({ refresh: false, operations: chunk });
    if (bulkResponse?.errors) {
      const items = bulkResponse.items || [];
      for (const action of items) {
        const op = action.index || action.create || action.update;
        if (op?.error) errorCount += 1;
      }
    }
  }
  return errorCount;
}

/**
 * Đồng bộ tất cả Chuyến bay sang Elasticsearch (batching an toàn).
 */
async function syncAllFlights({ models, client, limit = 5000 }) {
  if (!models?.Flight) {
    throw new Error('Model Flight is required for syncAllFlights');
  }

  const flights = await models.Flight.findAll({
    limit,
    order: [['departure_time', 'DESC']],
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

  const errorCount = await bulkSendInChunks(client, operations, 500);
  try { await client.indices.refresh({ index: INDEX_NAMES.FLIGHTS }); } catch (_) {}

  return {
    total: flights.length,
    indexed: flights.length - errorCount,
    errors: errorCount,
  };
}

/**
 * Định dạng document hãng hàng không.
 */
function formatAirlineDoc(airline) {
  const p = toPlain(airline);
  return {
    id: Number(p.id),
    name: (p.name || '').trim(),
    iata_code: (p.iata_code || '').trim().toUpperCase(),
    logo_url: p.logo_url || null,
  };
}

/**
 * Định dạng document người dùng (bảo mật: không đưa password_hash/tokens vào ES).
 */
function formatUserDoc(user) {
  const p = toPlain(user);
  return {
    id: Number(p.id),
    full_name: (p.full_name || '').trim(),
    email: (p.email || '').trim().toLowerCase(),
    role: p.role?.name || p.role || 'customer',
    phone: p.phone ? String(p.phone).trim() : null,
    status: p.status || 'active',
  };
}

/**
 * Định dạng document đặt chỗ.
 */
function formatBookingDoc(booking) {
  const p = toPlain(booking);
  const user = toPlain(p.user);
  return {
    id: Number(p.id),
    booking_code: (p.booking_code || '').trim().toUpperCase(),
    customer_name: (user.full_name || (Array.isArray(p.passengers) && p.passengers[0]?.passenger_name) || '').trim(),
    customer_email: (p.guest_email || user.email || '').trim().toLowerCase(),
    flight_id: Number(p.flight_id) || null,
    status: p.status || 'holding',
  };
}

/**
 * Định dạng document mã khuyến mại.
 */
function formatPromotionDoc(promotion) {
  const p = toPlain(promotion);
  return {
    id: Number(p.id),
    code: (p.code || '').trim().toUpperCase(),
    description: (p.description || '').trim(),
    discount_type: p.discount_type || 'percentage',
  };
}

/**
 * Đồng bộ Hãng hàng không sang Elasticsearch.
 */
async function syncAllAirlines({ models, client }) {
  if (!models?.Airline) return { total: 0, indexed: 0, errors: 0 };
  const airlines = await models.Airline.findAll();
  if (!airlines || airlines.length === 0) return { total: 0, indexed: 0, errors: 0 };

  const operations = [];
  for (const item of airlines) {
    const doc = formatAirlineDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.AIRLINES, _id: String(doc.id) } });
    operations.push(doc);
  }
  const bulkResponse = await client.bulk({ refresh: true, operations });
  const errorCount = bulkResponse?.errors ? (bulkResponse.items || []).filter((i) => (i.index || i.create)?.error).length : 0;
  return { total: airlines.length, indexed: airlines.length - errorCount, errors: errorCount };
}

/**
 * Đồng bộ Người dùng sang Elasticsearch.
 */
async function syncAllUsers({ models, client, limit = 5000 }) {
  if (!models?.User) return { total: 0, indexed: 0, errors: 0 };
  const users = await models.User.findAll({
    limit,
    order: [['id', 'DESC']],
    include: models.Role ? [{ model: models.Role, as: 'role', attributes: ['id', 'name'] }] : [],
    attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at'] },
  });
  if (!users || users.length === 0) return { total: 0, indexed: 0, errors: 0 };

  const operations = [];
  for (const item of users) {
    const doc = formatUserDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.USERS, _id: String(doc.id) } });
    operations.push(doc);
  }
  const errorCount = await bulkSendInChunks(client, operations, 500);
  try { await client.indices.refresh({ index: INDEX_NAMES.USERS }); } catch (_) {}
  return { total: users.length, indexed: users.length - errorCount, errors: errorCount };
}

/**
 * Đồng bộ Đặt chỗ sang Elasticsearch.
 */
async function syncAllBookings({ models, client, limit = 2000 }) {
  if (!models?.Booking) return { total: 0, indexed: 0, errors: 0 };
  const bookings = await models.Booking.findAll({
    limit,
    order: [['id', 'DESC']],
    include: [
      models.User ? { model: models.User, as: 'user', attributes: ['id', 'full_name', 'email'] } : null,
      models.BookingPassenger ? { model: models.BookingPassenger, as: 'passengers', attributes: ['id', 'passenger_name'] } : null,
    ].filter(Boolean),
  });
  if (!bookings || bookings.length === 0) return { total: 0, indexed: 0, errors: 0 };

  const operations = [];
  for (const item of bookings) {
    const doc = formatBookingDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.BOOKINGS, _id: String(doc.id) } });
    operations.push(doc);
  }
  const errorCount = await bulkSendInChunks(client, operations, 500);
  try { await client.indices.refresh({ index: INDEX_NAMES.BOOKINGS }); } catch (_) {}
  return { total: bookings.length, indexed: bookings.length - errorCount, errors: errorCount };
}

/**
 * Đồng bộ Khuyến mại sang Elasticsearch.
 */
async function syncAllPromotions({ models, client, limit = 1000 }) {
  if (!models?.Promotion) return { total: 0, indexed: 0, errors: 0 };
  const promotions = await models.Promotion.findAll({ limit, order: [['id', 'DESC']] });
  if (!promotions || promotions.length === 0) return { total: 0, indexed: 0, errors: 0 };

  const operations = [];
  for (const item of promotions) {
    const doc = formatPromotionDoc(item);
    operations.push({ index: { _index: INDEX_NAMES.PROMOTIONS, _id: String(doc.id) } });
    operations.push(doc);
  }
  const errorCount = await bulkSendInChunks(client, operations, 500);
  try { await client.indices.refresh({ index: INDEX_NAMES.PROMOTIONS }); } catch (_) {}
  return { total: promotions.length, indexed: promotions.length - errorCount, errors: errorCount };
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
  const airlineStats = await syncAllAirlines({ models, client });
  const userStats = await syncAllUsers({ models, client });
  const bookingStats = await syncAllBookings({ models, client });
  const promotionStats = await syncAllPromotions({ models, client });

  return {
    airports: airportStats,
    flights: flightStats,
    airlines: airlineStats,
    users: userStats,
    bookings: bookingStats,
    promotions: promotionStats,
  };
}

module.exports = {
  toPlain,
  formatAirportDoc,
  formatFlightDoc,
  formatAirlineDoc,
  formatUserDoc,
  formatBookingDoc,
  formatPromotionDoc,
  syncAllAirports,
  syncAllFlights,
  syncAllAirlines,
  syncAllUsers,
  syncAllBookings,
  syncAllPromotions,
  syncAllToElasticsearch,
};
