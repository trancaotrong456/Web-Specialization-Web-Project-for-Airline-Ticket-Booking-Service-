# Serene Flightways Notifications Design

**Status:** Approved by the project coordinator on 2026-10-17.

## Goal and scope

Provide authenticated customers with durable in-app notifications, realtime updates and optional email for real Booking/Payment state transitions. Flight Status events receive a stable consumer contract and regression coverage now; a producer is connected only after the Flight Status branch is integrated into the shared baseline.

Events in scope: `BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `REFUND_COMPLETED`, `FLIGHT_DELAYED`, `FLIGHT_CANCELLED`, and `FLIGHT_SCHEDULE_CHANGED`.

## Architecture

- Implement one canonical Express Modular Monolith module at `modules/notification` using the existing Composition Root, Sequelize, API response, authentication and route-registration patterns.
- Persist an in-app inbox record and a transactional outbox event with the business transaction. `event_key` has a database unique constraint. A rollback therefore leaves no notification event; an email or Socket.IO failure after commit cannot roll back Booking or Payment.
- A bounded background worker claims only committed outbox rows, records per-channel attempts/status, retries transient provider errors with capped backoff, marks permanently failed/exhausted records `FAILED`, and retains them for inspection/retry. Delivery is at-least-once; email is not described as exactly-once unless the provider guarantees it.
- Socket.IO authenticates an optional user identity with the existing access-token verification mechanism. The server derives the private user room; clients cannot choose another user room. Existing public flight-room behavior remains compatible. Realtime payloads contain only notification ID/type and trigger a refresh from the authorized API.
- Email uses the existing email infrastructure/template mechanism only when configured. Tests use a fake transport and never send live mail.
- The frontend adds an authenticated notification bell, unread count, paginated inbox, read action, related Booking/Flight links, and loading/empty/error states. Auth changes clear old listeners/data and reconnect safely.

## API and security

Mount below `/api/v1/notifications`: authenticated `GET /`, `GET /unread-count`, and `PATCH /:id/read`. Pagination is validated and bounded according to existing API conventions. Every read/update is scoped to the authenticated recipient; another user's notification is indistinguishable from a missing resource under the existing error contract.

## Event and transaction rules

Canonical Booking/Payment services publish events only for actual state transitions and pass the active Sequelize transaction. Event keys are stable for the source transition so callback/job retries hit the unique constraint and do not create duplicate inbox items. A publisher failure inside the transaction aborts the corresponding business transition rather than committing a state change without its durable event. Post-commit dispatch failures are isolated and retried by the worker.

The outbox worker uses an atomic claim/lease or dialect-supported row locks, never processes uncommitted rows, and marks successful channel delivery independently. A restart resumes pending/expired-lease rows. Retries are bounded; transient/permanent error classification is explicit. No PII is emitted over Socket.IO; email recipient data is resolved through canonical Booking/User records at dispatch time rather than copied into realtime payloads.

Flight event contract is a consumer boundary only in this branch. Do not copy or merge Flight Status implementation; the producer and end-to-end Flight Status notification test are deferred until that feature is merged into the shared baseline.

## Compatibility and exclusions

- Preserve existing one-way, round-trip and multi-city Booking/Payment behavior and canonical modules; do not add parallel legacy services.
- Do not send success events for rolled-back/failed state transitions.
- Do not let notification provider errors reverse committed payments.
- No live email, real payment callback, migration/seed against demo or production DB, or unapproved database integration.
- Owner review is required for cross-domain Booking/Payment hooks and shared Composition Root, route, job and Socket.IO changes before parent integration.

## Verification

Unit and HTTP regressions cover deduplication, recipient isolation, rollback, channel retry/restart/claiming, Socket.IO authentication/private-room behavior, Booking/Payment transitions and itinerary variants. Frontend tests cover auth-scoped bell/inbox/realtime refresh. MySQL transaction/locking behavior is `UNVERIFIED` unless run on an explicitly isolated test database. Flight Status producer integration remains `UNVERIFIED` until that branch is merged.
