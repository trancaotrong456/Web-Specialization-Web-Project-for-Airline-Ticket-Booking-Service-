# Serene Flightways — Frontend UI, navigation & functional QA

Ngày kiểm tra: 19/10/2026. Nhánh làm việc `fix/frontend-ui-navigation-audit`, baseline `45fa5b7084c0e826d4891c7dca9639db6ae9edcf` (local `main` và `origin/main` tracking bằng nhau lúc bắt đầu). Không fetch/push/merge, không thay đổi database. Trước khi sửa: tracked clean; các mục untracked có sẵn, 2 stash và worktree records được giữ nguyên.

## A. Tổng quan và mức độ bằng chứng

- `AppRouter.jsx` khai báo **49 route có path** (47 route ứng dụng, `/forbidden`, wildcard). Đã đọc tất cả 49 route; trình duyệt mở trực tiếp **26 URL tĩnh**: 12 public/protected với guest và 14 admin với **auth/API mô phỏng**. Chưa chạy route động với ID thật vì không có bộ dữ liệu test/phiên đăng nhập an toàn.
- Browser QA chạy Chromium tại 1920×1080, 1440×900, 1024×768, 768×1024, 390×844, 375×667: trang chủ và ba trang admin đại diện. Kiểm tra click thật: footer Tra cứu đặt chỗ, guest redirect, hai mục sidebar mới. Kiểm tra mock admin **chỉ xác minh render/điều hướng/UI**, không chứng nhận API, RBAC server hoặc CRUD.
- Đã xác nhận **0 P0, 3 P1, 1 P2, 0 P3**; sửa 4/4 phát hiện. Trước sửa, trang seat map/ancillaries tràn ngang 418px ở viewport 390px và 416px ở viewport 375px; sau sửa, document width bằng viewport ở cả hai. Lưới ghế rộng vẫn cuộn *bên trong* thẻ, không kéo rộng toàn trang.
- Backend `/api/v1/health` từng trả 200 lúc bắt đầu nhưng tiến trình backend không còn chạy ở lượt browser cuối; browser có Vite proxy 500 và yêu cầu tài nguyên ngoài bị chặn. Đây không phải bằng chứng lỗi API/source. Không chạy Docker/MySQL, seed/migration, cổng thanh toán hay email thật.
- Kết luận: **NOT READY** để nghiệm thu UI/E2E toàn hệ thống. Bản sửa navigation/responsive đã kiểm tra trên trình duyệt và unit suite; CRUD/Booking/Payment/8 tính năng chưa được browser E2E trên DB test biệt lập.

## B. Phát hiện và sửa lỗi

| ID | Trang | Lỗi đã xác nhận | Mức | Root cause | File sửa | Kết quả |
|---|---|---|---|---|---|---|
| UI-01 | Admin toàn cục | Sidebar thiếu Sơ đồ ghế và Dịch vụ bổ sung dù dashboard/route có | P1 | Mảng `adminLinks`/icon thiếu hai module | `frontend/src/components/AppHeader.jsx`, test dashboard | Đã thêm; browser click đến đúng route và hiện H1 |
| UI-02 | Admin mobile | Header vượt viewport khi account dài/đủ controls | P1 | Brand cố định không co, tên account chiếm chỗ | `frontend/src/components/adminSidebar.css`, `AppHeader.jsx` | 375/390px không còn scroll ngang; account button có accessible name |
| UI-03 | Seat Map Admin mobile | Card/lưới ghế có thể kéo rộng trang | P1 | Grid `1fr` giữ intrinsic width; card thiếu `min-width:0` | `frontend/src/features/bookings/seatMapAdmin.css` | Trang không tràn; lưới tự cuộn ngang trong container |
| UI-04 | Home footer | Bốn liên kết pháp lý/chính sách đưa nhầm về danh sách điểm đến | P2 | Placeholder `href="#destinations-heading"` | `frontend/src/features/flights/HomePage.jsx`, test public | Bỏ liên kết giả; hiện thông báo nội dung đang cập nhật |

Không có screenshot *trước sửa* được lưu trong phiên; số đo browser trước sửa ở trên là bằng chứng quan sát, không giả lập ảnh trước. Screenshot sau sửa: [home desktop](assets/home-desktop.png), [home mobile](assets/home-mobile.png), [admin desktop](assets/admin-desktop.png), [admin mobile](assets/admin-mobile.png), [sidebar mobile](assets/admin-sidebar-mobile-after.png), [seat map mobile](assets/seat-map-mobile-after.png), [ancillaries mobile](assets/ancillaries-mobile-after.png). Ảnh admin sử dụng API/auth mô phỏng, không phải dữ liệu demo thật.

## C. Navigation matrix

