'use strict';

const DEFAULT_CLASSES = Object.freeze([
  Object.freeze({ class_name: 'Economy', price: 1_250_000, seat_quota: 144 }),
  Object.freeze({ class_name: 'Business', price: 3_600_000, seat_quota: 36 }),
]);

function planForFlights(flights) {
  return flights.flatMap(({ slot }) => DEFAULT_CLASSES.map((fareClass) => ({ slot, ...fareClass })));
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

module.exports = { DEFAULT_CLASSES, planForFlights, seed };
