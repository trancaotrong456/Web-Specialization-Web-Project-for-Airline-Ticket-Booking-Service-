# SERENE FLIGHTWAYS — TEAM AI RULES

> Áp dụng bắt buộc cho Codex, Antigravity và mọi AI coding agent mở repository Serene Flightways. Đây là **chỉ dẫn làm việc trong dự án**, không phải fine-tune/training trọng số mô hình.
> Phiên bản quy tắc: 2026-10-16. **Bằng chứng audit là ảnh chụp trạng thái**, không được coi là tình trạng Git/tests hiện tại nếu chưa kiểm tra lại.

## 0. Thứ tự ưu tiên và giới hạn quyền

1. Bảo toàn dữ liệu, code chưa commit, bí mật, database và công việc của đồng đội.
2. Yêu cầu hiện tại và phân công/ủy quyền rõ ràng của nhóm.
3. Luồng nhánh Git bắt buộc và tiêu chuẩn review/test trong file này.
4. Kiến trúc, nghiệp vụ, hợp đồng API và quy ước hiện có trong source.
5. Tối ưu hóa hoặc cải tiến tự đề xuất (KHÔNG tự thực hiện ngoài phạm vi).

Nếu mâu thuẫn, thiếu quyền, không rõ chủ sở hữu, hoặc không thể chuyển nhánh/merge an toàn: **DỪNG thao tác có rủi ro, nêu blocker và giải pháp cụ thể**. Không được dùng từ “bắt buộc” để vượt qua branch protection, reviewer, CI hoặc sự đồng ý của nhóm.

## 1. Một project làm việc chính trên mỗi máy

- Trên máy trưởng nhóm, root đã được xác định: `C:\wamp64\www\Web-Specialization-Web-Project-for-Airline-Ticket-Booking-Service-`.
- Máy thành viên có thể dùng đường dẫn khác, nhưng agent phải `git rev-parse --show-toplevel` và xác nhận **một repository Serene Flightways đúng** trước khi làm.
- Chỉ thao tác trong checkout chính đang được người dùng mở. **KHÔNG tự tạo clone, nested repo, worktree, branch mới ngoài danh mục, project song song**. Không dùng repo khác làm nơi thử nghiệm riêng nếu chưa được cho phép.
- Được `git fetch origin` để đọc trạng thái mới nhất khi có kết nối/quyền; fetch không có nghĩa được phép merge hoặc ghi đè local. Không dùng `reset --hard`, `clean -fd`, force push, rebase/reset để viết lại lịch sử chung.
- Không đổi `git config user.name/email` hay commit thay danh tính thành viên. Nếu `git config user.name` không xác nhận được người phụ trách thì phải hỏi.

## 2. Đọc trạng thái trước MỌI tác vụ

Chỉ đọc và đối chiếu trước khi viết code:

```bash
git rev-parse --show-toplevel
git status --short
git branch --show-current
git log -1 --oneline
git branch -a
git worktree list
git stash list
```

- Kiểm tra commit, tracked modifications, untracked, files ignored (chỉ kiểm tra khi cần), nhánh đang checkout, remote-tracking có thể đã cũ; trước merge có thể `git fetch origin` nếu được phép.
- Phân biệt **code đang tồn tại**, **test từng đạt**, **test vừa chạy**, **hệ thống chạy thật**. Không suy diễn PASS từ commit cũ hoặc từ số lượng test files.
- Không tự `stash`, `stash pop/apply/drop`, xóa hoặc chuyển các thay đổi chưa commit, kể cả để switch nhánh. Nếu checkout bẩn và chuyển nhánh có nguy cơ chồng dữ liệu, dừng và yêu cầu người sở hữu xử lý/cho phép.
- Không giả định file untracked là đồ bỏ đi: có thể là migration, model, UI đang làm dở hoặc thư mục worktree lồng.
- Nếu yêu cầu chỉ AUDIT/READ-ONLY: không test/build nếu tạo file, không commit/merge/push/sửa code.

## 3. Mốc audit — đọc như baseline, KHÔNG phải trạng thái đang được xác nhận

Báo cáo FULL PROJECT AUDIT từ checkout `ui/stitch-redesign`, HEAD `c935bf3d18894c9ec50777d63f5fc30575e6839d` (14/10/2026):

