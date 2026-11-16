# Kiểm chứng chức năng và luồng nghiệp vụ trong báo cáo Nhóm E

Ngày kiểm tra: 21/10/2026. Tài liệu chuẩn: `docs/NhomE_baocao_2026102.docx`, chủ yếu Bảng 1.2, Bảng 2.1–2.2, mục 2.3, Chương 3 và các luồng Chương 4. Đối chiếu thêm `docs/qa/report-vs-implementation-audit.md`. Đây là **kiểm chứng hành vi trong phạm vi test ghi rõ**, không phải chứng nhận hệ thống production. DOCX chưa render được thành trang độc lập trong môi trường này, nên dẫn chương/mục/bảng thay vì đoán số trang.

## 1. Phiên bản và phương pháp

- Project chính; branch `wip/serene-local-recovery-20261020`, HEAD `45fa5b7084c0e826d4891c7dca9639db6ae9edcf`. Source đang kiểm tra **gồm 30 file tracked sửa chưa commit** (đặc biệt Flight/Frontend) và các file untracked; không gộp source ở worktree khác. Hai stash còn nguyên.
- Bằng chứng theo cấp: đọc API–service–repository–model; chạy Node unit và HTTP tests với dữ liệu giả lập; **không** chạy MySQL test ghi dữ liệu, migration/seed, booking/payment thật hay browser E2E trên DB demo. Workflow CI có MySQL riêng nhưng không có run mới cho checkout WIP này.
- Lệnh kiểm thử cuối: `node --test` với **92 file `tests/*.test.js`**, loại `airlineLogoUpload.test.js` (ghi/xóa file upload), `demoBootstrap.test.js` (tạo/xóa thư mục tạm), `mysqlBusinessIntegration.test.js` (ghi database). **400/400 PASS, 0 FAIL, 0 SKIP** trên checkout hiện tại. Một lượt hẹp 26 file trước đó cũng 193/193 PASS nhưng không cộng trùng vào tổng 400.
- Không chạy Frontend Vitest/build vì cấu hình Vite/Vitest có thể tạo cache/output, trái quy tắc read-only của `AGENTS.md`; không có bằng chứng frontend PASS mới. Playwright phát hiện hai server local (cổng 8000, 5000) nhưng chưa xác minh được server nào là frontend và DB nào là test biệt lập; không thử login/booking/payment lên dịch vụ có thể dùng DB demo. **Browser E2E BLOCKED do môi trường chưa định danh an toàn.**
- Trạng thái tracked/stash không đổi sau test. `git diff --check` **FAIL ở WIP có sẵn**: `frontend/src/app/App.jsx:25` blank EOF, `frontend/src/styles/global.css:4512` trailing whitespace và `:5890` blank EOF. Đây là lỗi vệ sinh diff, chưa chứng minh sai nghiệp vụ; không sửa trong audit.

Quy ước: **PASS** chỉ áp dụng cho test cụ thể đã chạy; **PARTIAL** = các thành phần có test nhưng chưa chứng minh cả luồng; **UNVERIFIED** = thiếu bằng chứng hành vi thật; **BLOCKED** = môi trường không đủ an toàn để thực thi. Hạng mục báo cáo ghi “dự kiến/mockup” không tính FAIL.

## 2. Bảng chức năng được báo cáo

