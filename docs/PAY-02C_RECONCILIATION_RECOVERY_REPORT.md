# PAY-02C — Payment Reconciliation & Recovery

## Baseline

- Branch: `feature/booking-payment`
- PAY-02A: `596ca75`
- PAY-02B: `71fb52c`
- No migration, gateway call, email delivery, push, merge, or deploy was performed.

## F06 — Late PAID financial exception

VNPay IPN, payOS webhook, payOS reconciliation, and VNPay QueryDR now share the
same locked transition semantics. A verified PAID result is stored on the
Payment, but it never revives an expired/cancelled booking or bypasses the
active-attempt and itinerary checks. A pending hold that cannot be confirmed is
closed as `expired`, with all itinerary seats and the promotion usage released
in the same transaction exactly once. No automatic refund or rebooking occurs.

The existing unique `payment_reconciliation_cases.payment_id` constraint is
used for idempotency. The case records booking, payment, provider, gateway
status, reason and timestamps; the existing immutable review-action table
provides the audit trail. Cases remain `manual_review` until an operator records
the financial outcome.

## F07 — Independent gateway scheduling

`bookingMaintenanceJob` invokes VNPay and payOS reconcilers independently when
their feature flags are enabled. A failure in one invocation is logged and does
not prevent the other invocation. VNPay uses its own provider-filtered cases and
lease name; payOS keeps its existing lease and worker ownership. Legacy pending
reconciliation remains the compatibility fallback when dedicated workers are
not selected.

## F08 — Authoritative VNPay QueryDR recovery

Only the verified `VnpayGateway.query()` result is applied. QueryDR response
validation continues to enforce merchant, reference, amount, command and
command-specific response HMAC checks from PAY-02B. Success rechecks the active
attempt, booking confirmation window and every itinerary leg under Payment →
Booking → Flight locks. It confirms only when all conditions hold; otherwise it
records a F06 financial exception. Verified failure changes only the active
attempt and releases resources when the hold is expired. Pending/unknown stays
unresolved and is scheduled for bounded retry. Query operations use a stable
operation key, so duplicate QueryDR calls are idempotent.

Unknown VNPay refund operations remain durable and blocked from blind retry;
the existing operator/manual-review path is preserved. No refund is marked
settled without a verified successful refund response.

## F09 — Promotion restoration

payOS CANCELLED/expired reconciliation now uses the same resource-release
helper as callback and booking expiry paths. Seat release and promotion
decrement occur under the transaction and row locks, only on the terminal
transition, and never below zero or twice for a booking already released.

## State transition matrix

| Verified result | Active attempt and booking eligible | Booking not eligible |
|---|---|---|
| PAID | `pending → success`, `pending_payment → confirmed`, one confirmation email | `pending → success`, booking remains/ends terminal, seats/promotion released once, case `manual_review` |
| FAILED/CANCELLED | `pending → failed`, booking returns to `holding` while hold is valid | `pending → failed`, booking `expired`, seats/promotion released once |
| PENDING/UNKNOWN | no Payment or Booking mutation | no Payment or Booking mutation; bounded reconciliation retry |

## Changed files

- `modules/payment/payment.service.js`
- `modules/payment/payment.repository.js`
- `modules/booking/booking.service.js`
- `infrastructure/jobs/bookingMaintenanceJob.js`
- `tests/payosRetryWorker.test.js`
- `tests/integration/bookingPaymentConcurrency.mysql.test.js`
- `tests/integration/payosReconciliation.mysql.test.js`
- `tests/integration/vnpayQueryRefund.mysql.test.js`
- `docs/PAY-02C_RECONCILIATION_RECOVERY_REPORT.md`

## Verification

- Targeted Booking/Payment/VNPay/payOS regression tests: **124/124 PASS**.
- Full backend with HTTP listener permission: **381/381 PASS**.
- Isolated MySQL integration target verified as
  `airline_booking_integration_test`: **40/40 PASS**. IT-09 now verifies the
  approved late-PAID policy: Payment success, Booking `expired`, one seat and
  promotion release, one durable `manual_review` case, duplicate-callback
  idempotency, and no automatic refund.
- No real VNPay/payOS gateway calls and no email delivery were made.
- `node --check` and `git diff --check`: PASS.

## Remaining risks

- Refund settlement recovery remains manual when VNPay returns an unknown
  outcome; this intentionally avoids duplicate refund requests.
- PAY-02D findings remain out of scope.

**COMMIT READY** for the PAY-02C checkpoint; no commit/push/merge/deploy was
performed in this verification.
