# PAY-02B — VNPay Protocol & Refund Safety

## Git baseline

- Branch: `feature/booking-payment`
- PAY-02A commit: `596ca75`
- PAY-02B is an uncommitted working tree checkpoint. No push, merge, deployment, migration, or real gateway call was performed.
- Existing PAY-02A itinerary and active-attempt guards remain in `modules/payment/payment.service.js` and its regression tests.

## F02 — Financial refund truth

The shared `POST /api/v1/payments/bookings/:id/refund` path now fails before any payment, booking, seat, or promotion mutation when a successful payment is VNPay. It returns HTTP 409 with code `VNPAY_REFUND_REQUIRES_DEDICATED_ENDPOINT` and directs operators to `POST /api/v1/payments/:id/vnpay/refund`.

payOS continues to return HTTP 409 without mutation. The dedicated VNPay endpoint remains the only path that can mark a payment `refunded`, and only after a verified refund response classified as settled success. Pending, rejected, unknown, timeout, signature mismatch, and duplicate operations do not mark the payment refunded and are not retried automatically.

## F03 — Outcome classification

Merchant API acceptance (`vnp_ResponseCode`) is evaluated separately from transaction/refund settlement (`vnp_TransactionStatus`). A response is successful only when both are `00`. Statuses `01`, `05`, and `06` are `pending`; known terminal statuses such as `02`, `04`, `07`, and `09` are `failed`; missing or undocumented status is `unknown`. A duplicate refund response (`94`) is also treated as `unknown`.

Invalid signatures, merchant/reference/amount mismatches, HTTP failures, and timeouts do not mutate Payment. Gateway operation records retain `failed` or `unknown` outcomes for later review.

## F04 — Merchant API protocol

`VnpayGateway` now sends JSON to the merchant API with `Content-Type: application/json`. QueryDR and refund use separate HMAC-SHA512 pipe canonicalization from the official v2.1.0 contract; the payment checkout URL checksum helper is not reused.

Request IDs are limited to 32 characters. QueryDR and refund use the Payment initiation timestamp (`created_at`/`createdAt`) as `vnp_TransactionDate`; `paid_at` is not used as a substitute. Refund requests include `vnp_CreateBy` from the authenticated operator, `vnp_CreateDate`, transaction reference, amount, transaction type, and merchant metadata. Responses are verified with command-specific response canonicalization before classification.

Reference: [VNPay QueryDR and refund API](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html), [VNPay v2.1.0 technical specification](https://sandbox.vnpayment.vn/apis/files/VNPAY%20Payment%20Gateway_Techspec%20Post%20method%202.1.0-VN.pdf).

## Changed files

- `modules/payment/payment.service.js`
- `modules/payment/vnpay.gateway.js`
- `frontend/src/features/bookings/PaymentPages.jsx`
- `frontend/src/features/bookings/bookingsApi.js`
- `tests/bookingPaymentLifecycle.test.js`
- `tests/bookingPaymentConcurrency.mysql.test.js`
- `tests/integration/vnpayQueryRefund.mysql.test.js`
- `tests/vnpayGateway.test.js`
- `frontend/src/features/bookings/PaymentPages.test.jsx`
- `frontend/src/features/bookings/bookingsApi.test.js`

## API contract changes

- Legacy booking refund returns structured HTTP 409 for VNPay and points to the dedicated endpoint.
- Admin frontend uses `POST /payments/:id/vnpay/refund` for VNPay and does not present a false internal refund action for payOS.
- Dedicated VNPay refund result includes the durable gateway operation status (`success`, `failed`, `pending`, or `unknown`).

## Test evidence

- Targeted backend Payment/VNPay regression: 132/132 PASS.
- VNPay QueryDR/refund isolated MySQL suite: 10/10 PASS.
- Booking/payment concurrency isolated MySQL suite: 9/9 PASS.
- Frontend booking/payment tests: 13/13 PASS; full frontend suite: 232/232 PASS.
- Full backend suite was attempted but the environment denied test-created HTTP listeners (`listen EPERM: operation not permitted 127.0.0.1`) in 21 unrelated HTTP parity/validation tests. The affected tests could not execute in this sandbox; no source assertion failure was observed for PAY-02B.
- No VNPay sandbox/live request was made.

## Remaining limitations

- F06–F12 remain open from PAY-01.
- Dedicated VNPay refund still requires a real merchant response to confirm production certification; tests use local signed fixtures only.
- No schema metadata was added, so the existing Payment creation timestamp is the source for `vnp_TransactionDate`.

## Commit readiness

`COMMIT READY` for review. Full backend coverage remains environment-limited by the listener permission error above; no commit, push, merge, or deployment was performed in PAY-02B.
