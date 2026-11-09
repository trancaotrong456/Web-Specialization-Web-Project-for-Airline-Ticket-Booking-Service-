'use strict';

const { getElasticsearchClient, checkElasticsearchHealth } = require('../../../infrastructure/elasticsearch/elasticsearchClient');
const { INDEX_NAMES, ensureIndicesExist } = require('../../../infrastructure/elasticsearch/indexManager');
const { formatAirportDoc, formatFlightDoc, syncAllToElasticsearch } = require('../../../infrastructure/elasticsearch/elasticsearchSync');

/**
 * Chuẩn hóa và loại bỏ dấu tiếng Việt (diacritics), chuyển ký tự đ/Đ thành d/D.
 *
 * @param {string} str - Chuỗi đầu vào
 * @returns {string} - Chuỗi đã loại bỏ dấu tiếng Việt
 */
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));
}

class FlightSearchEngine {
  constructor(options = {}) {
    this.options = options;
    this.esClient = options.client || getElasticsearchClient(options);
    this.lastFallbackTime = null;
    this._indicesChecked = false;
    // Hàng đợi đồng bộ bù khi Elasticsearch offline (Idempotent Offline Catch-up Buffer)
    // Key: `${type}:${id}`, Value: { type, action: 'upsert'|'delete', id, data, timestamp }
    this.pendingSyncQueue = new Map();
  }

  /**
   * Lấy số lượng thao tác đang chờ đồng bộ bù.
   */
  getPendingQueueSize() {
    return this.pendingSyncQueue.size;
  }

  /**
   * Lấy danh sách các thao tác trong hàng đợi bù.
   */
  getPendingQueue() {
    return Array.from(this.pendingSyncQueue.values());
  }

  /**
   * Xóa toàn bộ hàng đợi bù (dùng cho test/reset).
   */
  clearPendingQueue() {
    this.pendingSyncQueue.clear();
  }

  /**
   * Đồng bộ bù toàn bộ các document trong hàng đợi sang Elasticsearch khi kết nối phục hồi.
   * Phương thức đảm bảo idempotent:
   * - Không tạo document trùng lặp (dùng ID làm document id).
   * - Cho phép chạy lại nhiều lần mà không gây lỗi hoặc tác dụng phụ.
   * - Tự động xóa khỏi hàng đợi khi thao tác thành công.
   *
   * @returns {Promise<{ processed: number, remaining: number }>}
   */
  async flushPendingSyncQueue() {
    if (this.pendingSyncQueue.size === 0) {
      return { processed: 0, remaining: 0 };
    }

    const items = Array.from(this.pendingSyncQueue.entries());
    let processed = 0;

    for (const [key, item] of items) {
      try {
        const indexName = item.type === 'airport' ? INDEX_NAMES.AIRPORTS : INDEX_NAMES.FLIGHTS;
        if (item.action === 'upsert') {
          await this.esClient.index({
            index: indexName,
            id: String(item.id),
            document: item.data,
            refresh: true,
          });
        } else if (item.action === 'delete') {
          try {
            await this.esClient.delete({
              index: indexName,
              id: String(item.id),
              refresh: true,
            });
          } catch (delError) {
            if (delError?.meta?.statusCode !== 404) throw delError;
          }
        }
        this.pendingSyncQueue.delete(key);
        processed += 1;
        console.log(`[Elasticsearch Catch-up] Đồng bộ bù thành công: ${key} (${item.action})`);
      } catch (error) {
        console.warn(`[Elasticsearch Catch-up] Chưa thể đồng bộ bù ${key} (Elasticsearch có thể vẫn chưa sẵn sàng):`, error.message);
        break; // Dừng lại nếu kết nối vẫn gặp lỗi, giữ nguyên phần còn lại trong hàng đợi
      }
    }

    return { processed, remaining: this.pendingSyncQueue.size };
  }

  /**
   * Đảm bảo index và mapping đã được khởi tạo trên Elasticsearch.
   */
  async ensureReady() {
    if (this._indicesChecked) return true;
    try {
      await ensureIndicesExist(this.esClient);
      this._indicesChecked = true;
      return true;
    } catch (error) {
      console.warn('[Elasticsearch] Chưa thể khởi tạo index:', error.message);
      return false;
    }
  }

  /**
   * Kiểm tra tình trạng kết nối Elasticsearch cluster.
   */
  async pingElasticsearch() {
    try {
      const health = await checkElasticsearchHealth(this.esClient);
      return health.isAvailable;
    } catch {
      return false;
    }
  }

  // ─── AIRPORTS ───────────────────────────────────────────────────────────────