- Backend: Node.js 20+, **Express 4 / CommonJS / Sequelize 6 / MySQL**, kiến trúc **Modular Monolith 11 module**. **KHÔNG** tự chuyển sang NestJS, Laravel, Spring hoặc microservices.
- Frontend: **React 19 / React Router 7 / Vite 7 / Vitest**. Backend API mount tại `/api/v1`.
- Cấu trúc thật: `modules/` (Airline, Airport, Auth, Booking, Fare Class, Flight, Payment, Promotion, Role, Ticket, User), `application/` (Composition Root, DI, app/runtime), `infrastructure/` (email, jobs, realtime, demo readiness), `shared/http/`, `models/`, `migrations/`, `seeders/`, `frontend/`, `scripts/`, `tests/`.
- `controllers/`, `services/`, `routes/` và các file cũ **có thể là compatibility adapters còn cần thiết**; không tự xóa, đổi tên hoặc di chuyển chỉ vì nhìn trùng lặp. `models/index.js` nạp Sequelize models/associations.
- Auth/RBAC, Airline/Airport, Flight/Fare Class, Booking, Payment (VNPay/payOS), Ticket/PDF/Email, Admin và Demo Setup: **có code**, không đồng nghĩa end-to-end đã đạt.
- **Khứ hồi/nhiều chặng (itinerary) đang phát triển**: kiểm tra đồng bộ `frontend/src/features/flights/HomePage.jsx`, `FlightResultsPage.jsx`, Booking module, `models/booking_segment.js` và `migrations/20261014120000-create-booking-segments-table.js`. Hai file sau **đang untracked tại thời điểm audit**; không được bỏ sót model/migration/associations/tests khi triển khai hợp đồng mới.
- Tại thời điểm audit: 34 tracked files đã đổi, 1.179 untracked entries, 2 stash, 21 worktree records (có worktree lồng); local `[ahead 25]` so với `origin/develop` **chưa fetch**, nên số này có thể đã lỗi thời. **Không `git add .`/`git add -A`** trên checkout bẩn.
- Audit là read-only: **không chạy lại test/build, Docker, migration, seed, DB**, nên không có PASS mới hay xác nhận runtime MySQL. Trước đó có các báo cáo 255 backend/214 frontend PASS trên commit tích hợp, nhưng **không dùng thay kết quả hiện tại**.
- CI theo audit chưa có frontend tests/build; xem `.github/workflows/ci.yml` hiện tại trước khi tuyên bố CI bao phủ đủ.
- Docker Compose/demo hỗ trợ local và có thể chạy migrations/seed: **không chạy `npm run demo:up`, demo setup, compose up/down, migration/seed, cron hoặc các lệnh có ghi DB** nếu chưa rõ môi trường đích và chưa được phê duyệt. Không dùng demo credentials ở production.

Trạng thái trên có thể thay đổi mỗi ngày. **Source + Git + kết quả test mới là căn cứ cuối cùng**. Khi phát hiện khác biệt, ghi rõ phát hiện mới; không tự "đồng bộ toàn project" để ép code khớp baseline.

## 4. PHÂN CÔNG CHÍNH THỨC: 4 nhánh cha và 40 nhánh chức năng

**A. `feature/auth` — Trần Cao Trọng** (User / Role / RBAC; core Auth dùng code hiện có, không tự tạo nhánh Auth mới)

```text
feature/user-register
feature/user-update
feature/user-delete
feature/user-list
feature/user-detail
feature/role-add
feature/role-edit
feature/role-delete
feature/role-list
feature/role-detail
```

**B. `feature/airline-airport` — Nguyễn Phong**

```text
feature/airline-add
feature/airline-edit
feature/airline-delete
feature/airline-list
feature/airline-detail
feature/airport-add
feature/airport-edit
feature/airport-delete
feature/airport-list
feature/airport-detail
```

**C. `feature/flight-fareclass` — Hồ Hữu Huy**

```text
feature/flight-add
feature/flight-edit
feature/flight-delete
feature/flight-list
feature/flight-detail
feature/fareclass-add
feature/fareclass-edit
feature/fareclass-delete
feature/fareclass-list
feature/fareclass-detail
```

**D. `feature/booking-payment` — Nguyễn Hữu Chúc**

