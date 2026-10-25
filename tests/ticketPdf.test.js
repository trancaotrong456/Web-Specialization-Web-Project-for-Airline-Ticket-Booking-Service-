const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');
const ticketService = require('../services/ticket.service');
const TicketService = require('../modules/ticket/ticket.service');

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

test('multi-leg e-ticket includes every flight, passenger, fare class and booking total', async () => {
  const renderedText = [];
  class RecordingPdfDocument {
    constructor() { this.y = 0; }
    on(event, callback) { if (event === 'data') this.onData = callback; if (event === 'end') this.onEnd = callback; return this; }
    registerFont() { return this; }
    font() { return this; }
    fontSize() { return this; }
    fillColor() { return this; }
    text(value) { renderedText.push(String(value)); return this; }
    moveDown() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    strokeColor() { return this; }
    lineWidth() { return this; }
    stroke() { return this; }
    end() { this.onData(Buffer.from('%PDF-test')); this.onEnd(); }
  }
  const flight = (airline, from, to) => ({
    departure_time: '2026-11-01T01:00:00Z', arrival_time: '2026-11-01T03:00:00Z',
    airline: { name: airline },
    departureAirport: { name: from, iata_code: from, city: from, country: 'Viet Nam' },
    arrivalAirport: { name: to, iata_code: to, city: to, country: 'Viet Nam' },
  });
  const service = new TicketService({
    pdfDocument: RecordingPdfDocument,
    repository: { findBookingForTicket: async () => ({
      id: 123, booking_code: 'MULTI-LEG-123', user_id: 7, status: 'confirmed', total_amount: 3750000,
      flight: flight('Vietnam Airlines', 'HAN', 'SGN'), fareClass: { class_name: 'Economy' },
      itinerarySegments: [{ leg_order: 1, flight: flight('Vietnam Airlines', 'HAN', 'SGN'), fareClass: { class_name: 'Economy' } },
        { leg_order: 3, flight: flight('Bamboo Airways', 'DAD', 'CXR'), fareClass: { class_name: 'Business' } },
        { leg_order: 2, flight: flight('Vietjet Air', 'SGN', 'DAD'), fareClass: { class_name: 'Premium Economy' } }],
      passengers: [{ passenger_name: 'Nguyen Van An', seat_no: '12A' }, { passenger_name: 'Tran Thi Binh', seat_no: '12B' }],
      ancillaries: [{ service_name_snapshot: 'Hành lý bổ sung', offer_name_snapshot: '20 kg', quantity: 1, line_total_snapshot: '250000.00', currency_snapshot: 'VND', passenger: { passenger_name: 'Nguyen Van An' }, segment: { leg_order: 2 } }],
    }) },
  });

  await service.generateTicketPDF(123, { id: 7 });
  const text = renderedText.join('\n');
  for (const expected of ['Vietnam Airlines', 'HAN', 'SGN', 'Vietjet Air', 'DAD', 'Bamboo Airways', 'CXR',
    'Nguyen Van An', 'Tran Thi Binh', 'Economy', 'Premium Economy', 'Business', '3.750.000 VND', 'DỊCH VỤ BỔ SUNG', 'Hành lý bổ sung', '20 kg', '250.000 VND']) {
    assert.ok(text.includes(expected), `Expected ticket PDF content to include ${expected}`);
  }
  assert.ok(text.indexOf('CHẶNG 2') < text.indexOf('CHẶNG 3'), 'additional legs should be rendered in itinerary order');
  assert.equal(text.includes('CHẶNG 1'), false, 'primary flight is already rendered above and must not be duplicated');
});
