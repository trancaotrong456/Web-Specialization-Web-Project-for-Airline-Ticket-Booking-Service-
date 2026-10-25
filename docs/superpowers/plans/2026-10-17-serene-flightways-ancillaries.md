# Serene Flightways Ancillaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let Admin configure real ancillary offers and let customers purchase baggage, meals, and priority services per passenger and itinerary leg with immutable booking price snapshots.

**Architecture:** Add a canonical Ancillaries module for catalog/offers; inject its service into Booking so eligibility, capacity reservation, snapshots, fare totals, and promotion calculation happen in the existing booking transaction. Reuse the canonical Payment idempotency flow and Booking read models for summaries; extend Ticket/PDF/email to render snapshots. UI consumes server-calculated offers and never supplies authoritative prices.

**Tech Stack:** Express 4, CommonJS, Sequelize 6, MySQL, React 19, React Router 7, Vite, Vitest, Node test runner.

**Spec:** Approved in conversation on 2026-10-17; this plan records its implementation decisions.

## Global Constraints

- Work only in the primary repository and branch `booking-payment/booking-payment-ancillaries`, based on `210ef95eddc8af371b17f555d5729bd5dd25022e`.
- Preserve all existing untracked files and both stashes; do not create another clone/worktree.
- Do not run migrations/seeds against demo or production databases; real MySQL verification is allowed only on an explicitly isolated test database.
- Keep ticket purchase optional and retain one-way, round-trip, multi-city, Inventory Lock, Seat Selection, Payment Idempotency, and current provider contracts.
- No default price, quota, eligibility, or refundability is invented; an offer is unavailable until explicitly configured.
- Refund only within the existing whole-booking refund capability; do not introduce provider partial-refund behavior. If a booking contains non-refundable ancillary value that would require a partial refund, fail safely with a clear error rather than refunding that value or pretending partial refund is supported.
- Booking/Payment/Ticket/email and shared composition/route files are marked **PENDING OWNER REVIEW** before parent integration.
- Every `BookingAncillary` must reference the real `booking_id`, `passenger_id`, and persisted `booking_segment_id`. API inputs may use `passenger_index` and `leg_order` only; resolve them inside the transaction. New bookings must persist all itinerary legs as segment rows (including leg 1) while retaining legacy primary-flight columns; backfill existing bookings safely and audit every reader/release path to avoid double-counting.
- Capacity lifecycle is transactional and idempotent: reserve while booking is holding, confirm only on successful payment, and release only on valid cancel/expiry/refund transitions. Never release while a valid payment is processing; conditional state transitions and locks prevent duplicate release and concurrent oversell.
- Validate quantity, capacity, eligibility, currency, and exact price on the server. Calculate amounts using decimal-string/integer-minor-unit arithmetic; client prices are never authoritative.
- Replacements lock the Booking and affected Offers in deterministic order, atomically release old held capacity and reserve the new selection, replace snapshots, and recalculate `total_amount`; failures roll back together. Any Payment intent ever created permanently blocks repricing in this phase.
- Keep the existing whole-booking refund behavior. Reject before any state mutation if non-refundable ancillary value makes a whole-booking refund invalid. Do not add partial refunds. Valid cancellation/expiry still releases capacity according to existing lifecycle rules.
- Stage exact paths, test first, no force push/reset/clean, and do not merge to parent/develop/main.

## Review Focus

- Concurrent selections competing for the final configured offer capacity must serialize in the Booking transaction.
- An offer becoming disabled or edited after booking must not change historical snapshots or payment totals.
- Payment initiation/retry must use the final booking total and reject edits after a live/pending intent starts.
- Refunds must exclude non-refundable ancillary snapshots without pretending the existing whole-payment refund path supports partial refunds.
- Missing/legacy ancillary associations must keep existing one-way ticket and email output working.

---

### Task 1: Ancillary catalog, real segment links, and immutable snapshot persistence

**Files:**
- Create: `models/ancillary_service.js`
- Create: `models/ancillary_offer.js`
- Create: `models/booking_ancillary.js`
- Create: `migrations/20261017130000-create-ancillary-catalog-and-booking-snapshots.js`
- Create: `migrations/20261017140000-backfill-primary-booking-segments.js`
- Modify: `models/booking.js`, `models/booking_passenger.js`, `models/booking_segment.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/booking/booking.service.js` (**PENDING OWNER REVIEW; persist first-leg segment row**)
- Modify: `modules/booking/booking.repository.js` (**PENDING OWNER REVIEW; avoid duplicate handling of primary leg**)
- Test: `tests/ancillaryModels.test.js`
- Test: `tests/ancillaryMigration.test.js`

