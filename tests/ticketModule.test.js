const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createTicketModule, getDefaultTicketModule } = require('../modules/ticket');
const { SequelizeTicketRepository } = require('../modules/ticket/ticket.repository');
const TicketService = require('../modules/ticket/ticket.service');
const TicketController = require('../modules/ticket/ticket.controller');

const confirmedBooking = () => ({
  id: 12, booking_code: 'BK-12', user_id: 7, guest_email: null,
  status: 'confirmed', total_amount: 1500000,
  flight: { departure_time: '2026-11-01T01:00:00Z', arrival_time: '2026-11-01T03:00:00Z',
    airline: { name: 'Vietnam Airlines', iata_code: 'VN' },
    departureAirport: { name: 'Noi Bai', iata_code: 'HAN', city: 'Ha Noi', country: 'Viet Nam' },
    arrivalAirport: { name: 'Tan Son Nhat', iata_code: 'SGN', city: 'Ho Chi Minh', country: 'Viet Nam' } },
  fareClass: { class_name: 'Economy' },
  passengers: [{ passenger_name: 'Nguyen Van An', seat_no: '12A' }],
  user: { id: 7, full_name: 'Nguyen Van An', email: 'owner@example.com' },
});

test('Ticket repository retains Booking include graph and safe User projection', async () => {
  const models = Object.fromEntries(['Booking', 'Flight', 'Airline', 'Airport', 'FareClass', 'BookingPassenger', 'User']
    .map((name) => [name, { name }]));
  let id;
  let options;
  models.Booking.findByPk = async (value, query) => { id = value; options = query; return { id: value }; };
  const repository = new SequelizeTicketRepository(models);
  assert.deepEqual(await repository.findBookingForTicket('12'), { id: '12' });
  assert.equal(id, '12');
  assert.deepEqual(options.include.map(({ as }) => as), ['flight', 'fareClass', 'passengers', 'user']);
  assert.deepEqual(options.include[0].include.map(({ as }) => as), ['airline', 'departureAirport', 'arrivalAirport']);
  assert.deepEqual(options.include[3].attributes, ['id', 'full_name', 'email']);
  assert.equal(options.include[0].model, models.Flight);
  assert.equal(options.include[0].include[0].model, models.Airline);
  assert.equal(options.include[0].include[1].model, models.Airport);
  assert.equal(options.include[0].include[2].model, models.Airport);
  assert.equal(options.include[1].model, models.FareClass);
  assert.equal(options.include[2].model, models.BookingPassenger);
  assert.equal(options.include[3].model, models.User);
});

test('Ticket service rejects missing, unconfirmed and unauthorized bookings before PDF creation', async () => {
  const repository = { findBookingForTicket: async () => null };
  let pdfConstructions = 0;
  const service = new TicketService({ repository, pdfDocument: class {
    constructor() { pdfConstructions += 1; }
  } });
  await assert.rejects(service.generateTicketPDF(12), (error) => error.statusCode === 404);
  repository.findBookingForTicket = async () => ({ ...confirmedBooking(), status: 'holding' });
  await assert.rejects(service.generateTicketPDF(12, { id: 7 }), (error) => error.statusCode === 400);
  repository.findBookingForTicket = async () => confirmedBooking();
  await assert.rejects(service.generateTicketPDF(12, { id: 8 }), (error) => error.statusCode === 403);
  await assert.rejects(service.generateTicketPDF(12), (error) => error.statusCode === 403);
  const guest = { ...confirmedBooking(), user_id: null, guest_email: 'guest@example.com' };
  repository.findBookingForTicket = async () => guest;
  await assert.rejects(service.generateTicketPDF(12, null, 'wrong@example.com'), (error) => error.statusCode === 403);
  await assert.rejects(service.generateTicketPDF(12, { id: 8, role: { name: 'staff' } }),
    (error) => error.statusCode === 403);
  assert.equal(pdfConstructions, 0);
});