Ký hiệu: `B` = URL render trong browser (admin dùng auth/API mô phỏng); `C` = đã click link trên browser; `S` = route/entry xác nhận trong source hoặc component tests; `U` = chưa chạy với ID/dữ liệu thật. `—` ở cột click/mobile nghĩa là chưa kiểm chứng, **không phải lỗi xác nhận**. Route admin chi tiết/tạo/sửa thường được mở từ trang danh sách/chi tiết, không phải mỗi route đều cần sidebar riêng.

| Route → trang | Vai trò | Vị trí truy cập | Click | Mobile | Trạng thái |
|---|---|---|---|---|---|
| `/` → Trang chủ | Guest/Customer | Brand, nav | B | 6 viewport | Render |
| `/flights/search` → Kết quả tìm kiếm | Guest/Customer | Form tìm kiếm | S | — | B, API thật U |
| `/bookings/new` → Tạo booking | Guest/Customer | Kết quả/CTA | S | — | B, tạo thật U |
| `/bookings/lookup` → Tra cứu | Guest/Customer | Nav/footer | C | 390px | Render |
| `/bookings/:id/payment` → Thanh toán | Chủ/guest hợp lệ | Chi tiết booking | U | — | Cần ID thật |
| `/bookings/:id` → Chi tiết | Chủ/guest hợp lệ | Danh sách/tra cứu | U | — | Cần ID thật |
| `/payments/result` → Kết quả | Guest/Customer | Payment redirect | B | — | Render; callback thật U |
| `/login` → Đăng nhập | Guest | Header | B | — | Render |
| `/register` → Đăng ký | Guest | Header | B | — | Render |
| `/forgot-password` → Quên mật khẩu | Guest | Login | B | — | Render |
| `/reset-password` → Đặt lại mật khẩu | Guest | Email link/token | B | — | Render; token thật U |
| `/bookings/my` → Booking của tôi | Customer | Header | B (guest redirect) | — | Auth thật U |
| `/profile` → Hồ sơ | Customer | Header/account | B (guest redirect) | — | Auth thật U |
| `/profile/security` → Bảo mật | Customer | Header/account | B (guest redirect) | — | Auth thật U |
| `/admin` → Dashboard | Admin | Sidebar/account | B | 6 viewport | Mock render |
| `/admin/payments` → Thanh toán | Admin | Sidebar | B | — | Mock render |
| `/admin/payments/:id` → Chi tiết | Admin | Payment list | U | — | Cần ID thật |
| `/admin/payments/revenue` → Doanh thu | Admin | Payment page | B | — | Mock render |
| `/admin/bookings` → Booking | Staff/Admin | Sidebar/nav theo vai trò | B (Admin) | — | Staff browser U |
| `/admin/bookings/:id` → Chi tiết | Admin | Booking list | U | — | Cần ID thật |
| `/admin/airlines` → Hãng bay | Admin | Sidebar | B | — | Mock render |
| `/admin/airlines/statistics` → Thống kê | Admin | Airline page | B | — | Mock render |
| `/admin/airlines/new` → Tạo hãng | Admin | Airline list | U | — | Source; submit U |
| `/admin/airlines/:id` → Chi tiết hãng | Admin | Airline list | U | — | Cần ID thật |
| `/admin/airlines/:id/edit` → Sửa hãng | Admin | Airline detail | U | — | Cần ID thật |
| `/admin/airports` → Sân bay | Admin | Sidebar | B | — | Mock render |
| `/admin/airports/new` → Tạo sân bay | Admin | Airport list | U | — | Source; submit U |
| `/admin/airports/:id` → Chi tiết sân bay | Admin | Airport list | U | — | Cần ID thật |
| `/admin/airports/:id/edit` → Sửa sân bay | Admin | Airport detail | U | — | Cần ID thật |
| `/admin/promotions` → Khuyến mại | Admin | Sidebar | B | — | Mock render |
| `/admin/promotions/new` → Tạo KM | Admin | Promotion list | U | — | Source; submit U |
| `/admin/promotions/:id` → Chi tiết KM | Admin | Promotion list | U | — | Cần ID thật |
| `/admin/promotions/:id/edit` → Sửa KM | Admin | Promotion detail | U | — | Cần ID thật |
| `/admin/seat-maps` → Sơ đồ ghế | Admin | Sidebar/dashboard | C | 6 viewport | Mock render; CRUD U |
| `/admin/ancillaries` → Dịch vụ | Admin | Sidebar/dashboard | C | 6 viewport | Mock render; CRUD U |
| `/admin/users` → Người dùng | Admin | Sidebar | B | — | Mock render |
| `/admin/users/:id` → Chi tiết user | Admin | User list | U | — | Cần ID thật |
| `/admin/roles` → Vai trò | Admin | Sidebar | B | — | Mock render |
| `/admin/roles/:id` → Chi tiết role | Admin | Role list | U | — | Cần ID thật |
| `/admin/flights` → Chuyến bay | Staff/Admin | Sidebar/nav theo vai trò | B (Admin) | — | Staff browser U |
| `/admin/flights/new` → Tạo chuyến | Admin | Flight list | B | — | Mock render; submit U |
| `/admin/flights/:id` → Chi tiết chuyến | Staff/Admin | Flight list | U | — | Cần ID thật |
| `/admin/flights/:id/edit` → Sửa chuyến | Staff/Admin | Flight detail | U | — | Cần ID thật |
| `/admin/flights/:flightId/fare-classes` → Hạng vé | Staff/Admin | Flight detail/list | U | — | Cần ID thật |
| `/admin/flights/:flightId/fare-classes/new` → Tạo hạng vé | Staff/Admin | Fare list | U | — | Cần ID thật |
| `/admin/fare-classes/:id` → Chi tiết hạng | Staff/Admin | Fare list | U | — | Cần ID thật |
| `/admin/fare-classes/:id/edit` → Sửa hạng | Staff/Admin | Fare detail | U | — | Cần ID thật |
| `/forbidden` → Không có quyền | Mọi vai trò | Guard redirect | S | — | Browser U |
| `*` → 404 | Mọi vai trò | URL sai | S | — | Browser U |

