'use strict';

const DEFAULT_CLASSES = Object.freeze([
  Object.freeze({ class_name: 'Economy', price: 1_250_000, seat_quota: 144 }),
  Object.freeze({ class_name: 'Business', price: 3_600_000, seat_quota: 36 }),
]);

const ROUTE_FARE_PRICES = Object.freeze({
  DAD: Object.freeze({ economy: 890_000, business: 2_500_000 }),
  CXR: Object.freeze({ economy: 750_000, business: 2_100_000 }),
  SGN: Object.freeze({ economy: 1_150_000, business: 3_200_000 }),
  HAN: Object.freeze({ economy: 1_350_000, business: 3_800_000 }),
  PQC: Object.freeze({ economy: 1_650_000, business: 4_200_000 }),
});

function planForFlights(flights) {
  return flights.flatMap(({ slot }) => {
    const parts = typeof slot === 'string' ? slot.split('-') : [];
    const destinationCode = parts[2];
    const prices = ROUTE_FARE_PRICES[destinationCode] || { economy: 1_250_000, business: 3_600_000 };
    return [
      { slot, class_name: 'Economy', price: prices.economy, seat_quota: 144 },
      { slot, class_name: 'Business', price: prices.business, seat_quota: 36 },
    ];
  });
}

async function seed({ models, transaction, fareClasses, flightIdsBySlot }) {
  for (const fareClass of fareClasses) {
    const { slot, ...fields } = fareClass;
    const flightId = flightIdsBySlot.get(slot);
    if (flightId == null) throw new Error(`FareClassSeeder cannot find the planned flight for slot ${slot}.`);
    await models.FareClass.create({ ...fields, flight_id: flightId }, { ...(transaction ? { transaction } : {}) });
  }
  return fareClasses.length;
}

module.exports = { DEFAULT_CLASSES, ROUTE_FARE_PRICES, planForFlights, seed };
