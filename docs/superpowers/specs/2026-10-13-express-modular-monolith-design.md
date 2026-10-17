# Serene Flightways Express Modular Monolith — Design Specification

**Status:** Conditionally approved; implementation plan pending owner review
**Source baseline:** `origin/develop` at `eaed4634ab9dd577b83d551bff31f7fa9dd94e71` (fetched successfully from configured `origin`)
**Dedicated branch:** `codex/express-modular-refactor`
**Scope:** Backend architecture refactor; Airline is the proof-of-concept module.

## 1. Goals and non-goals

Keep Express.js, CommonJS, Sequelize, MySQL, and Docker. Evolve the existing backend incrementally into a NestJS-inspired modular monolith with feature modules, controllers, services, repositories, guards, dependency injection, exception filters, validation pipeline, and centralized bootstrap.

The work is structural only. Preserve every route, HTTP method, middleware order, request/response JSON shape, status code, JWT and RBAC rule, validation behavior, database query semantics, WebSocket event, cron behavior, and email/payment workflow. Do not edit migrations, seeders, snapshots, database data, or React. Do not add `@nestjs/*`, TypeScript, a DI framework, or unrelated abstractions.

## 2. Current architecture and verified boundaries

The current backend is organized in repository-root directories: `routes/`, `controllers/`, `services/`, `middlewares/`, `validators/`, `models/`, `jobs/`, `sockets/`, `config/`, and `utils/`. `app.js` configures Express middleware, mounts `/api/v1`, adds the 404 handler, and registers `middlewares/errorHandler.middleware.js`. `server.js` loads runtime configuration, creates the HTTP server, initializes Socket.IO, authenticates Sequelize, starts the expiry job, and listens.

Routes construct module routers and import controllers, guards/middleware, and express-validator chains directly. Controllers receive Express request/response objects, call a directly imported service singleton, and forward exceptions with `next(error)`. Services are classes exported as eagerly created singletons and query Sequelize models directly. There is no repository layer or explicit application composition root.

Existing reusable foundations are `authenticate`, `optionalAuth`, `authorize`, `validate`, `ApiResponse`, `errorHandler`, runtime configuration validation, Sequelize model factories/associations, and Node's built-in test runner. Current tests include Airline route/service/validation tests; shared Auth, RBAC, payment, booking lifecycle, ticket, email, WebSocket, and runtime tests.

Cross-feature dependencies to preserve include Booking and Payment services calling FlightService; Booking and Payment coordinating database transactions and row locks; Ticket service reading Booking/Flight-related models; Email service querying models; Flight/Booking/Payment publishing Socket.IO events through the process-level socket singleton; and the expiry job importing BookingService. Ticket endpoints are currently mounted by the Booking router.

Database/demo setup is explicitly outside this refactor. Cached develop does not run migrations or seeders from `npm start`; a separate `feature/local-demo-setup` branch contains Demo Setup work. No database was connected or modified for this audit. The architecture branch must not cherry-pick or absorb that feature branch.

## 3. Target architecture and source layout

Keep the root-level layout for existing infrastructure and legacy modules while migrating feature-by-feature; do not move the entire repository under `src/`.

Proposed incremental layout:

```text
app.js                         # Express app factory/compatibility export
server.js                      # process lifecycle entry point
application/
  buildContainer.js            # explicit composition root
  registerModules.js           # module registration and route mounting
modules/
  airline/
    index.js                   # public module factory/export
    airline.routes.js
    airline.controller.js
    airline.service.js
    airline.repository.js
    airline.validators.js      # may re-export existing validators initially
shared/
  http/guards/                  # Express-compatible auth/RBAC adapters
  http/validation/              # express-validator pipeline adapter
  http/filters/                 # centralized error-to-HTTP mapping
  persistence/                  # Sequelize transaction provider/contracts
infrastructure/
  email/                        # later migration from current service
  realtime/                     # later migration from sockets singleton
  jobs/                         # later migration of cron lifecycle
config/, models/, migrations/, seeders/, templates/, utils/ remain root-level
```

