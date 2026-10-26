# VNPay production-readiness

## Current status

VNPay is disabled by default. This repository has not been tested end-to-end against a VNPay Sandbox or production merchant account, and no real payment or refund request is made by the local demo. A successful local unit/integration test is not evidence of VNPay gateway certification.

The implementation follows the VNPay v2.1.0 payment flow: the merchant creates a signed URL, VNPay redirects the browser to `vnp_ReturnUrl`, and VNPay calls the merchant IPN endpoint separately. The browser return is display-only; only a verified IPN can confirm a booking. See the [official payment API guide](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [connection model](https://sandbox.vnpayment.vn/apis/docs/mo-hinh-ket-noi/), and [QueryDR/Refund API](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html).

## Configuration

| Variable | Meaning |
| --- | --- |
| `VNPAY_MODE` | `disabled` (default), `sandbox`, or `production` |
| `VNP_TMN_CODE` | VNPay merchant website code; never commit it |
| `VNP_HASH_SECRET` | VNPay HMAC-SHA512 secret; never log or commit it |
| `VNP_URL` | Browser payment URL; sandbox URL in sandbox mode; non-sandbox HTTPS URL in production |
| `VNP_API_URL` | Merchant QueryDR/Refund API URL; HTTPS is required |
| `VNP_RETURN_URL` | Browser return page, belonging to an allowlisted frontend origin |
| `CLIENT_URL` | Frontend origin used in the local fallback/allowlist |
| `PAYMENT_RETURN_URL_ALLOWLIST` | Comma-separated additional trusted origins |

`disabled` does not build a gateway URL and returns HTTP 503 from payment initiation. `sandbox` requires TMN Code and Hash Secret and is rejected when `NODE_ENV=production`. `production` requires TMN Code, Hash Secret, a non-sandbox HTTPS endpoint, and production HTTPS redirect policy. No credential fallback exists in application code.

## Payment flow

1. `POST /api/v1/payments/initiate` locks the holding Booking and its Flight, reads the amount from the database, changes the Booking to `pending_payment`, and creates one pending Payment attempt.
2. VNPay URL parameters use API version `2.1.0`, currency `VND`, and `vnp_Amount = amount * 100`. Parameters are sorted and signed with HMAC-SHA512.
3. The transaction reference is unique and is protected by the database unique `payments.transaction_ref` constraint.
4. If gateway URL creation is ambiguous, the local Payment remains pending for reconciliation; it is not silently deleted as a successful charge.

The timestamp is formatted in `Asia/Ho_Chi_Minh` (`GMT+7`) regardless of the host process timezone.

## Return and IPN

- Browser return: `GET /api/v1/payments/vnpay/return`. It verifies checksum, TMN Code, amount, and local transaction reference for display. It never changes Booking or Payment state.
- IPN: `GET /api/v1/payments/vnpay/ipn`. It verifies checksum, TMN Code, transaction reference, and amount before entering the row-locked transaction. VNPay receives HTTP 200 with `{ RspCode, Message }`.
- Duplicate success callbacks are idempotent. Invalid signature or merchant code never changes state.
- A valid late success is recorded as `Payment=success` with `requires_manual_review`; it does not confirm an expired, cancelled, departed, or cancelled-flight Booking.
- A valid failure returns the Booking to `holding` while the hold remains valid; otherwise it expires the Booking and releases seats/promotion once.

## Booking, concurrency, and refund

Payment IPN, stale pending reconciliation, and refund use row locks and the established lock order. Existing MySQL integration coverage includes duplicate IPN, late IPN versus reconciliation, refund races, and Flight cancellation versus payment initiation (IT-03, IT-04, IT-05, IT-08, IT-09).

The existing `/payments/bookings/:id/refund` endpoint remains the local administrative refund workflow for backward compatibility. VNPay gateway operations use the dedicated service methods described below and do not change local state until a verified gateway response is received.

## QueryDR and VNPay refund readiness

`modules/payment/vnpay.gateway.js` is a dependency-injectable adapter for the VNPay v2.1.0 merchant API. It signs QueryDR and full-refund requests, validates merchant code, transaction reference, amount, request ID and response HMAC, and classifies results as `success`, `failed`, or `unknown` (timeouts and transport errors). The API URL is configured separately with `VNP_API_URL`.

- `POST /api/v1/payments/:id/vnpay/query` performs QueryDR for an authenticated admin.
- `POST /api/v1/payments/:id/vnpay/refund` performs a full refund for an authenticated admin; the existing local refund route remains unchanged.
- Each operation is persisted in `payment_gateway_operations` with a unique request/idempotency key, attempt count, sanitized response and outcome timestamps.
- A refund request or an ambiguous response never marks a Payment as refunded. Only a verified `00` response does so; `unknown` operations must be reconciled with QueryDR.
- A row lock and unique `refund:<paymentId>` operation key prevent duplicate refund attempts. External HTTP is always performed after the database transaction creating the pending operation has committed.

The adapter is disabled while `VNPAY_MODE=disabled` (the default), and no real gateway call is made by tests. Gateway certification still requires a real merchant account and end-to-end sandbox verification.

## Verification checklists

### Sandbox

- Obtain a real sandbox merchant account and configure `VNPAY_MODE=sandbox`, TMN Code, Hash Secret, and sandbox `VNP_URL` through secret storage.
- Expose an HTTPS `vnp_ReturnUrl` and IPN URL reachable by VNPay; localhost alone cannot receive gateway callbacks.
- Verify successful, failed, cancelled, duplicate, invalid-signature, wrong-amount, and late callbacks.
- Compare the generated canonical string and HMAC with the VNPay sample for the issued account.

### Staging

- Use staging-only credentials and a staging database.
- Use HTTPS on both browser return and IPN endpoints; configure the exact allowlisted origin.
- Run the full Booking/Payment concurrency suite and verify no duplicate confirmation email, seat release, or refund.
- Test gateway timeout and reconciliation without changing production data.

### Production

- Set `NODE_ENV=production` and `VNPAY_MODE=production`.
- Inject real TMN Code, Hash Secret, and a non-sandbox HTTPS `VNP_URL` from a secret manager.
- Configure VNPay IPN to `GET /api/v1/payments/vnpay/ipn` on the public API host and the browser return URL on the trusted frontend host.
- Confirm TLS, proxy forwarding, request logging redaction, monitoring, alerting, and reconciliation ownership.
- Obtain explicit approval before enabling real payment or refund traffic.

## Not yet verifiable

There is no VNPay Sandbox account, merchant credential, public HTTPS callback, or end-to-end gateway result in this environment. The project is therefore **code-prepared and test-covered**, not certified production-ready.
