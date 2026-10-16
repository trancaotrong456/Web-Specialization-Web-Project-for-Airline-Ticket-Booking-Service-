'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO booking_segments
        (booking_id, leg_order, flight_id, fare_class_id, price_per_passenger, created_at, updated_at)
      SELECT b.id, 1, b.flight_id, b.fare_class_id, fc.price, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM bookings b
      INNER JOIN fare_classes fc ON fc.id = b.fare_class_id
      LEFT JOIN booking_segments bs ON bs.booking_id = b.id AND bs.leg_order = 1
      WHERE bs.id IS NULL
    `);
  },

  async down() {
    // Do not delete leg-1 rows: a later BookingAncillary may reference one.
    // Down migration is intentionally non-destructive.
  },
};