## D. Tám chức năng mở rộng

| Chức năng | UI/navigation kiểm tra | Functional | Browser E2E | Kết quả |
|---|---|---|---|---|
| Inventory Lock | Booking form/results render; unit booking có hết quota | Unit frontend | U | Chưa nghiệm thu |
| Seat Selection | Admin map mobile, booking unit chọn ghế | Unit frontend | U | UI không tràn; chọn thật U |
| Payment Idempotency | Payment page render; nút có disabled/loading trong source/tests | Unit frontend | U | Gateway/duplicate thật U |
| Ancillaries | Admin page mobile; unit CRUD contract | Unit frontend | U | UI render; DB write U |
| Manage Booking | My Bookings guest guard; unit danh sách/chi tiết | Unit frontend | U | Customer thật U |
| Flight Status | Admin Flight List mock; unit status/hủy | Unit frontend | U | History/API thật U |
| Notifications | Bell unit, browser mock header | Unit frontend | U | Socket/email thật U |
| Search Filters | Results route render; unit filter/stale request | Unit frontend | U | SQL/URL browser E2E U |

## E. Kiểm thử và giới hạn

| Kiểm tra | Kết quả trên source sau sửa |
|---|---|
| Frontend focused navigation/public tests | PASS; hai test mới/điều chỉnh đã thấy FAIL đúng lỗi trước khi sửa rồi PASS sau sửa |
| Frontend full `npm test -- --run --maxWorkers=1` | **PASS: 28 files, 261/261 tests** trên source sau sửa |
| Frontend production `npm run build` | **PASS**, 130 modules transformed; cảnh báo chunk JS >500 kB |
| Chromium responsive | PASS không overflow trang chủ, Admin Dashboard, Seat Map Admin, Ancillaries Admin ở 6 viewport nêu trên |
| Chromium navigation | PASS click guest lookup, guest guard, hai sidebar destination mới; chính sách giả không còn là link |
| `git diff --check` | PASS |
| Backend/API, MySQL/DB, CRUD ghi dữ liệu, payment demo, email/realtime, browser E2E có ID thật | UNVERIFIED vì không có DB test biệt lập/phiên test an toàn; backend đã ngừng chạy khi browser QA cuối |

Các ảnh admin dùng API mock trả danh sách rỗng; không thể dùng chúng chứng nhận loading/error/success hoặc phân quyền backend. Browser console có lỗi tài nguyên ngoài `ERR_NETWORK_ACCESS_DENIED`, Vite proxy 500 khi API dừng và Socket.IO handshake lỗi; chưa quy lỗi cho frontend. Build có cảnh báo JS bundle >500 kB, không phải build failure.

## F. Git và bước còn lại

File source/test thay đổi: `frontend/src/components/AppHeader.jsx`, `frontend/src/components/adminSidebar.css`, `frontend/src/features/bookings/seatMapAdmin.css`, `frontend/src/features/admin/AdminDashboardPage.test.jsx`, `frontend/src/features/flights/HomePage.jsx`, `frontend/src/features/flights/PublicFlightPages.test.jsx`. Báo cáo/ảnh nằm trong `docs/qa/`. Không migration/dependency/API mới. Không push/merge; các untracked/stash/worktree có sẵn không bị tác động.

Để đạt READY: chạy browser E2E bằng tài khoản Guest/Customer/Staff/Admin trên DB test biệt lập có ID thật, xác minh CRUD/Booking/Payment/8 tính năng và các trạng thái loading/error, chụp bằng chứng trước/sau nếu tái hiện lỗi mới, kiểm tra browser console/network trên backend test ổn định. Không dùng DB demo/production để hoàn tất checklist.
