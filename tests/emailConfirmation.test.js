const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEND_API_KEY = 're_test_key';
process.env.EMAIL_FROM = 'Airline Booking <onboarding@resend.dev>';

const models = require('../models');
const ticketService = require('../services/ticket.service');
const emailService = require('../services/email.service');

test('confirmation email generates and sends the e-ticket PDF attachment', async () => {
  const originalFindByPk = models.Booking.findByPk;
  const originalGenerateTicket = ticketService.generateTicketPDF;
  const originalFetch = global.fetch;
  const pdfBuffer = Buffer.from('%PDF-test-ticket');
  let requestBody;

  models.Booking.findByPk = async () => ({
    id: 321,
    booking_code: 'EMAIL-PDF-321',
    user_id: null,
    guest_email: 'guest@example.com',
    status: 'confirmed',
    total_amount: 1250000,
    flight: {
      departure_time: new Date('2026-10-01T06:45:00+07:00'),
      arrival_time: new Date('2026-10-01T08:55:00+07:00'),
      airline: { name: 'Vietnam Airlines' },
      departureAirport: { city: 'Hà Nội', iata_code: 'HAN' },
      arrivalAirport: { city: 'TP. Hồ Chí Minh', iata_code: 'SGN' },
    },
    fareClass: { class_name: 'Phổ thông' },
    passengers: [{ passenger_name: 'Nguyễn Văn An', seat_no: '12A' }],
    payments: [{ status: 'success' }],
    user: null,
  });
  ticketService.generateTicketPDF = async (bookingId, currentUser, guestEmail) => {
    assert.equal(bookingId, 321);
    assert.equal(currentUser, null);
    assert.equal(guestEmail, 'guest@example.com');
    return pdfBuffer;
  };
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'email-test-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await emailService.sendBookingConfirmation(321);
    assert.equal(requestBody.to, 'guest@example.com');
    assert.equal(requestBody.attachments.length, 1);
    assert.equal(requestBody.attachments[0].filename, 'ticket-EMAIL-PDF-321.pdf');
    assert.equal(requestBody.attachments[0].content, pdfBuffer.toString('base64'));
  } finally {
    models.Booking.findByPk = originalFindByPk;
    ticketService.generateTicketPDF = originalGenerateTicket;
    global.fetch = originalFetch;
  }
});

test('multi-leg confirmation email lists ordered flights, fares, passengers and total', async () => {
  const originalFindByPk = models.Booking.findByPk;
  const originalGenerateTicket = ticketService.generateTicketPDF;
  const originalFetch = global.fetch;
  let requestBody;
  const flight = (airline, from, to) => ({
    departure_time: new Date('2026-11-01T06:45:00+07:00'), arrival_time: new Date('2026-11-01T08:55:00+07:00'),
    airline: { name: airline }, departureAirport: { city: from, iata_code: from }, arrivalAirport: { city: to, iata_code: to },
  });
  models.Booking.findByPk = async () => ({
    id: 322, booking_code: 'EMAIL-MULTI-322', user_id: null, guest_email: 'guest@example.com', status: 'confirmed', total_amount: 3750000,
    flight: flight('Vietnam Airlines', 'Hà Nội', 'TP. Hồ Chí Minh'), fareClass: { class_name: 'Economy' },
    itinerarySegments: [
      { leg_order: 3, flight: flight('Bamboo Airways', 'Đà Nẵng', 'Nha Trang'), fareClass: { class_name: 'Business' } },
      { leg_order: 2, flight: flight('Vietjet Air', 'TP. Hồ Chí Minh', 'Đà Nẵng'), fareClass: { class_name: 'Premium Economy' } },
    ],
    passengers: [{ passenger_name: 'Nguyễn Văn An', seat_no: '12A' }, { passenger_name: 'Trần Thị Bình', seat_no: '12B' }],
    payments: [{ status: 'success' }], user: null,
  });
  ticketService.generateTicketPDF = async () => Buffer.from('%PDF-multi-leg');
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'email-multi-test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await emailService.sendBookingConfirmation(322);
    const html = requestBody.html;
    for (const expected of ['Vietnam Airlines', 'Hà Nội', 'TP. Hồ Chí Minh', 'Vietjet Air', 'Đà Nẵng', 'Bamboo Airways', 'Nha Trang',
      'Economy', 'Premium Economy', 'Business', 'Nguyễn Văn An', 'Trần Thị Bình', '3.750.000 VND']) {
      assert.ok(html.includes(expected), `Expected confirmation email to include ${expected}`);
    }
    assert.ok(html.indexOf('Vietjet Air') < html.indexOf('Bamboo Airways'), 'itinerary legs should appear in leg_order');
    assert.equal(requestBody.attachments[0].content, Buffer.from('%PDF-multi-leg').toString('base64'));
  } finally {
    models.Booking.findByPk = originalFindByPk;
    ticketService.generateTicketPDF = originalGenerateTicket;
    global.fetch = originalFetch;
  }
});