Only `modules/airline` and the minimum shared composition code are introduced in the proof of concept. Other existing feature folders remain in place until their individual migration is approved and verified. The existing paths `services/airline.service.js` and `routes/airline.route.js` are compatibility entry points during and after the Airline transition while any runtime code or tests import them. They must forward to the canonical AirlineModule implementation; they must never contain a second service, controller, or route implementation. The composition root mounts the Airline router exactly once.

## 4. Dependency injection and composition root

Use explicit CommonJS factories/constructor injection, with no cross-module/global service locator and no new runtime dependency. A single composition root receives concrete infrastructure (`models`, `sequelize`, logger, socket publisher, email provider as applicable), constructs repositories, services, controllers, guards, and module routers, then mounts the routers. A module-local, lazy, memoized default AirlineModule may be used solely to preserve the two legacy CommonJS import paths; it is not a general-purpose locator. The composition root and both adapters must resolve to that same default module instance. Tests may call the factory with isolated fake dependencies and must not initialize the default module unless testing compatibility.

For the Airline proof of concept, construction is explicit and inspectable:

```js
const airlineModule = createAirlineModule({
  repository: new SequelizeAirlineRepository({ Airline, Flight, Op }),
  guards,
  validation,
  apiResponse: ApiResponse,
});
// airlineModule exposes one router and its canonical service/controller for tests/adapters.
```

Factories accept test doubles, so unit tests can exercise service/controller behavior without connecting to MySQL. Modules publish routers/dependencies rather than reaching into an arbitrary global container. Shared providers are passed explicitly at module construction.

## 5. Guards, validation, and exception filters

### Guards

Keep Express middleware signatures `(req, res, next)` and existing semantics. Convert current auth/RBAC functions into injectable factories/adapters only where a module is migrated. Authentication continues to verify JWT, load the current user/role and enforce locked-account handling. Optional authentication retains its current fail-open behavior. Authorization continues to compare the same role names and return the same 401/403 responses. Middleware ordering remains byte-for-byte equivalent in route registration.

### Validation pipeline

Continue using `express-validator`. Feature modules own or re-export the existing validator chains and attach the existing `validate` adapter in the same position relative to auth/authorization middleware. Do not change sanitization, optional fields, error order, 422 body shape, or which routes validate.

### Exception filters

Treat the existing centralized Express error middleware as the compatibility boundary. Refactor it into an injectable filter/mapper behind the existing final Express error-handler adapter. Preserve `ApiResponse` JSON envelope and mappings for custom errors and Sequelize validation/unique/FK errors, along with production-safe response messages and current status codes. Keep 404 ordering unchanged. Add tests for the existing status/body mappings before replacing the implementation. Do not expose stacks, credentials, JWTs, or internal details in HTTP responses.

## 6. Repository contract and transaction propagation

Repositories encapsulate Sequelize model/query access and accept explicit query options, including transaction/lock context where needed. Services retain use-case orchestration and transaction ownership. For atomic work, a service receives a transaction provider (backed by Sequelize) and passes the resulting transaction object to every participating repository call. A repository must not silently open/commit an independent transaction inside an existing use case.

No query, include/association, ordering, pagination, lock mode, isolation level, or transaction boundary may change during extraction. Booking/Payment transaction and row-lock logic remains in its services until those features are migrated and characterized; when their repositories are eventually added, transaction propagation is mandatory and tested with the same use case boundary.

### Airline Repository/Service contract (verified against the current source)

`AirlineService` currently normalizes list pagination (`page`: integer fallback 1, minimum 1; `limit`: integer fallback 20, clamped 1–100), trims optional search, and returns `{ total, page, limit, data }`. It delegates directly to Sequelize today. The repository extraction must preserve these semantics and exact query contract:

- `findPage({ page, limit, search })` returns Sequelize-compatible `{ count, rows }`. The Sequelize implementation computes `offset = (page - 1) * limit`; when search is nonempty it applies `Op.or` over `name LIKE %search%` and `iata_code LIKE %search%`; it orders by `name ASC`; and it selects exactly `id`, `name`, `iata_code`, `logo_url`, `created_at`, `updated_at`. Do not add sorting/filter parameters or change wildcard behavior.
- `findById(id)` queries by primary key with the same six selected fields and returns the model instance or `null`.
- `findByIataCode(code, { excludeId })` performs the duplicate lookup using the current `where: { iata_code }` shape, with `id: { [Op.ne]: excludeId }` added only for update; do not add a projection or other query options.
- `create(values)` persists the normalized values and returns the created model instance.
- `update(instance, values)` updates the existing model instance and returns it, preserving Sequelize instance behavior.
- `countFlightsByAirlineId(id)` returns the `Flight.count` for `{ airline_id: id }`.
- `delete(instance)` destroys that instance and returns no new business result; the service retains the existing `{ id: Number(id), message: 'Airline deleted' }` response value.

