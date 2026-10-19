const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { SequelizeAirlineRepository } = require('../modules/airline/airline.repository');
const AirlineService = require('../modules/airline/airline.service');
const AirlineController = require('../modules/airline/airline.controller');
const { createAirlineModule } = require('../modules/airline');

test('SequelizeAirlineRepository.getFlightStatistics aggregates flights accurately by airline without duplicate counts', async () => {
  const mockAirlines = [
    { id: 1, name: 'Bamboo Airways', iata_code: 'QH', logo_url: 'https://img.test/qh.png' },
    { id: 2, name: 'Vietjet Air', iata_code: 'VJ', logo_url: 'https://img.test/vj.png' },
    { id: 3, name: 'Vietnam Airlines', iata_code: 'VN', logo_url: 'https://img.test/vn.png' },
  ];

  const mockFlightRows = [
    { airline_id: 1, status: 'scheduled', flight_count: 3 },
    { airline_id: 1, status: 'completed', flight_count: 2 },
    { airline_id: 3, status: 'scheduled', flight_count: 7 },
  ];

  const repository = new SequelizeAirlineRepository({
    Airline: {
      findAll: async () => mockAirlines,
    },
    Flight: {
      findAll: async () => mockFlightRows,
      sequelize: null,
    },
    Op: {},
  });

  const stats = await repository.getFlightStatistics();

  assert.equal(stats.total_airlines, 3);
  assert.equal(stats.total_flights, 12);
  assert.equal(stats.airlines.length, 3);

  // Bamboo Airways
  assert.deepEqual(stats.airlines[0], {
    id: 1,
    name: 'Bamboo Airways',
    iata_code: 'QH',
    logo_url: 'https://img.test/qh.png',
    total_flights: 5,
    status_breakdown: { scheduled: 3, completed: 2 },
  });

  // Vietjet Air has 0 flights, still appears with total_flights: 0
  assert.deepEqual(stats.airlines[1], {
    id: 2,
    name: 'Vietjet Air',
    iata_code: 'VJ',
    logo_url: 'https://img.test/vj.png',
    total_flights: 0,
    status_breakdown: {},
  });

  // Vietnam Airlines
  assert.deepEqual(stats.airlines[2], {
    id: 3,
    name: 'Vietnam Airlines',
    iata_code: 'VN',
    logo_url: 'https://img.test/vn.png',
    total_flights: 7,
    status_breakdown: { scheduled: 7 },
  });
});

test('SequelizeAirlineRepository.getFlightStatistics handles empty database correctly', async () => {
  const repository = new SequelizeAirlineRepository({
    Airline: {
      findAll: async () => [],
    },
    Flight: {
      findAll: async () => [],
      sequelize: null,
    },
    Op: {},
  });

  const stats = await repository.getFlightStatistics();
  assert.deepEqual(stats, {
    total_airlines: 0,
    total_flights: 0,
    airlines: [],
  });
});

test('AirlineService.getStatistics delegates directly to repository', async () => {
  let called = false;
  const mockRepo = {
    async getFlightStatistics() {
      called = true;
      return { total_airlines: 1, total_flights: 4, airlines: [] };
    },
  };

  const service = new AirlineService({ repository: mockRepo });
  const result = await service.getStatistics();
  assert.equal(called, true);
  assert.equal(result.total_airlines, 1);
  assert.equal(result.total_flights, 4);
});

test('AirlineController.getStatistics returns formatted success response with data', async () => {
  const mockStats = {
    total_airlines: 2,
    total_flights: 10,
    airlines: [
      { id: 1, name: 'Airline 1', iata_code: 'A1', total_flights: 6 },
      { id: 2, name: 'Airline 2', iata_code: 'A2', total_flights: 4 },
    ],
  };

  const mockService = {
    async getStatistics() {
      return mockStats;
    },
  };

  let responsePayload;
  let statusSet;
  const res = {
    status(s) {
      statusSet = s;
      return this;
    },
    json(data) {
      responsePayload = data;
      return this;
    },
  };

  const controller = new AirlineController({
    service: mockService,
    apiResponse: {
      success(r, data, message) {
        return r.status(200).json({ success: true, message, data });
      },
    },
  });

  await controller.getStatistics({}, res, () => {});
  assert.equal(statusSet, 200);
  assert.deepEqual(responsePayload, {
    success: true,
    message: 'Airline flight statistics retrieved',
    data: mockStats,
  });
});

test('Airline module router protects GET /statistics with authentication and admin authorization', () => {
  const authEvents = [];
  const guards = {
    authenticate: (req, res, next) => {
      authEvents.push('authenticate');
      next();
    },
    authorize: (role) => {
      authEvents.push(`authorize:${role}`);
      return (req, res, next) => {
        authEvents.push('adminPassed');
        next();
      };
    },
  };

  const controller = {
    getAll: () => {},
    getById: () => {},
    create: () => {},
    update: () => {},
    delete: () => {},
    getStatistics: () => {},
  };

  const validation = { validate: (req, res, next) => next() };
  const validators = {
    listAirlineValidator: [],
    airlineIdValidator: [],
    createAirlineValidator: [],
    updateAirlineValidator: [],
  };

  const module = createAirlineModule({
    expressModule: express,
    controller,
    guards,
    validation,
    validators,
  });

  const statsRoute = module.router.stack.find(
    (layer) => layer.route && layer.route.path === '/statistics' && layer.route.methods.get
  );

  assert.ok(statsRoute, 'GET /statistics route must be registered');
  assert.equal(authEvents.includes('authorize:admin'), true);
});
