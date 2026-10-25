const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const AirlineService = require('../modules/airline/airline.service');
const AirlineController = require('../modules/airline/airline.controller');
const { createAirlineModule } = require('../modules/airline');

test('AirlineService.uploadLogo accepts valid PNG buffer and stores it safely in public uploads directory', async () => {
  const service = new AirlineService({ repository: {} });
  // Valid PNG header (8 bytes) + minimal data
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const result = await service.uploadLogo({ file: pngHeader, filename: 'test-logo.png' });

  assert.ok(result.url.startsWith('/public/uploads/airlines/'));
  assert.ok(result.filename.endsWith('.png'));
  assert.equal(result.mime_type, 'image/png');
  assert.equal(result.size, pngHeader.length);

  // Clean up created file
  const filePath = path.join(__dirname, '..', 'public', 'uploads', 'airlines', result.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

test('AirlineService.uploadLogo accepts base64 data URL string for JPEG image', async () => {
  const service = new AirlineService({ repository: {} });
  // Valid JPEG header
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const base64Data = `data:image/jpeg;base64,${jpegHeader.toString('base64')}`;

  const result = await service.uploadLogo({ file: base64Data, filename: 'test.jpg' });
  assert.ok(result.url.startsWith('/public/uploads/airlines/'));
  assert.ok(result.filename.endsWith('.jpg'));
  assert.equal(result.mime_type, 'image/jpeg');

  // Clean up
  const filePath = path.join(__dirname, '..', 'public', 'uploads', 'airlines', result.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

test('AirlineService.uploadLogo accepts valid WebP buffer', async () => {
  const service = new AirlineService({ repository: {} });
  // Valid WebP header: RIFF (4) + length (4) + WEBP (4)
  const webpHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // file size
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);

  const result = await service.uploadLogo({ file: webpHeader, filename: 'test.webp' });
  assert.ok(result.url.startsWith('/public/uploads/airlines/'));
  assert.ok(result.filename.endsWith('.webp'));
  assert.equal(result.mime_type, 'image/webp');

  // Clean up
  const filePath = path.join(__dirname, '..', 'public', 'uploads', 'airlines', result.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

test('AirlineService.uploadLogo rejects spoofed content with non-image magic bytes', async () => {
  const service = new AirlineService({ repository: {} });
  // Text file content claiming to be an image
  const fakeImage = Buffer.from('<html><script>alert("hacked")</script></html>');

  await assert.rejects(
    service.uploadLogo({ file: fakeImage, filename: 'malicious.png' }),
    (error) => error.statusCode === 400 && error.message.includes('Invalid image format'),
  );
});

test('AirlineService.uploadLogo rejects empty file payload', async () => {
  const service = new AirlineService({ repository: {} });
  await assert.rejects(
    service.uploadLogo({ file: null }),
    (error) => error.statusCode === 400 && error.message.includes('required'),
  );

  await assert.rejects(
    service.uploadLogo({ file: Buffer.alloc(0) }),
    (error) => error.statusCode === 400 && error.message.includes('empty'),
  );
});

test('AirlineService.uploadLogo rejects files exceeding maximum size limit', async () => {
  const service = new AirlineService({ repository: {} });
  const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
  // Give it valid PNG header so size check is what triggers failure
  oversizedBuffer[0] = 0x89;
  oversizedBuffer[1] = 0x50;
  oversizedBuffer[2] = 0x4E;
  oversizedBuffer[3] = 0x47;

  await assert.rejects(
    service.uploadLogo({ file: oversizedBuffer, filename: 'big.png' }),
    (error) => error.statusCode === 400 && error.message.includes('exceeds maximum limit'),
  );
});

test('AirlineController.uploadLogo invokes service and returns standard apiResponse', async () => {
  const mockService = {
    async uploadLogo({ file, filename }) {
      return { url: '/public/uploads/airlines/abc-123.png', filename: 'abc-123.png', size: 100 };
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

  await controller.uploadLogo({ body: { file: 'data:...', filename: 'logo.png' } }, res, () => {});
  assert.equal(statusSet, 200);
  assert.deepEqual(responsePayload, {
    success: true,
    message: 'Logo uploaded successfully',
    data: { url: '/public/uploads/airlines/abc-123.png', filename: 'abc-123.png', size: 100 },
  });
});

test('Airline module router protects POST /upload-logo with authentication and admin authorization', () => {
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
    uploadLogo: () => {},
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

  const uploadRoute = module.router.stack.find(
    (layer) => layer.route && layer.route.path === '/upload-logo' && layer.route.methods.post
  );

  assert.ok(uploadRoute, 'POST /upload-logo route must be registered');
  assert.equal(authEvents.includes('authorize:admin'), true);
});