test('Ticket service returns PDF Buffers for owner, Admin and matching guest with Unicode font', async () => {
  const booking = confirmedBooking();
  const service = new TicketService({ repository: { findBookingForTicket: async () => booking } });
  const owner = await service.generateTicketPDF(12, { id: 7 });
  assert.equal(owner.subarray(0, 4).toString('ascii'), '%PDF');
  assert.match(owner.toString('latin1'), /DejaVuSans/);
  const fontPath = path.join(__dirname, '../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
  assert.equal(fs.existsSync(fontPath), true);
  const admin = await service.generateTicketPDF(12, { id: 99, role: { name: 'admin' } });
  assert.equal(admin.subarray(0, 4).toString('ascii'), '%PDF');
  booking.user_id = null; booking.guest_email = 'guest@example.com';
  const guest = await service.generateTicketPDF(12, null, ' GUEST@EXAMPLE.COM ');
  assert.equal(guest.subarray(0, 4).toString('ascii'), '%PDF');
});

test('Ticket controller preserves PDF headers, Buffer response and guest alias normalization', async () => {
  const calls = [];
  const pdf = Buffer.from('%PDF-test');
  const controller = new TicketController({ service: { async generateTicketPDF(...args) { calls.push(args); return pdf; } } });
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; }, end(value) { assert.equal(value, pdf); return value; } };
  await controller.downloadTicket({ params: { id: '12' }, query: { email: ' GUEST@EXAMPLE.COM ' }, user: null }, res,
    (error) => { throw error; });
  assert.deepEqual(calls, [['12', null, 'guest@example.com']]);
  assert.deepEqual(headers, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="ticket_12.pdf"',
  });
  let failure;
  await controller.downloadTicket({ params: { id: '12' }, query: { guest_email: 'a@example.com', email: 'b@example.com' } }, res,
    (error) => { failure = error; });
  assert.equal(failure.statusCode, 422);
  assert.equal(calls.length, 1);
});

test('Ticket default module shares legacy adapters and Booking registers its route once', () => {
  const module = getDefaultTicketModule();
  assert.equal(require('../services/ticket.service'), module.service);
  assert.equal(require('../controllers/ticket.controller'), module.controller);
  const bookingRouter = require('../routes/booking.route');
  const ticketRoutes = bookingRouter.stack.filter((layer) => layer.route && layer.route.path === '/:id/ticket');
  assert.equal(ticketRoutes.length, 1);
  assert.equal(ticketRoutes[0].route.methods.get, true);
  const stack = ticketRoutes[0].route.stack;
  assert.equal(stack[0].name, 'optionalAuth');
  assert.equal(stack[0].handle, require('../middlewares/optionalAuth.middleware'));
  assert.deepEqual(stack.slice(1, -2).map((layer) => layer.handle),
    require('../validators/ticket.validator').downloadTicketValidator);
  assert.equal(stack[stack.length - 2].handle, require('../middlewares/validate.middleware'));
  assert.equal(stack[stack.length - 1].name, 'bound downloadTicket');
  assert.equal(stack[stack.length - 1].handle, module.controller.downloadTicket);
  const injected = createTicketModule({ repository: { findBookingForTicket: async () => null } });
  assert.notEqual(injected.service, module.service);
  assert.equal(injected.controller.service, injected.service);
  assert.equal(injected.router, undefined, 'Ticket has no second HTTP router');
});

test('Booking ticket HTTP route keeps guest validation, legacy email alias and PDF headers', async (t) => {
  const service = require('../services/ticket.service');
  t.mock.method(service, 'generateTicketPDF', async (_id, _user, email) => {
    assert.equal(email, 'guest@example.com');
    return Buffer.from('%PDF-test');
  });
  const app = express();
  app.use('/bookings', require('../routes/booking.route'));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/bookings/12/ticket`;
    const missing = await fetch(base);
    assert.equal(missing.status, 422);
    const conflict = await fetch(`${base}?guest_email=a%40example.com&email=b%40example.com`);
    assert.equal(conflict.status, 422);
    const valid = await fetch(`${base}?email=GUEST%40EXAMPLE.COM`);
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('content-type'), 'application/pdf');
    assert.equal(valid.headers.get('content-disposition'), 'attachment; filename="ticket_12.pdf"');
    assert.equal(await valid.text(), '%PDF-test');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
