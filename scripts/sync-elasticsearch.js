'use strict';

require('dotenv').config();
const models = require('../models');
const { getElasticsearchClient, checkElasticsearchHealth } = require('../infrastructure/elasticsearch/elasticsearchClient');
const { syncAllToElasticsearch } = require('../infrastructure/elasticsearch/elasticsearchSync');

async function main() {
  console.log('--- KHỞI ĐỘNG ĐỒNG BỘ DỮ LIỆU SANG ELASTICSEARCH ---');
  const client = getElasticsearchClient();

  const health = await checkElasticsearchHealth(client);
  if (!health.isAvailable) {
    console.error(`[LỖI] Không thể kết nối tới Elasticsearch cluster: ${health.error}`);
    console.error('Vui lòng kiểm tra Docker container hoặc Elasticsearch service.');
    process.exit(1);
  }

  console.log(`[OK] Kết nối Elasticsearch thành công (${health.status}). Đang tiến hành tạo index và đồng bộ...`);

  try {
    const stats = await syncAllToElasticsearch({ models, client });
    console.log('--- KẾT QUẢ ĐỒNG BỘ ---');
    console.log(`- Sân bay (Airports): Tổng ${stats.airports.total} bản ghi | Thành công: ${stats.airports.indexed} | Lỗi: ${stats.airports.errors}`);
    console.log(`- Chuyến bay (Flights): Tổng ${stats.flights.total} bản ghi | Thành công: ${stats.flights.indexed} | Lỗi: ${stats.flights.errors}`);
    console.log('--- ĐỒNG BỘ HOÀN TẤT THÀNH CÔNG ---');
    process.exit(0);
  } catch (error) {
    console.error('[LỖI] Xảy ra sự cố trong quá trình đồng bộ:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

