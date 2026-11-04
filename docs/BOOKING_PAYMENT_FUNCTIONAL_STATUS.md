# Booking–Payment Functional Status (STT 30–41)

Audit date: 2026-11-02 (Asia/Bangkok)  
Branch: `feature/booking-payment`  
HEAD: `357c0a3`

## Evidence and test scope

- Backend unit suite command: `npm test` → 120 test files, 102 passed, 18 failed. The failures are concentrated in HTTP/parity and shared-module tests; this audit does not treat them as Booking–Payment regressions without a reproducible call-path failure.
- Booking–Payment targeted run: 15 files, 11 passed, 4 files failed under the current Node test runner; the failed files need separate diagnosis before claiming a clean gate. Core lifecycle, customer status, payment module, payOS return/live contract, VNPay checksum/gateway/return/operation tests passed in that run.
- Frontend: `npm test` in `frontend/` → 37 files, 354 tests passed.
- MySQL integration was not run: no new database verification was authorized for this read-only audit. No gateway or email calls were made.

## Functional matrix

| STT | Function | Backend | Frontend | Tests | Status | Missing Items |
|---:|---|---|---|---|---|---|
| 30 | CRUD đặt vé; transaction trừ/hoàn ghế | `modules/booking/booking.route.js` (`POST /`, `GET /:id`, `PUT /:id/cancel`); `modules/booking/booking.service.js`; `modules/booking/booking.repository.js` | `BookingPages.jsx` create/detail/cancel flows | `bookingPaymentContract`, `bookingPaymentLifecycle`, `bookingInventory`, `bookingItinerary` | **UNVERIFIED** | Implementation covers holding, cancellation, itinerary locks and resource release; current targeted run has runner failures and no fresh MySQL concurrency evidence.
| 31 | Danh sách đặt vé, lọc trạng thái/khách hàng | `GET /my-bookings`, `GET /admin/all`; repository list methods | Booking list/admin pages | `bookingModule`, frontend BookingPages tests | **PARTIAL** | Routes and filters exist; fresh backend HTTP evidence is incomplete because several parity suites fail in the current run.
| 32 | Chi tiết đặt vé | `GET /:id`, `GET /lookup/:code`; repository detail/lookup includes passengers, payment, itinerary and history | Booking detail and lookup pages | `bookingPaymentContract`, frontend BookingPages | **COMPLETE** | Guest lookup requires matching email; no new end-to-end DB run in this audit.
| 33 | CRUD thanh toán: tạo, hủy, hoàn tiền | `POST /payments/initiate`; admin refund routes; payment service/repository and VNPay refund path | Payment checkout/result pages and API client | `paymentModule`, `paymentOperation`, `paymentIdempotency`, `paymentAmountConsistency` | **PARTIAL** | Create/refund and idempotency are implemented; 4 targeted backend files failed in the combined run, so full regression status is unresolved. payOS cancellation is informational/read-only by design.
| 34 | Danh sách/chi tiết thanh toán | `GET /payments` and `GET /payments/:id`, admin-only; repository `listPayments`/detail | Admin payment screens/API client | `paymentModule`, frontend bookings API tests | **COMPLETE** | Authorization is present; current full backend suite still has unrelated shared-module failures.
| 35 | Giữ chỗ 15 phút, tự động xử lý hết hạn | Booking creation sets `hold_expires_at`; `expireHoldingBookings()` and maintenance job; stale pending reconciliation is separate | Hold countdown and expiry refresh in `PaymentPages.jsx` | `bookingPaymentLifecycle` expiry cases, `bookingPayosCapability`, `payosRetryWorker` | **PARTIAL** | Holding expiry and release are implemented; cron/worker lifecycle and MySQL race behavior require a fresh isolated integration run.
| 36 | Email xác nhận vé (Resend) | `services/email.service.js`; payment confirmation hook in `modules/payment/payment.service.js`; notification/outbox integration | Status/history UI exposes confirmation state | `emailConfirmation`, `emailIsolation`, notification tests | **PARTIAL** | Adapter and failure isolation are covered with mocks; no real Resend delivery is verified (correctly out of scope).
| 37 | Thống kê doanh thu ngày/tháng | `GET /payments/revenue`, admin-only; `aggregateRevenue()` filters successful payments by half-open paid_at range | Admin revenue page and API client | `paymentModule`, `bookingPaymentLifecycle` revenue tests, frontend API/page tests | **COMPLETE** | Source and mocked aggregation coverage exist; requires DB-backed aggregation verification for production confidence.
| 38 | VNPay Sandbox và payOS | VNPay gateway/config/service; payOS gateway/service, mode/capability checks and QR contract | Payment method selection, QR rendering and result page | `vnpayChecksum`, `vnpayGateway`, `vnpayReturn`, `payosLiveContract`, `payosBrowserReturn`, payment QR tests | **PARTIAL** | Demo/sandbox/live adapters and validation exist; live merchant acceptance/webhook delivery is not verified in this audit.
| 39 | Webhook/IPN xác nhận thanh toán, cập nhật Booking | `GET /vnpay/ipn`, `GET /vnpay/return`, `POST /payos/webhook`; signature, amount, stale-attempt, lock/idempotency logic in payment service | Result page reads authoritative backend status; browser return is not authoritative | `paymentCallbackSafety`, `paymentModule`, `payosLiveContract`, `vnpayReturn`, reconciliation tests | **PARTIAL** | Safety paths are implemented and unit-tested; current targeted run contains 4 failing files and no fresh MySQL callback/concurrency evidence.
| 40 | Tra cứu booking bằng mã + email | `GET /bookings/lookup/:code`; validator and `verifyBookingAccess` policy | `BookingLookupPage` and API client | `bookingPaymentContract`, frontend BookingPages tests | **COMPLETE** | Predictable code alone is not sufficient for guest access; authenticated owner path is separate.
| 41 | Áp mã khuyến mại khi tạo booking | `createHoldingBooking()` locks promotion, validates dates/usage, increments atomically; cancel/expiry restores usage | Booking form validation and promotion code flow | `bookingPaymentLifecycle`, promotion validation/service/repository tests, frontend BookingPages | **COMPLETE** | Core validation and atomic usage handling are covered; multi-leg promotion DB verification remains recommended.

