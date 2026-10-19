# Express Modular Monolith Implementation Plan

> **For implementation:** Use the `superpowers:executing-plans` skill to carry out this plan one stage at a time. Do not begin source work until the owner reviews and approves this plan.

**Goal:** Incrementally move the existing Express/CommonJS backend to explicit feature modules with constructor/factory dependency injection, repository boundaries, Express-compatible guards/validation/error filters, and a centralized composition root, without changing observable behavior.

**Architecture:** Keep current repository-root layout and add `application/`, `modules/`, and narrowly scoped `shared/` folders. Build an explicit composition root and app factory; migrate Airline first as a vertical slice. The module factory owns the canonical router/service/controller/repository graph. A module-local lazy default AirlineModule is shared by legacy service/router forwarders and composition root; test factories can still inject fakes. The process entry point alone owns database connection, cron, Socket.IO and HTTP listener lifecycle.

**Runtime:** Node.js, Express, CommonJS, Sequelize, MySQL, express-validator, Node built-in test runner. No new runtime dependency.

## Global constraints

- Work only in `codex/express-modular-refactor` and its dedicated worktree. Before every stage, inspect `git status`, current HEAD and `git diff`; never overwrite or discard existing changes.
- Before source implementation and again before any later integration, verify GitHub refs from the network (not stale remote-tracking refs alone), inspect new commits/path overlap, and stop on non-fast-forward or unsafe conflicts. Do not touch `ui/stitch-redesign` or `feature/local-demo-setup` worktrees.
- Preserve routes, HTTP verbs, middleware order, RBAC, validation/sanitization, response envelope/fields, status codes, Sequelize query options, transaction boundaries, JWT behavior, WebSocket contracts, cron timing/config, and Docker startup.
- No migration, seeder, snapshot, database, fixture, frontend or report changes. Tests must use fakes/mocks or an explicitly isolated test database; never write demo/production data.
- Retain `services/airline.service.js` and `routes/airline.route.js` as thin adapters while any code/tests use them. Both must resolve to the one canonical AirlineModule default instance; never keep parallel implementations or mount duplicate routers. Removal requires zero-import evidence, migration of all supported consumers, intentional compatibility-test disposition, and owner approval.
- Every stage ends with focused tests, `git diff --check`, a diff/path review, and a small descriptive commit on the feature branch. No push/merge without separate approval.

## Review focus and risk-to-test mapping

1. **HTTP/RBAC/validation compatibility risk:** route contract, request-level authorization, validation and response characterization tests must pin method/path/order/status/body.
2. **Sequelize behavior drift risk:** mocked repository tests must assert attributes, `where`, `Op`, ordering, offset/limit, return values and error mapping exactly.
3. **Composition/lifecycle side-effect risk:** import `app.js` under spies and prove no DB authenticate, cron scheduling, Socket.IO initialization, HTTP listen or duplicate route mount occurs.
4. **Legacy import and DI split-brain risk:** require old and new paths and assert service/router identity; instantiate an isolated module with fake repository and assert controller/service isolation.
5. **Cross-module transaction/event risk:** before each later migration add characterization tests for existing transaction object propagation, row locks, event names/payloads and callback/webhook behavior; leave Booking/Payment until last.

## Stage 0 — Reconfirm baseline and characterize current behavior

**Files:** no production files. Add only narrowly scoped characterization tests if existing coverage does not already pin a required behavior. The verified suite contains `tests/runtimeValidation.test.js`, `tests/rbacMiddleware.test.js`, `tests/rbacRouteMatrix.test.js`, `tests/authHeader.test.js`, `tests/authRouteContract.test.js`, and `tests/authSecurity.test.js`; there is no `tests/errorHandler.test.js` yet.

**Actions:**

1. Reconfirm branch/worktree/HEAD and clean-vs-dirty status; verify the spec and this plan are the only documentation changes so far.
2. Query remote develop safely and inspect any commits since the recorded base. Check ancestry and changed paths for conflicts; do not merge them into the main checkout.
3. Record route stack and middleware sequence for all modules, startup responsibilities in `app.js`/`server.js`, module import graph, current test commands, and test baseline.
4. Run the existing backend suite and record actual count/result before touching runtime source.
5. Add missing characterization assertions only for behaviors already present; do not change the implementation to make characterization easier.

