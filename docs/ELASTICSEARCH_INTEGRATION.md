# TÍCH HỢP ELASTICSEARCH TRONG HỆ THỐNG SERENE FLIGHTWAYS

Tài liệu này hướng dẫn chi tiết kiến trúc, cấu hình, đồng bộ dữ liệu, cơ chế truy vấn tìm kiếm nâng cao và giải pháp dự phòng Database Fallback của hệ thống đặt vé máy bay Serene Flightways.

---

## 1. TỔNG QUAN KIẾN TRÚC

Hệ thống sử dụng **Elasticsearch 8.11.0** làm công cụ tìm kiếm chính thức cho Chuyến bay (`Flight`) và Sân bay (`Airport`), tuân thủ phương pháp luận và cấu trúc từ tài liệu giảng viên `Tim_kiem_User_Elasticsearch.docx`.

```
                    ┌───────────────────────────────┐
                    │      Client / Frontend        │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │   Express Backend (Modular Monolith)                   │
       │   - AirportService / FlightService                     │
       └────────────────────────────┬───────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │  Elasticsearch Client  │      │  Sequelize Repository  │
       │  (Cơ chế chính)        │      │  (Dự phòng - Fallback) │
       │  - Fuzzy (fuzziness)   │      │  - SQL LIKE            │
       │  - Prefix (bool_prefix)│      │  - Tự kích hoạt khi    │
       │  - Xếp hạng theo _score│      │    ES lỗi hoặc offline │
       └────────────────────────┘      └────────────────────────┘
```

- **Khi Elasticsearch hoạt động**: Các truy vấn tìm kiếm được chuyển sang Elasticsearch để tận dụng khả năng tìm kiếm toàn văn, bỏ dấu tiếng Việt, tìm gần đúng (Fuzzy), tìm tiền tố và xếp hạng theo độ liên quan (`_score`).
- **Khi Elasticsearch gặp sự cố hoặc offline**: Hệ thống tự động chuyển sang cơ chế dự phòng **Database Fallback (SQL `LIKE`)**, ghi log cảnh báo rõ ràng `[Elasticsearch Fallback]`, giữ nguyên 100% điều kiện lọc nghiệp vụ và không làm sập ứng dụng.
- **Khi Elasticsearch phục hồi**: Hệ thống tự động tiếp tục phục vụ tìm kiếm bằng Elasticsearch mà không cần khởi động lại server.
- **Hoàn toàn loại bỏ MiniSearch** và các công cụ in-memory search engine trong luồng tìm kiếm nghiệp vụ.

---

## 2. CẤU TRÚC INDEX VÀ MAPPINGS

Hệ thống định nghĩa 2 index chuẩn: `airports` và `flights`.

### 2.1. Analyzer Tiếng Việt (`vi_analyzer`)
Dựa trên nguyên lý của tài liệu giảng viên, analyzer tiếng Việt được cấu hình:
- **Tokenizer**: `standard` (tách từ theo khoảng trắng và dấu câu).
- **Filter**:
  - `lowercase`: Chuẩn hóa chữ thường.
  - `asciifolding`: Loại bỏ dấu tiếng Việt (ví dụ: `Hà Nội` -> `Ha Noi`, `Đà Nẵng` -> `Da Nang`, `Tân Sơn Nhất` -> `Tan Son Nhat`).

### 2.2. Index `airports`
- `id`: `integer`
- `iata_code`: `keyword` (so khớp chính xác mã 3 ký tự: `SGN`, `HAN`, `DAD`...)
- `name`: `text` (sử dụng `vi_analyzer`, kèm sub-field `keyword`)
- `city`: `text` (sử dụng `vi_analyzer`, kèm sub-field `keyword`)
- `country`: `text` (sử dụng `vi_analyzer`)

