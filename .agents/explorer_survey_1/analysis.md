# Backend RBAC Survey & Architecture Analysis Report

**Date**: 2026-08-03  
**Module**: Backend API (`backend/src/`)  
**Investigator**: Backend Explorer  

---

## 1. Executive Summary

This report presents a thorough investigation of the Entelso backend codebase (`backend/`), mapping the existing user role storage, authentication, route middleware, and authorization mechanisms. It outlines the precise modifications required to implement the 4-role RBAC model (`admin`, `almacen`, `supervisor`, `trabajador`) for Requirement R1 and enforce strict API route security for Requirement R2.

---

## 2. Current Architecture & Role Representation

### 2.1 Database Layer (`init.sql` & PostgreSQL)
* **Storage**: User roles are stored in the `usuarios` table in the column `rol VARCHAR(50) NOT NULL DEFAULT 'trabajador'` (`init.sql`, line 45).
* **Current Seed Data** (`init.sql`, lines 196–203):
  * `Carlos Admin` (`admin`) — `admin@entelso.com`
  * `Juan Pérez` (`trabajador`)
  * `María González` (`trabajador`)
  * `Pedro Ramírez` (`supervisor`)
  * `Ana Torres` (`trabajador`)
  * `Luis Rodríguez` (`trabajador`)
  * `Supervisor NSW` (`supervisor`) — `super.nsw@entelso.com`
* **Observation**: The `almacen` role is not yet present in the default seed data, but the database column `rol VARCHAR(50)` natively supports any string value.

### 2.2 Backend Validation Layer (`zod`)
* **File**: `backend/src/modules/usuarios/usuarios.validation.js`
* **Current State**:
  * Line 7 (`createUserSchema`): `rol: z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional()`
  * Line 18 (`updateUserSchema`): `rol: z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional()`
* **Observation**: Zod validation schemas already list all four roles (`trabajador`, `admin`, `supervisor`, `almacen`).

### 2.3 Authentication & Session Context (`jwt`)
* **Login Endpoint**: `POST /api/auth/login` (`auth.service.js`, lines 47–56).
* **JWT Token Payload**: Includes `{ sub: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }`.
* **Auth Middleware**: `backend/src/common/middleware/auth.middleware.js`
  * `requireAuth`: Verifies `Bearer` JWT token and populates `req.user = payload` (`{ sub, nombre, email, rol }`).
  * `requireAdmin`: Checks `req.user.rol === 'admin'`. Returns `403 Forbidden` (`'FORBIDDEN'`, `'Acceso denegado. Se requieren privilegios de administrador.'`) if not admin.

---

## 3. Analysis of Current Security Deficiencies (R1 & R2 Scope)

### 3.1 Deficiencies in `/api/usuarios`
* **File**: `backend/src/modules/usuarios/usuarios.routes.js`
* **Current Routes**:
  * `GET /api/usuarios` -> protected only by `requireAuth` (line 7)
  * `GET /api/usuarios/:id` -> protected only by `requireAuth` (line 9)
  * `GET /api/usuarios/:id/activos` -> protected only by `requireAuth` (line 10)
* **Security Deficit**: Non-admin users (`almacen`, `supervisor`, `trabajador`) can currently query user lists and individual user details.
* **Requirement R2 Violation**: Requirement R2 mandates `/api/usuarios` (CRUD) to be restricted exclusively to `admin`. Acceptance criteria mandates `almacen` receive `403 Forbidden` when calling `GET /api/usuarios`.

### 3.2 Deficiencies in `/api/audit`
* **File**: `backend/src/modules/audit/audit.routes.js`
* **Current Routes**:
  * `GET /api/audit` -> protected only by `requireAuth` (lines 7–8)
* **Security Deficit**: Non-admin users (`almacen`, `supervisor`, `trabajador`) can access system audit logs.
* **Requirement R2 Violation**: Requirement R2 mandates `GET /api/audit` to be restricted exclusively to `admin`.

