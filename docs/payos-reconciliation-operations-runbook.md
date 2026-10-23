# payOS reconciliation monitoring and manual-review runbook

## Monitoring

The maintenance worker starts a database-backed metrics collector independently of Admin API traffic. It refreshes every minute and exposes the latest snapshot through the RBAC-protected Prometheus endpoint:

`GET /api/v1/payments/reconciliation-metrics/prometheus`

The exporter publishes low-cardinality gauges for active cases, manual-review cases, oldest unresolved age, pending payments beyond SLA, retry exhaustion, late PAID exceptions, gateway timeouts and collection time. Payment IDs, Booking IDs, customer data and credentials are never labels or metric values.

The JSON metrics endpoint remains available to Admin/Staff for diagnosis. Production alert delivery requires `RECONCILIATION_ALERT_WEBHOOK_URL`, `RECONCILIATION_ALERT_TRUSTED_HOSTS`, `RECONCILIATION_ALERT_WEBHOOK_SECRET` (minimum 32 characters) and a timeout between 100ms and 30s. The URL must be HTTPS and resolve to an explicitly trusted public host. Requests use `POST`, reject redirects, and carry an HMAC-SHA256 `x-alert-signature: sha256=<hex>` header over the exact JSON body. Delivery failures are logged and isolated from reconciliation. Test mode always disables external delivery.

Every alert includes the stable receiver grouping key `reconciliation:<ALERT_CODE>` and contains only the alert code, severity, value and cooldown. It has no Payment ID, Booking ID, customer data or credential. The application cooldown is process-local only; cross-instance deduplication must be configured and verified in the receiving alert backend using `grouping_key`. Do not claim distributed deduplication from the local cooldown.

## Alert response

- `MANUAL_REVIEW_QUEUE_HIGH`: operations reviews the oldest cases and assigns financial ownership.
- `OLDEST_UNRESOLVED_CASE_OLD`: inspect gateway status, webhook delivery and lease health.
- `PENDING_PAYMENT_SLA`: check whether cases were created and whether the durable worker owns the lease.
- `LEASE_RECOVERY_ANOMALY`: investigate worker crashes, database latency and overlapping deployments.

Gateway timeout and late-PAID visibility are operational signals. They never change Payment or Booking state by themselves.

## Manual-review workflow

Only Admin and authorized Staff may submit `POST /api/v1/payments/reconciliation-cases/:id/manual-review` with:

```json
{
  "action": "acknowledge | financial_reconciled | escalate",
  "reason": "operator explanation",
  "outcome_reference": "optional finance ticket"
}
```

The case must already be `manual_review`. The API writes one immutable audit action containing operator ID, reason, timestamp and optional finance reference. A unique case constraint makes repeated identical submissions idempotent and rejects conflicting resolutions with HTTP 409. Payment, Booking, seats, promotions and gateway operations are not changed by this API. Financial reconciliation, refunds and expired-booking decisions remain separate approved procedures.

For late PAID after expiry, preserve the successful Payment and record the finance ticket. Do not confirm the expired Booking or automatically refund it.

## Incident recovery

If metrics collection or alert delivery fails, reconciliation continues and the JSON/Admin endpoint can be used for diagnosis. If the metrics exporter is unavailable after restart, verify the maintenance job and database connectivity; the next refresh rebuilds the snapshot from durable tables. Keep reconciliation disabled when ownership or migration health cannot be verified.

## Alert delivery smoke test and rotation

In staging, inject the four alert variables from the secret manager, run the runtime configuration validation, and trigger a synthetic threshold alert. Verify the receiver accepts the HMAC signature, rejects a modified body, groups repeated alerts from two application instances by `grouping_key`, and rejects redirected or untrusted destinations. Never print the webhook URL or secret. To rotate credentials, provision the replacement secret at the receiver, update the deployment secret, restart the worker, and revoke the old receiver credential only after delivery succeeds with the new signature.

DNS rebinding cannot be fully eliminated by application-level hostname validation; use a trusted receiver network policy and an alert backend that does not redirect requests. Redirects are explicitly rejected by the HTTP client.