| Chức năng trong báo cáo | Code/điểm nối | Test hiện tại | Runtime | Kết luận |
|---|---|---|---|---|
| Auth/User/RBAC — Bảng 1.2 #1–10, Bảng 2.1 | `modules/auth/`, `modules/user/`, `modules/role/`, `middlewares/auth.middleware.js`, `middlewares/rbac.middleware.js`; route Admin dùng JWT+RBAC tại `modules/user/index.js:17` và `modules/role/index.js:16` | PASS: `tests/authSecurity.test.js`, `userAdminContract.test.js`, `userAccountSafety.test.js`, `rbacRouteMatrix.test.js` trong lượt 400 | MySQL/login trình duyệt UNVERIFIED | PARTIAL: hợp đồng HTTP/service đã test; luồng với DB thật chưa test |
| Airline/Airport CRUD, tìm/lọc/phân trang — #11–16 | `modules/airline/`, `modules/airport/`, `frontend/src/features/airline-airport/` | PASS: `airlineHttpParity`, `airlineService`, `airportHttpParity`, `airportService`, validation/repository tests trong lượt 400 | DB/browser UNVERIFIED | PARTIAL |
| Flight/FareClass/search/ghế — #21–26, #28 | `modules/flight/index.js:18-26`, `flight.repository.js`, `modules/fare-class/index.js:17-21`; dùng trạng thái/quota tại search, nhưng transaction Booking vẫn quyết định cuối | PASS: `flightHttpParity`, `flightSearchFilters`, `flightModule`, `fareClassModule`, `flightFeature` trong lượt 400 | SQL thực thi trên MySQL/browser UNVERIFIED | PARTIAL; source Flight/Frontend còn local WIP |
| Booking giữ chỗ/khách–guest/PNR/promo — #30–32, #35, #40–41 | `modules/booking/booking.route.js:25-45`, `booking.service.js:54+`, `booking.repository.js` | PASS: `bookingPaymentLifecycle`, `bookingInventory`, `bookingItinerary`, `bookingPaymentContract` trong lượt 400 | MySQL transaction/cron thực tế/browser UNVERIFIED | PARTIAL |
| Payment/VNPay/payOS demo/webhook/refund nội bộ — #33–34, #38–39 | `modules/payment/payment.route.js:34-63`, `payment.service.js:327+,961+`; Return tách IPN/webhook | PASS: `paymentIdempotency`, `paymentAmountConsistency`, `paymentAdminRoutes`, `bookingPaymentLifecycle` trong lượt 400 | Gateway sandbox thật/DB/browser UNVERIFIED | PARTIAL; không phải chứng nhận gateway live |
| PDF/email/Socket.IO — #28–29, #36 | `modules/ticket/ticket.service.js:21+`, `services/email.service.js`, `modules/flight/flight.service.js:49-62`, `infrastructure/realtime/` | PASS: `ticketModule`, `ticketPdf`, `emailConfirmation`, `socketAuthenticator`/realtime tests trong lượt 400 | Provider Resend và socket client thật UNVERIFIED | PARTIAL |
| Tính năng báo cáo ghi dự kiến | Forgot/reset, Role CRUD, autocomplete, thống kê; Calendar tuần/tháng chưa thấy | Test có ở lượt 400 cho nhiều tính năng đã phát triển sau báo cáo | Không xét bắt buộc | Không đánh FAIL vì phần dự kiến không phải cam kết hoàn thành |

Trong Chương 4, `frontend/src/app/AppRouter.jsx:66-127` có route cho các bước tìm chuyến, booking, payment, guest lookup, login/registration, profile và Admin. Đây là **bằng chứng nối route**, không phải xác minh click/API/browser. Thiết kế hiện tại có thể khác hình Stitch mà không sai báo cáo.

## 3. Bảng kiểm chứng 10 luồng xuyên suốt