```text
feature/booking-create
feature/booking-update
feature/booking-cancel
feature/booking-list
feature/booking-detail
feature/payment-create
feature/payment-cancel
feature/payment-refund
feature/payment-list
feature/payment-detail
```

**Quy tắc ownership:**
- Xác minh người dùng hiện tại/owner, nhánh chức năng và nhánh cha trước khi code. Chọn **đúng 1 nhánh chức năng** tương ứng task; không làm nhiều tính năng không liên quan cùng commit.
- Có quyền đọc module khác để hiểu API, bảo toàn business rules và tương thích, nhưng **không tự sửa code thuộc người khác**. Khi cần thay đổi hợp đồng chung, xin owner liên quan + người tích hợp duyệt, giới hạn diff, có test hồi quy.
- Các phần chưa có trong 40 nhánh (core Auth/login, Demo Setup, Ticket, Promotion, CSS global, application/runtime, Docker/CI, rules...) **KHÔNG được tự gán branch**. Báo người điều phối chọn scope/nhánh hợp lệ trước khi commit.
- Với file chia sẻ như `application/buildContainer.js`, `application/registerModules.js`, `models/index.js`, `server.js`, `frontend/src/app/AppRouter.jsx`, `frontend/src/styles/global.css`, `package.json`, migrations, Compose, CI: phải xác định người chịu trách nhiệm và tác động chéo trước khi sửa. Không khóa cứng cản mọi tích hợp đã được duyệt.

## 5. QUY TRÌNH GIT BẮT BUỘC — KHÔNG ĐƯỢC NHẢY CẤP

```text
Đúng feature/<chức năng> → CODE → TEST → COMMIT theo mốc thật
              ↓
      REVIEW & MERGE (feature → NHÁNH CHA ĐÚNG)
              ↓
      TEST/REVIEW NHÁNH CHA → MERGE (nhánh cha → develop)
              ↓
      CI/INTEGRATION TEST trên develop → REVIEW & MERGE (develop → main)
              ↓
      XÁC MINH main và ghi commit/merge thực tế vào báo cáo
```

**Ánh xạ đích:**
- `feature/user-*`, `feature/role-*` → **`feature/auth`** → `develop` → `main`.
- `feature/airline-*`, `feature/airport-*` → **`feature/airline-airport`** → `develop` → `main`.
- `feature/flight-*`, `feature/fareclass-*` → **`feature/flight-fareclass`** → `develop` → `main`.
- `feature/booking-*`, `feature/payment-*` → **`feature/booking-payment`** → `develop` → `main`.
- **Không** merge trực tiếp feature con vào `develop`/`main`, không merge nhánh cha thẳng vào `main`, không dùng `main` hoặc `develop` làm nhánh phát triển cá nhân.

**Mỗi công việc phải có lịch sử Git rõ ràng:**
1. Nếu nhánh feature đã tồn tại: dùng đúng nhánh đó và bảo toàn công việc chưa commit; nếu nhánh không tồn tại/checkout bị khóa bởi worktree cũ, dừng và xin quyết định thay vì tự tạo worktree/nhánh song song.
2. Khi đã có checkpoint chức năng có thể xác minh, stage **đúng file thuộc task** bằng đường dẫn cụ thể (`git add -- <path...>`), kiểm tra `git diff --cached --stat`, `git diff --cached --check`, `git diff --cached`; rồi commit với message tường minh (ví dụ `feat(booking): validate itinerary segments`). **Không** stage cache, nested worktrees, `.env`, config bí mật hay phần chưa được duyệt.
3. Sau khi test phù hợp PASS, push bình thường lên đúng feature branch nếu được owner/team cho phép; **không force push**, không push chung file ngoài phạm vi. Nếu push hoặc quyền remote bị chặn, báo trạng thái `COMMITTED LOCAL — NOT PUSHED`; không nói đã merge.
4. Sau review/approve và đồng bộ target an toàn, merge **feature branch → parent đúng mapping**. Ưu tiên PR để lưu review, kiểm tra conflicts, CI và quyền merge; Git local merge chỉ khi quy trình/team cho phép, và ghi lại merge commit.
5. Test lại khi đã tích hợp ở **nhánh cha** (ít nhất các test bị ảnh hưởng). Chỉ khi các feature cùng cha tương thích mới merge **nhánh cha → `develop`** thông qua người phụ trách tích hợp/reviewer và CI.
6. Kiểm tra backend + frontend tests/build, API/contracts, migration và môi trường liên quan ở `develop`. **Chỉ merge `develop` → `main` khi đạt điều kiện phát hành, có phê duyệt của người quản lý repo, không có blocking regression và branch protection cho phép.**
7. Sau mỗi merge kiểm tra ancestry/commit trên **branch đích thực sự** và trạng thái Git/CI. Một PR mở hoặc một merge local chưa push không có nghĩa remote đã cập nhật.
8. **Luồng 4 cấp là bắt buộc cho việc hoàn tất & phát hành**, nhưng KHÔNG có nghĩa agent được tự động đẩy mọi checkpoint lên `main`. Nếu chưa được duyệt hoặc test lỗi, dừng ở cấp hiện tại, ghi rõ checkpoint và bước chờ; **không bỏ qua cấp nào**.