### 3.3 Deficiencies in `/api/activos`
* **File**: `backend/src/modules/activos/activos.routes.js`
* **Current Routes**:
  * `GET /` -> protected by `requireAuth`
  * `POST /`, `POST /bulk`, `PATCH /:id`, `DELETE /:id`, and all `/bulk/*` endpoints -> protected by `requireAdmin`.
* **Security Deficit**:
  1. `almacen` role is currently blocked by `requireAdmin` from creating assets (`POST /`), editing assets (`PATCH /:id`), or performing bulk creation (`POST /bulk`).
  2. `supervisor` role is currently blocked by `requireAdmin` from performing status updates and reassignments (`PATCH /:id`, `PATCH /bulk/status`, `PATCH /bulk/zona`, `PATCH /bulk/team`).
  3. `supervisor` role does not currently have granular payload validation on `PATCH /:id` to restrict updates to permitted actions (reassignments, status updates, maintenance notes) while blocking core asset creation/deletion.

---

## 4. Requirement Mapping & Required Backend Changes

### 4.1 Target Permissions Matrix

| Endpoint / Action | Admin (`admin`) | Warehouse (`almacen`) | Supervisor (`supervisor`) | Worker (`trabajador`) |
|---|---|---|---|---|
| `GET /api/activos/*` | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `POST /api/activos` | ✅ Allow | ✅ Allow | ❌ Block (403) | ❌ Block (403) |
| `POST /api/activos/bulk` | ✅ Allow | ✅ Allow | ❌ Block (403) | ❌ Block (403) |
| `PATCH /api/activos/:id` | ✅ Allow | ✅ Allow | ⚠️ Restricted (Reassign/Status only) | ❌ Block (403) |
| `PATCH /api/activos/bulk/status,zona,team` | ✅ Allow | ✅ Allow | ✅ Allow | ❌ Block (403) |
| `PATCH /api/activos/bulk/category` | ✅ Allow | ✅ Allow | ❌ Block (403) | ❌ Block (403) |
| `DELETE /api/activos/:id` & `/bulk/*` | ✅ Allow | ✅ Allow | ❌ Block (403) | ❌ Block (403) |
| `GET/POST/PUT/DELETE /api/usuarios/*` | ✅ Allow | ❌ Block (403) | ❌ Block (403) | ❌ Block (403) |
| `GET /api/audit` | ✅ Allow | ❌ Block (403) | ❌ Block (403) | ❌ Block (403) |

---

### 4.2 File-by-File Technical Action Plan

#### 1. `backend/src/common/middleware/auth.middleware.js`
* **Changes**:
  * Add a generalized role authorization middleware factory: `requireRoles(...allowedRoles)`.
  * Implementation pattern:
    ```javascript
    const requireRoles = (...allowedRoles) => {
      return (req, reply, next) => {
        if (!req.user) {
          return reply.status(401).json(res.error('Token de acceso no provisto.', 'UNAUTHORIZED'));
        }
        if (allowedRoles.includes(req.user.rol)) {
          return next();
        }
        return reply.status(403).json(res.error('Acceso denegado. Permisos insuficientes.', 'FORBIDDEN'));
      };
    };
    ```
  * Export `requireRoles` alongside `requireAuth`, `requireAdmin`, and `requireApiKey`.

#### 2. `backend/src/modules/usuarios/usuarios.routes.js`
* **Changes**:
  * Apply `requireAdmin` (or `requireRoles('admin')`) to ALL endpoints in this module.
  * Update line 7, 9, 10 to use `requireAdmin`:
    ```javascript
    router.use(requireAuth, requireAdmin);
    router.get('/', ctrl.getAll);
    router.delete('/bulk/others', ctrl.removeAllOthers);
    router.get('/:id', ctrl.getById);
    router.get('/:id/activos', ctrl.getAssets);
    router.post('/', validate(createUserSchema), ctrl.create);
    router.put('/:id', validate(updateUserSchema), ctrl.update);
    router.delete('/:id', ctrl.remove);
    ```

#### 3. `backend/src/modules/audit/audit.routes.js`
* **Changes**:
  * Update `GET /` to require `requireAdmin` (or `requireRoles('admin')`).
    ```javascript
    router.use(requireAuth);
    router.get('/', requireAdmin, auditController.getLogs);
    router.post('/', auditController.createLog);
    ```

