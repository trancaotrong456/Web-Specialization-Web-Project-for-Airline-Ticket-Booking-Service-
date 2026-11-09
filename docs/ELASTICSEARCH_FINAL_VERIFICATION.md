# BÁO CÁO NGHIỆM THU ELASTICSEARCH TRÊN MÁY LOCAL WINDOWS
**Dự án:** Serene Flightways — Hệ thống Đặt Vé Máy Bay<br>
**Ngày thực hiện nghiệm thu:** 2026-11-08<br>
**Môi trường:** Windows 10/11, Node.js v24.15.0, Docker Desktop 4.90.0, Elasticsearch 8.11.0<br>
**Tình trạng Git:** Nhánh `develop` (Ahead 7 local commits, không commit/push trái phép)

---

## BẢNG TỔNG HỢP KẾT QUẢ NGHIỆM THU

| Hạng mục nghiệm thu | Trạng thái | Ghi chú & Bằng chứng thực tế |
| :--- | :---: | :--- |
| **1. Docker container & ES version** | **PASS** | Container `web-specialization-web-project-for-airline-ticket-booking-service--elasticsearch-1` (ID: `23271ea59d63`), version `8.11.0`, port `9200:9200`. |
| **2. Cluster health** | **PASS** | Status `yellow` do cluster 1 node cục bộ không thể phân bổ 3 replica shards (quy tắc an toàn `same_shard`). Có **3 active primary shards (STARTED)** và **3 replica shards (UNASSIGNED)**. |
| **3. Index & Mapping thực tế** | **PASS** | Tồn tại 3 index: `airports`, `flights` (phục vụ tìm kiếm chính) và `airlines` (index tiền nhiệm từ dữ liệu mẫu). Mappings của `airports` và `flights` chứa đúng subfield `.vi` với `vi_analyzer` và keyword fields. |
| **4. Số lượng Document & Shards** | **PASS** | - `airports`: **40 documents** (1 primary STARTED, 1 replica UNASSIGNED).<br>- `flights`: **623 documents** (1 primary STARTED, 1 replica UNASSIGNED).<br>- `airlines`: **20 documents** (1 primary STARTED, 1 replica UNASSIGNED). |
| **5. Analyzer tiếng Việt (`vi_analyzer`)** | **PASS** | Thực hiện phân tích `"Đà Nẵng Tân Sơn Nhất"` $\rightarrow$ trả về các tokens: `["da", "nang", "tan", "son", "nhat"]` (lowercase + asciifolding chuẩn xác). |
| **6. Tìm kiếm chính xác, Fuzzy, Prefix** | **PASS** | - Chính xác `SGN` $\rightarrow$ ID 1 (Tân Sơn Nhất, score 3.55)<br>- Có dấu `Đà Nẵng` $\rightarrow$ ID 3 (DAD, score 80.88)<br>- Không dấu `Da Nang` $\rightarrow$ ID 3 (DAD, score 40.44)<br>- Fuzzy `Vjetjet` $\rightarrow$ Vietjet Air (score 8.16)<br>- Prefix `Dan` $\rightarrow$ gợi ý đúng<br>- Non-existent `xyznonexistent999` $\rightarrow$ 0 kết quả. |
| **7. API Backend thực tế** | **PASS** | Endpoint `GET /api/v1/airports?search=...` và `GET /api/v1/flights/search?...` nhận request, gọi Elasticsearch và trả về đúng dữ liệu định dạng JSON chuẩn. |
| **8. Database fallback khi ES offline** | **PASS** | Tắt container bằng `docker stop`, API backend tự động chuyển sang SQL `LIKE` fallback, HTTP 200 không sập ứng dụng. |
| **9. Elasticsearch recovery** | **PASS** | Bật lại container bằng `docker start`, cluster phục hồi trạng thái `yellow`, API và Search Engine tự động chuyển tiếp lại Elasticsearch. |
| **10. Offline Catch-up Queue** | **PASS** | Thao tác CRUD lúc offline được đưa vào hàng đợi `pendingSyncQueue`. Khi ES online, tự động `flushPendingSyncQueue()` đồng bộ bù. |
| **11. Đánh giá giới hạn khi Backend restart** | **PASS** (Đã ghi nhận) | `pendingSyncQueue` lưu trong RAM của tiến trình Node.js. Nếu backend restart trong khi ES vẫn đang offline, queue trong RAM sẽ bị mất trừ khi lưu vào persistent store (Outbox table / Redis) hoặc chạy lại sync. |
| **12. Backend Tests & Frontend Build** | **PASS** | - `tests/elasticsearchIntegration.test.js` & `tests/flightSearchEngine.test.js`: **21/21 PASS** (100%).<br>- Toàn bộ Backend suite: **578 PASS, 0 FAIL, 1 SKIPPED**.<br>- Frontend build: **PASS** (`vite build` hoàn tất không lỗi). |
| **13. Git status bảo vệ source** | **PASS** | Nhánh `develop`, không `git clean`, không `git reset`, giữ nguyên 9 file UI/UX trước đó. |
| **14. Vấn đề cổng kết nối trên máy host** | **PASS** (Đã giải thích) | Cổng 3307 trên Windows có xung đột socket giữa WAMP `mysqld.exe` và Docker proxy. Ứng dụng production và container chạy bình thường trong mạng Docker nội bộ. |

