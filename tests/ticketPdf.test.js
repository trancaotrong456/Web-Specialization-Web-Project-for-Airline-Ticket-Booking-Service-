const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');
const ticketService = require('../services/ticket.service');

test('generates a confirmed Vietnamese e-ticket with the embedded Unicode font', async () => {
  const originalFindByPk = models.Booking.findByPk;
  models.Booking.findByPk = async () => ({
    id: 123,
    booking_code: 'TEST-PDF-123',
    user_id: 7,
    guest_email: null,
    status: 'confirmed',
    total_amount: 3390000,
    flight: {
      departure_time: new Date('2026-10-01T06:45:00+07:00'),
      arrival_time: new Date('2026-10-01T08:55:00+07:00'),
      airline: { name: 'Hãng hàng không Việt Nam', iata_code: 'VN' },
      departureAirport: {
        name: 'Sân bay Nội Bài',
        iata_code: 'HAN',
        city: 'Hà Nội',
        country: 'Việt Nam',
      },
      arrivalAirport: {
        name: 'Sân bay Tân Sơn Nhất',
        iata_code: 'SGN',
        city: 'TP. Hồ Chí Minh',
        country: 'Việt Nam',
      },
    },
    fareClass: { class_name: 'Phổ thông' },
    passengers: [{ passenger_name: 'Nguyễn Văn An', seat_no: '12A' }],
    user: { id: 7, full_name: 'Nguyễn Văn An', email: 'owner@example.com' },
  });

  try {
    const pdf = await ticketService.generateTicketPDF(123, { id: 7 });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(pdf.length > 5000, `Expected a non-trivial PDF, received ${pdf.length} bytes`);
    assert.match(pdf.toString('latin1'), /DejaVuSans/);
  } finally {
    models.Booking.findByPk = originalFindByPk;
  }
});
