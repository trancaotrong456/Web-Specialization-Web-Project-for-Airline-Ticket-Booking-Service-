# Báo cáo MySQL Integration & Concurrency Test — Booking–Payment

Ngày chạy: 2026-10-16

Branch: `test/booking-payment-mysql-integration`

Commit nền: `d8fe990` (trùng `feature/booking-payment` và `origin/feature/booking-payment` sau `git fetch origin --prune`)

## Môi trường đã xác minh

| Thuộc tính | Giá trị |
|---|---|
| MySQL | 8.0.46 |
| Host/port | `127.0.0.1:3309` |
| Database | `airline_booking_integration_test` |
| Transaction isolation | `REPEATABLE-READ` |
| Migration | 11/11 trong `SequelizeMeta` |
| Sequelize | Kết nối thật, pool nhiều connection |
| Test runner | Node.js `node --test` |

Test có guard bắt buộc `NODE_ENV=test`, đúng host, port và database trước khi nạp model. Bộ test không dùng `sequelize.sync`, không drop/truncate bảng và chỉ xóa các ID fixture do chính test ghi nhận. Kiểm tra sau lần chạy cuối cho kết quả còn lại: 0 airline, 0 airport, 0 booking và 0 passenger mang định danh integration test.

Không gọi API VNPay/payOS thật. VNPay IPN được ký cục bộ bằng checksum production hiện có. Dịch vụ email là dependency bên ngoài duy nhất được mock trong các ca xác nhận thanh toán; database, transaction, row lock và logic nghiệp vụ không bị mock.

## Kết quả

Đây là test ở mức service. Không có ca HTTP-level trong phạm vi này.

| Test | Kịch bản và kiểm tra trạng thái cuối trong MySQL | Kết quả | 10 lần chạy cuối |
|---|---|---:|---:|
| IT-01 | Hai `createHoldingBooking()` tranh 1 ghế; kiểm tra 2 connection, booking/passenger thừa và số ghế | PASS | 10/10 PASS |
| IT-02 | Hai lệnh hủy cùng booking; ghế và lượt promotion chỉ hoàn một lần | PASS | 10/10 PASS |
| IT-03 | Hai VNPay IPN thành công cùng payment; booking/payment nhất quán và email chỉ kích hoạt một lần | PASS | 10/10 PASS |
| IT-04 | VNPay IPN thành công tranh chấp với phần đối soát `pending_payment` của job hết hạn; giao dịch đã thu luôn được lưu và ghế khớp trạng thái cuối | PASS | 10/10 PASS |
| IT-05 | Hai refund đồng thời; đúng một yêu cầu có hiệu lực, payment và ghế chỉ cập nhật một lần | PASS | 10/10 PASS |
| IT-06 | Refund tranh chấp với success webhook lặp lại; không deadlock, booking `cancelled`, payment `refunded`, ghế hoàn một lần | PASS | 10/10 PASS |
| IT-07 | Hai booking tranh promotion còn một lượt; `used_count` không vượt `max_uses`, không mất lượt do rollback | PASS | 10/10 PASS |
| IT-08 | Success webhook của attempt cũ đến sau attempt mới; charge cũ được ghi nhận để đối soát, attempt mới và booking không bị xác nhận nhầm | PASS | 10/10 PASS |
| IT-09 | Payment Initiate tranh chấp với `FlightService.updateFlight(..., {status: 'cancelled'})` | **FAIL** | **10/10 FAIL** |

Mỗi lần chạy toàn bộ có 9 test: 8 pass, 1 fail, 0 skip. Tổng 10 lần chạy cuối: 80 lượt pass, 10 lượt fail, 0 skip. Tổng thời gian là 16.090 giây, trung bình 1.609 giây/lần. Không quan sát thấy MySQL deadlock `1213` hoặc lock timeout `1205`.

IT-04 dùng `reconcileStalePendingPayments()` vì code production cố ý giới hạn `expireHoldingBookings()` cho trạng thái `holding`; đây là phần job chịu trách nhiệm với booking `pending_payment` quá hạn.

## Race condition đã xác nhận — IT-09

Mức độ: **High**. Có thể tạo trạng thái cuối không nhất quán giữa chuyến bay và quy trình thanh toán.

Cách tái hiện ổn định:

1. Tạo Flight `scheduled` và Booking `holding` còn hạn.
2. Bắt đầu `PaymentService.initiatePayment()`.
3. Sau khi transaction Payment Initiate đã khóa và đọc Flight là `scheduled`, gọi đồng thời `FlightService.updateFlight()` để chuyển Flight sang `cancelled`.
4. Payment Initiate commit Booking `pending_payment` và tạo Payment `pending`.
5. Flight update hoàn tất sau đó.
6. Trạng thái cuối quan sát trực tiếp trong MySQL: Flight `cancelled`, Booking `pending_payment`, số Payment mới là 1.

Assertion mong muốn `paymentCount === 0` nhận giá trị thực tế `1` ở cả 10/10 lần. Đây là lỗi production đã xác nhận, không phải rủi ro giả định. Test sử dụng đúng `PaymentService` và `FlightService`; hook Sequelize chỉ tạo điểm đồng bộ sau câu `SELECT ... FOR UPDATE` để tái hiện đúng interleaving, không thay thế transaction hay database.

Nguyên nhân là thao tác cập nhật trạng thái Flight không phối hợp nguyên tử với Booking/Payment đang hoạt động. Khóa Flight trong Payment Initiate chỉ bảo vệ tới lúc transaction đó commit; Flight update vẫn có thể chuyển sang `cancelled` ngay sau commit, để lại Payment vừa tạo.

Đề xuất sửa trên branch riêng `fix/flight-payment-state-coordination` tạo từ bản mới nhất của `feature/booking-payment`. Workflow hủy Flight cần transaction và chính sách rõ cho booking `holding`/`pending_payment` cùng payment liên quan, với thứ tự khóa thống nhất để tránh deadlock. Không sửa business logic trên branch test này.

## Regression test

`npm test`: **159/159 PASS**, 0 fail, 0 skip, thời gian 2.613 giây.

`npm run test:integration:mysql`: thoát với mã 1 do IT-09 cố ý giữ assertion nghiệp vụ đang bị vi phạm. Không đánh dấu IT-09 là PASS hoặc skip.

## File tạo và sửa

| File | Thay đổi |
|---|---|
| `package.json` | Thêm script `test:integration:mysql`; không đổi script `test` |
| `tests/integration/helpers/mysqlTestDatabase.js` | Guard database và xác minh kết nối thật |
| `tests/integration/helpers/testFixtures.js` | Fixture có định danh và cleanup theo ID |
| `tests/integration/bookingPaymentConcurrency.mysql.test.js` | IT-01 đến IT-09 |
| `docs/mysql-integration-test-report.md` | Báo cáo này |

## Trạng thái Git

Commit Integration Test chỉ bao gồm các file được liệt kê phía trên. File `docs/NhomE_baocao_20261002_ChinhSua_CapNhat.docx` vẫn là untracked, không bị thay đổi và không được đưa vào commit. Không merge hoặc push.