**Tests:** first run `npm test` to capture the baseline. Add `tests/errorHandler.test.js` because no equivalent focused error-handler test exists, covering current Sequelize validation/unique/FK, custom `statusCode`, and fallback responses. Reuse existing `tests/runtimeValidation.test.js`, `tests/rbacMiddleware.test.js`, `tests/rbacRouteMatrix.test.js`, `tests/authHeader.test.js`, `tests/authRouteContract.test.js`, and `tests/authSecurity.test.js`; do not create duplicate tests under guessed names. Focused Airline suites: `node --test tests/airlineRouteContract.test.js tests/airlineService.test.js tests/airlineValidation.test.js`. Always run `git diff --check`.

**Acceptance:** source baseline is known; current tests pass or pre-existing failures are documented; no data-writing command was used; exact Airline contract in the specification matches source and tests.

**Commit:** `test(backend): characterize modular refactor baseline` (the missing error-handler characterization is expected here; no production code changes).

## Stage 1 — Foundation: composition root and safe app construction

**Files to add:**

- `application/buildContainer.js` — explicit providers/dependencies and module construction; no implicit process startup.
- `application/registerModules.js` — one registration point, initially delegating to the existing API route tree without re-mounting its children.
- `shared/http/filters/createErrorFilter.js` — injectable error mapper derived from the current error middleware.
- `shared/http/filters/errorHandlerAdapter.js` — Express `(err, req, res, next)` adapter.
- `tests/applicationComposition.test.js` — registration count/order and dependency graph tests.
- `tests/appImportSafety.test.js` — side-effect guard on importing app.

**Files to modify:**

- `app.js` — expose a backward-compatible app export/factory; retain existing middleware ordering, 404 and final error handler.
- `server.js` — keep lifecycle here; call app/container construction without causing import-time connection/listen side effects.
- `routes/index.js` — if needed, make this a compatibility forwarder into the centralized registration function; preserve every existing child mount and order exactly once.
- `middlewares/errorHandler.middleware.js` — forward into the extracted filter while preserving its existing export and response contract.
- `tests/errorHandler.test.js` and applicable app/runtime tests — characterize identical envelope/status mapping.

**Implementation sequence (test-first):**

1. Add tests that importing `app.js` does not call `sequelize.authenticate`, schedule jobs, initialize Socket.IO, or call `http.Server.listen`.
2. Add tests proving module registration order/prefixes and each route is registered exactly once.
3. Add parity tests for current custom errors and Sequelize validation/unique/FK errors (status and exact response JSON, including production-safe messages).
4. Extract the current error mapping without changing branches, field names or codes; run focused tests.
5. Introduce `buildContainer`/`registerModules` as explicit factories with injected infrastructure and no global service locator. At this stage preserve the existing route tree as one unit; do not mount each existing feature router a second time.
6. Convert `app.js` to safe composition only. Keep `server.js` as the only owner of runtime initialization and listening; retain lifecycle ordering and existing startup failure behavior.
7. Run all existing app/runtime/socket/job tests and full backend tests.

**Tests:** `node --test tests/errorHandler.test.js tests/applicationComposition.test.js tests/appImportSafety.test.js tests/runtimeValidation.test.js`; full `npm test`; `git diff --check`.

**Acceptance:** importing app for tests has no process side effects; the default production startup still initializes DB, Socket.IO, cron and listener exactly once in the existing order; API 404/error responses are byte-for-byte equivalent in tested cases; the pre-existing API route tree is mounted once and no endpoint duplicates.

**Commit:** `refactor(backend): add explicit application composition foundation`.

## Stage 2 — Shared Express adapters and AirlineModule DI seam

**Files to add:**

- `shared/http/guards/createAuthGuards.js` — injected adapters over current `authenticate`, `optionalAuth`, and `authorize` implementations; no new role matrix.
- `shared/http/validation/validationAdapter.js` — thin injectable wrapper around current express-validator `validate` middleware.
- `modules/airline/index.js` — `createAirlineModule(deps)` and module-local lazy `getDefaultAirlineModule()`; returns one router, service, controller and repository.
- `modules/airline/airline.validators.js` — initially forwards/reuses existing validator definitions without duplicating rules.
- `tests/httpAdapterCompatibility.test.js` — exact guard/validation behavior parity, using existing RBAC/Auth tests as baseline contracts.
- `tests/airlineModuleFactory.test.js` — isolated module-factory construction with a fake repository and injected middleware/validation dependencies; no MySQL.

**Files to modify:**

