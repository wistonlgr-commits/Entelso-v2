# Handoff Report: Challenger M1 (M1: DB Schema & Auth/RBAC Middleware)

**Date**: 2026-08-03  
**From**: Challenger M1 (`challenger_m1_1`)  
**To**: Orchestrator / Parent Agent (`29f9f250-1aa7-46d1-a91a-0d7ee8530958`)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **`backend/src/common/middleware/auth.middleware.js` (lines 54–62)**:
   ```javascript
   const requireRoles = (...roles) => {
     const allowedRoles = roles.flat();
     return (req, reply, next) => {
       if (req.user && allowedRoles.includes(req.user.rol)) {
         return next();
       }
       return reply.status(403).json(res.error('Access denied. Required role not met.', 'FORBIDDEN'));
     };
   };
   ```

2. **Empirical Stress Test Execution Results (`test_require_roles.js`)**:
   Executed 38 stress test scenarios covering variadic arguments, array inputs, non-object `req.user`, missing `rol` properties, uppercase/whitespace role strings, prototype property attacks (`toString`, `__proto__`, `constructor`), and factory input edge cases.
   
   **Test Output**:
   ```
   === STARTING RBAC STRESS TESTS FOR requireRoles ===
   ❌ TEST FAILED: Undefined arg in factory requireRoles(undefined) with user without rol
      Expected: nextCalled=false, status=403
      Actual:   nextCalled=true, status=null
      Response Body: null
   ❌ TEST FAILED: Null arg in factory requireRoles(null) with user rol null
      Expected: nextCalled=false, status=403
      Actual:   nextCalled=true, status=null
      Response Body: null

   === TEST SUMMARY ===
   Total tests: 38
   Passed: 36
   Failed: 2
   ```

3. **`init.sql` (line 45)**:
   ```sql
   rol VARCHAR(50) NOT NULL DEFAULT 'trabajador',
   ```
   The `usuarios` table defines `rol` as `VARCHAR(50)` without a `CHECK` constraint or PostgreSQL `ENUM` type enforcing the 4 allowed values (`'admin'`, `'almacen'`, `'supervisor'`, `'trabajador'`).

---

## 2. Logic Chain

1. **Security Bypass via `undefined`/`null` Factory Arguments**:
   * **Observation**: `requireRoles(...roles)` flattens input arguments using `roles.flat()`.
   * **Inference**: If a developer invokes `requireRoles(undefined)` (e.g., passing an uninitialized environment variable or undefined role constant), `allowedRoles` becomes `[undefined]`.
   * **Inference**: If an unprivileged user request arrives where `req.user` is defined (e.g. `{ id: 10 }`) but lacks a `rol` property (`req.user.rol === undefined`), the expression `allowedRoles.includes(req.user.rol)` evaluates `[undefined].includes(undefined)`.
   * **Result**: `[undefined].includes(undefined)` returns `true` (per `SameValueZero` equality). `next()` is executed, completely bypassing authorization checks and granting unauthorized access.
   * **Verification**: Proven empirically in `test_require_roles.js` where `requireRoles(undefined)` with `req.user = {}` called `next()` instead of returning HTTP 403.

2. **Missing Database-Level Integrity Enforcement**:
   * **Observation**: `init.sql` uses custom `ENUM` types for `tipo_item_enum`, `estado_activo_enum`, and `tipo_movimiento_enum`, but leaves `usuarios.rol` as an unconstrained `VARCHAR(50)`.
   * **Inference**: Any arbitrary string (e.g. `'superuser'`, `''`, `'admin_dev'`) can be written into `usuarios.rol` via database queries or unvalidated API routes.

---

## 3. Caveats

* Standard valid string usage (e.g. `requireRoles('admin', 'almacen')`) successfully blocks unauthorized roles (returning HTTP 403), handles non-object `req.user` (`null`, `undefined`, boolean, numbers) without throwing uncaught exceptions, and properly rejects prototype inheritance attacks (`toString`, `constructor`, `__proto__`).

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

Worker `worker_m1_1` must implement the following fixes before approval:

1. **Fix RBAC Middleware (`backend/src/common/middleware/auth.middleware.js`)**:
   Sanitize `allowedRoles` to only include non-empty strings, and ensure `req.user.rol` is a valid string before performing `.includes()` comparison:
   ```javascript
   const requireRoles = (...roles) => {
     const allowedRoles = roles.flat().filter(r => typeof r === 'string' && r.trim().length > 0);
     return (req, reply, next) => {
       if (req.user && typeof req.user.rol === 'string' && allowedRoles.includes(req.user.rol)) {
         return next();
       }
       return reply.status(403).json(res.error('Access denied. Required role not met.', 'FORBIDDEN'));
     };
   };
   ```

2. **Add Database Check Constraint (`init.sql`)**:
   Enforce role schema integrity on `usuarios`:
   ```sql
   rol VARCHAR(50) NOT NULL DEFAULT 'trabajador' CHECK (rol IN ('admin', 'almacen', 'supervisor', 'trabajador')),
   ```

---

## 5. Verification Method

1. Run the empirical stress test script from the project root:
   ```powershell
   node .agents/challenger_m1_1/test_require_roles.js
   ```
2. Confirm that all 38 tests pass with 0 failures (`Passed: 38`, `Failed: 0`).
3. Verify `init.sql` contains the `CHECK (rol IN ('admin', 'almacen', 'supervisor', 'trabajador'))` constraint.
