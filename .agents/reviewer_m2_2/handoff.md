# Handoff Report — Milestone 2 (M2): Backend API Security Review

## 1. Observation

Direct code observations and verification results:

1. **Test Execution Failure**:
   - Command: `node backend/test_m2_security.js`
   - Output / Error:
     ```
     C:\Users\Leor\Desktop\Entelso\backend\src\modules\activos\activos.validation.js:36
     }).refine(noConflicto, conflictMsg).passthrough();
                                         ^

     TypeError: z.object(...).refine(...).passthrough is not a function
         at Object.<anonymous> (C:\Users\Leor\Desktop\Entelso\backend\src\modules\activos\activos.validation.js:36:37)
     ```
   - Analysis: `z.object(...).refine(...)` returns a `ZodEffects` instance in Zod v3 (`zod^3.23.8`), which does not possess a `.passthrough()` method. Calling `.passthrough()` after `.refine()` causes a runtime syntax/type crash on module import. `.passthrough()` must be chained on the `z.object({...})` schema *before* calling `.refine(...)`, e.g. `z.object({...}).passthrough().refine(noConflicto, conflictMsg)`.

2. **Code & Route Security Inspection**:
   - **`backend/src/modules/usuarios/usuarios.routes.js`**:
     - Router uses `router.use(requireAuth, requireAdmin);` at top-level. Restricts all user management routes to `admin` role. Correctly enforced.
   - **`backend/src/modules/audit/audit.routes.js`**:
     - `GET /` is protected by `requireAdmin`.
     - `POST /` remains under `requireAuth` to accept logging from all authenticated users. Correctly enforced.
   - **`backend/src/modules/activos/activos.routes.js`**:
     - `GET` endpoints allow all 4 authenticated roles (`admin`, `almacen`, `supervisor`, `trabajador`).
     - `POST` / `DELETE` / `POST /bulk/delete` restricted to `admin` and `almacen`.
     - `PATCH` endpoints allow `admin`, `almacen`, and `supervisor`.
   - **`backend/src/modules/activos/activos.controller.js`**:
     - Enforces field restriction for `supervisor` role during single asset updates:
       `allowedSupervisorFields = ['usuario_actual_id', 'ubicacion_actual_id', 'team', 'estado', 'observaciones', 'notas']`.
     - Returns HTTP 403 with `FORBIDDEN` code when supervisor includes restricted fields.
   - **`backend/src/common/middleware/auth.middleware.js`**:
     - Missing token handling returns HTTP 401 `UNAUTHORIZED`.
     - Token expiration returns HTTP 401 `TOKEN_EXPIRED`.
     - Invalid roles return HTTP 403 `FORBIDDEN`.

---

## 2. Logic Chain

1. Worker M2 introduced `.passthrough()` in `backend/src/modules/activos/activos.validation.js`:
   ```javascript
   exports.updateAssetSchema = z.object({
     ...
   }).refine(noConflicto, conflictMsg).passthrough();
   ```
2. In Zod 3.x, `z.object()` creates a `ZodObject` (which has `.passthrough()`), but `.refine()` wraps it into a `ZodEffects` object. `ZodEffects` does not expose `.passthrough()`.
3. Loading `activos.routes.js` requires `activos.validation.js`, triggering an unhandled `TypeError` during module compilation before any server or route test can start.
4. Because `node backend/test_m2_security.js` crashes immediately on module load with exit code 1, verification fails and the changes cannot be deployed or approved in their current state.

---

## 3. Caveats

- Aside from the Zod schema chaining error (`.passthrough()` order), the RBAC logic in route definitions and controller authorization checks for supervisors, workers, admins, and warehouse roles is conceptually sound and matches all specifications in `ORIGINAL_REQUEST.md`.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

**Findings**:

### [Critical] Finding 1: Runtime Crash in `activos.validation.js` (Zod schema definition)
- **What**: `TypeError: z.object(...).refine(...).passthrough is not a function` when loading `backend/src/modules/activos/activos.validation.js`.
- **Where**: `backend/src/modules/activos/activos.validation.js:36`
- **Why**: Calling `.passthrough()` on the `ZodEffects` object returned by `.refine(...)` causes a fatal runtime exception on module import, preventing backend startup and failing `node backend/test_m2_security.js`.
- **Suggestion**: Move `.passthrough()` before `.refine(...)` on `updateAssetSchema`:
  ```javascript
  exports.updateAssetSchema = z.object({
    usuario_actual_id:   z.number().int().positive().nullable().optional(),
    ubicacion_actual_id: z.number().int().positive().nullable().optional(),
    team: z.string().nullable().optional(),
    fecha_ultima_cali: fecha, fecha_prox_cali: fecha,
    fecha_ultimo_tag:  fecha, fecha_prox_tag:  fecha,
    estado: estadoEnum.optional(),
    fotos: z.array(z.string()).optional(),
    notas: z.string().nullable().optional(),
    observaciones: z.string().nullable().optional(),
  }).passthrough().refine(noConflicto, conflictMsg);
  ```

---

## 5. Verification Method

1. Apply the suggested Zod schema fix in `backend/src/modules/activos/activos.validation.js`.
2. Run the test suite:
   ```bash
   node backend/test_m2_security.js
   ```
3. Confirm that all test cases pass with code 0.
