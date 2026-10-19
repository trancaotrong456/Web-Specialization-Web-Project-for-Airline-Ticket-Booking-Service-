class AirlineService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('An Airline repository is required');
    this.repository = repository;
  }

  async getAll({ page = 1, limit = 20, search } = {}) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const searchTerm = search && search.trim() ? search.trim() : undefined;
    const { count, rows } = await this.repository.findPage({
      page: pageNumber,
      limit: limitNumber,
      search: searchTerm,
    });

    return { total: count, page: pageNumber, limit: limitNumber, data: rows };
  }

  async getById(id) {
    const airline = await this.repository.findById(id);
    if (!airline) {
      const error = new Error('Airline not found');
      error.statusCode = 404;
      throw error;
    }
    return airline;
  }

  async create(data) {
    const payload = {
      name: data.name.trim(),
      iata_code: data.iata_code.trim().toUpperCase(),
      logo_url: data.logo_url ? data.logo_url.trim() : null,
    };

    const existing = await this.repository.findByIataCode(payload.iata_code);
    if (existing) throw this.createDuplicateIataError();

    try {
      return await this.repository.create(payload);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') throw this.createDuplicateIataError();
      throw error;
    }
  }

  async update(id, data) {
    const airline = await this.getById(id);
    const payload = {};

    if (data.name !== undefined) payload.name = data.name.trim();

    if (data.iata_code !== undefined) {
      const normalizedIata = data.iata_code.trim().toUpperCase();
      if (normalizedIata !== airline.iata_code) {
        const existing = await this.repository.findByIataCode(normalizedIata, { excludeId: id });
        if (existing) throw this.createDuplicateIataError();
      }
      payload.iata_code = normalizedIata;
    }

    if (data.logo_url !== undefined) payload.logo_url = data.logo_url ? data.logo_url.trim() : null;

    try {
      await this.repository.update(airline, payload);
      return airline;
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') throw this.createDuplicateIataError();
      throw error;
    }
  }

  async delete(id) {
    const airline = await this.getById(id);
    const flightCount = await this.repository.countFlightsByAirlineId(id);
    if (flightCount > 0) {
      const error = new Error('Cannot delete airline with existing flights');
      error.statusCode = 409;
      throw error;
    }

    await this.repository.delete(airline);
    return { id: Number(id), message: 'Airline deleted' };
  }

  async getStatistics() {
    return this.repository.getFlightStatistics();
  }

  async uploadLogo({ file, filename } = {}) {
    if (!file) {
      const error = new Error('File payload is required');
      error.statusCode = 400;
      throw error;
    }

    let buffer;
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === 'string') {
      const base64Data = file.replace(/^data:image\/[a-zA-Z0-9-.+]+;base64,/, '');
      try {
        buffer = Buffer.from(base64Data, 'base64');
      } catch {
        const error = new Error('Invalid base64 image data');
        error.statusCode = 400;
        throw error;
      }
    } else {
      const error = new Error('File payload must be a buffer or base64 string');
      error.statusCode = 400;
      throw error;
    }

    if (!buffer || buffer.length === 0) {
      const error = new Error('Uploaded file is empty');
      error.statusCode = 400;
      throw error;
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (buffer.length > MAX_FILE_SIZE) {
      const error = new Error('File size exceeds maximum limit of 5MB');
      error.statusCode = 400;
      throw error;
    }

    const detected = this.detectImageFormat(buffer);
    if (!detected) {
      const error = new Error('Invalid image format. Allowed formats are PNG, JPEG, and WebP');
      error.statusCode = 400;
      throw error;
    }

    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    const safeFilename = `${crypto.randomUUID()}.${detected.ext}`;
    const targetDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'airlines');

    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeFilename);
    fs.writeFileSync(targetPath, buffer);

    return {
      url: `/public/uploads/airlines/${safeFilename}`,
      filename: safeFilename,
      mime_type: detected.mime,
      size: buffer.length,
    };
  }

  detectImageFormat(buf) {
    if (!buf || buf.length < 12) return null;
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { ext: 'png', mime: 'image/png' };
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
      return { ext: 'jpg', mime: 'image/jpeg' };
    }
    // WebP: RIFF .... WEBP
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return { ext: 'webp', mime: 'image/webp' };
    }
    return null;
  }

  createDuplicateIataError() {
    const error = new Error('Airline with this IATA code already exists');
    error.statusCode = 409;
    return error;
  }
}

module.exports = AirlineService;