The service remains responsible for use-case rules and compatibility: missing airline becomes 404 `Airline not found`; create/update trim `name`, trim and uppercase `iata_code`, and map a falsy `logo_url` to `null` (a truthy value is trimmed). On HTTP routes the existing validator trims whitespace before the service, so whitespace-only logo input becomes falsy/null; do not introduce new direct-service semantics. Duplicate IATA pre-check and Sequelize unique-constraint races both become 409 `Airline with this IATA code already exists`; update only changes supplied (`!== undefined`) fields and excludes the current row from uniqueness lookup; delete first resolves the airline, counts flights, and returns 409 `Cannot delete airline with existing flights` when count is greater than zero. Preserve existing return values and error properties/status mapping. Do not add or remove validators or business rules.

The existing validator contract remains authoritative: name is trimmed/nonempty and 2–150 chars; IATA is trimmed/uppercased and matches `^[A-Z0-9]{2,3}$`; optional nullable logo is trimmed, at most 500 chars, and must be an HTTP(S) URL or root-relative path; page is >=1, limit is 1–100, search is trimmed and at most 100 chars; ID is a positive integer. Service normalization is not a replacement for route validation.

No transaction is introduced for Airline deletion: preserve current lookup → flight count → destroy order in this structural refactor. Any future race-hardening or behavior change requires a separate approval and characterization.

## 7. AirlineModule proof of concept

Migrate Airline completely as the first vertical slice:

- Preserve `GET /api/v1/airlines`, `GET /api/v1/airlines/:id`, `POST`, `PUT /:id`, and `DELETE /:id` exactly.
- Keep public read access and Admin-only writes.
- Preserve current validators, middleware order, response helpers, pagination, errors, and association behavior.
- Move query construction into `AirlineRepository`; keep business rules in `AirlineService`; keep HTTP extraction/response in `AirlineController`.
- Build the module through injected dependencies in the composition root and mount its router exactly once at the same prefix. Do not mount both the old router and new router.
- Keep `services/airline.service.js` and `routes/airline.route.js` as thin forwarders to the one canonical default AirlineModule while any runtime consumer or test imports either path. The service adapter must expose the same service object; the route adapter must export the same Router object. No second business implementation is allowed.
- An adapter may be removed only after a repository-wide runtime-and-test import search reports zero consumers, all supported imports have been migrated, compatibility tests are intentionally retired or replaced, and the owner approves removal. Until then, retaining a tiny adapter is safer than deleting it merely to achieve a clean directory layout.

Acceptance requires existing Airline tests unchanged and passing; added tests prove: old-path import compatibility and object identity; DI with a mocked repository; controller/service isolation; exactly one mount/registration for each endpoint; HTTP response, status, RBAC, validation, and error parity; and representative list/detail/create/update/delete service behavior. Add a startup side-effect regression proving that importing `app.js` for tests does not authenticate/connect to MySQL, start cron, create an HTTP listener, or initialize Socket.IO. No test may write the existing demo or production database.

### Module registration and lifecycle constraints

The only public prefix remains `/api/v1/airlines`, nested under the existing `/api/v1` mount. Preserve the existing middleware stack and order, including global middleware, API router, 404 handler, and final error handler. The central registry owns one registration per feature. For Airline, it must register either the canonical default module router or its legacy forwarding export, never both. Assert route stack/mount counts in tests to catch duplication.

`app.js` remains safe to import and is an app/configuration factory (or a backwards-compatible app export backed by that factory); it must not connect to the database, start cron, create/listen on an HTTP server, or initialize Socket.IO as an import side effect. `server.js` remains the process entry point and owns runtime startup/shutdown. Preserve Socket.IO initialization, cron timing/configuration, Docker startup expectations, and all existing listener behavior. Do not solve testability by moving lifecycle side effects into a new global bootstrap that runs on `require()`.

