# Đối chiếu đồ án Serene Flightways với báo cáo Nhóm E

Ngày kiểm tra: 21/10/2026. Tài liệu chuẩn: `docs/NhomE_baocao_2026102.docx` (bản trong repository, bìa 09/2026, commit tài liệu `9ec25c8d`). Đã đọc văn bản, 8 bảng và 13 hình mockup Chương 4; công cụ không render được DOCX thành PDF vì thiếu LibreOffice, do đó dẫn **chương/mục/bảng/hình**, không khẳng định số trang độc lập ngoài mục lục lưu trong file.

## A. Tóm tắt và phạm vi bằng chứng

- Checkout kiểm tra: `wip/serene-local-recovery-20261020`, HEAD `45fa5b7084c0e826d4891c7dca9639db6ae9edcf`; đánh giá **source đang có trong checkout**, bao gồm 30 file tracked sửa chưa commit và 39 mục untracked cấp cao. Hai stash và các worktree khác không được gộp vào kết luận về checkout này. Source ở `origin/main` cached cùng SHA, nhưng **remote hiện tại chưa xác minh**: `git ls-remote` SSH bị từ chối tại cổng 22.
- Bảng 1.2 có **41 hạng mục phân công**, không phải 41 tuyên bố đã hoàn thành. Đối chiếu source: **31 MATCHED ở mức mã/kiểm thử liên quan; 8 EXTENDED so với tình trạng viết báo cáo; 1 PARTIAL (#20, full-text); 1 PLANNED ONLY (#27, lịch tuần/tháng); 0 MISSING/MISMATCH được xác nhận**. Không suy ra 31 luồng E2E đã PASS.
- Chương 2, mục 2.3: ba luồng Booking, Payment/Webhook, Refund có route, service, model, migration và test tương ứng. Chưa xác minh MySQL/runtime gateway/email thật nên không kết luận vận hành production.
- Chương 3: 10 bảng lõi và index chính xuất hiện trong models/migrations. Có bảng mới cho itinerary, seat, ancillary, notification... ngoài ERD 09/2026; đây là mở rộng lịch sử, không tự là lỗi.
- Chương 4 ghi rõ hình Stitch là mockup và số liệu minh họa (đoạn ngay trước hình 4.1). Đối chiếu luồng, không chấm sai khác pixel/màu hay những con số giả trong ảnh.

Quy ước cột “Báo cáo”: `PC` = hạng mục được giao ở Bảng 1.2, **không xác nhận hoàn thành**; `DK` = đoạn “dự kiến/chưa triển khai” ở mục 1.2 hoặc Bảng 2.1. “MATCHED” dưới đây chỉ là **phù hợp source**, không thay cho kiểm thử DB/trình duyệt.

## B. Ma trận truy vết 41 hạng mục của Bảng 1.2

| # | Yêu cầu (Bảng 1.2; chi tiết Bảng 2.1 khi có) | Báo cáo | Bằng chứng trong checkout | Kết luận |
|---:|---|---|---|---|
| 1 | Đăng ký/sửa/khóa tài khoản | PC | `modules/auth/index.js`, `modules/user/index.js`, `modules/user/user.service.js`, `tests/userModule.test.js` | MATCHED |
| 2 | Danh sách user, tìm/lọc/phân trang | PC | `modules/user/index.js`, `frontend/src/features/users/UsersPage.jsx` | MATCHED |
| 3 | Chi tiết user | PC | `modules/user/index.js`, `frontend/src/features/users/UserDetailPage.jsx` | MATCHED |
| 4 | Role CRUD | PC, DK ở mục 1.2 | `modules/role/index.js:16-21`, `tests/roleModule.test.js` | EXTENDED |
| 5 | Danh sách Role | PC, DK ở mục 1.2 | `modules/role/index.js`, `frontend/src/features/roles/RolesPage.jsx` | EXTENDED |
| 6 | Chi tiết Role | PC, DK ở mục 1.2 | `modules/role/index.js`, `frontend/src/features/roles/RoleDetailPage.jsx` | EXTENDED |
| 7 | JWT login/logout | PC | `modules/auth/index.js:23-31`, `modules/auth/auth.service.js`, `tests/authModule.test.js` | MATCHED |
| 8 | Forgot/reset qua email | PC, DK ở mục 1.2 | `modules/auth/index.js:23-31`, `frontend/src/features/auth/ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` | EXTENDED |
| 9 | Middleware RBAC | PC | `modules/user/index.js`, `modules/role/index.js`, `middlewares/auth.middleware.js`, `middlewares/rbac.middleware.js` | MATCHED |
| 10 | Access/refresh JWT | PC | `modules/auth/auth.service.js`, `tests/authModule.test.js` | MATCHED |
| 11 | Airline CRUD | PC | `modules/airline/index.js`, `tests/airlineService.test.js` | MATCHED |
| 12 | Airline list/tìm/phân trang | PC | `modules/airline/index.js`, `modules/airline/airline.service.js` | MATCHED |
| 13 | Airline detail | PC | `modules/airline/index.js`, `frontend/src/features/airline-airport/AirlineAirportPages.jsx` | MATCHED |
| 14 | Airport CRUD | PC | `modules/airport/index.js:28-32`, `tests/airportService.test.js` | MATCHED |
| 15 | Airport list | PC | `modules/airport/index.js:28`, `frontend/src/features/airline-airport/AirlineAirportPages.jsx` | MATCHED |
| 16 | Airport detail | PC | `modules/airport/index.js:29`, `modules/airport/airport.service.js` | MATCHED |
| 17 | `logo_url`/upload logo | PC, upload DK ở Bảng 2.1 | `models/airline.js`, `modules/airline/index.js`, `tests/airlineLogoUpload.test.js` | EXTENDED |
| 18 | Gợi ý sân bay | PC, DK ở mục 1.2 | `frontend/src/features/flights/AirportCombobox.jsx`, `flightDiscoveryApi.js`; dùng API list/search hiện có, không route autocomplete riêng | EXTENDED |
| 19 | Thống kê chuyến theo hãng | PC | `modules/airline/index.js`, `tests/airlineStatistics.test.js` | EXTENDED |
| 20 | Tìm kiếm nâng cao, gồm full-text | PC; full-text DK ở mục 1.2 | `modules/flight/flight.repository.js:15-99`, `frontend/src/features/flights/AdvancedFlightFilters.jsx`; có filter cấu trúc nhưng không thấy SQL full-text `MATCH`/chỉ mục tương ứng | PARTIAL |
| 21 | Flight CRUD/cancel | PC | `modules/flight/index.js:18-26`, `tests/flightModule.test.js` | MATCHED |
| 22 | Flight list/search đi–đến–ngày | PC | `modules/flight/index.js`, `flight.repository.js`, `tests/flightSearchFilters.test.js` | MATCHED |
| 23 | Flight detail/số ghế | PC | `modules/flight/index.js`, `flight.service.js`, `flight.repository.js` | MATCHED |
| 24 | FareClass CRUD/giá | PC | `modules/fare-class/index.js:17-21`, `tests/fareClassModule.test.js` | MATCHED |
| 25 | FareClass list theo chuyến | PC | `modules/fare-class/index.js:17` | MATCHED |
| 26 | FareClass detail | PC | `modules/fare-class/index.js:18` | MATCHED |
| 27 | Calendar tuần/tháng | PC, DK ở mục 1.2 | Không thấy route/component lịch trong phạm vi Flight hiện tại; không phải thiếu tính năng đã cam kết triển khai | PLANNED ONLY |
| 28 | Cảnh báo ít ghế qua Socket.IO | PC | `modules/flight/flight.service.js:49-62`, `infrastructure/realtime/`, `tests/flightModule.test.js` | MATCHED |
| 29 | E-ticket PDF | PC | `modules/ticket/ticket.service.js`, `modules/booking/booking.route.js:38`, `tests/ticketModule.test.js` | MATCHED |
| 30 | Tạo/xem/hủy booking, giữ quota | PC | `modules/booking/booking.route.js:25-45`, `booking.service.js`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |
| 31 | Booking list | PC | `modules/booking/booking.route.js:29,35` | MATCHED |
| 32 | Booking detail | PC | `modules/booking/booking.route.js:41` | MATCHED |
| 33 | Initiate/Return/IPN/webhook/refund | PC | `modules/payment/payment.route.js:34-63`, `payment.service.js`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |
| 34 | Payment admin list/detail | PC | `modules/payment/payment.route.js:25-32,59-60`, `tests/paymentAdminRoutes.test.js` | MATCHED |
| 35 | Hold 15 phút, reconciliation tùy cấu hình | PC | `modules/booking/booking.service.js:75-76,438+`, `infrastructure/jobs/bookingMaintenanceJob.js`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |
| 36 | Resend email xác nhận | PC | `services/email.service.js`, `modules/payment/payment.service.js:312-320`, `tests/emailConfirmation.test.js` | MATCHED |
| 37 | Doanh thu ngày/tháng | PC, DK ở mục 1.2 | `modules/payment/payment.route.js:48-56`, `tests/bookingPaymentLifecycle.test.js` | EXTENDED |
| 38 | VNPay sandbox + payOS/VietQR demo | PC | `modules/payment/payment.service.js`, `payment.route.js:38-46`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |
| 39 | Webhook cập nhật booking | PC | `modules/payment/payment.service.js:612+`, `payment.route.js:41,45` | MATCHED |
| 40 | Guest tra PNR + email | PC | `modules/booking/booking.route.js:31-32`, `booking.service.js`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |
| 41 | Promotion lúc tạo booking | PC | `modules/booking/booking.service.js:179-215`, `modules/promotion/`, `tests/bookingPaymentLifecycle.test.js` | MATCHED |

Mục #35 mặc định hiện là 15 phút nhưng `HOLDING_TIME_MINUTES` có thể cấu hình (`booking.service.js:75-76`); 15 phút tuyệt đối trên mọi môi trường **chưa xác minh**. Những test không nêu là đã chạy riêng chỉ là bằng chứng **test tồn tại**.

## C. Ba luồng nghiệp vụ trọng tâm — Chương 2, mục 2.3

| Luồng/điều kiện báo cáo | Bằng chứng source và test | Đánh giá |
|---|---|---|
| Booking Customer/Guest, PNR, `holding`, giá server | `modules/booking/booking.route.js:25-26`, `booking.service.js:75+`, `tests/bookingPaymentLifecycle.test.js` | Có code/test mock; DB E2E UNVERIFIED |
| Giữ chỗ 15 phút, giảm/hoàn quota, promo lúc tạo | `booking.service.js:75-76,105+,179-215,438+`, `booking.repository.js:12-17,51-57`, `utils/bookingItinerary.util.js` | Có transaction và truy vấn khóa trong source; concurrency MySQL UNVERIFIED |
| Payment ownership, amount server, `pending_payment` | `modules/payment/payment.service.js:327-456`, `bookingPaymentContract.test.js`, `paymentAmountConsistency.test.js` | Có code/test; gateway thật UNVERIFIED |
| VNPay Return chỉ hiển thị; IPN và payOS webhook xác minh/chốt trạng thái | `modules/payment/payment.route.js:38-46`, `payment.service.js:612+`, `paymentIdempotency.test.js` | Có tách kênh, kiểm tra chữ ký/số tiền và khóa; callback thật UNVERIFIED |
| Callback lặp/trễ không xác nhận booking hết hạn | `payment.service.js:668+`, `tests/bookingPaymentLifecycle.test.js`, `paymentIdempotency.test.js` | Có regression mock; DB race UNVERIFIED |
| Refund nội bộ Admin, confirmed + success, không lặp; trả ghế trong transaction | `payment.route.js:63`, `payment.service.js:1017+`, `tests/bookingPaymentLifecycle.test.js` | Có điều kiện/transaction trong source; **không phải refund gateway thật** |
| Email xác nhận sau thành công | `payment.service.js:312-320`, `services/email.service.js`, `tests/emailConfirmation.test.js` | Luồng có code; provider thật UNVERIFIED |

Ghi chú: Báo cáo Chương 2 chỉ đặc tả **áp promotion khi tạo**; không coi việc thiếu thay promotion sau khi đặt là lỗi vì mục 1.2 ghi đây là kế hoạch. Tương tự, payOS được mô tả là demo/VietQR, không được trình bày thành thanh toán payOS live.

## D. Database/ERD — Chương 3, Bảng 3.1–3.2

| Bảng lõi trong ERD | Model + migration tương ứng | Runtime DB | Nhận xét |
|---|---|---|---|
| `roles`, `users` | `models/role.js`, `user.js`; `migrations/20260915184447-create-roles-table.js`, `...184449-create-users-table.js` | UNVERIFIED | FK role cần chạy DB test để chứng minh |
| `airlines`, `airports` | `models/airline.js`, `airport.js`; `...184450-create-airlines-table.js`, `...184452-create-airports-table.js` | UNVERIFIED | Có model/migration |
| `flights` | `models/flight.js`; `...184453-create-flights-table.js`; `...20261017180000-add-flight-status-tracking.js` | UNVERIFIED | Index `(departure_airport_id, arrival_airport_id, departure_time)` có ở migration; enum trạng thái mở rộng |
| `fare_classes` | `models/fare_class.js`; `...184455-create-fare-classes-table.js` | UNVERIFIED | Có model/migration |
| `promotions` | `models/promotion.js`; `...184457-create-promotions-table.js` | UNVERIFIED | Có model/migration |
| `bookings` | `models/booking.js`; `...184458-create-bookings-table.js` | UNVERIFIED | Enum `holding/pending_payment/confirmed/cancelled/expired`; `booking_code` unique; index `(status,user_id)` |
| `booking_passengers` | `models/booking_passenger.js`; `...184500-create-booking-passengers-table.js` | UNVERIFIED | Có model/migration |
| `payments` | `models/payment.js`; `...184502-create-payments-table.js` | UNVERIFIED | Enum `pending/success/failed/refunded`; `transaction_ref` unique/index |

`models/index.js` nạp associations. `booking_segments` (`models/booking_segment.js`, `migrations/20261014120000-create-booking-segments-table.js`) và các bảng seat/ancillary/status/notification là mở rộng sau báo cáo; **không có bằng chứng chúng đã migrate trên DB đang chạy**. Không chạy `sync`, migration, seed hoặc SELECT vào DB không định danh an toàn.

## E. Giao diện — Chương 4, mục 4.1–4.12, hình 4.1–4.13

| Luồng trong báo cáo | Bằng chứng frontend/router | Mức xác minh |
|---|---|---|
| 1. Trang chủ tìm chuyến | `frontend/src/features/flights/HomePage.jsx` | Route/source có; browser UNVERIFIED |
| 2. Kết quả tìm kiếm | `FlightResultsPage.jsx`, `AdvancedFlightFilters.jsx` | Route/source có; browser UNVERIFIED |
| 3. Chi tiết/chọn hạng vé | `FlightResultsPage.jsx`, `flightDiscoveryApi.js` | Source có; hành vi click thật UNVERIFIED |
| 4. Hành khách/tạo booking | `frontend/src/features/bookings/BookingPages.jsx` | Source có; DB E2E UNVERIFIED |
| 5. Thanh toán/giữ chỗ | `PaymentPages.jsx` | Source có; provider thật UNVERIFIED |
| 6. Guest PNR + email | `BookingPages.jsx`, `bookingsApi.js` | Source có; browser UNVERIFIED |
| 7. Login/registration (hai hình) | `LoginPage.jsx`, `RegisterPage.jsx` | Source có; browser UNVERIFIED |
| 8. Profile/security | `frontend/src/features/profile/ProfileLayout.jsx` | Source có; browser UNVERIFIED |
| 9. Admin Flight | `frontend/src/features/flights/FlightManagementPages.jsx` | Source có; browser UNVERIFIED |
| 10. Admin Booking | `frontend/src/features/bookings/BookingPages.jsx` | Source có; browser UNVERIFIED |
| 11. Danh mục/User | `AirlineAirportPages.jsx`, `frontend/src/features/users/UsersPage.jsx` | Source có; browser UNVERIFIED |
| 12. Vé của tôi/danh sách Booking | `frontend/src/features/bookings/BookingPages.jsx` | Source có; browser UNVERIFIED |

Các route tương ứng nằm trong `frontend/src/app/AppRouter.jsx:66-127`; giao diện hiện tại mới hơn mockup. Không đánh giá pixel hay dữ liệu minh họa trong hình. Các file frontend nói trên có thay đổi chưa commit, nên đây là **workspace state**, không khẳng định HEAD committed giống hệt.

## F. Kiến trúc và kiểm thử thực hiện

- Node/Express REST `/api/v1`: `application/createApp.js:27`, `application/registerModules.js:4-18`; kiến trúc Controller→Service→Repository/Sequelize trong các `modules/`; MySQL config có trong source nhưng DB thực tế chưa được xác minh. `models/index.js` là đầu nạp model/association.
- JWT/refresh/RBAC và bcrypt: `modules/auth/`, `modules/user/`, `modules/role/`, middleware; nguồn VNPay/payOS, Resend, Socket.IO, PDF nêu ở các bảng trên. `.github/workflows/ci.yml` có Node test/Docker và deploy hook; workflow tồn tại **không chứng minh GitHub Actions/deploy Render đã chạy**. Git-flow trong báo cáo là quy trình, không chứng minh các branch đã merge/CI đã đậu.
- Chạy trên checkout hiện tại: `node --test tests/authModule.test.js tests/userModule.test.js tests/roleModule.test.js tests/airlineService.test.js tests/airportService.test.js tests/flightModule.test.js tests/fareClassModule.test.js tests/bookingModule.test.js tests/paymentModule.test.js tests/ticketModule.test.js` → **69/69 PASS**.
- Chạy tiếp: `node --test tests/bookingPaymentLifecycle.test.js tests/paymentIdempotency.test.js tests/paymentAmountConsistency.test.js tests/bookingInventory.test.js tests/bookingItinerary.test.js tests/flightSearchFilters.test.js tests/flightStatus.test.js tests/airlineStatistics.test.js tests/bookingPaymentContract.test.js tests/paymentAdminRoutes.test.js tests/bookingStatusHistory.test.js` → **106/106 PASS**. Tổng 175 focused backend tests, chủ yếu mock/injected repository; **không phải MySQL integration**.
- `git diff --check` trên local WIP → **FAIL**: `frontend/src/app/App.jsx:25` blank EOF; `frontend/src/styles/global.css:4512` trailing whitespace, `:5890` blank EOF. Không sửa vì audit read-only. Backend full suite, frontend tests/build, API live, browser E2E, MySQL, gateway/email, deployment: **UNVERIFIED trong lần kiểm tra này**. Không lấy PASS ở commit cũ thay thế.

## G. Sai lệch và rủi ro trình bày

| ID | Mức | Vị trí báo cáo | Nhận định có bằng chứng | Ảnh hưởng/đề xuất (không sửa) |
|---|---|---|---|---|
| D1 | MEDIUM | Bảng 1.2 #20, mục 1.2 | Search theo trường có trong `modules/flight/flight.repository.js`, nhưng không thấy full-text đặc thù; mục 1.2 cũng gọi full-text là dự kiến | Khi bảo vệ, demo các filter đã có; không nói đã triển khai full-text |
| D2 | LOW | Bảng 1.2 #27, mục 1.2 | Calendar tuần/tháng được giao nhưng báo cáo ghi dự kiến; không thấy UI/route lịch | Trình bày là định hướng, không gắn nhãn lỗi thiếu implementation |
| D3 | MEDIUM | Mục 1.2 so với Bảng 2.1 | Tài liệu vừa liệt kê một số khả năng trong catalog, vừa ghi chưa triển khai ở đoạn minh chứng; source tháng 10 đã có Role/forgot/autocomplete/revenue | **DOCUMENT INCONSISTENCY theo thời điểm**: khi cập nhật báo cáo, tách “thiết kế”, “đã có 09/2026”, “đã bổ sung 10/2026” |
| D4 | MEDIUM | Chương 3, Bảng 3.1–3.2 | ERD chỉ có 10 bảng; source đã thêm itinerary, seat, ancillary, status, notification | Cập nhật ERD nếu trình bày bản code mới; không gọi bảng bổ sung là sai thiết kế gốc |
| D5 | LOW | Chương 2, Bảng 2.2 | Flight enum ở `models/flight.js:51-52` đã thêm delayed/boarding/departed/arrived bên cạnh enum gốc | Cập nhật bảng trạng thái khi thuyết trình Flight Status mới |
| D6 | MEDIUM | Mục 2.3 Booking | `HOLDING_TIME_MINUTES` có default 15 (`booking.service.js:75-76`), cấu hình môi trường có thể thay đổi | Kiểm tra config demo trước khi tuyên bố đúng 15 phút trong runtime |
| D7 | HIGH (bằng chứng thiếu) | Chương 2–3 | Models/migrations và mock tests không chứng minh DB hiện tại đã migrate hoặc concurrent row-lock hoạt động | Cần MySQL test biệt lập và browser QA trước khi tuyên bố E2E/production |
| D8 | LOW | Mục 1.3 | Báo cáo ghi `feature/flightfareclass`, Git hiện dùng `feature/flight-fareclass` | Chuẩn hóa tên nhánh trong tài liệu, tránh nhầm khi trình bày Git history |
| D9 | LOW | Không phải sai lệch báo cáo | `git diff --check` FAIL chỉ ở thay đổi local chưa commit | Sửa sau audit/owner review trước commit, không ảnh hưởng bản DOCX |

Không phát hiện **MISMATCH nghiệp vụ P0 đã xác nhận** trong phạm vi báo cáo bằng kiểm tra tĩnh + 175 focused tests. Điều này **không** chứng minh không có lỗi runtime.

## H. Kết luận dùng khi bảo vệ đồ án

1. **Còn phù hợp?** Có ở mức kiến trúc, 10 bảng lõi, route và luồng nghiệp vụ chính; tài liệu là ảnh chụp 09/2026 nên chưa phản ánh đầy đủ source 10/2026.
2. **Đã có và được test trong phạm vi này?** 31 mục source MATCHED và 8 mục EXTENDED có implementation; 175 focused backend tests đã chạy PASS trên checkout này. Không nâng trạng thái đó thành “toàn bộ chức năng hoạt động thực tế”.
3. **Chưa đủ bằng chứng?** MySQL schema đã migrate, concurrency/rollback thực tế, frontend/browser E2E, cổng thanh toán/email thật, CI/deploy hiện tại; calendar là kế hoạch, full-text mới partial.
4. **Sai nghiệp vụ cốt lõi?** Chưa xác nhận từ bằng chứng đã kiểm; refund là **nội bộ**, payOS là **demo**, hai điều này phải nói đúng như báo cáo.
5. **Phần báo cáo đã lạc hậu?** Tình trạng Frontend, Role/forgot/autocomplete/revenue, ERD mở rộng và Flight Status. Nên cập nhật mục 1.2, Bảng 2.1–2.2, ERD/Bảng 3.1–3.2 và mô tả Chương 4 theo bản release được chọn, **không cần làm giao diện quay về mockup**.
6. **Câu hỏi giáo viên có thể đặt:** “DB demo đang dùng đã chạy migration nào?”, “Có test cạnh tranh hai booking bằng MySQL thật không?”, “VNPay/payOS đang ở sandbox/demo hay live?”, “Refund có chuyển tiền thật không?”, “41 hạng mục là phân công hay tất cả đã xong?”, “Hình Stitch có phải UI đã lập trình lúc nộp báo cáo không?”. Chưa nên trả lời PASS cho phần chưa có chứng cứ runtime.

Báo cáo này là audit read-only về source/Git, ngoại trừ chính file Markdown kết quả được tạo mới. Không sửa DOCX, source, stash, nhánh hay database; không commit/push.