| Luồng | Theo báo cáo | Hành vi đã kiểm chứng và giới hạn | Kết quả | Bằng chứng |
|---|---|---|---|---|
| 1. Customer login → search → booking → payment → vé | Mục 2.3 + Chương 4 | Auth/search/booking/payment/PDF đều có test thành phần PASS; chưa chạy một phiên người dùng trên API+MySQL+browser thật | **UNVERIFIED E2E** | `tests/authSecurity.test.js`, `flightSearchFilters.test.js`, `bookingPaymentLifecycle.test.js`, `ticketModule.test.js`; `frontend/src/app/AppRouter.jsx:66-83` |
| 2. Guest search → booking → payment → PNR+email | Bảng 2.1, mục 2.3 | Guest email normalize/ownership, lookup, initiate và PDF guest PASS trong service/HTTP mock | **PARTIAL** | `tests/bookingPaymentContract.test.js:50-130`, `bookingPaymentLifecycle.test.js:140,168`, `ticketModule.test.js:64`; `booking.route.js:25,32` |
| 3. Hai khách tranh ghế cuối | Mục 2.3 transaction/row-lock; Chương 3 | Simulated row-lock ngăn bán vượt trong unit test; SQL được sinh nhưng chưa chạy hai kết nối MySQL độc lập | **UNVERIFIED concurrency thật** | `tests/bookingInventory.test.js:157-215`, `modules/booking/booking.repository.js:12-17`, `tests/mysqlBusinessIntegration.test.js` chưa chạy |
| 4. Holding quá 15 phút → expire/hoàn ghế | Mục 2.3; Bảng 2.1 | Default 15 phút, expiry holding, đa chặng và job lặp PASS ở mock; env có thể đổi thời hạn; cron+DB thật chưa chạy | **PARTIAL** | `modules/booking/booking.service.js:75-76,438+`, `tests/bookingPaymentLifecycle.test.js:77,301-330`, `infrastructure/jobs/bookingMaintenanceJob.js` |
| 5. Webhook lặp → không confirm/email trùng | Mục 2.3 Payment | Callback lặp/khóa trạng thái và email một lần PASS trong test giả lập; provider+DB race thật chưa chạy | **PARTIAL** | `modules/payment/payment.service.js:612+`, `tests/bookingPaymentLifecycle.test.js:452`, `tests/paymentIdempotency.test.js` |
| 6. Payment success → confirmed → PDF | Mục 2.3 Payment + Chương 4 | Transition/payment/Ticket service và PDF Buffer PASS trong mock; chưa thực hiện gateway+MySQL+download browser | **PARTIAL** | `tests/bookingPaymentLifecycle.test.js:168+`, `tests/ticketModule.test.js:44-121`, `tests/ticketPdf.test.js`, `booking.route.js:38` |
| 7. Admin refund → cancelled → hoàn ghế | Mục 2.3 Refund | RBAC Admin, confirmed+success, trạng thái/refund/hoàn ghế và duplicate PASS ở mock; refund là **nội bộ**, không gọi gateway hoàn tiền thật | **PARTIAL** | `modules/payment/payment.route.js:63`, `payment.service.js:961+`, `tests/bookingPaymentLifecycle.test.js:338,349,476` |
| 8. Khách mở booking người khác → từ chối | Mục 2.3 quyền sở hữu | Service/HTTP tests từ chối sai owner, yêu cầu guest email; DB browser chưa test | **PARTIAL** | `tests/bookingPaymentLifecycle.test.js:118,140`, `tests/bookingPaymentContract.test.js:65`, `modules/booking/booking.route.js:41` |
| 9. Promo hợp lệ/hết hạn/hết lượt | Mục 2.3 Booking, Bảng 2.1 | Validation thời gian biên/usage limit, tạo booking với promo và hoàn lượt theo điều kiện PASS trong mock | **PARTIAL** | `tests/promotionService.test.js:22`, `tests/bookingPaymentLifecycle.test.js:77,118,301`, `modules/booking/booking.service.js:179-215` |
| 10. Admin/Staff Flight CRUD/hủy/xóa | Bảng 2.1, Chương 4 | HTTP parity và unit tests xác minh Staff/Admin gates, booked-flight delete rollback; MySQL/browser chưa chạy | **PARTIAL** | `tests/flightHttpParity.test.js:12+`, `tests/flightModule.test.js`, `modules/flight/index.js:18-26` |

Các tính năng mới chỉ được xem ở điểm nối với luồng gốc: `bookingInventory.test.js` kiểm tra quota/seat và rollback, `paymentAmountConsistency.test.js` kiểm tra tổng tiền có ancillary/số tiền gateway, `bookingPaymentLifecycle.test.js` kiểm tra cancel/refund không release lặp. **Không thấy regression được xác nhận ở các giao điểm này trong 400 tests**, nhưng MySQL/browser vẫn chưa xác minh, nên không kết luận “tính năng mới chắc chắn không ảnh hưởng”.

## 4. Những điều chưa thể chứng minh và lỗi đã xác nhận

| Phần còn thiếu | Trạng thái | Lý do/bước kiểm chứng đúng phạm vi |
|---|---|---|
| MySQL migration, FK, row-lock, rollback và tranh ghế cuối | **BLOCKED** | Test thật `tests/mysqlBusinessIntegration.test.js:6-8` chỉ được mở khi `RUN_MYSQL_BUSINESS_TESTS=1`, `NODE_ENV=test`, `DB_NAME=airline_booking_ci_test`. Chưa xác nhận được DB test biệt lập; không dùng DB demo/production. |
| Browser E2E Customer/Guest/Admin và luồng Frontend→API | **BLOCKED** | Có nhiều server local, chưa định danh app+DB test riêng; các bước login/booking/payment là thao tác ghi dữ liệu. Không chạy trên demo dùng chung. |
| Frontend unit/build trên WIP hiện tại | **UNVERIFIED** | Vite/Vitest/build có khả năng tạo cache/dist trong checkout; quy tắc audit read-only không cho chạy test/build tạo file. Có test source nhưng không lấy kết quả cũ gán cho phiên này. |
| VNPay sandbox, payOS demo callback, Resend, Socket.IO thực tế | **UNVERIFIED** | Chỉ có mock/HTTP nội bộ; không gửi tiền/email thật hay phát sự kiện đến tài khoản thật. |
| Vệ sinh diff | **FAIL** | `git diff --check` thấy whitespace/blank EOF ở hai file frontend local WIP nêu mục 1; không phải lỗi nghiệp vụ theo báo cáo, không sửa. |

