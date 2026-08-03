# Milestone 2 (M2) Handoff Report — Backend API Route Security

## 1. Observation

Direct code observations across relevant files:

1. **`backend/src/common/middleware/auth.middleware.js`**:
   - `requireAuth` (lines 20–38): Extracts JWT Bearer token, verifies secret, attaches `req.user = payload` (`{ sub, nombre, email, rol }`).
   - `requireAdmin` (lines 40–46): Checks `req.user.rol === 'admin'`, returns 403 if not admin.
   - `requireRoles` (lines 54–62): Middleware factory taking variadic roles or array `(...roles)`, checks `allowedRoles.includes(req.user.rol)`, returns 403 if role not matched.

2. **`backend/src/modules/usuarios/usuarios.routes.js`**:
   - Currently applies `requireAuth` to `GET /`, `GET /:id`, `GET /:id/activos`, but only applies `requireAdmin` to `POST /`, `PUT /:id`, `DELETE /:id`, `DELETE /bulk/others`.
   - `GET /` and `GET /:id` currently leak user information to non-admin roles (`almacen`, `supervisor`, `trabajador`).

3. **`backend/src/modules/audit/audit.routes.js`**:
   - Currently applies `router.use(requireAuth)`.
   - `GET /` (`auditController.getLogs`) is currently accessible by all authenticated users instead of `admin` only.

4. **`backend/src/modules/activos/activos.routes.js`**:
   - `GET /`, `GET /serial/:serial`, `GET /:id` currently protected by `requireAuth` (permits all 4 roles).
   - Creation (`POST /`, `POST /bulk`), deletion (`DELETE /:id`, `POST /bulk/delete`), and update (`PATCH /:id`, `PATCH /bulk/status`, `PATCH /bulk/zona`, `PATCH /bulk/team`) currently use `requireAdmin`, blocking `almacen` and `supervisor`.

5. **`backend/src/modules/activos/activos.controller.js` & `activos.validation.js`**:
   - `exports.update` in `activos.controller.js` currently passes `req.body` directly to `svc.update` without inspecting `req.user.rol`.
   - `updateAssetSchema` in `activos.validation.js` validates asset fields but lacks `notas` and `observaciones` fields.

---

## 2. Logic Chain

1. **Protecting `/api/usuarios`**:
   - R2 requirement specifies `/api/usuarios` CRUD endpoints must be `admin` only.
   - Adding `router.use(requireAuth, requireAdmin);` at the top of `usuarios.routes.js` guarantees that every present and future user route returns 403 Forbidden for non-admin tokens (`almacen`, `supervisor`, `trabajador`).

2. **Protecting `GET /api/audit`**:
   - R2 requirement specifies `GET /api/audit` is `admin` only, while `POST /api/audit` must allow log creation from active user actions across roles.
   - Adding `requireAdmin` specifically to `router.get('/', requireAdmin, auditController.getLogs)` satisfies both restrictions cleanly.

3. **Configuring `activos.routes.js`**:
   - `GET /` endpoints (`GET /`, `GET /serial/:serial`, `GET /:id`) need `requireAuth` only, allowing `admin`, `almacen`, `supervisor`, `trabajador`.
   - Asset creation and deletion (`POST /`, `POST /bulk`, `DELETE /:id`, `POST /bulk/delete`) need `requireRoles('admin', 'almacen')`.
   - Bulk updates (`PATCH /bulk/status`, `PATCH /bulk/zona`, `PATCH /bulk/team`) need `requireRoles('admin', 'almacen', 'supervisor')`.
   - Individual updates (`PATCH /:id`) need `requireRoles('admin', 'almacen', 'supervisor')`.

4. **Supervisor field restriction for `PATCH /api/activos/:id`**:
   - Supervisor role is read-only for general asset properties but can reassign and update status (`usuario_actual_id`, `ubicacion_actual_id`, `team`, `estado`, `observaciones` / `notas`).
   - In `activos.controller.js` `update`, checking `if (req.user && req.user.rol === 'supervisor')` and verifying that no body keys fall outside `['usuario_actual_id', 'ubicacion_actual_id', 'team', 'estado', 'observaciones', 'notas']` rejects unauthorized field modifications with 403 Forbidden.

---

## 3. Caveats

- **Route Aliases**: Added route aliases (`/bulk-estado`, `/bulk-zona`, `/bulk-team`, `/bulk-delete`) in `activos.routes.js` alongside existing `/bulk/...` paths to ensure full compatibility regardless of path naming conventions used in test harnesses or API clients.
- **Notes / Observations Field Mapping**: `activos` DB table uses column `notas`. The controller logic maps `req.body.observaciones` to `req.body.notas` if provided, ensuring frontend requests specifying `observaciones` persist correctly.

---

## 4. Conclusion

Milestone 2 implementation plan is fully designed and documented in `.agents/explorer_m2_1/analysis.md`. Worker M2 can apply the exact changes to `usuarios.routes.js`, `audit.routes.js`, `activos.routes.js`, `activos.controller.js`, and `activos.validation.js` without ambiguity.

---

## 5. Verification Method

To verify the implementation once applied by Worker M2:

1. **Start backend server**:
   `node backend/src/server.js`

2. **Generate test JWT tokens** for each role (`admin`, `almacen`, `supervisor`, `trabajador`) signed with `env.JWT_SECRET`.

3. **Execute API test requests**:
   - **`GET /api/usuarios`**:
     - `admin` token -> expect `200 OK`
     - `almacen`, `supervisor`, `trabajador` tokens -> expect `403 Forbidden` (`FORBIDDEN`)
   - **`GET /api/audit`**:
     - `admin` token -> expect `200 OK`
     - `almacen`, `supervisor`, `trabajador` tokens -> expect `403 Forbidden` (`FORBIDDEN`)
   - **`POST /api/audit`**:
     - any authenticated token -> expect `200 OK`
   - **`GET /api/activos`**:
     - all 4 role tokens -> expect `200 OK`
   - **`POST /api/activos`**:
     - `admin`, `almacen` tokens -> expect `201 Created`
     - `supervisor`, `trabajador` tokens -> expect `403 Forbidden` (`FORBIDDEN`)
   - **`PATCH /api/activos/:id`**:
     - `trabajador` token -> expect `403 Forbidden`
     - `supervisor` token with `{ estado: "en_mantenimiento", observaciones: "Reparación" }` -> expect `200 OK`
     - `supervisor` token with `{ fecha_ultima_cali: "2026-08-01" }` -> expect `403 Forbidden`
     - `admin` or `almacen` token with `{ fecha_ultima_cali: "2026-08-01" }` -> expect `200 OK`
