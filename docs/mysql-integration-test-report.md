# Báo cáo MySQL Integration & Concurrency Test — Booking–Payment

Ngày chạy: 2026-10-16

Branch kiểm tra ban đầu: `test/booking-payment-mysql-integration`

Branch hiệu chỉnh IT-09: `fix/flight-payment-state-coordination`

Commit Integration Test nền: `eb45962` (nằm trên `d8fe990`, phiên bản mới nhất của `feature/booking-payment` và `origin/feature/booking-payment` khi bắt đầu sửa)

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
| IT-09 | Hai thứ tự commit giữa Payment Initiate và Flight Cancellation; webhook/refund sau hủy chuyến | PASS | 10/10 PASS |

Sau khi hiệu chỉnh IT-09, mỗi lần chạy toàn bộ có 9 pass, 0 fail, 0 skip. Tổng 10 lần: 90 lượt pass, 0 fail, 0 skip. Tổng thời gian là 23.014 giây, trung bình 2.301 giây/lần. Không quan sát thấy MySQL deadlock `1213` hoặc lock timeout `1205`.

IT-04 dùng `reconcileStalePendingPayments()` vì code production cố ý giới hạn `expireHoldingBookings()` cho trạng thái `holding`; đây là phần job chịu trách nhiệm với booking `pending_payment` quá hạn.

## Chẩn đoán và hiệu chỉnh IT-09

Kết luận ban đầu “race condition mức High” là false positive do assertion không phản ánh thứ tự commit đã được test chủ động tạo ra.

Cách tái hiện ổn định:

1. Tạo Flight `scheduled` và Booking `holding` còn hạn.
2. Bắt đầu `PaymentService.initiatePayment()`.
3. Sau khi transaction Payment Initiate đã khóa và đọc Flight là `scheduled`, test mới gọi `FlightService.updateFlight()` để chuyển Flight sang `cancelled`.
4. Payment Initiate commit Booking `pending_payment` và tạo Payment `pending`.
5. Flight update hoàn tất sau đó.
6. Trạng thái cuối quan sát trực tiếp trong MySQL: Flight `cancelled`, Booking `pending_payment`, số Payment mới là 1.

Trong interleaving này, Payment Initiate đã thắng khóa và phải được phép commit. Kết quả có một Payment `pending` là đúng; Flight Cancellation chỉ có thể commit sau đó. Assertion `paymentCount === 0` đã yêu cầu rollback một transaction vốn hoàn thành hợp lệ trước thao tác hủy chuyến.

Code production bảo vệ bất biến còn lại ở webhook: callback khóa Payment → Booking → Flight, ghi nhận giao dịch thành công nhưng không xác nhận Booking nếu Flight đã `cancelled`; Booking giữ `pending_payment` để manual review và `processRefund()` hỗ trợ trạng thái này. Nếu Flight Cancellation commit trước, locking read trong Payment Initiate thấy Flight không còn `scheduled`, rollback Booking và không tạo Payment.

IT-09 mới kiểm tra cả hai thứ tự commit, success webhook sau Flight Cancellation và Refund chạy đồng thời với Flight Cancellation. Không cần sửa production service hoặc schema cho chính sách hiện tại.

### Chính sách trạng thái được kiểm chứng

- Flight Cancellation commit trước: Booking giữ `holding`, Payment Initiate đọc Flight `cancelled`, rollback và không tạo Payment. Booking được người dùng hủy hoặc job expiration xử lý theo lifecycle hiện có.
- Payment Initiate commit trước: Booking chuyển `pending_payment` và Payment giữ `pending`; Flight Cancellation được phép commit sau đó vì payment attempt đã được tạo hợp lệ khi Flight còn `scheduled`.
- Success webhook sau Flight Cancellation: Payment chuyển `success` để không làm mất charge; Booking không chuyển `confirmed`, tiếp tục `pending_payment` với kết quả yêu cầu manual review.
- Refund thủ công sau charge bất thường: Payment chuyển `refunded`, Booking chuyển `cancelled`, ghế được hoàn đúng một lần. Không có auto-refund khi gateway chưa xác nhận.
- Refund đồng thời Flight Cancellation: hai thao tác tuần tự trên row Flight, cùng hoàn tất mà không deadlock; refund là workflow duy nhất hoàn ghế.

### Thứ tự khóa

Không thay đổi thứ tự khóa production:

- Payment Initiate: Booking → Flight → tạo Payment.
- VNPay/payOS webhook: Payment → Booking → Flight → Promotion khi cần hoàn tài nguyên.
- Refund: các Payment success theo ID → Booking → Flight.
- Flight Cancellation: chỉ ghi row Flight; không giữ thêm Booking hoặc Payment lock, nên không tạo chu trình khóa với webhook/refund.

Hook trong IT-09 chỉ quan sát thời điểm Payment Initiate đã lấy Flight lock để tạo interleaving xác định. Test không mock transaction hoặc row lock.

### Phạm vi chưa tự động hóa

Schema hiện không có trạng thái `refund_pending` hoặc `cancelled_by_airline`. Hệ thống cũng chưa tự động hoàn tiền qua gateway, thông báo khách hay đổi chuyến khi Flight bị hủy. Các trường hợp này tiếp tục dùng manual review và admin refund; nếu muốn tự động hóa cần một quyết định sản phẩm và workflow riêng, không nên gộp vào sửa assertion IT-09.

## Regression test

`npm test`: **159/159 PASS**, 0 fail, 0 skip, thời gian 2.145 giây.

`npm run test:integration:mysql`: **9/9 PASS**; lặp 10 lần đều PASS.

## File tạo và sửa

| File | Thay đổi |
|---|---|
| `package.json` | Thêm script `test:integration:mysql`; không đổi script `test` |
| `tests/integration/helpers/mysqlTestDatabase.js` | Guard database và xác minh kết nối thật |
| `tests/integration/helpers/testFixtures.js` | Fixture có định danh và cleanup theo ID |
| `tests/integration/bookingPaymentConcurrency.mysql.test.js` | IT-01 đến IT-09 |
| `docs/mysql-integration-test-report.md` | Báo cáo này |

Trên branch fix, chỉ IT-09 trong file integration test và báo cáo này được sửa. Không thay đổi service, controller, validator, model, migration hoặc schema production.

Commit dự kiến: `test: align IT-09 with transaction commit order`.

## Trạng thái Git

Commit Integration Test `eb45962` chỉ bao gồm các file được liệt kê phía trên. File `docs/NhomE_baocao_20261002_ChinhSua_CapNhat.docx` vẫn là untracked, không bị thay đổi và không được đưa vào commit. Không merge hoặc push.