**Quy tắc đồng bộ:** `git fetch origin` + kiểm tra lịch sử; chỉ `git pull --ff-only` khi an toàn/working tree phù hợp. Nếu diverged, cherry-pick/rebase/merge conflict cần đánh giá; không tự `reset --hard`, force push hoặc dùng `-X ours/theirs` để bỏ code người khác. Không tự resolve conflict bằng cách chọn toàn bộ một phía. Không sửa branch thuộc người khác nếu chưa được ủy quyền.

**Định nghĩa hoàn thành:** `CODE COMPLETE` khác `FEATURE COMMITTED`, khác `PARENT MERGED`, khác `DEVELOP MERGED`, khác `MAIN RELEASED`. Báo đúng mốc với SHA, PR link và test result thực tế, không tuyên bố hoàn thành toàn bộ khi còn chặn ở một cấp.

## 6. Chuẩn kỹ thuật và bảo vệ tương thích

- Bám theo kiến trúc Express Modular Monolith hiện có. Thêm/sửa nghiệp vụ ở **canonical module** trong `modules/`; dùng `application/` cho DI/runtime, `infrastructure/` cho adapter. Giữ backward compatibility thông qua adapters cũ khi đang được sử dụng.
- Controller mỏng; service quản lý nghiệp vụ; repository/data access phù hợp pattern đang có; Sequelize models/migrations/associations nhất quán. Không sao chép một workflow nghiệp vụ thành implementation thứ hai ở `services/` cũ.
- Không tự đổi route prefix, HTTP response, auth/RBAC policy, JWT/refresh flow, Booking lifecycle, trạng thái Payment/VNPay/payOS, Ticket/PDF/email hay thời hạn booking. Nếu contract cần đổi, thông báo bên tiêu thụ và test cả hai phía.
- Với Booking khứ hồi/nhiều chặng, thay đổi **frontend + API + validation + model + migration + association + tests** là một nhóm phụ thuộc; bảo vệ mọi file còn untracked. Migration chỉ được chạy trên DB thử nghiệm riêng được xác nhận an toàn.
- Viết code đơn giản, tên mô tả, comment tiếng Việt khi hữu ích; bảo mật dữ liệu đầu vào, kiểm tra quyền, transaction/locking cho tác vụ nhạy cảm. Không tự thêm Solr, Laravel Service Interface, NestJS hoặc cơ chế/kiến trúc ngoài source.
- Frontend dùng đúng React/Vite hiện có, ưu tiên components/styles có sẵn, không sửa global CSS vì một trang nếu có giải pháp scoped. Nếu có ảnh mẫu, coi ảnh là yêu cầu UI; kiểm tra màn hình desktop/mobile, không tự thiết kế lại. Đối chiếu chức năng NEW/EXISTING/PARTIAL/BROKEN trước khi viết lại.
- Không đổi Docker structure, `.gitignore`, Compose, deployment, database schema hoặc môi trường ngoài task khi chưa có yêu cầu/ủy quyền. File Dockerfile/Compose có thể là source cần quản lý; `.env`, credentials, volume DB/runtime logs phải được bảo vệ; không mặc định ignore cả thư mục Docker.

## 7. Kiểm thử và chốt merge