#### 4. `backend/src/modules/activos/activos.routes.js`
* **Changes**:
  * Refine middleware for each action:
    ```javascript
    // Read-only (All authenticated roles)
    router.get('/', requireAuth, ctrl.getAll);
    router.get('/serial/:serial', requireAuth, ctrl.getBySerial);
    router.get('/:id', requireAuth, ctrl.getById);

    // Create & Delete (Admin + Almacen)
    router.post('/', requireAuth, requireRoles('admin', 'almacen'), validate(createAssetSchema), ctrl.create);
    router.post('/bulk', requireAuth, requireRoles('admin', 'almacen'), validate(bulkCreateAssetSchema), ctrl.bulkCreate);
    router.delete('/:id', requireAuth, requireRoles('admin', 'almacen'), ctrl.remove);
    router.delete('/bulk/all', requireAuth, requireRoles('admin', 'almacen'), ctrl.removeAll);
    router.post('/bulk/delete', requireAuth, requireRoles('admin', 'almacen'), ctrl.bulkRemoveSelected);
    router.patch('/bulk/category', requireAuth, requireRoles('admin', 'almacen'), ctrl.bulkUpdateCategory);

    // Status/Reassignment Bulk Updates (Admin + Almacen + Supervisor)
    router.patch('/bulk/status', requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateStatus);
    router.patch('/bulk/zona', requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateZona);
    router.patch('/bulk/team', requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateTeam);

    // Single Asset Update (Admin + Almacen + Supervisor with field validation)
    router.patch('/:id', requireAuth, requireRoles('admin', 'almacen', 'supervisor'), validate(updateAssetSchema), checkSupervisorUpdatePermissions, ctrl.update);
    ```
* **Supervisor Update Check Middleware**:
  If `req.user.rol === 'supervisor'`, inspect `req.body` to ensure non-permitted fields (`item_id`, `numero_serie`, `fecha_registro`, etc.) are not present or modified, allowing only `usuario_actual_id`, `ubicacion_actual_id`, `estado`, `team`, `notas`, `fecha_prox_cali`, `fecha_prox_tag`.

#### 5. `init.sql` (Seed Data)
* **Changes**:
  * Add a seed user with `rol = 'almacen'` (e.g. `'Roberto Almacén'`, `'almacen@entelso.com'`) to simplify local testing and verification.

---

## 5. Build, Test & Verification Mechanisms

### 5.1 Project Execution
* **Backend Entry Point**: `backend/src/server.js` (runs Express app defined in `backend/src/app.js`).
* **Environment Configuration**: `.env` parsed via `backend/src/config/environment.js` (requires `DATABASE_URL`, `JWT_SECRET`, `API_KEY`, `PORT`).
* **Database Pool**: PostgreSQL pool via `pg` (`backend/src/config/database.js`).

### 5.2 Test Strategy & Invalidation Conditions
* **Test Runner**: Node.js custom test runner / HTTP client scripts (or automated integration tests).
* **Verification Steps**:
  1. Obtain JWT tokens via `POST /api/auth/login` for all four roles:
     - `admin` (`admin@entelso.com`)
     - `almacen` (`almacen@entelso.com`)
     - `supervisor` (`super.nsw@entelso.com`)
     - `trabajador` (`juan@entelso.com`)
  2. Send requests to endpoints and verify status codes:
     - `POST /api/activos` with `trabajador` token -> **403 Forbidden**
     - `POST /api/activos` with `supervisor` token -> **403 Forbidden**
     - `POST /api/activos` with `almacen` token -> **201 Created / 200 OK**
     - `GET /api/usuarios` with `almacen` token -> **403 Forbidden**
     - `GET /api/usuarios` with `supervisor` token -> **403 Forbidden**
     - `GET /api/usuarios` with `admin` token -> **200 OK**
     - `GET /api/audit` with `supervisor` token -> **403 Forbidden**
     - `GET /api/audit` with `admin` token -> **200 OK**

---
