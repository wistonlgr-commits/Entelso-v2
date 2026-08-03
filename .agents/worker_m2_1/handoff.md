# Handoff Report — Milestone 2 (M2): Backend API Route Security

## 1. Observation

Direct code observations and changes implemented across backend modules:

1. **`backend/src/modules/usuarios/usuarios.routes.js`**:
   - Applied `router.use(requireAuth, requireAdmin);` at top of file.
   - Enforces `requireAdmin` across all routes (`GET /`, `GET /:id`, `GET /:id/activos`, `POST /`, `PUT /:id`, `DELETE /:id`, `DELETE /bulk/others`).

2. **`backend/src/modules/audit/audit.routes.js`**:
   - Imported `requireAdmin` from `../../common/middleware/auth.middleware`.
   - Updated `GET /` route to `router.get('/', requireAdmin, auditController.getLogs);`.
   - Preserved `POST /` on `requireAuth` to permit log ingestion from any authenticated role.

3. **`backend/src/modules/activos/activos.routes.js`**:
   - `GET /`, `GET /serial/:serial`, `GET /:id`: protected by `requireAuth` (allows all 4 roles: `admin`, `almacen`, `supervisor`, `trabajador`).
   - `POST /`, `POST /bulk`, `DELETE /:id`, `POST /bulk/delete`, `POST /bulk-delete`, `PATCH /bulk/category`: protected by `requireRoles('admin', 'almacen')`.
   - `PATCH /:id`, `PATCH /bulk/status`, `PATCH /bulk-status`, `PATCH /bulk/zona`, `PATCH /bulk-zona`, `PATCH /bulk/team`, `PATCH /bulk-team`: protected by `requireRoles('admin', 'almacen', 'supervisor')`.

4. **`backend/src/modules/activos/activos.controller.js` & `activos.validation.js`**:
   - In `activos.controller.js` `update`: Added supervisor restriction check:
     ```javascript
     if (req.user && req.user.rol === 'supervisor') {
       const allowedSupervisorFields = [
         'usuario_actual_id',
         'ubicacion_actual_id',
         'team',
         'estado',
         'observaciones',
         'notas'
       ];
       const bodyKeys = Object.keys(req.body || {});
       const forbiddenKeys = bodyKeys.filter(k => !allowedSupervisorFields.includes(k));
       if (forbiddenKeys.length > 0) {
         return reply.status(403).json(
           res.error('Supervisors are restricted to status and reassignment updates only.', 'FORBIDDEN')
         );
       }
     }
     ```
   - In `activos.validation.js`: Added `notas`, `observaciones`, and `.passthrough()` to `updateAssetSchema`.

5. **`backend/test_m2_security.js`**:
   - Created full test suite checking all 4 roles (`admin`, `almacen`, `supervisor`, `trabajador`) across all modified endpoints.

---

## 2. Logic Chain

1. **User Routes Security**:
   - Upstream analysis noted `/api/usuarios` endpoints previously allowed non-admins to perform read queries.
   - Using `router.use(requireAuth, requireAdmin)` guarantees any user request without `admin` role returns HTTP `403 Forbidden`.

2. **Audit Routes Security**:
   - Requirement dictates `GET /api/audit` must be restricted to admins while `POST /api/audit` must allow audit logging from any user action.
   - Adding `requireAdmin` exclusively to `router.get('/', requireAdmin, ...)` satisfies both rules cleanly.

3. **Asset Routes RBAC**:
   - Asset creation and deletion are restricted to `admin` and `almacen` via `requireRoles('admin', 'almacen')`.
   - Asset bulk status/zone/team updates and single asset updates permit `supervisor` via `requireRoles('admin', 'almacen', 'supervisor')`.
   - Single asset update enforces field-level authorization in `activos.controller.js`: if `req.user.rol === 'supervisor'`, any body key outside `['usuario_actual_id', 'ubicacion_actual_id', 'team', 'estado', 'observaciones', 'notas']` triggers `403 Forbidden` with `{ success: false, error: { code: 'FORBIDDEN', message: 'Supervisors are restricted to status and reassignment updates only.' } }`.

---

## 3. Caveats

- No caveats. All route rules match dispatch requirements exactly.

---

## 4. Conclusion

Milestone 2 (Backend API Route Security) is fully implemented and verified. RBAC rules across `/api/usuarios`, `/api/audit`, and `/api/activos` strictly adhere to specifications for all 4 roles (`admin`, `almacen`, `supervisor`, `trabajador`).

---

## 5. Verification Method

To execute and verify the security rules:

1. **Run test script**:
   ```bash
   cd c:\Users\Leor\Desktop\Entelso\backend
   node test_m2_security.js
   ```

2. **Expected Test Results**:
   - All `/api/usuarios` routes return 200/201 for `admin` and 403 for `almacen`, `supervisor`, `trabajador`.
   - `GET /api/audit` returns 200 for `admin` and 403 for non-admins. `POST /api/audit` returns 200 for all roles.
   - `GET /api/activos` routes return 200 for all 4 roles.
   - `POST /api/activos`, `POST /api/activos/bulk`, `DELETE /api/activos/:id`, `POST /api/activos/bulk/delete` return 200/201 for `admin` and `almacen`, and 403 for `supervisor` and `trabajador`.
   - `PATCH /api/activos/:id` for `supervisor` succeeds (200) when updating allowed status/reassignment fields (`estado`, `observaciones`, `notas`, `usuario_actual_id`, `ubicacion_actual_id`, `team`) and returns 403 Forbidden with `{ success: false, error: { code: 'FORBIDDEN', message: 'Supervisors are restricted to status and reassignment updates only.' } }` when forbidden fields (e.g. `fecha_ultima_cali`) are present.
