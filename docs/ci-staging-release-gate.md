# PRG-04 CI/CD và staging release gate

## Required CI checks

Mỗi Pull Request vào `develop` hoặc `main` phải đạt các job `backend-regression`, `mysql-integration`, `frontend`, `secret-scan` và `docker-production-build`. Workflow dùng concurrency theo ref để các run cũ bị hủy, còn mỗi MySQL job có database service cô lập riêng.

`backend-regression` kiểm tra syntax toàn bộ module và chạy regression với credential sandbox giả lập. `mysql-integration` khởi tạo MySQL 8 disposable, chạy toàn bộ migration từ đầu, chạy migration lần hai để xác minh forward migration không chạy lặp, rồi chạy integration suite. Không chạy down migration trong CI hoặc trên production.

`frontend` chạy Vitest ở chế độ non-watch và Vite production build. `secret-scan` dùng Gitleaks trên lịch sử checkout. `docker-production-build` chỉ build image, không push hoặc chạy container production.

## Staging prerequisites

- Staging MySQL riêng, backup và migration window đã xác nhận.
- JWT, database, payOS/VNPay sandbox và Resend secrets được inject từ secret manager; không đặt trong repository.
- Callback, webhook và trusted hosts dùng HTTPS công khai của staging.
- `PAYOS_MODE=live` chỉ khi có credential sandbox hợp lệ; `PAYOS_RECONCILIATION_WORKER=false` trong giai đoạn chuẩn bị.
- `ENABLE_PENDING_RECONCILIATION=false` khi deploy mixed version.
- `EMAIL_DELIVERY_MODE=test` hoặc fake provider cho smoke test; live email chỉ sau khi sender domain được xác minh.

## Staging sequence

1. Chờ CI required checks PASS và reviewer xác nhận migration diff.
2. Snapshot/backup staging database và chạy `npx sequelize-cli db:migrate --env production` với connection staging.
3. Kiểm tra lease row `payos-reconciliation`, metrics endpoint, alert webhook và health check.
4. Deploy toàn bộ instance mới với reconciliation disabled; chờ instance cũ drain hoàn toàn.
5. Smoke test list/detail manual-review bằng Admin/Staff, xác nhận Customer nhận 403 và unauthenticated nhận 401.
6. Bật `ENABLE_PENDING_RECONCILIATION=true` và `PAYOS_RECONCILIATION_WORKER=true` trên designated worker deployment sau khi xác nhận chỉ một owner.
7. Kiểm tra retry, expired lease recovery, late PAID visibility, email isolation và shutdown/restart.
8. Operator phải phê duyệt bằng văn bản trước khi bất kỳ production release nào được mở.

## Rollback and incident response

Nếu migration, lease ownership, alert delivery hoặc smoke test lỗi: tắt reconciliation, giữ durable worker drained và không fallback tự động sang legacy. Rollback code chỉ sau khi durable instances dừng và lease hết hạn; legacy chỉ được bật khi không còn durable poller.

Không chạy `db:migrate:undo:all` hoặc down migration trên production. Migration audit/manual-review dùng foreign keys RESTRICT để bảo toàn bằng chứng; rollback cần kế hoạch dữ liệu riêng và phê duyệt.

IT-18 dùng fixture IATA random và retry khi unique constraint collision; assertion WebSocket-after-commit vẫn giữ nguyên. Chạy lặp integration suite nhiều lần để phát hiện fixture collision, không nới lỏng business assertion.