**Trong feature branch:**
- Trước sửa: xem tests hiện có, hợp đồng API và trường hợp biên liên quan.
- Sau sửa: thêm/cập nhật tests phù hợp (happy path, invalid input, Auth/RBAC, edge cases, lỗi nghiệp vụ). Chạy tests của phạm vi thay đổi; với UI cần build/verify ảnh khi có khả năng.
- Khi sửa cross-cutting hoặc trước promote: chạy đầy đủ backend tests, frontend tests, frontend build và các regression quan trọng nếu môi trường cho phép. `npm test` tại root cho backend theo audit; **xác minh scripts hiện tại** trong `package.json` và `frontend/package.json` thay vì đoán.
- Kiểm tra `git diff --check`; tuyệt đối không xóa/làm yếu tests để có PASS. Không bịa số PASS, không giấu test chưa chạy hoặc lỗi do môi trường.
- **Không chạy** `npm run demo:up`, migration/seed, Docker/database integration, payment callback live, email live nếu chưa biết target DB/dữ liệu và chưa được duyệt. Có thể ghi `NOT VERIFIED` cho những phần thiếu môi trường.
- Gate để merge: scope đúng, files đầy đủ (đặc biệt untracked model/migration), code review phù hợp, tests yêu cầu PASS, không conflict chưa xử lý, không secrets, không tác động trái phép module khác. Nếu CI thiếu frontend, chạy kiểm thử frontend riêng và báo bằng chứng thay vì mặc định CI đã cover.

## 8. Nhật ký nhóm và phục hồi phiên (nhẹ, không ép Google Drive)

- **Nguồn chân lý**: source hiện có + Git + review/CI; báo cáo audit và mô tả AI chỉ làm bối cảnh. Các lần sửa cần lưu vào commit/PR description: chủ sở hữu, nhánh nguồn→đích, files, thay đổi contract, tests đã chạy/kết quả, SHA, blocker, bước tiếp theo.
- Không tự tạo file lịch sử lớn hay đồng bộ Google Drive/ứng dụng ngoài nếu nhóm không yêu cầu. Không sửa một nhật ký chung cùng lúc với đồng đội chỉ vì muốn “ghi nhớ”.
- Khi phiên bị gián đoạn, đọc lại trạng thái và commit mới nhất để tiếp tục; không làm lại tính năng đã có hay tuyên bố việc chưa làm là hoàn thành.
- Nếu task bị chặn ở nhánh cha/develop/main vì review, CI, permission, dirty tree hay divergence, báo chính xác **đang dừng ở đâu**.

## 9. Báo cáo cuối mỗi task — ngắn và có thể kiểm chứng

```text
Thành viên / nhánh đang làm / nhánh cha:
Phạm vi và file đã sửa:
Code: DONE / PARTIAL / BLOCKED
Tests: PASS (lệnh + số liệu) / FAIL / NOT RUN
Git: feature commit <SHA>; feature→parent [SHA/PR/status]; parent→develop [SHA/PR/status]; develop→main [SHA/PR/status]
Rủi ro chưa xử lý / lý do dừng:
Bước tiếp theo đúng quy trình:
```

**Cấm** báo “đã push/merge/main cập nhật” nếu chưa xác minh trên remote. Không kéo dài báo cáo, không đề nghị refactor toàn project khi task đã hoàn thành.

## 10. Checklist bắt buộc trước khi báo DONE

- [ ] Đúng project chính, đúng chủ sở hữu, đúng feature branch.
- [ ] Không làm mất file tracked/untracked, stash, env/DB hay code người khác.
- [ ] Thay đổi nhỏ nhất cần thiết, tuân thủ modules + API/contracts.
- [ ] File phụ thuộc (model, migration, associations, frontend, tests) đầy đủ.
- [ ] Test phù hợp thực sự chạy PASS hoặc nêu rõ NOT RUN và lý do.
- [ ] Commit có ý nghĩa trên nhánh feature; stage chính xác.
- [ ] Feature → đúng nhánh cha → develop → main theo thứ tự, mỗi cấp đạt gate/approval; nếu chưa thì ghi BLOCKED/PENDING, không nhảy cấp.
- [ ] Không force push, tự ý xóa worktree, chạy migration/seed trên DB thật hoặc xuất credentials.
- [ ] Báo cáo ngắn gọn SHA, cấp merge thực tế, CI/test và blocker.
