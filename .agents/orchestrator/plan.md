# Project Plan: Entelso RBAC Implementation

## Architecture
- Backend: Node.js (Express), SQLite / Prisma / Database layer with JWT-based Authentication & Authorization middleware.
- Frontend: Vanilla JavaScript (`dashboard/script.js`), HTML (`dashboard/index.html`), `window.i18n.t()` localization engine.

## Feature Inventory
| # | Feature | Description | Requirement | Milestone | Source |
|---|---------|-------------|-------------|-----------|--------|
| 1 | 4 Role Schema & Enums | DB enums/schema support `admin`, `almacen`, `supervisor`, `trabajador` | R1 | M1 | survey |
| 2 | Auth & RBAC Middleware | Middleware decoding JWT/role and injecting role checking functions | R1 | M1 | survey |
| 3 | Activos Endpoint RBAC | Block trabajador and supervisor on POST/PUT/DELETE /api/activos (allow specific reassignment/status updates for supervisor) | R2 | M2 | survey |
| 4 | Audit Endpoint RBAC | Restrict GET /api/audit to `admin` role only | R2 | M2 | survey |
| 5 | Users Endpoint RBAC | Restrict CRUD /api/usuarios to `admin` role only | R2 | M2 | survey |
| 6 | Frontend Menu & Tab Hiding | Hide Administration (Users) and Audit tabs for non-admins | R3 | M3 | survey |
| 7 | Frontend Button Hiding | Hide "Add Asset" and "Edit" buttons for trabajador and supervisor | R3 | M3 | survey |
| 8 | Localization & Error Messages | Preserve and use `window.i18n.t()` for all new strings/errors; no raw Spanish strings | R3 | M3 | survey |
| 9 | E2E Testing & Hardening | Full test coverage (Tiers 1-4) + Adversarial hardening (Tier 5) | Acceptance | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 0 | Phase 0 Survey | Codebase mapping, route enumeration, requirement verification | None | DONE |
| 1 | M1: DB Schema & Auth/RBAC Middleware | Add almacen seed user, implement requireRoles middleware | M0 | DONE |
| 2 | M2: Backend API Route Security | RBAC checks on /api/activos, /api/audit, /api/usuarios | M1 | IN_PROGRESS |
| 3 | M3: Frontend UI Restrictions & i18n | Hide tabs, hide buttons, ensure i18n English strings | M1 | PLANNED |
| 4 | M4: E2E Testing & Hardening | Opaque-box E2E tests, 100% pass, adversarial hardening | M2, M3 | PLANNED |

## Interface Contracts
### Auth Middleware Contract
- `req.user`: Contains `{ id, username, role }` after JWT verification.
- Roles enum: `'admin'`, `'almacen'`, `'supervisor'`, `'trabajador'`.
- Authorization helper functions / middleware: `checkRole(allowedRoles)` or `requirePermission(permission)`.

## Code Layout
- Backend: `backend/src/`
  - Modules: `backend/src/modules/`
  - Auth Middleware: `backend/src/middleware/` or equivalent
  - Database: `backend/src/database/` or Prisma schema
- Frontend: `dashboard/`
  - Script: `dashboard/script.js`
  - HTML: `dashboard/index.html`
  - Localization: `dashboard/js/i18n.js` or equivalent
