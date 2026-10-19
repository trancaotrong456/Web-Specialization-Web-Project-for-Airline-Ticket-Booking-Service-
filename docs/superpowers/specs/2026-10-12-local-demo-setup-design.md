# Local Docker Demo Setup Design

## Goal

Provide one safe host-controlled local onboarding command for the Serene Flightways demo using the existing Docker Compose stack and committed shared fixtures. Contributors run `npm run demo:up`; it verifies local Docker, migrates, additively seeds missing fixtures, and only then starts a ready API, without separate Seeder commands or an interactive confirmation prompt.

## Scope and constraints

- The current implementation is on the existing `feature/local-demo-setup` branch, based on fetched `origin/develop`; do not create another branch.
- Keep Auth/User/Role behavior unchanged except for the existing demo fixture seeder. Do not modify Flight, Booking, Payment, GPS, database schema, or the submitted Word report.
- Never run the 100,000-user seeder, `db:seed:all`, database reset, volume deletion, or destructive cleanup.
- Demo data is additive and idempotent. Existing users and their passwords, existing schedules, promotion usage counts, bookings, and payments must remain unchanged.
- These exact public test-only credentials are fixed shared fixtures: Admin `admin@airline-booking.local` / `DemoAdmin@2026!`; Staff `staff.demo@airline-booking.local` / `DemoStaff@2026!`; Customer `customer.demo@airline-booking.local` / `DemoCustomer@2026!`.
- Demo passwords are bcrypt-hashed using the existing Auth mechanism. They are never updated for existing users and may only be seeded after Docker/Compose identity and database safety checks establish the dedicated local `airline_booking_docker` target. They must never be used on staging or production.
- All shared demo rows are committed fixtures/seeders: roles, airlines, airports, flights, fare classes, promotions, and the three accounts. No member-specific password entry or random password generation is required.

## Approved host-side architecture

1. `scripts/demo-up.js` owns Docker context verification and Compose orchestration on the host. It checks the effective context endpoint plus `DOCKER_HOST`, `DOCKER_CONTEXT`, TLS and Compose configuration overrides; only known local Docker sockets are accepted.
2. The host starts only the verified Compose DB and a private bootstrap agent, waits for MySQL health, validates service/project labels and the exact demo DB, then runs migrations and the existing guarded Seeder inside the bootstrap container. It reads a dry-run first and automatically applies only missing fixtures; a second dry-run must report zero missing records.
3. Compose API depends on bootstrap `service_completed_successfully`. The host marks a durable non-secret state file in a dedicated named volume only after migration/seed verification, then cleanly stops the bootstrap agent and starts API. API checks the marker against live MySQL DB name, container identity and read-only status before listening. Direct `docker compose up` on an uninitialized stack therefore cannot report a healthy/ready API.
4. No Docker socket is mounted in containers. Bootstrap has no published ports and cannot access Docker Engine. Production startup continues through the Dockerfile/default server path and does not require the demo marker or fixtures.
5. Keep `demo:setup` as an interactive maintenance/review helper for an already bootstrapped stack. Normal first setup is the explicitly invoked `npm run demo:up`; it does not ask for a second confirmation prompt.
6. Retain fixed shared credentials and fixtures, bcrypt hashing, skip-existing semantics, date-stable schedules, conflict checks and transaction guards. Never create Booking/Payment rows or invoke the 100,000-user Seeder.
7. `docker.env` remains local and ignored; create it from `docker.env.example` only when absent and never overwrite it. Keep migration guidance for members who previously had a tracked `docker.env`.
8. Unit tests inject Docker/process adapters and exercise local/remote/unknown contexts, engine unavailable, invalid DB config, migration/seed failures, first run/rerun, API start ordering, marker validation and additive/idempotent Seeder behavior. They never access the existing demo DB.

## Explicit tradeoff

Invoking `npm run demo:up` is the user's explicit intent to prepare the local demo DB. The command still refuses unless the host socket, Compose service identities and MySQL target are positively verified. This removes the extra interactive prompt while retaining fail-closed runtime identity checks. `demo:setup` remains available when a human wants to inspect a preview and separately confirm maintenance apply.

## Error and safety behavior

- Reject remote Docker contexts, wrong Compose project/service labels, non-development API config, non-local DB host, any database other than `airline_booking_docker`, or a non-writable/read-only/unhealthy database.
- Do not stop unrelated processes when host ports are occupied; report the conflict.
- Do not overwrite local environment files or print password values. The only committed passwords are the exact public test-only demo fixtures listed above; Docker/payment/API secrets are not added to source.
- Reuse the current transaction-wrapped seeder and its structural conflict checks. Any conflict aborts the transaction and reports the reason without deleting or repairing existing data.
- If Docker host access is unavailable, source/unit-test work can proceed, but no integration result may be reported as verified.

## Validation

- Unit tests cover first run, rerun, partial state, collisions, wrong environment, exact fixture identities/roles, password hashing and skip-existing semantics, and proof that Booking/Payment tables are not written.
- Run backend tests, demo-seeder safety tests, frontend tests/build, and `git diff --check`.
- Run Compose host-verification tests, bootstrap gating tests, Seeder safety tests, backend tests, frontend tests/build, and `git diff --check`.
- Where a real local Docker engine is available, run the read-only DB identity preflight, migrations and dry-run before additive apply, then verify counts and rerun dry-run. Never run this sequence against the user's existing database during code-only validation.
- Review the final diff for exact Demo Setup scope and only the public demo-only fixture credentials before commit/push to the existing `feature/local-demo-setup` branch.

## Environment note

The earlier implementation attempt could not access the Windows Docker named pipe from the Codex sandbox. This does not establish that Docker Engine is unhealthy. Source changes and isolated tests can proceed; report real Docker integration as blocked unless a subsequent permitted host check succeeds. GitHub push likewise requires a working remote credential and fast-forward preflight.