**Interfaces:**
- `AncillaryService`: type (`baggage`, `meal`, `priority`), name/description, active flag.
- `AncillaryOffer`: service, flight, fare class, unit price/currency, explicitly configured capacity and applicability conditions, refund policy, active flag.
- `BookingAncillary`: non-null FKs to booking, passenger, and actual `BookingSegment`; nullable offer reference; immutable service/type/price/currency/quantity/refund-policy snapshot. Do not persist passenger index or leg order as surrogate relationships. Deactivate catalog rows rather than deleting history.
- New bookings persist a `BookingSegment` row for every itinerary leg, including leg 1, while retaining existing primary-flight fields for compatibility. Backfill creates only missing leg-1 rows. Audit downstream itinerary, fare-quota, cancellation, ticket, and email readers for double-counting.
- Snapshot lifecycle: `held → confirmed` after successful payment; `held → released` on valid cancel/expiry; `confirmed → released` only after a permitted successful whole-booking refund transition. Repeated callbacks/jobs are no-ops.

- [x] Add model/association tests for real segment/passenger/booking FKs, immutable snapshots after offer deactivation, and legacy bookings without ancillary rows.
- [x] Add migrations/models/associations and primary-leg persistence/backfill without executing migrations.
- [x] Verify existing itinerary, inventory-release, ticket, and email readers do not double-count leg 1 through regressions.
- [x] Review migration definitions and constraints without running them.

### Task 2: Canonical Ancillaries module and Admin API

**Files:**
- Create: `modules/ancillaries/ancillaries.repository.js`
- Create: `modules/ancillaries/ancillaries.service.js`
- Create: `modules/ancillaries/ancillaries.controller.js`
- Create: `modules/ancillaries/index.js`
- Create: `routes/ancillaries.route.js` (legacy route adapter)
- Modify: `application/buildContainer.js` (**PENDING OWNER REVIEW**)
- Modify: `application/registerModules.js` (**PENDING OWNER REVIEW**)
- Modify: `frontend/src/app/AppRouter.jsx` (**PENDING OWNER REVIEW**)
- Modify: `frontend/src/features/admin/AdminDashboardPage.jsx` (**PENDING OWNER REVIEW**)
- Create: `frontend/src/features/admin/AncillariesAdminPage.jsx`
- Create: `frontend/src/features/admin/AncillariesAdminPage.test.jsx`
- Create: `frontend/src/features/admin/ancillariesAdmin.css`
- Test: `tests/ancillariesModule.test.js`
- Test: `tests/ancillariesRepository.test.js`
- Test: `tests/ancillaryCapacity.test.js`

**Interfaces:**
- `listOffers({ flightId, fareClassId, activeOnly, transaction })` returns configured real offers and remaining capacity; reservation locks offers in stable ID order.
- `GET /api/v1/ancillaries?flight_id=&fare_class_id=` returns configured customer-visible offers only.
- Admin-only `GET/POST /api/v1/ancillaries/admin/services`, `PUT/DELETE /api/v1/ancillaries/admin/services/:id`, `GET/POST /api/v1/ancillaries/admin/offers`, and `PUT/DELETE /api/v1/ancillaries/admin/offers/:id` manage catalog and exact flight/FareClass applicability; DELETE is soft deactivation.
- Deactivation preserves historical bookings; no hard deletion of referenced service snapshots.

- [x] Add repository, module/route registration, Admin UI, eligibility, currency, capacity, and concurrent reservation tests.
- [x] Implement Sequelize repository, service validation, injected controller/router, registration, and Admin form/list UI.
- [x] Run module/UI tests; mark shared-owner files pending review.

### Task 3: Booking selection, repricing, and immutable snapshots

**Files:**
- Modify: `modules/booking/booking.service.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/booking/booking.repository.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/booking/booking.controller.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/booking/booking.route.js` (**PENDING OWNER REVIEW**)
- Modify: `validators/booking.validator.js` (**PENDING OWNER REVIEW**)
- Modify: `models/booking.js`
- Modify: `modules/ancillaries/ancillaries.repository.js`
- Modify: `modules/ancillaries/ancillaries.service.js`
- Modify: `frontend/src/features/bookings/BookingPages.jsx` (**PENDING OWNER REVIEW**)
- Modify: `frontend/src/features/bookings/BookingPages.test.jsx` (**PENDING OWNER REVIEW**)
- Test: `tests/bookingAncillaries.test.js`