- None in the active production route graph. The existing auth/validation middleware stays untouched and is injected by identity.
- Stage 2's module factory is an isolated DI seam only; it is not mounted. `application/buildContainer.js`, `application/registerModules.js`, `routes/index.js`, and `app.js` are wired to the AirlineModule atomically in Stage 3, when legacy forwarding adapters and identity tests are ready.

**Implementation sequence (test-first):**

1. Pin middleware response behavior: unauthenticated read/write, staff write, admin write, optional auth, invalid body and error ordering.
2. Add a module-factory test proving a router can be constructed with fake injected controller/guard/validation dependencies without Sequelize or MySQL. This test router is not mounted in the running app during Stage 2.
3. Implement the factory/DI seam only; do not move the old route/controller/service or create a second active implementation in this stage.
4. Assert the factory route definitions and middleware sequence once. Production continues to mount only the existing Airline router until Stage 3 replaces it atomically.

**Tests:** `node --test tests/httpAdapterCompatibility.test.js tests/airlineModuleFactory.test.js tests/airlineRouteContract.test.js tests/rbacMiddleware.test.js tests/rbacRouteMatrix.test.js tests/authHeader.test.js tests/authRouteContract.test.js`; full `npm test`; `git diff --check`.

**Acceptance:** no new permission semantics; existing middleware exports remain compatible; factory uses injected fakes and needs no live DB; production still has only its original Airline service/controller/router active; the test-created factory router is not mounted. Legacy identity assertions are deferred until Stage 3 converts both old paths to forwarders.

**Commit:** `refactor(backend): add injectable HTTP adapters for Airline`.

## Stage 3 — AirlineModule repository/service/controller vertical slice

**Files to add:**

- `modules/airline/airline.repository.js` — Sequelize repository implementing `findPage`, `findById`, `findByIataCode`, `create`, `update`, `countFlightsByAirlineId`, and `delete`.
- `modules/airline/airline.service.js` — injected repository; owns current normalization, 404/409 behavior and return contract.
- `modules/airline/airline.controller.js` — injected service/response helper; only HTTP extraction, response writing and `next(error)`.
- `tests/airlineRepository.test.js` — exact Sequelize options and model delegation with fake models.
- `tests/airlineModuleDI.test.js` — fake repository, controller/service isolation, old/new object identity.
- `tests/airlineHttpParity.test.js` — route, auth, validator, response and status contract.

**Files to modify:**

- `modules/airline/index.js` — construct the vertical slice from concrete injected dependencies.
- `services/airline.service.js` — replace implementation with thin forwarder exporting the canonical default `service` object.
- `routes/airline.route.js` — replace implementation with thin forwarder exporting the canonical default `router` object.
- `application/buildContainer.js`, `application/registerModules.js`, route aggregator — wire and mount the canonical default module once at current `/api/v1/airlines`.
- `controllers/airline.controller.js` — replace implementation with a thin forwarder to the canonical default controller, preserving import identity.
- `tests/airlineService.test.js`, `tests/airlineRouteContract.test.js`, `tests/airlineValidation.test.js` — preserve these tests and add assertions only; do not weaken or delete existing expectations.

**Required repository semantics:**

- `findPage({page, limit, search})`: use `offset=(page-1)*limit`; optional `Op.or` with `name LIKE %search%` and `iata_code LIKE %search%`; order `name ASC`; exact attributes `id,name,iata_code,logo_url,created_at,updated_at`; return `{count,rows}`.
- `findById(id)`: `findByPk` with the same attribute set.
- `findByIataCode(code,{excludeId})`: exact equality and, when supplied, `id: {[Op.ne]: excludeId}`; retain the existing `where`-only options (no added projection).
- `create(values)`: `Airline.create`; `update(instance,values)` and `delete(instance)` delegate to that instance; `countFlightsByAirlineId(id)` delegates to `Flight.count({where:{airline_id:id}})`.
- Repository owns Sequelize operators, options, and persistence calls. Service owns current page/limit parsing/clamping, search trim, payload normalization, duplicate precheck/error mapping, 404, update-only-supplied-fields, flight reference conflict, and result shapes. For `logo_url`, preserve the actual behavior: falsy/missing input maps to `null`, while truthy input is trimmed; on HTTP routes the existing validator trims whitespace first, making whitespace-only input falsy before service execution.
- Do not introduce a transaction or change lookup → count → destroy ordering.

