'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_FLIGHTS = 100_000;
const BATCH_SIZE = 5_000;
const AIRLINE_COUNT = 20;
const AIRPORT_COUNT = 40;

function makeFlightsBatch(startId, size) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    const id = startId + i;
    const airline_id = (id % AIRLINE_COUNT) + 1;

    let depAirport = (id % AIRPORT_COUNT) + 1;
    let arrAirport = ((id + 7) % AIRPORT_COUNT) + 1;
    if (depAirport === arrAirport) {
      arrAirport = (depAirport % AIRPORT_COUNT) + 1;
    }

    const depDate = faker.date.between({ from: '2025-01-01', to: '2026-12-31' });
    const flightDurationHours = faker.number.int({ min: 1, max: 12 });
    const arrDate = new Date(depDate.getTime() + flightDurationHours * 3600 * 1000);

    const total_seats = faker.helpers.arrayElement([150, 180, 200, 250, 300]);
    const available_seats = faker.number.int({ min: 0, max: total_seats });

    const status = faker.helpers.weightedArrayElement([
      { weight: 70, value: 'scheduled' },
      { weight: 25, value: 'completed' },
      { weight: 5,  value: 'cancelled' },
    ]);

    rows.push({
      id,
      airline_id,
      departure_airport_id: depAirport,
      arrival_airport_id: arrAirport,
      departure_time: depDate,
      arrival_time: arrDate,
      total_seats,
      available_seats,
      status,
      created_at: depDate,
      updated_at: new Date(),
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_FLIGHTS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_FLIGHTS - start);
      await queryInterface.bulkInsert('flights', makeFlightsBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('flights', null, {});
  },
};