**Không phát hiện lỗi nghiệp vụ trái báo cáo có điều kiện tái hiện thực tế** trong các test đã chạy. Vì chưa có lỗi nghiệp vụ xác nhận, không lập bảng lỗi với “kết quả thực tế” giả định. Không diễn giải `400/400 PASS` thành “mọi chức năng E2E PASS”.

## 5. Trả lời bốn câu hỏi chính

1. **Tất cả chức năng đã cam kết còn hoạt động đúng?** Chưa thể kết luận “tất cả”. Source và 400 unit/HTTP tests hỗ trợ nhiều hợp đồng cốt lõi, không có FAIL nghiệp vụ trong phạm vi đó; MySQL/browser/provider còn thiếu.
2. **Luồng đầu–cuối còn đúng?** **UNVERIFIED** trên môi trường chạy thật. Mười kịch bản có bằng chứng thành phần như bảng trên, nhưng chưa có phiên end-to-end an toàn từ giao diện qua MySQL/gateway demo.
3. **Tính năng mới gây ảnh hưởng?** Chưa phát hiện regression ở các giao điểm được test giả lập; chưa loại trừ ảnh hưởng runtime. Không chấm lỗi chỉ vì tồn tại tính năng bổ sung.
4. **Lỗi cần sửa trước bảo vệ?** Chưa xác nhận lỗi nghiệp vụ P0/P1. Cần sửa whitespace WIP trước commit nếu giữ thay đổi, và quan trọng hơn là chuẩn bị một DB test biệt lập + browser QA để chứng minh các luồng trước khi tuyên bố vận hành hoàn chỉnh. Phân biệt refund nội bộ với gateway refund và payOS demo với live khi trình bày.

Báo cáo này là kết quả audit; chỉ file Markdown mới được tạo. Không sửa code, DOCX, Git, stash hay database; không commit/push.

## 6. Phụ lục kiểm chứng runtime — 21/10/2026

Phụ lục này **bổ sung**, không thay thế kết quả audit ở trên. `400/400` backend là bằng chứng lịch sử của lượt trước; không chạy lại trong lượt runtime này. Checkout vẫn ở `wip/serene-local-recovery-20261020`, HEAD `45fa5b7084c0e826d4891c7dca9639db6ae9edcf`, gồm 30 tracked modifications và hai stash có sẵn. Không sửa source, migration hay DOCX.

### Môi trường và cách ly dữ liệu

| Thành phần | Xác minh thực tế |
|---|---|
| Server có sẵn | `5174`: Vite từ `frontend/` project chính (định danh qua process command line). `5000`: Serene API, nhưng **chưa chứng minh được CWD/branch và DB** của process này; không dùng để ghi test. `8000`: ứng dụng thư viện số khác. |
| Docker/MySQL | Docker daemon local không hoạt động. MySQL WAMP 9.1.0 tại `127.0.0.1:3306` được định danh bằng `@@hostname`, `@@port`, `@@version`, `@@datadir`; không kết nối TiDB ngoài. Cổng 3307 là MariaDB WAMP khác, không dùng. |
| DB test | Xác minh `airline_booking_ci_test` chưa tồn tại, sau đó tạo **schema mới duy nhất** trên MySQL cục bộ. Trước migration: `SELECT DATABASE()` đúng tên test và 0 bảng. Mỗi lệnh Node/Sequelize đặt tường minh `NODE_ENV=test`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=airline_booking_ci_test`, `DB_SSL=false`; test tự kiểm tra DB identity. Không dùng schema demo/production. Schema test được giữ lại, mọi fixture đã dọn: 0 booking, flight, user, promotion và outbox. |
| Server kiểm thử | Backend từ checkout chính tại `5001`, `NODE_ENV=test`, cron tự động tắt, `PAYOS_MODE=demo`, Resend key rỗng; frontend từ checkout chính tại `5175`, `VITE_API_BASE_URL=http://127.0.0.1:5001/api/v1`. Cả hai đã dừng sau test. Không gửi email thật hoặc gọi provider thanh toán live. |

### MySQL và Frontend

