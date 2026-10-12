# Dữ liệu demo Docker local

Tài liệu này dành riêng cho database Docker local `airline_booking_docker`. Không dùng seeder hoặc ba tài khoản demo công khai trên staging/production, TiDB Cloud, Render hay môi trường dùng chung.

## Setup cho thành viên mới

1. Cài Docker Desktop (local context), Node.js 20+ và npm.
2. Nếu repository hiện có `docker.env` đã được tùy chỉnh trước khi pull commit xóa file tracked cũ, hãy sao lưu nó trước khi pull và khôi phục sau pull chỉ khi chưa có `docker.env`. Xem mục “Safe docker.env migration” trong README. Không thay file local bằng template nếu đã có cấu hình.
3. Chuẩn bị backend và dữ liệu demo bằng lệnh chạy trên host:

```powershell
npm run demo:up
```

Lệnh chỉ tạo `docker.env` từ `docker.env.example` nếu file local chưa tồn tại. Wrapper trên host xác minh Docker context/endpoint hiệu lực và các biến override, từ chối SSH/TCP hoặc endpoint không xác định, kiểm tra Compose cùng database `airline_booking_docker`, khởi động MySQL, chờ healthy, chạy migrations, preview rồi tự bổ sung fixture còn thiếu. Sau đó nó xác minh bootstrap, khởi động API và kiểm tra health. Đây là thao tác ghi demo được chủ động gọi bằng `demo:up`; không chạy Seeder riêng và không nhập xác nhận lần hai. Tài khoản, mật khẩu, lịch bay hiện có, Booking và Payment không bị sửa.

API Compose đợi bootstrap thành công và kiểm tra marker gắn với đúng MySQL container trước khi mở cổng/health. Chạy `docker compose up` trực tiếp trên stack chưa khởi tạo sẽ để API chưa sẵn sàng; chạy `npm run demo:up`. Lệnh không tự dừng process khác khi cổng bận, không xóa volume và không chạy `db:seed:all`. Production không phụ thuộc seed demo.

`npm run demo:setup` vẫn là công cụ bảo trì tương tác sau lần bootstrap đầu: nó hiển thị preview và chỉ apply khi nhập chính xác `CHO PHÉP APPLY DEMO SEED`. Không dùng lệnh này cho lần khởi động đầu tiên.

## Tài khoản demo local cố định

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@airline-booking.local` | `DemoAdmin@2026!` |
| Staff | `staff.demo@airline-booking.local` | `DemoStaff@2026!` |
| Customer | `customer.demo@airline-booking.local` | `DemoCustomer@2026!` |

Đây là mật khẩu public dành cho kiểm thử offline trong Docker local. Seeder hash bcrypt trước khi lưu. Nếu email đã có, seeder không sửa password, role, trạng thái hay profile; mật khẩu trên bảng chỉ đúng cho tài khoản vừa được tạo từ fixture. Không dùng trên staging/production.

## Phạm vi dữ liệu và rerun

Fixtures trong repository định nghĩa Roles, 20 Airlines, 40 Airports, ba users và kế hoạch Flights/Fare Classes/Promotions. Database mới nhận tối đa 50 flights tương lai, 100 fare classes và 10 promotions. Ngày đầu tiên là ngày mai theo giờ Việt Nam, được chọn trong phiên setup và hiển thị trước khi xác nhận. Lịch đầy đủ được nhận diện và giữ nguyên khi chạy lại ở ngày khác. Seeder dừng nếu lịch partial/xung đột, mã airport/airline xung đột hoặc fare classes hiện có khác fixture; nó không tự sửa dữ liệu.

Seeder không tạo Booking/Payment, không sửa `used_count`, không reset mật khẩu account cũ và không gọi seeder tạo 100.000 users. Apply chạy trong transaction; dry-run sau setup phải báo 0 bản ghi thiếu mới được xem là idempotent.

Preview thủ công (không khởi động service) khi Compose đã chạy và target local đã xác minh:

```powershell
npm run seed:demo:docker
```

Lệnh diagnostic cũ `npm run seed:demo:docker -- --apply` bị giữ để tương thích; đây là thao tác ghi trực tiếp có guard target. Thành viên nên dùng `npm run demo:up` cho startup bình thường.

Frontend chạy riêng:

```powershell
npm --prefix frontend run dev -- --port 5174
```

API health: `http://localhost:5000/api/v1/health`; MySQL host port mặc định: `3307`. Dừng mà giữ dữ liệu: `docker compose --env-file docker.env stop` hoặc `down`. Không dùng `docker compose down -v` cho setup/rerun thường lệ vì lệnh đó xóa volume dữ liệu.