### 2.3. Index `flights`
- `id`: `integer`
- `flight_number`: `keyword` (kèm sub-field `text` sử dụng `vi_analyzer`)
- `status`: `keyword` (`scheduled`, `delayed`, `boarding`...)
- `airline_name`: `text` (sử dụng `vi_analyzer`, kèm sub-field `keyword`)
- `airline_code`: `keyword` (`VN`, `VJ`, `QH`...)
- `departure_airport_code`: `keyword`
- `departure_airport_name`: `text` (sử dụng `vi_analyzer`)
- `departure_airport_city`: `text` (sử dụng `vi_analyzer`)
- `arrival_airport_code`: `keyword`
- `arrival_airport_name`: `text` (sử dụng `vi_analyzer`)
- `arrival_airport_city`: `text` (sử dụng `vi_analyzer`)
- `fare_classes`: `text` (sử dụng `vi_analyzer`)

---

## 3. CẤU TRÚC TRUY VẤN TÌM KIẾM

Áp dụng phương pháp truy vấn `bool.should` với `minimum_should_match: 1`:

### 3.1. Tìm kiếm Sân bay (`AirportSearch`)
```json
{
  "query": {
    "bool": {
      "should": [
        { "term": { "iata_code": { "value": "SGN", "boost": 5.0 } } },
        { "match_bool_prefix": { "iata_code": { "query": "SGN", "boost": 3.5 } } },
        { "match": { "name": { "query": "Tan Son Nhat", "fuzziness": "AUTO", "operator": "and", "boost": 2.0 } } },
        { "match_bool_prefix": { "name": { "query": "Tan Son Nhat", "operator": "and", "boost": 1.8 } } },
        { "match": { "city": { "query": "TP. Ho Chi Minh", "fuzziness": "AUTO", "operator": "and", "boost": 2.5 } } },
        { "match_bool_prefix": { "city": { "query": "TP. Ho Chi Minh", "operator": "and", "boost": 2.0 } } }
      ],
      "minimum_should_match": 1
    }
  }
}
```

### 3.2. Tìm kiếm Chuyến bay (`FlightSearch`)
```json
{
  "query": {
    "bool": {
      "should": [
        { "term": { "flight_number": { "value": "VN123", "boost": 6.0 } } },
        { "match_bool_prefix": { "flight_number": { "query": "VN123", "boost": 4.0 } } },
        { "match": { "airline_name": { "query": "Vjetjet", "fuzziness": "AUTO", "operator": "and", "boost": 2.5 } } },
        { "match_bool_prefix": { "airline_name": { "query": "Vjetjet", "operator": "and", "boost": 2.0 } } },
        { "match": { "departure_airport_city": { "query": "Ha Noi", "fuzziness": "AUTO", "operator": "and", "boost": 2.2 } } },
        { "match": { "arrival_airport_city": { "query": "Da Nang", "fuzziness": "AUTO", "operator": "and", "boost": 2.2 } } }
      ],
      "minimum_should_match": 1
    }
  }
}
```

---

## 4. ĐỒNG BỘ DỮ LIỆU (DATABASE -> ELASTICSEARCH)

### 4.1. Đồng bộ toàn bộ (Bulk Sync)
Chạy lệnh đồng bộ CLI độc lập:
```bash
npm run sync:elasticsearch
# Hoặc:
node scripts/sync-elasticsearch.js
```
Cơ chế:
1. Tự động kiểm tra và tạo index nếu chưa tồn tại (`ensureIndicesExist`).
2. Đọc toàn bộ Sân bay và Chuyến bay từ MySQL database.
3. Tạo payload Bulk API gửi một lần tới `/_bulk?refresh=true`.
4. Mỗi bản ghi được định danh bằng `_id: String(id)` (idempotent, chạy lại không tạo trùng).
5. Xử lý và ghi log số lượng bản ghi thành công và lỗi.

### 4.2. Đồng bộ gia tăng (Incremental Sync)
- **Thêm mới**: Gọi `searchEngine.addAirport(created)` hoặc `searchEngine.addFlight(created)`.
- **Cập nhật**: Gọi `searchEngine.addAirport(updated)` hoặc `searchEngine.addFlight(updated)`.
- **Đổi trạng thái chuyến bay**: Gọi `searchEngine.addFlight(result)` trong `updateFlightStatus`.
- **Xóa**: Gọi `searchEngine.removeAirport(id)` hoặc `searchEngine.removeFlight(id)`.
- Tất cả thao tác đồng bộ được bọc `try/catch` an toàn, không ảnh hưởng đến database transaction.