**Interfaces:**
- Booking creation accepts `ancillary_selections: [{ offer_id, leg_order, passenger_index, quantity }]`; it ignores/rejects client prices.
- `PUT /api/v1/bookings/:id/ancillaries` replaces optional selections only while booking is `holding` and has never created any Payment intent. This conservatively avoids editing totals while any provider intent might remain payable; no cancellation API for old provider intents is invented.
- Ancillaries service validates offer/flight/fare/passenger/leg/quantity/capacity/currency under the caller's Sequelize transaction, resolves actual Passenger and BookingSegment IDs, and returns immutable snapshots plus a server-calculated subtotal using exact minor-unit arithmetic.
- Booking replacement locks the booking and old/new offers in deterministic order, then releases old held capacity and reserves new capacity atomically; any validation/capacity failure rolls back snapshots, capacity, and repricing.
- Missing ancillary rows on legacy bookings remain valid and preserve the existing no-ancillary booking path.
- Keep the current promotion validation and discount calculation unchanged on the fare subtotal; add the independently validated ancillary subtotal after that discount. Persist the resulting amount in `bookings.total_amount`, which remains authoritative for Payment.

- [x] Add booking creation, server pricing, itinerary rollback, payment-intent lock, replacement atomicity/rollback, and legacy/no-ancillary regression tests.
- [x] Inject the Ancillaries service into canonical BookingModule; reserve capacity and persist snapshots in the existing transaction.
- [x] Add authorized update route with the existing guest/user booking access policy; preserve seat/inventory behavior.
- [x] Add optional selection/review controls to the booking UI, including configured quantity controls; use server pricing and block edits after intent creation.
- [x] Run Booking itinerary, inventory, seat-selection, booking and frontend booking regressions.

### Task 4: Payment intent consistency and refund policy

**Files:**
- Modify: `modules/payment/payment.service.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/payment/payment.repository.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/booking/booking.repository.js` (**PENDING OWNER REVIEW**)
- Test: `tests/paymentAncillaries.test.js`
- Test: `tests/paymentIdempotency.test.js`
- Test: `tests/bookingPaymentLifecycle.test.js`
- Test: `tests/ancillaryCapacityLifecycle.test.js`

**Interfaces:**
- Payment always reads the persisted `booking.total_amount`; no per-service or per-leg payment is created.
- A booking with `pending_payment` status or a pending Payment cannot have ancillary selections or price changed.
- Successful payment confirms held ancillary capacity once. Valid cancel/expiry releases held capacity; successful permitted whole-booking refund releases confirmed capacity once. Do not release while Payment is validly processing.
- Refundable snapshot lines remain eligible only when the existing whole-booking refund policy permits. Do not create a partial-refund provider operation; if non-refundable ancillary value makes the current full-payment refund unsafe, reject before changing booking/payment/inventory/seat/ancillary state.
- Existing idempotency fingerprint includes the final booking amount; callback/reconciliation retries cannot duplicate ancillary state or refund.

- [x] Add Payment lifecycle regressions for confirmation, pending-payment release guard, duplicate callback/refund, and non-refundable precheck.
- [x] Implement minimal transaction/locking integration without changing provider callback contracts.
- [x] Run Payment Idempotency, Booking expiry/cancel, Inventory Lock and Seat Selection lifecycle regressions.

### Task 5: Booking summaries, Ticket/PDF, and confirmation email

**Files:**
- Modify: `modules/booking/booking.repository.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/ticket/ticket.repository.js` (**PENDING OWNER REVIEW**)
- Modify: `modules/ticket/ticket.service.js` (**PENDING OWNER REVIEW**)
- Modify: `services/email.service.js` (**PENDING OWNER REVIEW**)
- Modify: `frontend/src/features/bookings/BookingPages.jsx` (**PENDING OWNER REVIEW**)
- Modify: `frontend/src/features/bookings/PaymentPages.jsx` (**PENDING OWNER REVIEW**)
- Test: `tests/ticketPdf.test.js`
- Test: `tests/emailConfirmation.test.js`
- Test: `frontend/src/features/bookings/BookingPages.test.jsx`
- Test: `frontend/src/features/bookings/PaymentPages.test.jsx`

- [x] Add regression assertions for multi-leg PDF and confirmation email snapshot lines and legacy one-way output.
- [x] Extend repository includes and render snapshot details while retaining existing one-way output.
- [x] Verify PDF buffer content and fake email transport; no live email sent.
- [x] Run ticket/email and booking/payment suites.

### Task 6: Full regression, isolated MySQL gate, and feature delivery

**Files:**
- Test: all affected backend/frontend tests above.

- [x] Run the final full backend suite twice, full frontend suite, production build, syntax checks, and `git diff --check` after the last edits.
- [ ] MySQL migration/transaction/concurrency verification is `UNVERIFIED`; no database was accessed and no migration was run.
- [ ] Review exact staged diff, secrets scan, owner-review file list, and stacked ancestry.
- [ ] Commit final verified scope; normal push to `booking-payment/booking-payment-ancillaries`; verify remote SHA.
- [x] Do not merge to `feature/booking-payment`, `develop`, or `main`; prepare owner-review notes and the next Manage Booking plan only.