## Source evidence highlights

- Booking routes and authorization: `modules/booking/booking.route.js:25-45`.
- Payment routes and gateway separation: `modules/payment/payment.route.js:46-81`.
- Holding expiry and pending-payment reconciliation: `modules/booking/booking.service.js:411-585`.
- Deterministic itinerary/flight locking: `modules/booking/booking.service.js:123-140` and repository lock helpers.
- Customer payment status is read-only and authorization-aware: `modules/payment/payment.service.js:173-228`.
- Revenue aggregation is restricted to `status = success` with a half-open paid-at range: `modules/payment/payment.repository.js:411-431`.
- Frontend payment result route: `frontend/src/app/AppRouter.jsx` (`/payments/result`); status display logic is in `frontend/src/features/bookings/PaymentPages.jsx`.

## Classification summary

- COMPLETE: 5 (STT 32, 34, 37, 40, 41)
- PARTIAL: 6 (STT 31, 33, 35, 36, 38, 39)
- NOT IMPLEMENTED: 0
- UNVERIFIED: 1 (STT 30)
- BLOCKED: 0

### Priority issues

- P1: Obtain a clean, isolated MySQL regression run for booking/payment concurrency, expiry, callback and reconciliation; the current targeted Node run has four failing test files whose detailed causes are not established here.
- P1: Verify live VNPay/payOS webhook/IPN delivery and merchant configuration in controlled sandbox/staging only.
- P2: Add DB-backed revenue and email/outbox operational verification; retain mocked providers for unit tests.

## Recommended order

1. Diagnose the four targeted backend test-file failures without changing business logic.
2. Run the approved isolated MySQL suites (port 3309 only) for lifecycle, callbacks and reconciliation.
3. Perform controlled VNPay/payOS sandbox callback verification through HTTPS endpoints.
4. Close remaining operational evidence for Resend and revenue aggregation.

No source, test, environment or database files were changed by this audit; only this report was added.

## MySQL integration verification (2026-11-02)

Preflight findings:

- Branch/HEAD: `feature/booking-payment` / `357c0a3`.
- Integration command: `node --env-file=.env.integration --test --test-concurrency=1 tests/integration/*.mysql.test.js`.
- Booking–Payment integration files identified: `bookingPaymentConcurrency.mysql.test.js`, `paymentCallbackSafety.mysql.test.js`, `paymentReconciliationCase.mysql.test.js`, `payosReconciliation.mysql.test.js`, `payosRetryWorker.mysql.test.js`, `vnpayQueryRefund.mysql.test.js` (plus email isolation coverage).
- The repository guard expects `127.0.0.1:3309` and database `airline_booking_integration_test`; it refuses the development database `airline_booking_docker` on port 3307.
- The checked-in `.env.integration` currently contains `PAYOS_MODE=live`, which the integration guard explicitly rejects. It also contains merchant-looking values and an ngrok webhook URL. No integration test was run with this file.
- Docker is unavailable in this WSL environment (`docker: command not found`), so container identity, volume isolation and MySQL contents could not be independently verified.