- **PASS** — `sequelize-cli db:migrate --env test`: 19/19 migrations, bao gồm `20261014120000-create-booking-segments-table`. `node scripts/ci/verify-mysql-schema.js`: 21 model tables, cột model, FK, unique/index và rollback transaction. Bằng chứng là MySQL **9.1.0 local**, không nhận là MySQL 8 CI.
- **PASS 13/13** — `NODE_ENV=test RUN_MYSQL_BUSINESS_TESTS=1 DB_NAME=airline_booking_ci_test node --test tests/mysqlBusinessIntegration.test.js`: tranh quota/ghế bằng kết nối và transaction thật, rollback chặng sau, hết hạn/giải phóng ghế, snapshot và capacity ancillary, payment/callback/refund lặp, callback trễ, owner check, Flight SQL/status history, notification outbox/rollback/claim. `tests/mysqlBusinessIntegration.test.js` đã tự dọn fixture.
- **PASS 268/268** — `npm test -- --run --maxWorkers=1 --minWorkers=1` tại `frontend/` (28 test files). Một cảnh báo jsdom “navigation to another Document not implemented” trong test PDF không làm test FAIL.
- **PASS** — `npm run build -- --outDir C:/Users/Admin/AppData/Local/Temp/serene-runtime-build-20261021-verified --emptyOutDir false`; output ở thư mục temp ngoài repo. Vite cảnh báo bundle JS >500 kB, là vấn đề hiệu năng cần theo dõi, không phải build fail.
- **FAIL vệ sinh diff có sẵn, không phải lỗi runtime** — `git diff --check` vẫn báo `frontend/src/app/App.jsx:25` và `frontend/src/styles/global.css:4512,5890`. Không sửa WIP ngoài phạm vi.

### Ma trận luồng nghiệp vụ gốc

| Luồng | Unit/HTTP | MySQL Integration | Browser E2E | Kết luận |
|---|---|---|---|---|
| Customer login → search → booking → payment demo → vé | 400/400 lịch sử; Frontend 268/268 hiện tại | PASS: booking, payment callback, trạng thái và quota trong test DB | PASS: CI customer login, search, seat + ancillary, booking, payOS demo; booking confirmed tải được `ticket_15.pdf` qua browser | **PASS trong chế độ demo test**; VNPay sandbox/live chưa chạy |
| Guest search/booking → PNR + email | 400/400 lịch sử | PASS: tạo guest booking ở test DB, PNR `BKD35BE5`; email sai trả 403, thiếu email ở detail trả 422 | PASS: sau lượt lookup đầu, một lượt Playwright riêng đi từ kết quả tìm chuyến → tạo guest booking `BK63E05A` → payOS demo → PNR/email → chi tiết → tải PDF; request API quan sát đều tới cổng 5001, không có page error | **PASS trong chế độ demo test** |
| Hai khách tranh ghế/quota cuối; rollback nhiều chặng | 400/400 lịch sử | PASS: MySQL 13/13 gồm concurrent quota, concurrent cùng ghế và rollback khi chặng sau lỗi | Không phù hợp để chứng minh race; browser chọn ghế và nhiều chặng PASS | **PASS MySQL concurrency**; tải đồng thời quy mô lớn UNVERIFIED |
| Giữ chỗ 15 phút → expiry/hoàn ghế | 400/400 lịch sử | PASS: booking guest tạo `hold_expires_at` sau đúng 15 phút; chỉ trên test DB đặt hạn về quá khứ rồi gọi canonical expiry: lượt 1 xử lý 1, lượt 2 xử lý 0; trạng thái `expired`, `available_seats` tăng 18→19 (1 vé confirmed vẫn giữ). Suite MySQL cũng kiểm tra release ghế/seat đúng một lần | Không đợi 15 phút thật trong browser | **PASS job trên DB test**, lịch cron tự chạy UNVERIFIED vì cố ý tắt cron ở server test |
| Payment webhook/callback lặp, chậm, refund lặp | 400/400 lịch sử | PASS: suite MySQL kiểm tra signed demo callback trùng, thanh toán đồng thời, callback sau expiry; Admin refund nội bộ booking khứ hồi qua API: `confirmed/success` → `cancelled/refunded`, quota hai chặng 19→20; lần refund thứ hai HTTP 400 | PASS: payOS demo confirmation và Admin refund UI trên booking guest `20`; DB xác nhận `cancelled/refunded`, ghế 19→20 | **PASS cho refund nội bộ/demo**; gateway refund/live UNVERIFIED |
| Payment success → confirmed → PDF | 400/400 lịch sử | PASS: booking 15 confirmed/payment success trên DB test | PASS: browser tải `ticket_15.pdf` từ booking confirmed | **PASS demo/local**; email delivery thật UNVERIFIED |
| Quyền sở hữu booking | 400/400 lịch sử | PASS trong suite MySQL; guest email sai HTTP 403 | PASS: customer mở booking guest không thuộc mình nhận API 403, UI hiện error state, không lộ passenger; guest đúng email xem được | **PASS các tình huống quyền đã chạy** |
| Promotion hợp lệ/hết hạn/hết lượt | 400/400 lịch sử | PASS API+MySQL: mã hợp lệ giảm 1.250.000→1.125.000 VND và `used_count=1`; mã hết lượt và hết hạn đều HTTP 400, không tạo thêm booking/không trừ thêm ghế; sau expiry hoàn `used_count=0` | PASS: form guest báo lỗi mã hết hạn, chấp nhận mã hợp lệ và booking được server chốt 1.250.000→1.240.000 VND; không test mã hết lượt qua UI | **PARTIAL**: hết lượt chỉ xác minh API/MySQL |
| Admin/Staff quản lý chuyến bay theo quyền | 400/400 lịch sử | PASS: Flight Status/history và SQL search trong suite MySQL; Staff list 200, create/status update 403; Customer list 403, chưa xác thực 401 | PASS: Admin login + cập nhật status/history; Staff login + xem danh sách + sửa giờ chuyến test qua UI (12:00/14:00→12:05/14:05), xác nhận DB | **PASS các quyền/luồng đã chạy**; không thay cho CRUD toàn diện |
| Các điểm nối tính năng mới với nghiệp vụ gốc | 400/400 lịch sử | PASS: Seat Selection, Inventory Lock, Ancillary snapshot/capacity, Notification rollback/claim; cancelled flight bị chặn đặt mới | PASS: Ancillary Admin, seat/ancillary customer, notification inbox, khứ hồi/nhiều chặng, cancelled-flight exclusion; browser smoke desktop/mobile PASS | Không phát hiện regression tại các điểm nối đã chạy; không suy ra toàn hệ thống/prod PASS |

