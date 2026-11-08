'use strict';

const INDEX_NAMES = {
  AIRPORTS: 'airports',
  FLIGHTS: 'flights',
};

const COMMON_ANALYSIS_SETTINGS = {
  analysis: {
    analyzer: {
      // Tách từ + chuyển chữ thường + loại bỏ dấu tiếng Việt (asciifolding)
      // Dựa trên hướng dẫn tài liệu Tim_kiem_User_Elasticsearch.docx
      vi_analyzer: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding'],
      },
    },
  },
};

const AIRPORTS_INDEX_CONFIG = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    ...COMMON_ANALYSIS_SETTINGS,
  },
  mappings: {
    properties: {
      id: { type: 'integer' },
      iata_code: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'vi_analyzer',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      city: {
        type: 'text',
        analyzer: 'vi_analyzer',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      country: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
    },
  },
};

const FLIGHTS_INDEX_CONFIG = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    ...COMMON_ANALYSIS_SETTINGS,
  },
  mappings: {
    properties: {
      id: { type: 'integer' },
      flight_number: {
        type: 'keyword',
        fields: {
          text: {
            type: 'text',
            analyzer: 'vi_analyzer',
          },
        },
      },
      status: { type: 'keyword' },
      airline_id: { type: 'integer' },
      departure_airport_id: { type: 'integer' },
      arrival_airport_id: { type: 'integer' },
      airline_name: {
        type: 'text',
        analyzer: 'vi_analyzer',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      airline_code: { type: 'keyword' },
      departure_airport_code: { type: 'keyword' },
      departure_airport_name: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
      departure_airport_city: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
      arrival_airport_code: { type: 'keyword' },
      arrival_airport_name: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
      arrival_airport_city: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
      fare_classes: {
        type: 'text',
        analyzer: 'vi_analyzer',
      },
    },
  },
};

/**
 * Đảm bảo các index cần thiết đã tồn tại trong Elasticsearch.
 * Không xóa index cũ để tránh mất dữ liệu (idempotent).
 *
 * @param {import('@elastic/elasticsearch').Client} client
 * @returns {Promise<{ created: string[], existed: string[] }>}
 */
async function ensureIndicesExist(client) {
  const created = [];
  const existed = [];

  const indices = [
    { name: INDEX_NAMES.AIRPORTS, config: AIRPORTS_INDEX_CONFIG },
    { name: INDEX_NAMES.FLIGHTS, config: FLIGHTS_INDEX_CONFIG },
  ];

  for (const { name, config } of indices) {
    try {
      const exists = await client.indices.exists({ index: name });
      const doesExist = typeof exists === 'boolean' ? exists : exists?.body ?? false;

      if (!doesExist) {
        await client.indices.create({
          index: name,
          ...config,
        });
        created.push(name);
      } else {
        existed.push(name);
      }
    } catch (error) {
      // Nếu index đã tồn tại do race condition thì bỏ qua
      if (error?.meta?.body?.error?.type === 'resource_already_exists_exception') {
        existed.push(name);
      } else {
        throw error;
      }
    }
  }

  return { created, existed };
}

module.exports = {
  INDEX_NAMES,
  COMMON_ANALYSIS_SETTINGS,
  AIRPORTS_INDEX_CONFIG,
  FLIGHTS_INDEX_CONFIG,
  ensureIndicesExist,
};

