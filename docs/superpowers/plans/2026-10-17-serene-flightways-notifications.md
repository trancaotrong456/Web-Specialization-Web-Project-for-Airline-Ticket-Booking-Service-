# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a durable, authenticated Notification inbox with transactional Booking/Payment events, retryable post-commit Socket.IO/email delivery and a responsive React experience.

**Architecture:** A canonical `modules/notification` API owns inbox reads and event persistence. Booking/Payment write an idempotent outbox event in their existing transaction; a background worker claims committed records and dispatches channels independently. Socket.IO derives private user rooms from verified access tokens, while the client refreshes via the authorized API.

**Tech Stack:** Express 4 CommonJS, Sequelize 6/MySQL, existing JWT/Auth, Socket.IO, email provider, React/Vite/Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-serene-flightways-notifications-design.md`

## Global Constraints

- Use only the main repository and `booking-payment/booking-payment-notifications`, based on `9481164bf286692508a331142293491363770873`.
- Keep canonical Booking/Payment; preserve one-way, round-trip and multi-city flows.
- Never let a post-commit notification delivery error roll back committed Booking/Payment.
- Use at-least-once delivery; never claim exactly-once email without provider support.
- Do not run migrations/seeds on demo or production; MySQL verification requires a separately approved isolated test DB.
- Do not implement the Flight Status producer until Flight Status is merged; define/test only its event consumer contract here.
- Preserve unrelated untracked files and both existing stashes; stage only reviewed task files.

## Review Focus

1. Same event key reused with different event content must not silently create a second state or corrupt the original notification; test duplicate and conflicting event-key handling.
2. A stale outbox lease after process restart must be reclaimable while a live lease prevents a second worker claim; test lease expiry and concurrent claim contract.
3. Guest Booking events must not expose email or passenger data through in-app/API/Socket.IO; test minimal socket payload and recipient scoping.
4. Expired/revoked access tokens must not join a private user room; test invalid and expired token connection behavior.
5. A permanently invalid email must stop retrying while preserving the in-app notification and failed outbox evidence; test permanent-vs-transient failure paths.

---

### Task 1: Notification API and durable inbox

**Files:** Create `models/notification.js`, `models/notification_outbox.js`, `modules/notification/{index.js,notification.controller.js,notification.service.js,notification.repository.js,notification.routes.js}`, `validators/notification.validator.js`, one timestamped migration, and `tests/notificationModule.test.js`; modify `application/buildContainer.js`, `application/registerModules.js`, and `tests/moduleRegistration.test.js` only as required.

**Interfaces:** `NotificationService.listForUser(userId, { page, limit })`, `unreadCountForUser(userId)`, `markReadForUser(userId, notificationId)`. Repository queries always include `user_id`; mark-read returns not-found for non-owned IDs.

- [ ] Write tests for pagination, unread count, own-recipient read, foreign-recipient denial, and route auth.
- [ ] Run the focused file and confirm expected failures before implementation.
- [ ] Implement Sequelize models, associations, migration, module DI and APIs using current response/validation patterns.
- [ ] Run focused tests, syntax checks and `git diff --check`.
- [ ] Review and commit only Task 1 files.

### Task 2: Transactional event publisher and Booking/Payment hooks

**Files:** Create `infrastructure/notifications/notificationEventPublisher.js` and tests; modify `modules/booking/booking.service.js`, `modules/payment/payment.service.js`, their module factories and `application/buildContainer.js`; add `tests/notificationEvents.test.js` and update canonical Booking/Payment lifecycle tests.

**Interfaces:** `publishNotificationEvent({ eventKey, type, aggregateType, aggregateId, payload, transaction })` persists event data with the caller's Sequelize transaction. Source services publish only after detecting a real state transition and before that transaction commits.

- [ ] Write regression tests for booking-created/confirmed/cancelled and payment-succeeded/failed/refund-completed events, duplicate callbacks, rollback, and one-way/round-trip/multi-city references.
- [ ] Run tests to observe the missing event behavior.
- [ ] Implement publisher and minimal canonical source hooks; do not alter unrelated Booking/Payment policies.
- [ ] Verify duplicate event keys are handled idempotently and transaction failures leave no outbox record.
- [ ] Run Booking/Payment focused suites and commit the scoped group.

### Task 3: Claiming worker, delivery retry and job lifecycle

**Files:** Create `infrastructure/jobs/notificationOutboxJob.js`, channel dispatcher/email template as needed, and worker tests; modify `jobs/expireBookings.job.js` only to register the worker through existing job startup.

**Interfaces:** Worker claims a bounded batch of committed pending/expired-lease events, dispatches independently by channel, persists attempts/status, uses bounded retry/backoff, and retains exhausted records as `FAILED`.

- [ ] Write tests for no pre-commit dispatch, successful processing, claim exclusion, crash/restart lease recovery, transient retry, permanent failure and retry exhaustion.
- [ ] Run worker tests to observe failures.
- [ ] Implement atomic claim/lease and channel status updates; keep email transport injected and fakeable.
- [ ] Run worker + job lifecycle regressions without starting the real server or sending mail.
- [ ] Review and commit the worker group.

### Task 4: Authenticated Socket.IO delivery

**Files:** Modify `sockets/index.js`, `infrastructure/realtime/socketProvider.js` only if needed, `frontend/src/lib/socket.js`, and relevant socket tests.

**Interfaces:** Socket connection may authenticate an access token; server derives `user:<id>` room from verified token. Existing flight rooms remain functional. Event payload is `{ notificationId, type }` and never includes email, booking PII or client-selected user ID.

- [ ] Write tests for valid/invalid/expired token, private room isolation, and unchanged flight room behavior.
- [ ] Run focused socket tests to observe failures.
- [ ] Implement optional authenticated user-room join and safe emit adapter.
- [ ] Run Socket.IO server/client regressions and commit.

### Task 5: React notification experience

**Files:** Create `frontend/src/features/notifications/notificationsApi.js`, `NotificationBell.jsx`, scoped styles and tests; modify `frontend/src/components/AppHeader.jsx`, `frontend/src/app/AuthProvider.jsx` or route shell only as required, plus frontend route/navigation tests.

**Interfaces:** Bell loads unread count/list through existing API client, refreshes on authenticated `notification:new`, marks owned items read through API, and clears state/listeners when auth identity changes.

- [ ] Write component/API tests for unread, pagination, read, empty/loading/error, realtime refresh, auth change and related links.
- [ ] Run focused tests to observe failures.
- [ ] Implement the UI with existing design tokens and responsive patterns.
- [ ] Run focused tests and production build; commit the frontend group.

### Task 6: Flight event consumer contract and full regression

**Files:** Create event-contract tests and document the deferred producer integration; no edits to Flight module in this task.

- [ ] Test consumer handling for delayed/cancelled/schedule-changed event envelopes and dedupe keys using a fake publisher/consumer boundary.
- [ ] Run Backend full suite twice, Frontend full suite, build, JS syntax checks and `git diff --check`.
- [ ] Inspect migrations/models/associations, staged diff and secrets; report MySQL and actual Flight producer integration as `UNVERIFIED`.
- [ ] Commit final tests/docs if not included earlier, push normally to the authorized feature branch, and verify remote SHA.
