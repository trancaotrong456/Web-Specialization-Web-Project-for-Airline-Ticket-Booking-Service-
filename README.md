# Web-Specialization-Web-Project-for-Airline-Ticket-Booking-Service-

## Docker demo

Yêu cầu: Docker Desktop đang chạy.

```bash
docker compose --env-file docker.env up --build
```

Compose khởi tạo MySQL riêng cho môi trường demo, chờ database healthy, chạy Sequelize migrations, rồi khởi động API tại `http://localhost:5000/api/v1/health`.

```bash
docker compose --env-file docker.env down
```

Để xóa cả dữ liệu MySQL demo và chạy lại từ đầu:

```bash
docker compose --env-file docker.env down -v
```

Không dùng Docker Compose này với TiDB Cloud/Render production. Các biến `MYSQL_*` chỉ là credential demo cục bộ.

## CI/CD

GitHub Actions chạy khi push hoặc tạo Pull Request vào `main`/`develop`: cài dependency, kiểm tra cú pháp Node.js và build Docker image. Render tự deploy từ nhánh `main`; vì vậy push thành công lên `main` sau khi CI pass là phần CD của demo.
Chuyên Đề Web - Dự án Web cho Dịch vụ Đặt Vé Máy Bay