---

## 5. HƯỚNG DẪN KIỂM TRA VÀ DEMO

### 5.1. Khởi động và kiểm tra trạng thái Elasticsearch
Trên PowerShell (Windows):
```powershell
# 1. Kiểm tra container Elasticsearch
docker ps | Select-String "elasticsearch"

# 2. Kiểm tra Cluster Health
Invoke-RestMethod -Uri "http://localhost:9200/_cluster/health?pretty" -Method Get

# 3. Kiểm tra danh sách Index
Invoke-RestMethod -Uri "http://localhost:9200/_cat/indices?v" -Method Get

# 4. Kiểm tra số lượng document của index airports và flights
Invoke-RestMethod -Uri "http://localhost:9200/airports/_count?pretty" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/flights/_count?pretty" -Method Get
```

### 5.2. Chạy lệnh đồng bộ dữ liệu
```powershell
npm run sync:elasticsearch
```

### 5.3. Thử nghiệm tìm kiếm bằng API

#### A. Tìm kiếm chính xác mã sân bay:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/airports?search=SGN" -Method Get
```

#### B. Tìm kiếm mờ (Fuzzy) - Gõ sai chính tả:
```powershell
# Tìm "Vjetjet" thay vì "Vietjet Air":
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/flights?search=Vjetjet" -Method Get

# Tìm "Tan Son Nhat" không dấu:
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/airports?search=tan%20son%20nhat" -Method Get
```

#### C. Tìm kiếm tiền tố:
```powershell
# Gõ "Dan" ra "Đà Nẵng (DAD)":
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/airports?search=Dan" -Method Get
```

### 5.4. Kiểm tra cơ chế Database Fallback khi Elasticsearch tắt
1. **Tắt Elasticsearch**:
   ```powershell
   docker stop web-specialization-web-project-for-airline-ticket-booking-service--elasticsearch-1
   ```
2. **Gửi lại request tìm kiếm**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5000/api/v1/airports?search=Noi%20Bai" -Method Get
   ```
   *Kết quả*: API vẫn trả về kết quả `200 OK`, backend ghi log:
   `[Elasticsearch Fallback] Sân bay: Chuyển sang tìm kiếm Database LIKE cho từ khóa "Noi Bai"`
3. **Bật lại Elasticsearch**:
   ```powershell
   docker start web-specialization-web-project-for-airline-ticket-booking-service--elasticsearch-1
   ```
4. **Kiểm tra tự phục hồi**: Gửi lại request, backend tự động tiếp tục phục vụ qua Elasticsearch mà không cần restart server:
   `[Elasticsearch] Tìm kiếm Airport: "Noi Bai" -> Tìm thấy 1 kết quả (nguồn: Elasticsearch)`

---

## 6. KẾT QUẢ KIỂM THỬ

Hệ thống sở hữu bộ test tích hợp toàn diện: `tests/elasticsearchIntegration.test.js` kiểm chứng đầy đủ 11 kịch bản:
- `✔ 1. checkElasticsearchHealth reports online and offline states accurately`
- `✔ 2. ensureIndicesExist creates airports and flights indices with vi_analyzer and asciifolding`
- `✔ 3. Document formatters preserve database keys and format fields cleanly`
- `✔ 4. Bulk sync synchronizes both Airports and Flights into Elasticsearch with stable IDs`
- `✔ 5. FlightSearchEngine.searchAirports executes bool.should query with match, fuzziness: AUTO, and match_bool_prefix`
- `✔ 6. FlightSearchEngine.searchFlights executes bool.should query on flight_number, airline, and airports with fuzzy and prefix`
- `✔ 7. Empty search returns empty results without querying Elasticsearch`
- `✔ 8. Elasticsearch offline triggers seamless Database Fallback without crash`
- `✔ 9. AirportService and FlightService delegate to Elasticsearch when available and fallback to Database LIKE when offline`
- `✔ 10. FlightService search preserves business filters when using Elasticsearch or Database Fallback`
- `✔ 11. CRUD operations on Airport and Flight index and delete documents in Elasticsearch`

Toàn bộ test backend dự án: **574/574 PASS** (100% đạt).