Browser E2E chạy `scripts/ci/browser-e2e.cjs` và `scripts/ci/browser-smoke.cjs` trên cặp 5001/5175. Bộ CI E2E báo PASS; browser guest lookup lần đầu vướng locator test không duy nhất (hai phần tử cùng tên), chạy lại với locator `.passenger-summary` thì PASS — **không phải lỗi sản phẩm**. Trace browser nằm tại `artifacts/e2e/browser-e2e-trace.zip`; không commit. Browser fixture được xóa bằng `scripts/ci/cleanup-browser-fixtures.js`, guest/promotion/staff fixtures bổ sung được xóa đúng ID trên DB test. Không sửa hoặc xóa dữ liệu demo.

Lượt Playwright bổ sung guest end-to-end, promo UI, Admin refund UI, customer-denial và Staff edit dùng fixture test mới, sau đó dọn theo đúng ID. Hai lần báo FAIL ban đầu là **locator của bài kiểm thử tự viết** (trùng tên hành khách; matcher URL không tính query string), sửa locator rồi kịch bản PASS; không thay đổi source ứng dụng. Sau cleanup lần cuối, truy vấn DB test xác nhận 0 booking, flight, user, promotion và notification outbox; cổng 5001/5175 đã dừng, cổng sẵn có 5000/5174 vẫn chạy.

### Kết luận runtime và giới hạn trước bảo vệ

- **Chưa phát hiện lỗi P0/P1 nghiệp vụ** trong các luồng MySQL và browser đã thực sự chạy. Các tính năng mới không làm sai những giao điểm gốc đã kiểm chứng, nhưng không thể tuyên bố tuyệt đối cho luồng chưa chạy.
- Báo cáo Nhóm E mô tả **VNPay sandbox**, payOS/VietQR **demo**, refund **nội bộ**. Lượt này chỉ chạy payOS demo và refund nội bộ. VNPay sandbox thực tế, gateway live, Resend live, TiDB/production và MySQL 8 CI vẫn **UNVERIFIED**; không được trình bày là đã nghiệm thu.
- Lịch cron tự chạy đủ 15 phút, promo hết lượt **qua UI**, provider VNPay/Resend thực, tải đồng thời quy mô lớn và các trường hợp UI khác ngoài ma trận vẫn **PARTIAL/UNVERIFIED**. Frontend WIP whitespace và cảnh báo kích thước bundle là việc riêng, không phải blocker nghiệp vụ đã xác nhận.
