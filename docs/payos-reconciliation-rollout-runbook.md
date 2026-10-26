# payOS reconciliation rollout runbook

The durable worker uses the `reconciliation_worker_leases` row named `payos-reconciliation`. Only the process that owns that lease may discover cases and poll payOS. Existing `PaymentReconciliationCase` leases still protect individual cases. The ownership lease is released only when the owner matches; an expired lease can be claimed after a process crash.

## Modes

- **Legacy-only:** `ENABLE_PENDING_RECONCILIATION=true`, `PAYOS_RECONCILIATION_WORKER=false`. Only the legacy booking maintenance path runs. Use only while every running instance is an old version or has been explicitly drained from durable mode.
- **Disabled:** `ENABLE_PENDING_RECONCILIATION=false`. Holding expiry continues, but no pending-payment reconciliation polls payOS.
- **Durable-only:** `ENABLE_PENDING_RECONCILIATION=true`, `PAYOS_RECONCILIATION_WORKER=true`. New versions acquire the shared MySQL ownership lease before discovery or gateway polling. If the lease table/model is unavailable, the worker skips polling and does not fall back to legacy.

Process-local flags are not a distributed lock. An old deployed version that does not acquire `reconciliation_worker_leases` can still poll payOS. Mixed-version deployments therefore require a drain-and-cutover sequence.

## Pre-deployment checks

1. Apply the worker-lease migration to the staging database and verify the `payos-reconciliation` row exists.
2. Confirm every instance has the same database and feature-flag configuration.
3. Confirm the isolated/staging gateway adapter is fake or sandbox-only; production credentials are never used in tests.
4. Query the lease row and confirm no active owner before cutover.

## Legacy to durable cutover

1. Set `ENABLE_PENDING_RECONCILIATION=false` and deploy/restart all old instances. This stops both legacy and durable polling while holding expiry remains active.
2. Wait for old cron executions to finish and verify no old instances remain in service.
3. Deploy the version containing the lease migration and durable worker with reconciliation still disabled.
4. Verify the migration, lease row, metrics and worker logs on the new instances.
5. Set `ENABLE_PENDING_RECONCILIATION=true` and `PAYOS_RECONCILIATION_WORKER=true` on the designated worker deployment. All instances must run the new code before enabling this mode.
6. Confirm only one owner is present and gateway polling occurs from the durable path.

## Restart and crash recovery

Graceful shutdown stops new cron ticks and releases ownership only when the current owner matches. A crash leaves the lease until `PAYOS_RECONCILIATION_OWNERSHIP_LEASE_MS` expires; another durable worker can then claim it. Individual case leases are recovered independently.

## Rollback

1. Disable reconciliation on the durable deployment and wait for in-flight work/lease expiry.
2. Stop or drain every durable instance before starting an old version. Do not run old and new polling paths together.
3. If rollback is to legacy-only, set `ENABLE_PENDING_RECONCILIATION=true` and `PAYOS_RECONCILIATION_WORKER=false` only after the durable deployment is fully drained.
4. If shared ownership cannot be verified, keep reconciliation disabled. Never automatically fall back from durable to legacy.

VNPay QueryDR and refund routes do not use this payOS ownership lease and retain their existing behavior.