**Implementation sequence (test-first):**

1. Add repository tests first for exact list query options and each model operation.
2. Add service tests with a mocked repository for all existing rules: defaults/clamps/search, trim/uppercase/logo null, duplicate create/update, unique-race error mapping, 404, update allowlist, flight delete conflict and successful delete result.
3. Add controller isolation tests using a fake service and response helper, and invoke injected handlers through Express over an ephemeral HTTP server so binding/context defects surface as HTTP failures.
4. Implement repository, service and controller classes; then wire module factory.
5. Convert old service/router paths to identity-preserving forwarders. Ensure old direct consumers do not instantiate another service or router.
6. Test that requiring `services/airline.service.js` equals the canonical default service, requiring `routes/airline.route.js` equals the canonical default router, and the composition root resolves those same instances.
7. Mount the canonical router once; assert effective `/api/v1/airlines` URLs, no legacy+new double mount, exact middleware order, and one endpoint registration per method/path.
8. Run focused API/route/HTTP tests and full backend tests. No integration against non-isolated MySQL.

**Tests:**

```powershell
node --test tests/airlineService.test.js tests/airlineRepository.test.js tests/airlineModuleDI.test.js tests/airlineModuleFactory.test.js tests/airlineRouteContract.test.js tests/airlineValidation.test.js tests/airlineHttpParity.test.js
npm test
git diff --check
```

**Acceptance:** existing three Airline test suites continue unchanged and pass; all added contract/DI/isolation/identity/registration/real-HTTP tests pass; controller methods work when Express invokes them; GET remains public and mutation remains Admin-only; no duplicated endpoint or legacy+canonical double mount; exact middleware order remains; no response, validation, query, status or business-rule drift; only `modules/airline`, minimal shared/application wiring, adapters and tests are changed. Stage 3 is independently runnable from a clean install and full backend regression.

**Commit:** `refactor(backend): migrate Airline to injected module layers`.

## Stage 4 — AirportModule

**Files:** add `modules/airport/{index.js,airport.controller.js,airport.service.js,airport.repository.js}` and focused `tests/airportRepository.test.js`, `tests/airportService.test.js`, `tests/airportController.test.js`, `tests/airportModuleFactory.test.js`, `tests/airportModuleDI.test.js`, and `tests/airportHttpParity.test.js`; convert existing Airport service/controller/route paths to identity-preserving adapters; update only Composition Root and route registration. The current Airport source has no validator middleware, so do not add one or introduce autocomplete/business behavior in this migration.

**Test-first/acceptance:** preserve list query (`name`, `iata_code`, `city`, raw search interpolation, `city ASC`, existing pagination/coercion and response types), detail 404, raw create/update payload behavior, delete flow without a Flight precheck, public GET, Admin-only mutations, and existing foreign-key error mapping. Verify repository query options, controller response methods, injected route guards/order, real HTTP responses, adapter object identity, exactly-one endpoint/mount, app import side-effect safety, and focused plus full backend tests. Every stage remains independently testable; no new Airport validator or business rule.

**Commit:** `refactor(backend): migrate Airport to module layers`.

## Stage 5 — PromotionModule

**Files:** add module layers under `modules/promotion/`; add repository/DI/HTTP parity tests; adapt legacy promotion service/route; register once.

**Test-first/acceptance:** lock actual Promotion fields, CRUD authorization, validation, used-count behavior, booking-related read paths and error contract from the current source. Do not alter `used_count`, redemption semantics, API, or data. Full existing Promotion/Booking tests pass.

**Commit:** `refactor(backend): migrate Promotion to module layers`.

## Stage 6 — FareClassModule, then FlightModule

**Files:** add `modules/fare-class/` first, then `modules/flight/`, each with route/controller/service/repository/validator forwarding files and isolated tests; adapt old routes/services and register each once.

**Test-first/acceptance:** characterize flight search joins, `pagination.total`, detail fares, seat availability, cancellation/deletion, FareClass ownership/update allowlist and all filters. Keep existing observed pagination behavior even if it contains a known backend defect; record it rather than silently fixing it during structural migration. Assert FareClass never changes `flight_id` if current service does not permit it. Preserve all API and authorization contracts. Full flight/fare-class suites pass.

**Commits:** `refactor(backend): migrate FareClass to module layers`; `refactor(backend): migrate Flight to module layers`.

## Stage 7 — UserModule and RoleModule, then AuthModule