## 8. Remaining modules and migration order

1. Shared application composition and HTTP adapters, introduced incrementally with the Airline pilot.
2. Airport.
3. Promotion.
4. FareClass, then Flight (their data/use-case dependency is explicit).
5. User and Role, then Auth (reusing injected auth/role providers while preserving security behavior).
6. Ticket (keep endpoint mounted at its existing Booking path).
7. Booking and Payment last, with transaction/locking characterization and callback/webhook contract tests.
8. Infrastructure lifecycle: Email, Socket.IO, and expiry/reconciliation job wiring; centralize startup/shutdown without changing event names, timing, flags, or side effects.
9. Final centralized registration and full regression; remove compatibility adapters only after import/test search proves they are unused.

This order is provisional and may be adjusted only if source dependency discovery finds a concrete blocker. It does not imply those later modules are complete when Airline is done.

## 9. Test strategy and stage gates

### Before each module

- Capture current route/method/middleware order and access matrix.
- Add/confirm request, response, status, validation, and error characterization tests.
- Identify DB writes and ensure tests use mocks or an isolated test database.
- Record existing module tests and baseline results before changing files.

### Per-module acceptance

- Existing tests pass without weakening assertions.
- Route contract (method/path/auth/order) is unchanged.
- JSON response envelope/fields and HTTP statuses are unchanged.
- Injected fake dependencies make service/controller unit tests independent of MySQL.
- Repository query options and transaction propagation are asserted where applicable.
- No additional database write occurs outside tests’ isolated database.
- `git diff --check` passes and changed files stay within the active module/shared foundation.

### Final acceptance

- Every listed backend module is registered by the centralized composition root and uses Module → Controller → Service → Repository boundaries.
- Guards, validation, exception mapping, DI, startup/shutdown, WebSocket and Cron are verified by tests.
- Full backend suite and frontend regression/build pass; frontend source remains unchanged.
- Docker smoke test uses an isolated local test database only, and is separately reported from unit tests.
- No migration, seeder, schema, fixture/data, API contract, or business-rule changes appear in the diff.

## 10. Risks and mitigations

- **Contract drift from middleware ordering:** lock exact route chains in contract tests and preserve ordering.
- **Booking/Payment atomicity loss:** leave services as transaction owners; explicitly propagate one transaction through repositories; migrate last.
- **Static singleton assumptions in tests:** add explicit construction seams first and preserve compatibility exports during migration.
- **Socket/job initialization ordering:** move lifecycle only after a tested bootstrap boundary exists; initialize once and retain current enable/disable flags and event payloads.
- **Circular dependencies between feature services:** declare cross-feature ports/providers in the composition root; modules must not import sibling module internals.
- **Incompatible query extraction:** characterize Sequelize includes, locks, count/pagination, and ordering before moving each query.
- **Seeder work collision:** architecture branch starts from verified develop and excludes `feature/local-demo-setup`; no seed/migration files are touched.
- **Current checkout is dirty:** all spec/plan/refactor artifacts stay in the dedicated worktree; the principal checkout remains untouched.

## 11. Git and delivery plan

The dedicated branch `codex/express-modular-refactor` was created in an isolated managed worktree from the fetched `origin/develop` commit `eaed4634ab9dd577b83d551bff31f7fa9dd94e71`. The existing `ui/stitch-redesign` checkout and its tracked/untracked changes remain untouched. The Demo Setup branch is excluded.

Before implementation, re-check current origin/develop and worktree status. Keep architecture commits confined to the dedicated branch. Final delivery will use Git-based integration reviewed against the then-current develop; do not copy files manually, merge, or push without separate approval. If develop advances, inspect all changed paths and ancestry before rebasing/fast-forwarding; never overwrite local work.

## 12. Review gate

This document specifies architecture and staged acceptance criteria only; it does not authorize bulk refactoring. The owner conditionally approved this architecture on 2026-10-13 subject to the compatibility, Airline contract, registration/lifecycle, testing, and Git-delivery constraints above. A detailed implementation plan is maintained separately at `docs/superpowers/plans/2026-10-13-express-modular-monolith.md`. The owner must review that plan before AirlineModule source changes begin.
