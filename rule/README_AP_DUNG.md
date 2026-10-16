# Cài bộ rule chung Codex + Antigravity — Serene Flightways

## Cách áp dụng

1. Copy duy nhất `AGENTS.md` vào **thư mục gốc của repository Serene Flightways hiện có** trên máy trưởng nhóm. Không tạo project, clone hoặc worktree mới.
2. Nhờ người điều phối kiểm tra nội dung. Commit **chỉ `AGENTS.md`** trong một nhánh được nhóm cho phép; không tự gán một branch feature nghiệp vụ để chứa rule chung. Đưa thay đổi qua quy trình review/integration đã được nhóm phê duyệt đến `develop`, rồi `main`.
3. Khi rule đã nằm trên `main`, thành viên cập nhật code an toàn theo nhánh của mình và làm việc trong repo đó. Codex và Antigravity nhận quy tắc từ `AGENTS.md` ở workspace root. Quy tắc không tự "train" trọng số mô hình; nó cung cấp chỉ dẫn chung mỗi khi AI làm việc tại repo.
4. Mỗi thành viên yêu cầu AI: “Đọc và tuân thủ `AGENTS.md`. Xác minh tôi là ai, task thuộc branch con nào, branch cha là gì; kiểm tra Git an toàn trước khi code.”

## Nguyên tắc quan trọng

- Một project chính trên mỗi máy; không tạo thêm worktree/clone.
- Commit code task vào feature con được giao, merge feature con → nhánh cha → develop → main **theo thứ tự** với review/tests/approval.
- `main` là đích phát hành sau cùng, **không được tự merge nếu chưa duyệt/CI lỗi**.
- Trạng thái trong báo cáo audit ngày 14/10/2026 chỉ là mốc tham khảo, không phải trạng thái hiện tại của mọi máy.
- Repo chưa được sửa bởi gói này; copy/cài đặt/commit là bước nhóm sẽ thực hiện.