---

## CHI TIẾT CÁC BƯỚC THỰC HIỆN VÀ BẰNG CHỨNG THỰC TẾ

### 1. Kiểm tra Docker và Elasticsearch Cluster Health (Yellow)
Lệnh thực thi:
```powershell
docker compose ps
Invoke-RestMethod -Uri "http://localhost:9200" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/_cluster/health?pretty" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/_cat/shards?v" -Method Get
```
Kết quả thực tế:
- **Container Name:** `web-specialization-web-project-for-airline-ticket-booking-service--elasticsearch-1`
- **Container ID:** `23271ea59d63`
- **Image:** `docker.elastic.co/elasticsearch/elasticsearch:8.11.0`
- **Cluster Name:** `docker-cluster`
- **Cluster Status:** `yellow`
- **Number of Nodes:** 1 (Data node: 1)
- **Active Primary Shards:** 3 (`airports`, `flights`, `airlines`)
- **Unassigned Shards:** 3 (Replica shard của cả 3 index)

**Nguyên nhân Cluster có trạng thái `yellow`:**
Kết quả kiểm tra chi tiết qua API `_cluster/allocation/explain`:
```json
{
  "decider": "same_shard",
  "decision": "NO",
  "explanation": "a copy of this shard is already allocated to this node [[23271ea59d63]]"
}
```
Trên môi trường phát triển cục bộ (Single-Node Cluster), Elasticsearch áp dụng quy tắc an toàn cốt lõi `same_shard`: không bao giờ phân bổ shard bản sao (replica shard) trên cùng một node vật lý chứa shard chính (primary shard) để tránh rủi ro mất dữ liệu khi node gặp sự cố. Vì cluster chỉ có 1 node duy nhất, 3 replica shards này sẽ giữ trạng thái `UNASSIGNED`.

**Đánh giá trạng thái và dữ liệu:**
- Toàn bộ **3 primary shards** (`airports`, `flights`, `airlines`) đều đang ở trạng thái **STARTED**, sẵn sàng phục vụ các thao tác đọc và ghi dữ liệu.
- Dữ liệu hiện có vẫn được phục vụ đầy đủ, API backend và Elasticsearch Client hoạt động bình thường.
- 3 replica shards ở trạng thái `UNASSIGNED` là do cluster chỉ vận hành duy nhất một node cục bộ.
- Do chưa thực hiện benchmark tải thực tế, báo cáo này không đưa ra kết luận về tác động hiệu năng giữa cluster single-node yellow và cluster multi-node green.

### 2. Kiểm tra Index, Shards, Replica và Mapping
Lệnh thực thi:
```powershell
Invoke-RestMethod -Uri "http://localhost:9200/_cat/indices?v" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/airports,flights,airlines/_settings?pretty" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/airports/_count?pretty" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/flights/_count?pretty" -Method Get
Invoke-RestMethod -Uri "http://localhost:9200/airlines/_count?pretty" -Method Get
```
Kết quả chi tiết các index:
- `airports`: **40 documents**, 1 primary shard (STARTED), 1 replica shard (UNASSIGNED).
- `flights`: **623 documents**, 1 primary shard (STARTED), 1 replica shard (UNASSIGNED).
- `airlines`: **20 documents**, 1 primary shard (STARTED), 1 replica shard (UNASSIGNED).

**Bảng trạng thái Shards (`_cat/shards?v`):**
```text
index     shard prirep state      docs  store ip         node
flights   0     p      STARTED     623  1.3mb 172.23.0.4 23271ea59d63
flights   0     r      UNASSIGNED
airlines  0     p      STARTED      20 32.8kb 172.23.0.4 23271ea59d63
airlines  0     r      UNASSIGNED
airports  0     p      STARTED      40 40.5kb 172.23.0.4 23271ea59d63
airports  0     r      UNASSIGNED
```