**Files:** add modules under `modules/user/`, `modules/role/`, and `modules/auth/`; adapt existing routes/services; add DI/repository/HTTP parity suites; update composition root providers.

**Test-first/acceptance:** characterize password hashing/reset, refresh-token digest and legacy compatibility, JWT verification, locked account, role assignment constraints, RBAC and exact response/status behavior. Preserve the Auth security fix and role semantics. No new permission matrix or custom role behavior. Existing Auth/User/Role security tests pass.

**Commits:** one module-scoped commit each: `refactor(backend): migrate User to module layers`, `... Role ...`, `... Auth ...`.

## Stage 8 — TicketModule

**Files:** add `modules/ticket/` module layers and tests; preserve current Booking router path as the ticket route mount; do not relocate public URLs.

**Test-first/acceptance:** characterize ticket fetch authorization, response payload and Booking/Flight association reads. Confirm exactly one endpoint registration at its existing path. Run ticket and booking regression tests.

**Commit:** `refactor(backend): migrate Ticket to module layers`.

## Stage 9 — BookingModule and PaymentModule (last business modules)

**Files:** add `modules/booking/` and `modules/payment/`, repository ports/adapters and extensive tests; migrate existing services/controllers/routes only after separate pre-migration characterization passes.

**Test-first/acceptance:** pin transaction ownership, exact transaction propagation to every repository call, row locks/isolation, booking hold expiry, seat/fare quota consistency, passenger validation, cancellation, payment initiation, callbacks/webhooks, refund/revenue authorization, idempotency and Socket.IO events. Preserve return URLs, provider behavior and exact API/error contracts. Test on mocks or isolated test DB only; do not use demo/production DB. Full backend suite and isolated integration suite pass.

**Commits:** `refactor(backend): migrate Booking to module layers`; `refactor(backend): migrate Payment to module layers`.

## Stage 10 — Infrastructure lifecycle and complete centralized registration

**Files:** add adapters under `infrastructure/email/`, `infrastructure/realtime/`, `infrastructure/jobs/` and lifecycle coordinator only where required; update `server.js`, composition root and focused lifecycle tests.

**Test-first/acceptance:** prove email transport config, Socket.IO event names/payloads, cron schedule/flags and shutdown behavior remain unchanged. Server entry point starts each runtime provider once; importing app/container does not. Docker startup readiness and failure handling remain unchanged. No edits to Docker files in this refactor.

**Commit:** `refactor(backend): centralize infrastructure lifecycle wiring`.

## Stage 11 — Final regression, adapter audit and delivery review

**Files:** only fix files within the active refactor scope; tests and documentation of resulting architecture if needed. Do not delete a compatibility adapter without the conditions in Global constraints.

**Actions/tests:**

1. Search all runtime and test imports of old `routes/` and `services/` paths; report each remaining compatibility path.
2. Verify exact route table and middleware order against Stage 0 snapshot, including no duplicate mount.
3. Run full backend tests, frontend tests and production build (frontend should remain unchanged), seeder safety tests, `git diff --check`, syntax/lint checks available in package scripts, and isolated Docker smoke tests only if separately authorized and available.
4. Inspect complete diff for migrations, seeders, snapshots, API contracts, secrets and unrelated modules; expected result is no such changes.
5. Before returning results to the main project, fetch/verify current remote refs again, check ancestry and path overlap, and prepare a Git-based integration option. Do not copy files manually, push, merge or update the dirty main checkout without explicit approval.

**Acceptance:** every migrated module has the same external contract; all route and lifecycle tests pass; existing compatibility imports still work where used; no out-of-scope data/config change; owner receives commit list and an integration path that preserves the dirty primary checkout.

**Commit:** `test(backend): verify modular architecture compatibility` (only if this stage adds a test/documentation change; avoid empty commits).

## Final self-review checklist before implementation starts

- [ ] Owner approved the updated design specification and this plan.
- [ ] `origin/develop` is freshly verified; no assumption relies on stale tracking refs.
- [ ] Main dirty checkout and Demo Setup branch/worktree are untouched.
- [ ] Foundation and Airline exact contract have characterization tests before extraction.
- [ ] Compatibility adapter identity and exactly-once route mount have executable tests.
- [ ] `app.js` import side-effect test covers DB, cron, Socket.IO and HTTP listener.
- [ ] No migration, seeder, snapshot, database, frontend, Docker or report file is in the planned diff.
