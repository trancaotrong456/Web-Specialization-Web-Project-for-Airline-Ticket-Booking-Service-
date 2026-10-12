# Tran Cao Trong Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and verify all ten Auth, User, Role, JWT, and RBAC responsibilities assigned to Tran Cao Trong in the final report.

**Architecture:** Keep the existing Express MVC layering: routes validate and authorize requests, controllers translate HTTP input/output, and services own authentication and persistence rules. Restore Role mutation and password-reset behavior without changing the existing User/JWT/RBAC contracts.

**Tech Stack:** Node.js, Express, Sequelize, bcryptjs, JWT, Resend, node:test.

**Spec:** `docs/NhomE_baocao_2026102.docx`, Table 1.2, items 1-10 assigned to Tran Cao Trong.

## Global Constraints

- Implement all ten assigned items; do not modify unrelated airline, airport, flight, booking, or payment domains.
- Protect all User and Role administration routes with authentication and Admin RBAC.
- Store only password hashes and password-reset token hashes.
- Return an indistinguishable forgot-password response for unknown or locked accounts.
- Preserve existing user self-protection, token typing, refresh-token revocation, and production security checks.

## Review Focus

- Unknown email during password reset must not disclose whether an account exists.
- Locked accounts must not regain access through password reset.
- Expired or invalid reset tokens must be rejected and never mutate a password.
- System Role names must not be renamed or deleted because RBAC depends on them.
- Duplicate Role names, including concurrent inserts, must return HTTP 409.

---

### Task 1: Full assignment route contract

**Files:**
- Create: `tests/tranCaoTrongAssignmentContract.test.js`
- Test: `tests/tranCaoTrongAssignmentContract.test.js`

**Interfaces:**
- Consumes: Express routers exported by `routes/auth.route.js`, `routes/user.route.js`, and `routes/role.route.js`.
- Produces: an executable contract proving all ten assigned feature groups are exposed.

- [ ] Write assertions for Auth register/login/logout/refresh/profile/change-password/forgot/reset, User CRUD/list/detail/role/status, Role CRUD/list/detail, and global RBAC middleware.
- [ ] Run the contract test and verify it fails because Role mutations and forgot/reset routes are absent.
- [ ] Keep the contract test as a permanent regression test.

### Task 2: Secure forgot and reset password

**Files:**
- Modify: `.env.example`
- Modify: `routes/auth.route.js`
- Modify: `controllers/auth.controller.js`
- Modify: `services/auth.service.js`
- Modify: `validators/auth.validator.js`
- Create: `tests/passwordReset.test.js`

**Interfaces:**
- Consumes: `User`, `emailService.sendMail`, bcrypt, crypto, and application validation middleware.
- Produces: `POST /auth/forgot-password` and `POST /auth/reset-password`.

- [ ] Add failing tests for enumeration resistance, hashed reset tokens, locked accounts, and successful one-time reset.
- [ ] Verify the tests fail because the endpoints/service methods are absent.
- [ ] Implement validators, controller methods, token hashing/expiry, HTTPS reset URL validation, email delivery, password hashing, and refresh-token revocation.
- [ ] Run password-reset and Auth contract tests until green.

### Task 3: Administrative Role CRUD

**Files:**
- Modify: `routes/role.route.js`
- Modify: `controllers/role.controller.js`
- Modify: `services/role.service.js`
- Modify: `validators/role.validator.js`
- Modify: `tests/roleReadRoutes.test.js`
- Modify: `tests/roleService.test.js`

**Interfaces:**
- Consumes: `Role`, `User`, authentication middleware, and Admin RBAC middleware.
- Produces: Admin-only Role create, list, detail, update, and delete endpoints.

- [ ] Add failing route and service tests for create/update/delete, duplicate names, assigned-role deletion, and protected system roles.
- [ ] Verify the tests fail because mutation routes and methods are absent.
- [ ] Implement normalized Role CRUD with database-conflict mapping and system-role safeguards.
- [ ] Run Role tests until green.

### Task 4: Regression, integration, and Git delivery

**Files:**
- Verify: `tests/*.test.js`

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: tested commits on `feature/auth`, merged into `develop` and `main`.

- [ ] Run `npm test` and require every test to pass.
- [ ] Run `git diff --check` and inspect the exact staged files.
- [ ] Commit the completed Auth/Role scope on `feature/auth`.
- [ ] Merge into `develop`, rerun `npm test`, then merge into `main`.
- [ ] Push updated branches without force-pushing or overwriting unrelated work.