Executed safely:

- `tests/reconciliationOperations.test.js` with the standard test environment: **FAIL / UNVERIFIED**, `listen EPERM: operation not permitted 127.0.0.1` at the test listener. This is an environment restriction; the route/middleware test was not replaced with a mock.
- MySQL integration suites: **NOT RUN / BLOCKED** because isolation could not be proven and the configured PAYOS mode is rejected by the test guard.
- No migration, seed, reset, truncate, gateway request or email delivery was performed.

Required before MySQL verification:

1. Use an explicitly disposable MySQL 8 container with host `127.0.0.1`, port `3309`, database `airline_booking_integration_test`, dedicated credentials and no development volume.
2. Use a test-only environment with `PAYOS_MODE=demo` and non-production VNPay settings; do not use the current live payOS values.
3. Run the migration command only against that disposable database, then run the six Booking–Payment suites with `--test-concurrency=1`.
4. Run `reconciliationOperations.test.js` in WSL2/CI where binding localhost listeners is permitted.

Until these conditions are met, STT 30, 33, 35 and 39 remain **PARTIAL/UNVERIFIED** for database-backed concurrency and callback evidence; no production regression is established.

## MySQL integration rerun (2026-11-02)

Docker became available and was verified before execution:

- `airline-mysql-test`: `mysql:8.0`, host mapping `127.0.0.1:3309 -> 3306`.
- Read-only identity query returned database `airline_booking_integration_test`, MySQL `8.0.46`; the development container remains separately mapped to port 3307.
- The test process used `PAYOS_MODE=demo` as a command-line override; `.env.integration` was not modified.

Command executed:

```bash
PAYOS_MODE=demo node --env-file=.env.integration --test --test-concurrency=1 \
  tests/integration/bookingPaymentConcurrency.mysql.test.js \
  tests/integration/paymentCallbackSafety.mysql.test.js \
  tests/integration/paymentReconciliationCase.mysql.test.js \
  tests/integration/payosReconciliation.mysql.test.js \
  tests/integration/payosRetryWorker.mysql.test.js \
  tests/integration/vnpayQueryRefund.mysql.test.js
```

Result: **86 passed, 0 failed, 0 skipped**. This included IT-01–IT-19, PAY02A itinerary/callback/concurrency cases, IT-20–IT-26 payOS reconciliation, IT-27–IT-44 retry/discovery cases and IT-47/49/52–55 operational reconciliation cases. No real VNPay/payOS request or email delivery was made; gateway behavior was mocked by the integration fixtures.

The previous `EPERM` gap for `reconciliationOperations.test.js` remains an HTTP-listener environment issue and was not hidden or replaced with a mock. The MySQL Booking–Payment suites themselves are now verified green on the isolated database.

Updated evidence: STT 30, 33, 35 and 39 now have MySQL-backed PASS evidence; STT 38 remains PARTIAL because real merchant sandbox/live callback delivery was not exercised.

## Follow-up verification (2026-11-02)

HTTP listener and Booking–Payment regression checks were rerun:

- `tests/reconciliationOperations.test.js`: **1/1 PASS** when executed with permission to bind `127.0.0.1`; the prior `EPERM` was an environment restriction, not a route or authorization defect.
- Backend Booking–Payment/worker/outbox set (`bookingModule`, `bookingPaymentContract`, `bookingPaymentLifecycle`, `infrastructureLifecycle`, `notificationDeliveryWorker`, `notificationOutboxDiagnostics`, `paymentModule`, `payosRetryWorker`): **8/8 test files PASS**.
- Frontend Booking list/detail/lookup and API client (`BookingPages.test.jsx`, `bookingsApi.test.js`): **30/30 tests PASS**.
- No live email or payment gateway calls were made. Worker and outbox checks used mocks/unit fixtures; MySQL locking evidence remains the previously recorded 86/86 isolated integration PASS.

Interpretation:

- STT 31 now has direct backend module and frontend HTTP-contract evidence, but remains **PARTIAL** because a fresh authenticated MySQL list endpoint run was not required and admin/customer data-volume behavior is not fully covered by one parity test.
- STT 35 and STT 36 have worker/outbox lifecycle mock coverage plus MySQL lifecycle evidence; real Resend delivery remains intentionally unverified.
- STT 37 retains successful-payment aggregation unit coverage; a dedicated DB aggregate assertion is still recommended.
- STT 38 remains **PARTIAL**: source adapters and safety tests pass, but real merchant sandbox callback acceptance is outside this run.

### Current status table

| STT | Status after follow-up | Evidence | Remaining limitation |
|---:|---|---|---|
| 30 | **COMPLETE** | 86/86 MySQL lifecycle/concurrency + 2/2 HTTP acceptance PASS per run (two runs) | None for implemented CRUD scope |
| 31 | **COMPLETE** | Backend module/contract + 30 frontend tests + 2/2 HTTP acceptance PASS per run (two runs) | Customer-text filter/explicit empty-result case recommended if required |
| 32 | COMPLETE | Lookup/detail contract and frontend tests PASS | None blocking |
| 33 | **PARTIAL** | Payment lifecycle/idempotency/refund MySQL PASS | No live gateway/refund settlement |
| 34 | COMPLETE | Admin payment routes/module and reconciliation HTTP test PASS | None blocking for source scope |
| 35 | **COMPLETE** | Expiry/reconciliation/concurrency MySQL PASS; scheduler acceptance 1/1 PASS in two runs | Long-running production scheduler observation remains operational follow-up |
| 36 | **PARTIAL** | Notification/outbox worker tests PASS; email isolation PASS | Real Resend delivery not verified |
| 37 | **COMPLETE** | Revenue aggregation unit tests plus DB-backed HTTP acceptance 1/1 PASS in two runs | None blocking for dashboard contract |
| 38 | **PARTIAL** | VNPay/payOS contract, checksum and integration fixtures PASS | Real merchant sandbox callback not rerun |
| 39 | **PARTIAL** | IPN/webhook, duplicate/stale/late-payment MySQL PASS | Production HTTPS callback acceptance unverified |
| 40 | COMPLETE | Guest lookup authorization and frontend tests PASS | None blocking |
| 41 | COMPLETE | Promotion validation/lifecycle and frontend tests PASS | None blocking |

## Priority acceptance follow-up (2026-11-02)

Existing-test review found no dedicated MySQL-backed HTTP acceptance suite for Booking list/detail/create/cancel or revenue endpoints. The available coverage is service/repository contract tests, frontend HTTP-client/page tests, route matrices, and the 86-test MySQL lifecycle/concurrency set.

Executed without source changes:

- `tests/reconciliationOperations.test.js` with localhost listener permission: **1/1 PASS**.
- Backend lifecycle/worker/outbox set: **8/8 files PASS**.
- Frontend `BookingPages.test.jsx` + `bookingsApi.test.js`: **30/30 PASS**.
- Previously verified isolated MySQL Booking–Payment suites: **86/86 PASS**.

Tests still missing (proposal only; not added in this audit):

1. A DB-backed HTTP acceptance fixture for STT 30/31 that creates an authenticated customer and admin, exercises `POST /bookings`, `GET /bookings/my-bookings`, `GET /bookings/admin/all`, status/customer filters, pagination, guest lookup authorization, and `PUT /bookings/:id/cancel` with transaction-visible seat/promotion assertions.
2. A DB-backed revenue acceptance fixture for STT 37 that inserts isolated successful/failed payments at day/month boundaries and verifies `/api/v1/payments/revenue` for both grouping modes and admin authorization.
3. A scheduler integration check for STT 35 that starts the maintenance job with injected services and verifies start/stop lifecycle around an expired booking; unit lifecycle and MySQL expiry behavior already pass.

These are coverage gaps, not confirmed production defects. Adding them requires approved test-only changes and must continue using `airline_booking_integration_test` on port 3309.

## Acceptance-test implementation review (2026-11-02)

The requested new acceptance tests were not added in this pass. Inspection showed:

