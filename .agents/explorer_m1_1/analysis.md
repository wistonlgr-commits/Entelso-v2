# Milestone 1 (M1) Implementation Blueprint: DB Schema & Auth/RBAC Middleware

**Date**: 2026-08-03  
**Milestone**: M1 - DB Schema & Auth/RBAC Middleware  
**Target Files**:
1. `init.sql`
2. `backend/src/common/middleware/auth.middleware.js`
3. `backend/src/modules/usuarios/usuarios.validation.js` (Verification only)

---

## 1. Objective & Scope

Milestone 1 establishes the core backend foundations for the 4-role Role-Based Access Control (RBAC) model (`admin`, `almacen`, `supervisor`, `trabajador`). Specifically:
1. Seed data in `init.sql` must include a default user assigned to the `almacen` (Warehouse) role.
2. The authentication middleware `auth.middleware.js` must export a flexible role-checking middleware factory (`requireRoles(...roles)`).
3. The Zod validation schemas in `usuarios.validation.js` must be verified for full support of all 4 roles.

---

## 2. Component Analysis & Step-by-Step Instructions for Worker

### 2.1 Task 1: Update `init.sql` (Seed Data)

* **Target File**: `init.sql` (Absolute path: `c:\Users\Leor\Desktop\Entelso\init.sql`)
* **Current State**:
  * Line 45 defines `rol VARCHAR(50) NOT NULL DEFAULT 'trabajador'`.
  * Lines 196–203 insert 7 seed users:
    * `Carlos Admin` (`admin`)
    * `Juan Pérez` (`trabajador`)
    * `María González` (`trabajador`)
    * `Pedro Ramírez` (`supervisor`)
    * `Ana Torres` (`trabajador`)
    * `Luis Rodríguez` (`trabajador`)
    * `Supervisor NSW` (`supervisor`)
  * The `almacen` role is NOT present in the seed data.
* **Worker Action Plan**:
  1. Open `init.sql`.
  2. Locate the seed user `INSERT` statement around line 196.
  3. Add a seed user with `rol = 'almacen'`, email `'almacen@entelso.com'`, and password hash matching the standard test PIN/password hash (`$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi`).
  4. Ensure proper SQL syntax (commas separating rows, ending with semicolon).

**Exact Code Blueprint (`init.sql`)**:
```sql
-- Replace lines 196-203 with:
INSERT INTO usuarios (nombre, telefono_whatsapp, email, rol, team, pin_hash) VALUES
('Carlos Admin',          '+584121000001', 'admin@entelso.com',     'admin',      NULL,            '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Juan Pérez',            '+584121234567', 'juan@entelso.com',      'trabajador', 'Transmission',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('María González',        '+584127654321', 'maria@entelso.com',     'trabajador', 'Energy',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Pedro Ramírez',         '+584129876543', NULL,                    'supervisor', 'Calibration',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Ana Torres',            '+584120001111', NULL,                    'trabajador', 'Networks',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Luis Rodríguez',        '+584120002222', NULL,                    'trabajador', 'Maintenance',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Supervisor NSW',        '+614001112222', 'super.nsw@entelso.com', 'supervisor', 'Instrumentation','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
('Roberto Almacén',       '+584120003333', 'almacen@entelso.com',   'almacen',    'Warehouse',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
```

---

### 2.2 Task 2: Enhance `auth.middleware.js` (Role-Based Authorization)

* **Target File**: `backend/src/common/middleware/auth.middleware.js` (Absolute path: `c:\Users\Leor\Desktop\Entelso\backend\src\common\middleware\auth.middleware.js`)
* **Current State**:
  * Line 40–46 exports `requireAdmin`, which checks `req.user && req.user.rol === 'admin'`.
  * Line 48 exports `{ requireApiKey, requireAuth, requireAdmin }`.
* **Worker Action Plan**:
  1. Open `backend/src/common/middleware/auth.middleware.js`.
  2. Implement `requireRoles(...roles)` as a middleware factory that flattens inputs, checks `req.user`, and verifies `allowedRoles.includes(req.user.rol)`.
  3. If `req.user` is missing, return `401 Unauthorized`.
  4. If `req.user.rol` is not in allowed roles, return `403 Forbidden` with standard error format using `res.error(...)`.
  5. Export `requireRoles` in `module.exports`.

**Exact Code Blueprint (`auth.middleware.js`)**:
```javascript
/**
 * Middleware factory para restringir el acceso según uno o varios roles permitidos.
 * Soporta invocaciones variádicas o por arreglo:
 *   requireRoles('admin', 'almacen')
 *   requireRoles(['admin', 'almacen'])
 */
const requireRoles = (...roles) => {
  const allowedRoles = roles.flat();
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

module.exports = { requireApiKey, requireAuth, requireAdmin, requireRoles };
```

---

### 2.3 Task 3: Verify `usuarios.validation.js`

* **Target File**: `backend/src/modules/usuarios/usuarios.validation.js` (Absolute path: `c:\Users\Leor\Desktop\Entelso\backend\src\modules\usuarios\usuarios.validation.js`)
* **Investigation Findings**:
  * Line 7 (`createUserSchema`):
    `rol: z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional()`
  * Line 18 (`updateUserSchema`):
    `rol: z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional()`
* **Worker Action Plan**:
  * Verify that all 4 roles (`trabajador`, `admin`, `supervisor`, `almacen`) are present in both enum arrays.
  * No edits are necessary for `usuarios.validation.js`.

---

## 3. Independent Verification Plan for Worker

1. **Database Seed Verification**:
   * Execute `init.sql` against a test PostgreSQL instance (or inspect `init.sql`).
   * Confirm `SELECT * FROM usuarios WHERE rol = 'almacen'` returns `Roberto Almacén` with email `almacen@entelso.com`.

2. **Middleware Unit / Integration Test**:
   * Create a unit test or run node execution test:
     * Call `requireRoles('admin', 'almacen')({ user: { rol: 'almacen' } }, reply, next)` -> expect `next()` called.
     * Call `requireRoles('admin', 'almacen')({ user: { rol: 'trabajador' } }, reply, next)` -> expect `reply.status(403)`.
     * Call `requireRoles('admin', 'almacen')({}, reply, next)` -> expect `reply.status(401)`.

3. **Export Check**:
   * Run `node -e "const m = require('./backend/src/common/middleware/auth.middleware'); console.log(typeof m.requireRoles);"` -> expect output `'function'`.
