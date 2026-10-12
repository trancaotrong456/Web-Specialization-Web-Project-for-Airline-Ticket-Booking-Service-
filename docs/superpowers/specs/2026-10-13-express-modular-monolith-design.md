# Serene Flightways Express Modular Monolith — Design Specification

**Status:** Draft for owner review
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

Only `modules/airline` and the minimum shared composition code are introduced in the proof of concept. Other existing feature folders remain in place until their individual migration is approved and verified. Temporary compatibility exports may keep old imports working during a transition; duplicate implementations must not remain after each feature is completed.

## 4. Dependency injection and composition root

Use explicit CommonJS factories/constructor injection, with no global service locator and no new runtime dependency. A single composition root receives concrete infrastructure (`models`, `sequelize`, logger, socket publisher, email provider as applicable), constructs repositories, services, controllers, guards, and module routers, then mounts the routers.

For the Airline proof of concept, construction is explicit and inspectable:

```js
const airlineRepository = new SequelizeAirlineRepository({ Airline, Flight, Op });
const airlineService = new AirlineService({ repository: airlineRepository });
const airlineController = new AirlineController({ service: airlineService, apiResponse: ApiResponse });
const airlineModule = createAirlineModule({ controller: airlineController, guards, validation });
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

For the Airline repository, document the methods actually needed by current `AirlineService` (list/search/pagination, get-by-id, create, update, delete and flight-reference checks). Preserve exact Sequelize options and results observed in the current implementation; do not redesign data access while moving it.

## 7. AirlineModule proof of concept

Migrate Airline completely as the first vertical slice:

- Preserve `GET /api/v1/airlines`, `GET /api/v1/airlines/:id`, `POST`, `PUT /:id`, and `DELETE /:id` exactly.
- Keep public read access and Admin-only writes.
- Preserve current validators, middleware order, response helpers, pagination, errors, and association behavior.
- Move query construction into `AirlineRepository`; keep business rules in `AirlineService`; keep HTTP extraction/response in `AirlineController`.
- Build the module through injected dependencies in the composition root and mount its router at the same prefix.
- Keep an old-path adapter only if required by existing imports/tests; remove it within the Airline slice once all consumers use the module API.

Acceptance requires existing Airline tests unchanged and passing; added tests prove factory injection with fakes, route methods and access policy, validation/error contract compatibility, and representative list/detail/create/update/delete service behavior. No test may write the existing demo or production database.

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

This document specifies the architecture and staged acceptance criteria only. It does not authorize bulk refactoring. The owner must review this written specification before a detailed implementation task plan is prepared and before AirlineModule source changes begin.