- Existing integration helpers provide model fixtures and scoped cleanup, but no reusable HTTP harness that boots the canonical app, creates JWT-authenticated customer/admin users, and safely tears down all related records.
- Existing Booking tests (`bookingPaymentLifecycle`, `bookingModule`, frontend Booking/API tests) already cover service behavior, route contracts and UI/API serialization, but do not provide the requested DB-backed HTTP matrix.
- Existing revenue tests verify repository/service aggregation with mocked model calls; no isolated DB-backed `/api/v1/payments/revenue` acceptance fixture exists.
- Scheduler tests use dependency injection and controllable promises; no short-tick scheduler integration harness exists against an actual expired DB booking.

Therefore no test-only file was created, and no production behavior was changed. Creating the requested coverage safely requires a separately reviewed test harness with:

1. canonical `createApp()`/container startup against the verified integration DB;
2. customer/admin JWT fixtures and role cleanup;
3. explicit ownership tracking for bookings, payments, passengers, status history, promotions and inventory;
4. HTTP assertions for STT 30/31 and revenue boundary cases;
5. injected scheduler clock/tick control rather than real-time waits.

Current status remains unchanged: STT 30/31/35/37 are not marked COMPLETE solely from existing unit or MySQL service-level coverage. No new defect was discovered; this is a test-harness/coverage gap.

## HTTP harness implementation (2026-11-04)

Added test-only files:

- `tests/integration/helpers/httpIntegrationHarness.js`
- `tests/integration/httpIntegrationHarness.smoke.test.js`

The harness uses the canonical `createApp()` + `buildContainer()` path, binds an ephemeral `127.0.0.1` port, creates customer/admin JWT fixtures with the existing `generateAccessToken()`, verifies the integration database identity, and cleans only its owned users before closing the listener. It does not start `server.js`, cron, sockets, demo bootstrap, gateways or email providers.

Syntax and whitespace checks: **PASS** (`node --check` for both files; `git diff --check`).

Smoke execution was attempted twice as required, but both runs were blocked before the test body because `airline-mysql-test` had exited (`Exited (255)`), producing `ECONNREFUSED 127.0.0.1:3309`. No database write occurred and the container/volume was not restarted or reset by this task. Therefore smoke result is **UNVERIFIED/BLOCKED**, not PASS.

After the approved isolated container is started again, run:

```bash
for run in 1 2; do
  NODE_ENV=test PAYOS_MODE=demo node --env-file=.env.integration \
    --test --test-concurrency=1 tests/integration/httpIntegrationHarness.smoke.test.js || exit $?
done
```

STT 30/31/35/37 remain unchanged until this smoke test passes twice and the dedicated acceptance matrix is implemented and verified.

## STT 33 refund audit — mixed modes (2026-11-04)

Process-only configuration used: `PAYOS_MODE=live`, `VNPAY_MODE=sandbox`, plus a test return URL. No environment file was changed.

- `POST /api/v1/payments/:id/vnpay/refund` is the automated VNPay refund path. It is admin-only, locks a gateway operation, verifies the gateway response/signature, and changes Payment to `refunded` only after verified success.
- `POST /api/v1/payments/bookings/:id/refund` is the whole-booking/manual path. VNPay payments are directed to the dedicated endpoint; payOS fails closed with manual refund reconciliation required. It does not mutate Payment/Booking/inventory for unsupported payOS refunds.
- Automated payOS refund is **unsupported**; no code claims payOS refunded without a verified adapter.

Mock/unit command with no external requests:

```bash
NODE_ENV=test CLIENT_URL=http://localhost:5173 \
VNP_RETURN_URL=http://localhost:5173/payments/result \
PAYOS_MODE=live VNPAY_MODE=sandbox \
VNP_TMN_CODE=TEST_TMN VNP_HASH_SECRET=test-only-vnpay-secret \
node --test tests/paymentAmountConsistency.test.js tests/vnpayOperation.test.js \
  tests/vnpayGateway.test.js tests/bookingPaymentLifecycle.test.js \
  tests/paymentModule.test.js tests/payosLiveContract.test.js
```

Result: **6/6 test files PASS**. Coverage includes VNPay success/rejection/unknown outcomes, refund idempotency, amount/signature checks, inventory safety, payOS live contract behavior and unsupported payOS refund handling.

An initial run without `VNP_RETURN_URL` failed at the expected configuration guard; the rerun with the test-only URL passed. This is an environment setup issue, not a refund business defect.

The MySQL refund suite remains correctly restricted to `PAYOS_MODE=demo`; it was not run with live mode because the integration guard rejects live payOS. No real provider request was made. Payment method remains the provider selector; no cross-provider switching was observed.

