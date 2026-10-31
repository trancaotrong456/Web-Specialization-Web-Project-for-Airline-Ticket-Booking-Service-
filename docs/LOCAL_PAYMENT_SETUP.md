# Local Docker và kiểm thử thanh toán

## 1. Chuẩn bị

```bash
git clone <repository-url>
cd Web-Specialization-Web-Project-for-Airline-Ticket-Booking-Service-
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Không commit `.env` hoặc credentials Sandbox/live.

## 2. Cấu hình local

Giữ các mapping Docker mặc định:

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`
- MySQL host: `127.0.0.1:3307`
- MySQL trong Compose: `db:3306`
- Database: `airline_booking_docker`

Compose dùng các default local đã khai báo trong `docker-compose.yml`: database `airline_booking_docker`, host port `3307`, user `airline_user` và mật khẩu demo local. Nếu cần đổi mật khẩu, đặt `MYSQL_PASSWORD`/`MYSQL_ROOT_PASSWORD` trong shell hoặc Compose override riêng; không đưa giá trị thật vào `.env.example`.

Khi chạy backend trực tiếp ngoài Docker, dùng `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `DB_NAME=airline_booking_docker`, `DB_USER=airline_user` và `DB_PASS` tương ứng. Trong container, Compose tự đặt `DB_HOST=db` và `DB_PORT=3306`.

## 3. Khởi động Docker và bootstrap an toàn

Kiểm tra cấu hình trước:

```bash
docker compose config
```

Sau đó dùng workflow đã có guard kiểm tra Docker local, database, migration và seed:

```bash
npm run demo:setup
```

`demo:setup` khởi động `api`/`db`, xác minh database là `airline_booking_docker`, kiểm tra migration và yêu cầu xác nhận trước khi áp dụng demo seed. Không chạy trên database khác.

Nếu chỉ cần khởi động các service đã bootstrap:

```bash
docker compose up -d db bootstrap api frontend
```

Kiểm tra API:

```bash
curl -fsS http://localhost:5000/api/v1/health
```

Mở frontend tại `http://localhost:5173`.

## 4. payOS demo

Giữ:

```text
PAYOS_MODE=demo
```

Demo QR/webhook là mô phỏng local, không cần `PAYOS_CLIENT_ID`, `PAYOS_API_KEY` hoặc `PAYOS_CHECKSUM_KEY` thật. Không dùng demo mode trong production.

## 5. VNPay Sandbox

Đặt các biến bằng credentials Sandbox được cấp riêng cho thành viên:

```text
VNPAY_MODE=sandbox
VNP_TMN_CODE=<sandbox-terminal-id>
VNP_HASH_SECRET=<sandbox-secret>
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:5173/payments/result
```

Không commit terminal secret. VNPay IPN cần một backend HTTPS public khi kiểm thử callback thật; localhost chỉ dùng được cho flow không yêu cầu callback từ Internet.

## 6. Public callback khi được phê duyệt

Khi cần nhận IPN/webhook từ gateway, dùng HTTPS staging hoặc tunnel được nhóm phê duyệt và cập nhật riêng:

```text
VNP_RETURN_URL=https://<frontend-host>/payments/result
PAYOS_RETURN_URL=https://<frontend-host>/payments/result
PAYOS_CANCEL_URL=https://<frontend-host>/payments/result
PAYOS_WEBHOOK_URL=https://<backend-host>/api/v1/payments/payos/webhook
```

Không đưa URL tunnel cá nhân vào repository. Không đăng ký webhook live trước khi xác minh host, signature và database staging.

## 7. Automated tests

Backend unit/feature tests:

```bash
npm test
```

Frontend tests/build:

```bash
cd frontend
npm test
npm run build
```

MySQL integration chỉ chạy sau khi xác nhận database disposable `airline_booking_integration_test` (không phải `airline_booking_docker`):

```bash
npm run test:integration:mysql
```

Các test không được gọi gateway thật; dùng fixture/mock và `.env.integration`.

## 8. Kiểm tra sau thanh toán

Xác minh trạng thái từ Payment Status API/backend. Không coi query trên browser return là bằng chứng Payment success; Booking chỉ confirmed sau webhook/IPN hoặc reconciliation authoritative.
