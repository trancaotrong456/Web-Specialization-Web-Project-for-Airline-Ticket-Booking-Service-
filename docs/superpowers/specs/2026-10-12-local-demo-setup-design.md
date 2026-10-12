# Local Docker Demo Setup Design

## Goal

Provide a repeatable local onboarding path for the Serene Flightways demo using the existing Docker Compose stack and existing safe demo seeder. A contributor should be able to start the local services, review a read-only seed plan, explicitly confirm additive seed writes, and run the frontend without manually entering fixture rows or credentials.

## Scope and constraints

- Work only on the existing `feature/auth` branch, based on `origin/develop` at `2b03e44938f650b4295487befed0e7f8258ee3bd`; do not create a branch.
- Keep Auth/User/Role behavior unchanged except for the existing demo fixture seeder. Do not modify Flight, Booking, Payment, GPS, database schema, or the submitted Word report.
- Never run the 100,000-user seeder, `db:seed:all`, database reset, volume deletion, or destructive cleanup.
- Demo data is additive and idempotent. Existing users and their passwords, existing schedules, promotion usage counts, bookings, and payments must remain unchanged.
- Public demo passwords are intentionally test-only fixtures, must be bcrypt-hashed, and may only be used after Docker/Compose identity and database safety checks establish the dedicated local `airline_booking_docker` target.

## Recommended approach

1. Add a small `scripts/demo-setup.js` orchestrator and `npm run demo:setup` entrypoint. It validates the local Docker socket and Compose configuration, starts only the project’s `api` and `db` services, waits for health/migrations, and invokes the existing seeder rather than duplicating seed logic.
2. Run the seeder in dry-run mode first. Print the verified Compose project/database identity and existing/planned counts. Before any seed transaction, require an interactive confirmation phrase. Non-interactive runs stop safely and explain how to rerun interactively; no implicit `--yes` mode is added.
3. Keep fixtures in a dedicated source module consumed by the existing demo seed core. Define the three documented local accounts there; hash passwords with the current bcrypt mechanism. Existing accounts are skipped without password or profile updates. Continue using current airline/airport prerequisites and route/fare/promotion plan, with no Booking/Payment creation. Derive a future schedule date on first safe plan; detect and preserve a complete existing schedule on reruns, and refuse partial/conflicting schedules.
4. Replace the tracked machine-local `docker.env` with a tracked `docker.env.example`; add `docker.env` to `.gitignore`. The setup command may create a missing local copy from the example, but must never overwrite an existing local file. README instructions explain backing up a local file before pulling the removal commit and copying the example only when no local file exists.
5. Add isolated unit tests for orchestration decisions, confirmation behavior, credentials/fixture safety, idempotency/conflict behavior, target rejection, and no Booking/Payment writes. Test with injected Docker/process/model adapters; do not touch the real demo database in unit tests.

## Alternatives considered

- Keep `demo:setup` dry-run only and require a separate `seed:demo:docker -- --apply` command. This is safest but does not meet the requested one-command onboarding experience.
- Automatically apply on every `demo:setup` invocation. This is simpler but removes a clear review point before database writes and is not recommended.

## Error and safety behavior

- Reject remote Docker contexts, wrong Compose project/service labels, non-development API config, non-local DB host, any database other than `airline_booking_docker`, or a non-writable/read-only/unhealthy database.
- Do not stop unrelated processes when host ports are occupied; report the conflict.
- Do not overwrite ignored local environment files or print password values.
- Reuse the current transaction-wrapped seeder and its structural conflict checks. Any conflict aborts the transaction and reports the reason without deleting or repairing existing data.
- If Docker host access is unavailable, source/unit-test work can proceed, but no integration result may be reported as verified.

## Validation

- Unit tests cover first run, rerun, partial state, collisions, wrong environment, password hashing/skip-existing semantics, and proof that Booking/Payment tables are not written.
- Run backend tests, demo-seeder safety tests, frontend tests/build, and `git diff --check`.
- Where Docker access is approved, run Compose health checks and seeder dry-run first; apply only after the user’s explicit runtime confirmation, then verify counts and rerun dry-run.
- Review the final diff for exact scope and public demo-only fixture credentials before any commit/push to `feature/auth`.

## Known implementation gate

Docker access from the current Codex sandbox was denied by the Windows named-pipe permission boundary. This design does not treat that as a Docker Engine failure. Host-backed integration must remain blocked until an approved local execution path is available.