STT 33 remains **PARTIAL**: automated VNPay refund safety is covered, while payOS refunds are intentionally manual/unsupported and live merchant settlement is not exercised.

### STT 33 Phase 2 — Admin manual payOS settlement

Added an additive manual refund ledger and Admin-only API:

- `POST /api/v1/payments/:paymentId/manual-refund`
- `GET /api/v1/payments/manual-refunds`
- `GET /api/v1/payments/manual-refunds/:id`
- `POST /api/v1/payments/manual-refunds/:id/settle`
- `POST /api/v1/payments/manual-refunds/:id/reject`

The request snapshots the successful payOS amount and enforces one request per Payment. Payment remains `success` while pending/rejected and changes to `refunded` only during a locked settlement transaction after evidence and settlement reference validation. Append-only audit rows record Admin identity and evidence. Automated payOS refund remains fail-closed with HTTP 409; VNPay refund behavior is unchanged.

Unit and frontend verification passed. Additive migrations and isolated MySQL acceptance passed on `airline_booking_integration_test` (`127.0.0.1:3309`, MySQL 8.0.46); the manual refund acceptance file passed twice and the existing refund/callback/concurrency suites passed 54/54. External merchant settlement remains unverified; STT 33 remains **PARTIAL** for that external prerequisite.

### Transaction blocker resolution

Manual refund create, settle and reject now use the stable lock order `Payment → ManualRefundRequest → Booking → Flight → Promotion`. The MySQL acceptance test covers duplicate creation races, concurrent settlement, rollback injection, same-reference idempotency, conflicting references, inventory consistency and late webhook protection. The updated acceptance test passed after the lock-order fix; the existing VNPay/callback/concurrency suite passed 54/54.

## Harness smoke rerun (2026-11-04)

`airline-mysql-test` was healthy and mapped to `127.0.0.1:3309`; the development MySQL remained separate on port 3307. The harness smoke test was run twice consecutively with `PAYOS_MODE=demo`:

- Run 1: **1/1 PASS**
- Run 2: **1/1 PASS**

Both runs verified canonical app startup, health route, customer JWT authentication, admin JWT authentication, customer denial of the admin payment list, isolated database identity, fixture cleanup and listener shutdown. This validates the reusable harness only; it does not complete the STT 30/31/35/37 acceptance matrix.

## Scheduler and revenue acceptance (2026-11-04)

Added test-only files:

- `tests/integration/revenueHttpAcceptance.mysql.test.js`
- `tests/integration/schedulerAcceptance.mysql.test.js`

Both use the existing HTTP harness and verified `airline_booking_integration_test` database on `127.0.0.1:3309`; no development DB, gateway or real email provider was used.

Results:

- Revenue HTTP/MySQL: **1/1 PASS** in run 1 and **1/1 PASS** in run 2. Covered admin authorization, customer denial, day/month grouping, successful-only totals, failed/pending exclusion, empty range and invalid date validation.
- Scheduler expiry: **1/1 PASS** in run 1 and **1/1 PASS** in run 2. Covered injected scheduler tick, expired holding transition, inventory restoration exactly once and clean stop.

The scheduler emitted an informational count for other pre-existing holding rows, but assertions remained scoped to the owned fixture and cleanup completed. No production defect was found.

## Booking HTTP acceptance tests (2026-11-04)

Added `tests/integration/bookingHttpAcceptance.mysql.test.js` using the existing canonical harness and scoped fixture cleanup. No production code or environment files were changed.

Coverage:

- STT 30: authenticated HTTP create/detail/cancel, MySQL persistence, inventory decrement/restoration, promotion usage restoration, duplicate cancellation protection and invalid input validation.
- STT 31: customer-owned list, ownership denial, admin list, non-admin denial, status filter, pagination and invalid query validation.

Execution against `airline_booking_integration_test` on port 3309 with `PAYOS_MODE=demo`:

- Run 1: **2/2 PASS**
- Run 2: **2/2 PASS**
- Total: **4/4 PASS, 0 FAIL, 0 SKIP**

Expected error-handler log lines for duplicate cancellation and unauthorized detail access appeared, but the assertions passed and no production defect was identified. Fixture cleanup completed in both runs.

Status proposal: STT 30 can move to **COMPLETE** for the implemented acceptance scope. STT 31 can move to **COMPLETE** for customer/admin list, ownership, status and pagination scope; customer-text filtering and an explicit empty-result assertion remain recommended additions if those are required by the final functional specification.