  /**
   * Thêm hoặc cập nhật một sân bay vào Elasticsearch.
   *
   * @param {object} airport
   */
  async addAirport(airport) {
    const doc = formatAirportDoc(airport);
    if (!doc.id) return;

    try {
      await this.esClient.index({
        index: INDEX_NAMES.AIRPORTS,
        id: String(doc.id),
        document: doc,
        refresh: true,
      });
      // Nếu trước đó có trong hàng đợi đồng bộ bù thì xóa bỏ
      this.pendingSyncQueue.delete(`airport:${doc.id}`);
      if (this.pendingSyncQueue.size > 0) {
        this.flushPendingSyncQueue().catch(() => {});
      }
    } catch (error) {
      console.warn(`[Elasticsearch Offline] Không thể đồng bộ Airport #${doc.id}: ${error.message}. Đã lưu vào hàng đợi đồng bộ bù.`);
      this.pendingSyncQueue.set(`airport:${doc.id}`, {
        type: 'airport',
        action: 'upsert',
        id: doc.id,
        data: doc,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Xóa một sân bay khỏi Elasticsearch.
   *
   * @param {number|string} id
   */
  async removeAirport(id) {
    if (!id) return;
    try {
      await this.esClient.delete({
        index: INDEX_NAMES.AIRPORTS,
        id: String(id),
        refresh: true,
      });
      this.pendingSyncQueue.delete(`airport:${id}`);
      if (this.pendingSyncQueue.size > 0) {
        this.flushPendingSyncQueue().catch(() => {});
      }
    } catch (error) {
      if (error?.meta?.statusCode === 404) {
        this.pendingSyncQueue.delete(`airport:${id}`);
      } else {
        console.warn(`[Elasticsearch Offline] Không thể xóa Airport #${id}: ${error.message}. Đã lưu vào hàng đợi xóa bù.`);
        this.pendingSyncQueue.set(`airport:${id}`, {
          type: 'airport',
          action: 'delete',
          id,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Tìm kiếm sân bay qua Elasticsearch với hỗ trợ:
   * - Tìm kiếm chính xác (match, term)
   * - Tìm kiếm gần đúng / fuzzy (fuzziness: 'AUTO')
   * - Tìm kiếm tiền tố (match_bool_prefix)
   * - Xếp hạng theo _score
   *
   * Khi Elasticsearch gặp sự cố, tự động trả về cờ fallback để chuyển sang Database.
   *
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<Array<{ id: number, _score: number, source: string }> | { fallback: boolean, source: string, error: string }>}
   */
  async searchAirports(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const keyword = query.trim();
    const limit = options.limit || 50;

    // Tự động kiểm tra và flush các mục chờ bù nếu Elasticsearch vừa phục hồi
    if (this.pendingSyncQueue.size > 0) {
      await this.flushPendingSyncQueue();
    }

    try {
      // Câu truy vấn Elasticsearch chuẩn mực dựa trên tài liệu Tim_kiem_User_Elasticsearch.docx
      const esResponse = await this.esClient.search({
        index: INDEX_NAMES.AIRPORTS,
        query: {
          bool: {
            should: [
              // 1. So khớp chính xác hoặc tiền tố mã IATA (ưu tiên cao nhất)
              { term: { iata_code: { value: keyword.toUpperCase(), boost: 5.0 } } },
              { match_bool_prefix: { iata_code: { query: keyword.toUpperCase(), boost: 3.5 } } },

              // 2. So khớp mờ (Fuzzy) trên tên sân bay (hỗ trợ cả chuẩn có dấu và không dấu qua vi analyzer)
              { match: { name: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.0 } } },
              { match: { 'name.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.0 } } },
              { match_bool_prefix: { name: { query: keyword, operator: 'and', boost: 1.8 } } },
              { match_bool_prefix: { 'name.vi': { query: keyword, operator: 'and', boost: 1.8 } } },

              // 3. So khớp mờ trên thành phố (hỗ trợ cả chuẩn có dấu và không dấu)
              { match: { city: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.5 } } },
              { match: { 'city.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.5 } } },
              { match_bool_prefix: { city: { query: keyword, operator: 'and', boost: 2.0 } } },
              { match_bool_prefix: { 'city.vi': { query: keyword, operator: 'and', boost: 2.0 } } },

              // 4. So khớp trên quốc gia
              { match: { country: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 1.0 } } },
              { match_bool_prefix: { country: { query: keyword, operator: 'and', boost: 0.8 } } },
            ],
            minimum_should_match: 1,
          },
        },
        size: limit,
      });

      const hits = esResponse?.hits?.hits || esResponse?.body?.hits?.hits || [];
      console.log(`[Elasticsearch] Tìm kiếm Airport: "${keyword}" -> Tìm thấy ${hits.length} kết quả (nguồn: Elasticsearch)`);

      const results = hits.map((hit) => ({
        id: Number(hit._source?.id || hit._id),
        iata_code: hit._source?.iata_code,
        name: hit._source?.name,
        city: hit._source?.city,
        country: hit._source?.country,
        _score: hit._score,
        source: 'elasticsearch',
      }));

      // Gắn thuộc tính bổ trợ để caller nhận diện nguồn
      results.source = 'elasticsearch';
      results.fallback = false;
      return results;
    } catch (error) {
      console.warn(`[Elasticsearch Fallback] Sân bay: Chuyển sang tìm kiếm Database LIKE cho từ khóa "${keyword}" (Lý do: ${error.message})`);
      return {
        fallback: true,
        source: 'database',
        error: error.message,
        items: [],
      };
    }
  }

  // ─── FLIGHTS ────────────────────────────────────────────────────────────────

  /**
   * Thêm hoặc cập nhật chuyến bay vào Elasticsearch.
   *
   * @param {object} flight
   */
  async addFlight(flight) {
    const doc = formatFlightDoc(flight);
    if (!doc.id) return;

    try {
      await this.esClient.index({
        index: INDEX_NAMES.FLIGHTS,
        id: String(doc.id),
        document: doc,
        refresh: true,
      });
      this.pendingSyncQueue.delete(`flight:${doc.id}`);
      if (this.pendingSyncQueue.size > 0) {
        this.flushPendingSyncQueue().catch(() => {});
      }
    } catch (error) {
      console.warn(`[Elasticsearch Offline] Không thể đồng bộ Flight #${doc.id}: ${error.message}. Đã lưu vào hàng đợi đồng bộ bù.`);
      this.pendingSyncQueue.set(`flight:${doc.id}`, {
        type: 'flight',
        action: 'upsert',
        id: doc.id,
        data: doc,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Xóa chuyến bay khỏi Elasticsearch.
   *
   * @param {number|string} id
   */
  async removeFlight(id) {
    if (!id) return;
    try {
      await this.esClient.delete({
        index: INDEX_NAMES.FLIGHTS,
        id: String(id),
        refresh: true,
      });
      this.pendingSyncQueue.delete(`flight:${id}`);
      if (this.pendingSyncQueue.size > 0) {
        this.flushPendingSyncQueue().catch(() => {});
      }
    } catch (error) {
      if (error?.meta?.statusCode === 404) {
        this.pendingSyncQueue.delete(`flight:${id}`);
      } else {
        console.warn(`[Elasticsearch Offline] Không thể xóa Flight #${id}: ${error.message}. Đã lưu vào hàng đợi xóa bù.`);
        this.pendingSyncQueue.set(`flight:${id}`, {
          type: 'flight',
          action: 'delete',
          id,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Tìm kiếm chuyến bay qua Elasticsearch với hỗ trợ:
   * - Tìm kiếm chính xác (mã chuyến bay, mã hãng, mã sân bay)
   * - Tìm kiếm gần đúng / fuzzy (tên hãng, tên thành phố, tên sân bay)
   * - Tìm kiếm tiền tố (match_bool_prefix)
   * - Xếp hạng theo _score
   *
   * Khi Elasticsearch gặp sự cố, tự động trả về cờ fallback để chuyển sang Database.
   *
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<Array<{ id: number, _score: number, source: string }> | { fallback: boolean, source: string, error: string }>}
   */
  async searchFlights(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const keyword = query.trim();
    const limit = options.limit || 50;

    // Tự động kiểm tra và flush các mục chờ bù nếu Elasticsearch vừa phục hồi
    if (this.pendingSyncQueue.size > 0) {
      await this.flushPendingSyncQueue();
    }

    try {
      // Câu truy vấn Elasticsearch chuẩn mực dựa trên tài liệu Tim_kiem_User_Elasticsearch.docx
      const esResponse = await this.esClient.search({
        index: INDEX_NAMES.FLIGHTS,
        query: {
          bool: {
            should: [
              // 1. Số hiệu chuyến bay (VN123, VJ456...)
              { term: { flight_number: { value: keyword.toUpperCase(), boost: 6.0 } } },
              { match_bool_prefix: { flight_number: { query: keyword.toUpperCase(), boost: 4.0 } } },
              { match: { 'flight_number.text': { query: keyword, boost: 3.0 } } },

              // 2. Mã IATA sân bay đi / đến / hãng
              { term: { departure_airport_code: { value: keyword.toUpperCase(), boost: 3.5 } } },
              { term: { arrival_airport_code: { value: keyword.toUpperCase(), boost: 3.5 } } },
              { term: { airline_code: { value: keyword.toUpperCase(), boost: 3.5 } } },

              // 3. Tên hãng hàng không (Fuzzy: "Vjetjet" -> "Vietjet Air")
              { match: { airline_name: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.5 } } },
              { match: { 'airline_name.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.5 } } },
              { match_bool_prefix: { airline_name: { query: keyword, operator: 'and', boost: 2.0 } } },
              { match_bool_prefix: { 'airline_name.vi': { query: keyword, operator: 'and', boost: 2.0 } } },

              // 4. Thành phố khởi hành
              { match: { departure_airport_city: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.2 } } },
              { match: { 'departure_airport_city.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.2 } } },
              { match_bool_prefix: { departure_airport_city: { query: keyword, operator: 'and', boost: 1.8 } } },
              { match_bool_prefix: { 'departure_airport_city.vi': { query: keyword, operator: 'and', boost: 1.8 } } },

              // 5. Thành phố đến
              { match: { arrival_airport_city: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.2 } } },
              { match: { 'arrival_airport_city.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 2.2 } } },
              { match_bool_prefix: { arrival_airport_city: { query: keyword, operator: 'and', boost: 1.8 } } },
              { match_bool_prefix: { 'arrival_airport_city.vi': { query: keyword, operator: 'and', boost: 1.8 } } },

              // 6. Tên sân bay đi / đến
              { match: { departure_airport_name: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 1.5 } } },
              { match: { 'departure_airport_name.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 1.5 } } },
              { match_bool_prefix: { departure_airport_name: { query: keyword, operator: 'and', boost: 1.2 } } },
              { match_bool_prefix: { 'departure_airport_name.vi': { query: keyword, operator: 'and', boost: 1.2 } } },
              { match: { arrival_airport_name: { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 1.5 } } },
              { match: { 'arrival_airport_name.vi': { query: keyword, fuzziness: 'AUTO', operator: 'and', boost: 1.5 } } },
              { match_bool_prefix: { arrival_airport_name: { query: keyword, operator: 'and', boost: 1.2 } } },
              { match_bool_prefix: { 'arrival_airport_name.vi': { query: keyword, operator: 'and', boost: 1.2 } } },
            ],
            minimum_should_match: 1,
          },
        },
        size: limit,
      });

      const hits = esResponse?.hits?.hits || esResponse?.body?.hits?.hits || [];
      console.log(`[Elasticsearch] Tìm kiếm Flight: "${keyword}" -> Tìm thấy ${hits.length} kết quả (nguồn: Elasticsearch)`);

      const results = hits.map((hit) => ({
        id: Number(hit._source?.id || hit._id),
        flight_number: hit._source?.flight_number,
        airline_name: hit._source?.airline_name,
        departure_airport_city: hit._source?.departure_airport_city,
        arrival_airport_city: hit._source?.arrival_airport_city,
        _score: hit._score,
        source: 'elasticsearch',
      }));

      results.source = 'elasticsearch';
      results.fallback = false;
      return results;
    } catch (error) {
      console.warn(`[Elasticsearch Fallback] Chuyến bay: Chuyển sang tìm kiếm Database LIKE cho từ khóa "${keyword}" (Lý do: ${error.message})`);
      return {
        fallback: true,
        source: 'database',
        error: error.message,
        items: [],
      };
    }
  }

  // ─── AIRLINES ───────────────────────────────────────────────────────────────

  async addAirline(airline) {
    // Để tương thích nếu có gọi
  }

  async removeAirline(id) {
    // Để tương thích nếu có gọi
  }

  // ─── DATABASE SYNC ──────────────────────────────────────────────────────────

  /**
   * Đồng bộ toàn bộ dữ liệu từ Database sang Elasticsearch.
   *
   * @param {object} models
   */
  async syncFromDatabase(models) {
    if (!models) return;
    try {
      return await syncAllToElasticsearch({ models, client: this.esClient });
    } catch (error) {
      console.warn('[Elasticsearch] Đồng bộ ban đầu từ Database thất bại (Elasticsearch có thể đang offline):', error.message);
    }
  }
}

// Singleton instance dùng chung trong ứng dụng
let defaultInstance = null;

function getSearchEngine(options) {
  if (!defaultInstance || options) {
    defaultInstance = new FlightSearchEngine(options);
  }
  return defaultInstance;
}

function resetSearchEngine() {
  defaultInstance = null;
}

module.exports = {
  FlightSearchEngine,
  getSearchEngine,
  resetSearchEngine,
  removeVietnameseTones,
};
