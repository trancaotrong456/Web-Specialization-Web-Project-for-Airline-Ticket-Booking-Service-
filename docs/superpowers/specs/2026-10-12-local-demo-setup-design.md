# Local Docker Demo Setup Design

## Goal

Provide a repeatable local onboarding path for the Serene Flightways demo using the existing Docker Compose stack and a committed, shared fixture seeder. A contributor should start local services, review a read-only seed plan, explicitly confirm additive seed writes, and run the frontend without manually entering rows or credentials.

## Scope and constraints

- Work only on the existing `feature/auth` branch, based on `origin/develop` at `2b03e44938f650b4295487befed0e7f8258ee3bd`; do not create a branch.
- Keep Auth/User/Role behavior unchanged except for the existing demo fixture seeder. Do not modify Flight, Booking, Payment, GPS, database schema, or the submitted Word report.
- Never run the 100,000-user seeder, `db:seed:all`, database reset, volume deletion, or destructive cleanup.
- Demo data is additive and idempotent. Existing users and their passwords, existing schedules, promotion usage counts, bookings, and payments must remain unchanged.
- These exact public test-only credentials are fixed shared fixtures: Admin `admin@airline-booking.local` / `DemoAdmin@2026!`; Staff `staff.demo@airline-booking.local` / `DemoStaff@2026!`; Customer `customer.demo@airline-booking.local` / `DemoCustomer@2026!`.
- Demo passwords are bcrypt-hashed using the existing Auth mechanism. They are never updated for existing users and may only be seeded after Docker/Compose identity and database safety checks establish the dedicated local `airline_booking_docker` target. They must never be used on staging or production.
- All shared demo rows are committed fixtures/seeders: roles, airlines, airports, flights, fare classes, promotions, and the three accounts. No member-specific password entry or random password generation is required.

## Recommended approach

1. Add a small `scripts/demo-setup.js` orchestrator and `npm run demo:setup` entrypoint. Validate the local Docker socket and Compose configuration, start only the project’s `api` and `db` services, and wait for health/migrations before any seeding.
2. Run the seed plan read-only first. Print the verified Compose project/database identity and existing/planned counts. Before any seed transaction, require an interactive confirmation phrase. Non-interactive runs stop safely; no implicit `--yes` mode is added.
3. Keep all fixed shared fixture data in committed seeders/fixture code. Reuse the existing roles, airlines, and airports seeders only if they pass idempotency review; otherwise add a narrowly scoped safe bootstrap path rather than invoking all seeders. Seed fixed demo users with bcrypt, and skip existing users without password/profile/role mutation. Seed flights/fare classes/promotions via the existing guarded transaction, derive a future Vietnam date for a new schedule, preserve complete existing schedules, and refuse partial/conflicting schedules. Never create Booking/Payment rows.
4. Replace the tracked `docker.env` with tracked `docker.env.example`; add local `docker.env` to `.gitignore`. The setup command may copy the example only when the local file is absent, never overwrite it. README must explain backing up an existing `docker.env` before pulling the removal commit, restoring it after pull, or creating it from the example when no local copy exists.
5. Add isolated tests for orchestration decisions, confirmation behavior, fixed credentials and hashing, idempotency/conflict behavior, target rejection, and no Booking/Payment writes. Use injected Docker/process/model adapters; never touch the real demo DB from unit tests.

## Alternatives considered

- Keep `demo:setup` dry-run only and require a separate `seed:demo:docker -- --apply` command. This is safest but does not meet the requested one-command onboarding experience.
- Automatically apply on every `demo:setup` invocation. This is simpler but removes a clear review point before database writes and is not recommended.

## Error and safety behavior

- Reject remote Docker contexts, wrong Compose project/service labels, non-development API config, non-local DB host, any database other than `airline_booking_docker`, or a non-writable/read-only/unhealthy database.
- Do not stop unrelated processes when host ports are occupied; report the conflict.
- Do not overwrite local environment files or print password values. The only committed passwords are the exact public test-only demo fixtures listed above; Docker/payment/API secrets are not added to source.
- Reuse the current transaction-wrapped seeder and its structural conflict checks. Any conflict aborts the transaction and reports the reason without deleting or repairing existing data.
- If Docker host access is unavailable, source/unit-test work can proceed, but no integration result may be reported as verified.

## Validation

- Unit tests cover first run, rerun, partial state, collisions, wrong environment, exact fixture identities/roles, password hashing and skip-existing semantics, and proof that Booking/Payment tables are not written.
- Run backend tests, demo-seeder safety tests, frontend tests/build, and `git diff --check`.
- Where Docker access is approved, run Compose health checks and seeder dry-run first; apply only after the user’s explicit runtime confirmation, then verify counts and rerun dry-run.
- Review the final diff for exact scope and only the public demo-only fixture credentials before commit/push to the existing `feature/auth` branch.

## Known implementation gate

Docker access from the current Codex sandbox was denied by the Windows named-pipe permission boundary, and HTTPS access to GitHub was unavailable. This does not establish that Docker Engine or GitHub is unhealthy. Source changes and isolated tests can proceed; Docker integration and push must be reported blocked unless a permitted host/remote path becomes available.
