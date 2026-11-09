'use strict';

const { Client } = require('@elastic/elasticsearch');

let clientInstance = null;
let lastKnownStatus = {
  isAvailable: false,
  checkedAt: null,
  clusterInfo: null,
  lastError: null,
};

/**
 * Lấy cấu hình node Elasticsearch từ biến môi trường.
 */
function getElasticsearchNode() {
  return process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
}

/**
 * Khởi tạo hoặc lấy Elasticsearch Client singleton tập trung.
 *
 * @param {object} [options]
 * @returns {Client}
 */
function getElasticsearchClient(options = {}) {
  if (options.client) {
    return options.client;
  }

  if (!clientInstance) {
    const node = options.node || getElasticsearchNode();
    const requestTimeout = options.requestTimeout || Number(process.env.ELASTICSEARCH_TIMEOUT_MS || 2500);
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 1;

    clientInstance = new Client({
      node,
      requestTimeout,
      maxRetries,
    });
  }

  return clientInstance;
}

/**
 * Reset singleton client (dùng cho unit test).
 */
function resetElasticsearchClient() {
  clientInstance = null;
  lastKnownStatus = {
    isAvailable: false,
    checkedAt: null,
    clusterInfo: null,
    lastError: null,
  };
}

/**
 * Kiểm tra kết nối và trạng thái cluster của Elasticsearch.
 *
 * @param {Client} [client]
 * @returns {Promise<{ isAvailable: boolean, status: string, clusterInfo: object|null, error: string|null }>}
 */
async function checkElasticsearchHealth(client = getElasticsearchClient()) {
  try {
    const pingResult = await client.ping();
    if (!pingResult) {
      lastKnownStatus = {
        isAvailable: false,
        checkedAt: new Date(),
        clusterInfo: null,
        lastError: 'Elasticsearch ping returned false',
      };
      return { isAvailable: false, status: 'red', clusterInfo: null, error: 'Ping failed' };
    }

    let clusterInfo = null;
    try {
      const infoRes = await client.info();
      clusterInfo = infoRes?.body || infoRes;
    } catch {
      // Bỏ qua nếu info không lấy được
    }

    lastKnownStatus = {
      isAvailable: true,
      checkedAt: new Date(),
      clusterInfo,
      lastError: null,
    };

    return {
      isAvailable: true,
      status: 'green',
      clusterInfo,
      error: null,
    };
  } catch (error) {
    lastKnownStatus = {
      isAvailable: false,
      checkedAt: new Date(),
      clusterInfo: null,
      lastError: error.message || String(error),
    };

    return {
      isAvailable: false,
      status: 'unavailable',
      clusterInfo: null,
      error: error.message || String(error),
    };
  }
}

/**
 * Kiểm tra nhanh trạng thái kết nối gần nhất hoặc ping trực tiếp.
 */
async function isElasticsearchOnline(client = getElasticsearchClient()) {
  const health = await checkElasticsearchHealth(client);
  return health.isAvailable;
}

module.exports = {
  getElasticsearchNode,
  getElasticsearchClient,
  resetElasticsearchClient,
  checkElasticsearchHealth,
  isElasticsearchOnline,
};