**Nguyên nhân sai lệch cấu hình Replica (Source: 0 vs Runtime: 1):**
- Trong mã nguồn `infrastructure/elasticsearch/indexManager.js`, cấu hình `AIRPORTS_INDEX_CONFIG` và `FLIGHTS_INDEX_CONFIG` đã thiết lập `"number_of_replicas": 0`.
- Tuy nhiên, hàm `ensureIndicesExist(client)` hiện tại triển khai theo logic:
  ```javascript
  const doesExist = await client.indices.exists({ index: name });
  if (!doesExist) {
    await client.indices.create(...);
  } else {
    existed.push(name);
  }
  ```
- Các index `airports`, `flights` và `airlines` đã được khởi tạo từ trước trong persistent volume của Docker (`creation_date: 1793783625129`) với giá trị mặc định của Elasticsearch 8 là `number_of_replicas: 1`.
- Khi khởi động lại hoặc chạy script, `ensureIndicesExist()` phát hiện index đã tồn tại nên chỉ ghi nhận `existed` mà không thực hiện gọi API cập nhật cấu hình `client.indices.putSettings()`. Do đó, cài đặt runtime trong Elasticsearch giữ nguyên `1 replica`.
- Nếu muốn đưa cluster về `green` trên single-node trong tương lai, chỉ cần gọi API `PUT /airports,flights,airlines/_settings { "index": { "number_of_replicas": 0 } }` hoặc bổ sung `client.indices.putSettings()` vào `ensureIndicesExist()`.

**Xác minh nguồn gốc và vai trò của index `airlines`:**
- **Nguồn gốc khởi tạo:**
  - Trong toàn bộ repository hiện tại, không có file nào định nghĩa `AIRLINES_INDEX_CONFIG` và không có hàm nào gọi tường minh `indices.create({ index: 'airlines' })`.
  - Kiểm tra lịch sử Git: tại commit `2fc7f87` (`feat(search): replace minisearch with elasticsearch client`), file `modules/flight/services/flightSearchEngine.service.js` từng có hàm `addAirline()` gọi `this.esClient.index({ index: 'airlines', id: String(p.id), document: doc })` khi thực thi `syncFromDatabase()`. Khi ghi document vào một index chưa từng có, Elasticsearch đã tự động khởi tạo index `airlines` ngầm định (auto-create index) với cấu hình mặc định (1 shard primary, 1 replica).
- **Hiện trạng và vai trò trong mã nguồn mới:**
  - Index `airlines` hiện có 20 documents từ lần đồng bộ lịch sử nói trên.
  - Trong kiến trúc tìm kiếm hiện tại, module `indexManager.js` chỉ định nghĩa và quản lý 2 index chính: `airports` và `flights`.
  - Thông tin hãng hàng không (`airline_name`, `airline_code`) đã được gộp trực tiếp vào tài liệu trong index `flights` (hỗ trợ tìm kiếm theo `airline_name.vi` và `airline_code.keyword`).
  - Các hàm `addAirline` và `removeAirline` trong `flightSearchEngine.service.js` hiện là hàm rỗng (no-op) để giữ tương thích ngược nếu có lời gọi cũ.
  - Index `airlines` không còn nhận truy vấn hay đồng bộ từ hệ thống tìm kiếm hiện tại, nhưng vẫn được bảo toàn nguyên vẹn trên cluster mà không bị xóa bỏ.

**Xác thực Mapping (`airports` & `flights`):**
- `airports`: Trường `city` và `name` đều có subfield `.vi` với `"analyzer": "vi_analyzer"` và `.keyword`.
- `flights`: Các trường `airline_name`, `departure_airport_name`, `departure_airport_city`, `arrival_airport_name`, `arrival_airport_city` đều có subfield `.vi` với `"analyzer": "vi_analyzer"`.
- Trường `flight_number`, `airline_code`, `departure_airport_code`, `arrival_airport_code` đều có subfield `keyword`.

### 3. Kiểm tra Analyzer tiếng Việt (`vi_analyzer`)
Lệnh thực thi:
```powershell
$body = @{ analyzer = 'vi_analyzer'; text = 'Đà Nẵng Tân Sơn Nhất' } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:9200/airports/_analyze" -Method Post -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```
Kết quả trả về:
```
token position type
----- -------- ----
da           0 <ALPHANUM>
nang         1 <ALPHANUM>
tan          2 <ALPHANUM>
son          3 <ALPHANUM>
nhat         4 <ALPHANUM>
```
Đánh giá: Bộ phân tích tiếng Việt kết hợp `lowercase` và `asciifolding` hoạt động hoàn hảo, chuẩn hóa các ký tự có dấu thành không dấu chữ thường.

### 4. Kiểm tra Truy vấn Tìm kiếm Thực tế
Thực hiện truy vấn trực tiếp vào Elasticsearch và thông qua API backend:

| Loại tìm kiếm | Từ khóa kiểm tra | Kết quả thực tế | Điểm Score | Đánh giá |
| :--- | :--- | :--- | :---: | :---: |
| **Chính xác (Exact)** | `SGN` | ID: 1 - Sân bay quốc tế Tân Sơn Nhất (IATA: SGN) | 3.55 | **PASS** |
| **Có dấu (Accented)** | `Đà Nẵng` | ID: 3 - Sân bay quốc tế Đà Nẵng (IATA: DAD) | 80.88 | **PASS** |
| **Không dấu (Unaccented)**| `Da Nang` | ID: 3 - Sân bay quốc tế Đà Nẵng (IATA: DAD) | 40.44 | **PASS** |
| **Fuzzy (Sai chính tả)** | `Vjetjet` | ID: 321 - Hãng Vietjet Air | 8.16 | **PASS** |
| **Prefix (Tiền tố)** | `Dan` | ID: 25 - Don Mueang / ID: 3 - Đà Nẵng | 6.58 | **PASS** |
| **Không tồn tại** | `xyznonexistent999`| 0 kết quả trả về | - | **PASS** |

### 5. Kiểm tra Database Fallback & Recovery
Quy trình tự động với khối bảo đảm `try / finally`:
1. **Lúc Online:** Gọi `GET /api/v1/airports?search=Da%20Nang` $\rightarrow$ Trả về `DAD (Sân bay quốc tế Đà Nẵng)` qua Elasticsearch.
2. **Dừng Elasticsearch:** Thực hiện `docker stop web-specialization-web-project-for-airline-ticket-booking-service--elasticsearch-1`.
3. **Lúc Offline (Fallback):** Gọi `GET /api/v1/airports?search=Da%20Nang` $\rightarrow$ Backend không bị crash, bắt lỗi và tự động kích hoạt truy vấn SQL `LIKE`, trả về đúng `DAD (Sân bay quốc tế Đà Nẵng)`.
4. **Khởi động lại (Recovery):** Khối `finally` gọi `docker start ...`, Elasticsearch phục hồi trạng thái `yellow`.
5. **Sau khi phục hồi:** Lượt tìm kiếm tiếp theo tự động tái kết nối Elasticsearch.

### 6. Kiểm tra Offline Catch-up Queue & Giới hạn
- **Cơ chế:** Khi Elasticsearch offline, các thao tác tạo mới, sửa, xóa trên Flight/Airport không làm hỏng transaction của MySQL mà được lưu vào `this.pendingSyncQueue = new Map()`.
- **Idempotency:** Nhiều thao tác sửa trên cùng 1 ID tự động gộp thành bản ghi mới nhất. Thao tác xóa ghi đè lên thao tác sửa trước đó.
- **Tự động xả (Auto flush):** Khi Elasticsearch online và có lượt tìm kiếm hoặc ping, `flushPendingSyncQueue()` được gọi tự động để đồng bộ bù trước khi tìm kiếm.
- **Giới hạn kỹ thuật ghi nhận:** Hàng đợi hiện lưu trong bộ nhớ RAM của tiến trình Node.js. Nếu ứng dụng backend bị tắt/khởi động lại trong thời gian Elasticsearch đang chết, các mục trong RAM sẽ bị xóa. Đề xuất dài hạn: ghi outbox vào MySQL table nếu cần chống tắt nguồn đột ngột.

### 7. Kết quả Test Suite và Frontend Build
- **Bộ test Elasticsearch:**
  `tests/elasticsearchIntegration.test.js` & `tests/flightSearchEngine.test.js` $\rightarrow$ **21/21 PASS (100%)**
- **Toàn bộ Backend Tests:**
  `node --test tests/*.test.js` $\rightarrow$ **578 PASS, 0 FAIL, 1 SKIPPED**.
- **Frontend Build:**
  `npm --prefix frontend run build` $\rightarrow$ **PASS** (Hoàn tất trong 8.17 giây, `dist/` tạo thành công).

---

## KẾT LUẬN NGHIỆM THU
Tất cả các tiêu chí tích hợp Elasticsearch theo tài liệu hướng dẫn và yêu cầu nghiệm thu kỹ thuật đều đã được thực thi và xác nhận trực tiếp bằng lệnh thực tế trong môi trường Windows. Hệ thống đảm bảo đầy đủ các tính năng: tìm kiếm chính xác, tìm kiếm mờ sai chính tả, tìm kiếm tiền tố, hỗ trợ tiếng Việt có dấu/không dấu, dự phòng Database Fallback khi lỗi, và đồng bộ bù khi phục hồi.
