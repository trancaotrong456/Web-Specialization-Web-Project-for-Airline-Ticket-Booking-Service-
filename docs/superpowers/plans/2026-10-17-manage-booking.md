# Manage Booking Implementation Plan

**Goal:** Improve customer and admin booking management using the existing canonical Booking, Payment, Ticket, Inventory, Seat Selection and Ancillaries modules.

**Architecture:** Extend the current Booking module and existing `/bookings/my-bookings`, `/bookings/admin/all` and detail APIs. Add an append-only booking status history for real lifecycle transitions. Keep cancellation limited to the existing `holding` rule and refunds to the existing whole-booking Admin flow; do not add flight changes or new refund policy.

**Tech Stack:** Express CommonJS, Sequelize/MySQL, React Router, Vitest, Node test runner.

**Spec:** User request in this conversation; project rules in `AGENTS.md`.

## Global Constraints
- Keep the existing Modular Monolith and API response/auth contracts.
- Do not run migrations or seeders against demo/production databases.
- Preserve all existing untracked files and stashes; never stage unrelated paths.
- No invented change-fee, refund, or cancellation policy.
- MySQL concurrency/integration is UNVERIFIED unless an isolated test database is explicitly verified.

## Review Focus
- A customer search/filter must remain scoped to authenticated `user_id`; test cross-owner denial.
- Admin list search must cover booking code/customer and flight without broadening details access to Staff.
- Every logged lifecycle transition must be written in the same transaction as the Booking state update.
- Existing bookings without itinerary, seat, ancillary, or status-history rows must still render.
- Cancellation/refund controls must remain unavailable outside current backend-allowed states.

### Task 1: Characterize existing lifecycle and access
- Tests: extend `tests/bookingPaymentLifecycle.test.js`, `tests/bookingPaymentContract.test.js`, and `frontend/src/features/bookings/BookingPages.test.jsx` before implementation.
- Verify RED for customer search, admin flight filtering, status timeline, payment/refund visibility, and legacy bookings.

### Task 2: Booking query filters and status history
- Add `models/booking_status_history.js` and an additive migration.
- Add a Booking association and repository methods for history and safe filtered lists.
- Record create/hold/payment/confirm/cancel/expire/refund transitions transactionally in Booking/Payment services.
- Add Admin-only history to Booking detail; preserve customer ownership checks and Staff list-only behavior.

### Task 3: Customer/admin Manage Booking UI
- Extend `bookingsApi.js` and `BookingPages.jsx` for customer booking-code search, Admin customer/code/flight/status filters, segment/passenger/seat/ancillary/payment/refund detail, and real status history.
- Keep cancel available only for `holding`, ticket download only for `confirmed`, and Admin refunds routed through existing Payment workflow.
- Do not implement itinerary change requests without an existing policy.

### Task 4: Verification and delivery
- Run focused Booking/Payment/Ticket tests, full Backend and Frontend suites, production build, syntax checks, and diff checks.
- Do not run database migrations; mark MySQL integration UNVERIFIED.
- Stage only Manage Booking files and commit only if the configured Git identity is confirmed as the assigned Booking owner.
- Push only a normal fast-forward to the requested feature branch and verify its remote SHA; do not merge to the parent/develop/main.
