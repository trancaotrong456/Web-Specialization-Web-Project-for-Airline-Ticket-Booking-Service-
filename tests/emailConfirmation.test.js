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
