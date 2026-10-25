# BÁO CÁO NGHIỆM THU 10 CHỨC NĂNG AIRLINE & AIRPORT (NGUYỄN HỮU PHONG)

**Người thực hiện:** Nguyễn Hữu Phong  
**Phạm vi trách nhiệm:** Nhánh cha `feature/airline-airport`  
**Căn cứ phân công:** Báo cáo đồ án `NhomE_baocao_2026102.docx`  
**Ngày nghiệm thu:** 21/10/2026  

---

## 1. Danh Sách 10 Chức Năng Đã Triển Khai & Kiểm Thử

| STT | Chức năng theo Phân công | Phương thức HTTP | Triển khai Backend | Triển khai Frontend | Trạng thái Kiểm thử |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **1** | CRUD hãng bay (thêm / sửa / xóa) | `POST`, `PUT`, `DELETE` | `modules/airline/` có Admin RBAC, chống xóa khi có chuyến bay (409) | Form thêm/sửa, modal xác nhận xóa | **PASS** |
| **2** | Danh sách hãng bay (phân trang + tìm kiếm) | `GET` | `GET /api/v1/airlines` phân trang và tìm kiếm theo tên, mã IATA | Bảng danh sách, ô tìm kiếm debounce | **PASS** |
| **3** | Chi tiết hãng bay | `GET` | `GET /api/v1/airlines/:id` trả về thông tin chi tiết và logo | Trang `CatalogDetailPage` đầy đủ thông tin | **PASS** |
| **4** | CRUD sân bay (thêm / sửa / xóa) | `POST`, `PUT`, `DELETE` | `modules/airport/` có Admin RBAC, xử lý khóa ngoại | Form thêm/sửa, nút xóa trên danh sách | **PASS** |
| **5** | Danh sách sân bay | `GET` | `GET /api/v1/airports` phân trang, tìm theo tên/mã/thành phố, sắp xếp `city ASC` | Bảng quản lý sân bay có phân trang | **PASS** |
| **6** | Chi tiết sân bay | `GET` | `GET /api/v1/airports/:id` trả về chi tiết sân bay | Trang `CatalogDetailPage` cho sân bay | **PASS** |
| **7** | Quản lý logo hãng bay (nhập URL + upload file) | `POST`, `PUT` | `POST /airlines/upload-logo` kiểm tra Magic Bytes (PNG/JPG/WebP), 5MB, static serving | Xem trước ảnh tức thì (preview), tự động upload | **PASS** |
| **8** | Autocomplete gợi ý sân bay khi tìm chuyến | `GET` | `GET /api/v1/airports` tìm kiếm nhanh theo mã IATA/tên/thành phố | Component `AirportCombobox` debounce 220ms, điều hướng bàn phím | **PASS** |
| **9** | Thống kê số chuyến bay theo hãng | `GET` | `GET /airlines/statistics` (Admin) tính tổng chuyến, tỷ lệ %, phân bổ trạng thái | `AirlineStatisticsPage`: 3 thẻ KPI, Biểu đồ cột Bar Chart | **PASS** |
| **10**| Bộ lọc tìm kiếm chuyến bay nâng cao | `GET` | `GET /flights/search` lọc theo đi-đến-ngày, hãng bay, giá, giờ bay, thời lượng | `HomePage` + `AdvancedFlightFilters`: lọc linh hoạt, filter chips | **PASS** |

---

## 2. Bằng Chứng Kiểm Thử Tự Động

- **Backend Test Suite:** `npm test` -> **408 PASS**, 0 FAIL, 1 SKIPPED (409 tests).
- **Frontend Test Suite:** `npm --prefix frontend test -- --run` -> **258 PASS** (28/28 test files).
- **Frontend Build:** `npm --prefix frontend run build` -> **PASS (Vite production bundle thành công 100%)**.

---

## 3. Quy Trình Git 4 Cấp Đã Thực Hiện

```text
feature con (feature/airline-list, feature/airline-edit, feature/airport-*)
                     ↓
             feature/airline-airport (nhánh cha)
                     ↓
                     develop
                     ↓
                      main
```
