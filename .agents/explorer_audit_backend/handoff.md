# Backend Codebase Audit Report — Entelso-v2

**Auditor**: Teamwork Explorer (Backend Codebase Auditor)  
**Target**: `backend/` (Node.js / Express / PostgreSQL / Supabase)  
**Date**: 2026-08-14  
**Audit Scope**: Security Vulnerabilities, Logic Bugs & Edge Cases, Performance Bottlenecks, Architecture & Clean Code, Automated Test Suite Assessment.

---

## 1. Observation

Direct, verified evidence gathered across the codebase with exact file paths, line numbers, and code extracts:

### 1.1 Security Vulnerabilities Observations

1. **RBAC Authorization Bypass on User Management Endpoints**
   - **File**: `backend/src/modules/usuarios/usuarios.routes.js` (lines 7–10)
   - **Code**:
     ```javascript
     7: router.get('/',             requireAuth, ctrl.getAll);
     8: router.delete('/bulk/others', requireAuth, requireAdmin, ctrl.removeAllOthers);
     9: router.get('/:id',          requireAuth, ctrl.getById);
     10: router.get('/:id/activos',  requireAuth, ctrl.getAssets);
     ```
   - **Observation**: `GET /api/usuarios`, `GET /api/usuarios/:id`, and `GET /api/usuarios/:id/activos` only enforce `requireAuth`. Any authenticated user with role `trabajador`, `supervisor`, or `almacen` can retrieve the entire user registry (names, emails, WhatsApp phone numbers, team, role, assigned assets). This directly violates requirement R2 and acceptance criteria (`A user with role almacen receives a 403 Forbidden error if they try to call GET /api/usuarios`).

2. **Inverted / Over-Restrictive Asset Permissions (Blocking Warehouse Role)**
   - **File**: `backend/src/modules/activos/activos.routes.js` (lines 9–19)
   - **Code**:
     ```javascript
     16: router.post('/',               requireAuth, requireAdmin, validate(createAssetSchema), ctrl.create);
     17: router.post('/bulk',          requireAuth, requireAdmin, validate(bulkCreateAssetSchema), ctrl.bulkCreate);
     18: router.patch('/:id',           requireAuth, requireAdmin, validate(updateAssetSchema), ctrl.update);
     19: router.delete('/:id',          requireAuth, requireAdmin, ctrl.remove);
     ```
   - **Observation**: All mutation endpoints on `/api/activos` require `requireAdmin`. The `almacen` (warehouse) role is explicitly intended to create, edit, and assign assets (Requirement R1: *Warehouse (almacen): Can manage assets (create, edit, assign)*), but is rejected with HTTP 403 Forbidden because no granular RBAC middleware (e.g., `requireRole(['admin', 'almacen'])`) exists.

3. **Unprotected Catalog, Inventory Movements, Location & Audit Endpoints**
   - **File**: `backend/src/modules/items/items.routes.js` (lines 10–13)
     - `POST /api/items`, `PUT /api/items/:id`, `PATCH /api/items/:id/stock`, `DELETE /api/items/:id` have only `requireAuth`. Any `trabajador` can delete catalog categories or manipulate global stock.
   - **File**: `backend/src/modules/ubicaciones/ubicaciones.routes.js` (lines 10–12)
     - `POST /api/ubicaciones`, `PUT /api/ubicaciones/:id`, `DELETE /api/ubicaciones/:id` have only `requireAuth`. Any worker can create, alter, or delete physical warehouse locations.
   - **File**: `backend/src/modules/audit/audit.routes.js` (lines 7–9)
     - `GET /api/audit` and `POST /api/audit` only enforce `requireAuth`. Non-admin users can view system audit logs and inject arbitrary fake audit logs (`POST /api/audit`).

4. **Completely Unauthenticated File Upload Endpoints & In-Memory DoS**
   - **File**: `backend/src/modules/upload/upload.routes.js` (lines 13–45)
   - **Code**:
     ```javascript
     8: const upload = multer({
     9:   storage: multer.memoryStorage(),
     10:  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
     11: });
     13: router.post('/', upload.single('foto'), async (req, reply, next) => { ... });
     28: router.post('/batch', upload.array('fotos', 5), async (req, reply, next) => { ... });
     ```
   - **Observation**: No `requireAuth` middleware is mounted. Any anonymous actor on the public internet can upload arbitrary files (up to 5MB single, up to 25MB batch) to Supabase Storage. Furthermore, there is no MIME-type or file-extension whitelist/filter, enabling unrestricted file upload (e.g., `.html`, `.svg`, `.exe`).

5. **2FA Implementation Bypass and Plaintext Secret Storage**
   - **File**: `backend/src/modules/auth/auth.service.js` (lines 10–67 vs lines 138, 157)
   - **Observation**: `setup2FA` stores the TOTP secret key unencrypted in `usuarios.secret_2fa` (`UPDATE usuarios SET secret_2fa = $1 WHERE id = $2`). Crucially, `exports.login` (lines 10–67) never checks `is_2fa_enabled` or validates a TOTP token before issuing a JWT, rendering 2FA completely inoperative in the authentication flow.

6. **Timing Attack Vulnerability in API Key Validation**
   - **File**: `backend/src/common/middleware/auth.middleware.js` (lines 10–12)
   - **Code**:
     ```javascript
     const key = req.headers['x-api-key'] || req.headers['x-ingest-secret'];
     if (!key)           return reply.status(401).json(res.error('Clave de API no provista.',  'UNAUTHORIZED'));
     if (key !== env.API_KEY) return reply.status(403).json(res.error('Clave de API inválida.', 'FORBIDDEN'));
     ```
   - **Observation**: Non-constant time string equality comparison (`key !== env.API_KEY`) is susceptible to timing side-channel attacks for secret brute-forcing.

7. **JWT Secret Strength & Missing Revocation Mechanism**
   - **File**: `backend/src/config/environment.js` (line 9): `JWT_SECRET: z.string().min(10)` allows weak secrets (RFC 7518 recommends >= 256 bits / 32 bytes).
   - **File**: `backend/src/common/middleware/auth.middleware.js` (line 29): `jwt.verify(token, env.JWT_SECRET)` does not specify `{ algorithms: ['HS256'] }`.
   - **File**: `backend/src/modules/auth/auth.service.js` (line 55): JWTs have a 2-hour lifetime without a revocation list or `token_version` check; deactivated users retain active sessions until expiration.

---

### 1.2 Bugs, Logic Flaws & Edge Cases Observations

1. **Fatal Database Transaction Connection Pool Bug (False Transactions)**
   - **Files**:
     - `backend/src/modules/mantenimientos/mantenimientos.service.js` (lines 19–34)
     - `backend/src/modules/whatsapp/whatsapp.service.js` (lines 77, 102, 105, 115, 128, 131, 175, 182, 185)
   - **Code (`mantenimientos.service.js`)**:
     ```javascript
     19: await db.query('BEGIN');
     20: try {
     21:     const { rows } = await db.query(`INSERT INTO mantenimientos ...`, [...]);
     28:     await db.query(`UPDATE activos SET estado = 'en_mantenimiento' WHERE id = $1`, [activo_id]);
     30:     await db.query('COMMIT');
     31: } catch (err) {
     32:     await db.query('ROLLBACK');
     33:     throw err;
     34: }
     ```
   - **Observation**: `db.query` delegates to `pool.query()`. Each call borrows a client from `pg.Pool`, executes one statement, and immediately returns the client to the pool. As a result, `BEGIN`, `INSERT`, `UPDATE`, and `COMMIT` execute on different connections. The statements execute in autocommit mode without transaction isolation, and pool connections remain dirty with unclosed transactions.

2. **Unhandled Promise Rejection in Express 4 Async Route Handler**
   - **File**: `backend/src/modules/auth/auth.controller.js` (lines 8–27)
   - **Code**:
     ```javascript
     8: exports.login = async (req, reply) => {
     9:   try { ... } catch (err) {
     21:     if (err.isOperational) {
     22:       return reply.status(err.statusCode ?? 401).json(res.error(err.message, 'AUTH_ERROR'));
     23:     }
     26:     throw err; // el error handler global lo maneja
     27:   }
     28: };
     ```
   - **Observation**: In Express 4 (`express@4.19.2`), throwing an error inside an `async` function handler that does not call `next(err)` triggers an `UnhandledPromiseRejection` in Node.js, leaving the HTTP client hanging indefinitely or crashing the Node process.

3. **Controller Context Mismatch Causing Delete Failure**
   - **File**: `backend/src/modules/usuarios/usuarios.controller.js` (line 39)
   - **Code**:
     ```javascript
     exports.removeAllOthers = async (req, reply, next) => {
       try {
         await svc.removeAllOthers(req.user.id);
         reply.json(res.success({ deleted: true, kept: req.user.id }));
       } catch (e) { next(e); }
     };
     ```
   - **Observation**: `auth.middleware.js` attaches JWT claims as `req.user = payload` where the user ID is in `sub` (`req.user.sub`), not `req.user.id`. `req.user.id` is `undefined`, causing `svc.removeAllOthers(undefined)` to execute `DELETE FROM usuarios WHERE id != $1` with `[undefined]`, throwing a Postgres execution error.

4. **Race Condition in Asset Serial Number Generation**
   - **File**: `backend/src/modules/activos/activos.service.js` (lines 28–51)
   - **Code**:
     ```javascript
     async function generateAutoId(categoria) {
       ...
       const res = await db.query(`SELECT numero_serie FROM activos WHERE numero_serie LIKE $1`, [prefix + '-%']);
       if (res.rows.length > 0) {
         let maxNum = 0;
         for (const row of res.rows) {
           const num = parseInt(row.numero_serie.substring(prefix.length + 1), 10);
           if (!isNaN(num) && num > maxNum) maxNum = num;
         }
         seq = maxNum + 1;
       }
       return `${prefix}-${String(seq).padStart(5, '0')}`;
     }
     ```
   - **Observation**: Auto-incrementing IDs are computed in Node memory via full prefix queries without database locks (`FOR UPDATE`) or sequences. Concurrent asset creations will calculate the same `seq`, resulting in duplicate key constraint collisions or data overwrites via `ON CONFLICT`.

5. **Race Condition and Negative Balance in Consumable Stock Updates**
   - **File**: `backend/src/modules/items/items.service.js` (lines 35–47) and `backend/src/modules/movimientos/movimientos.service.js` (lines 44–55)
   - **Observation**: Stock deduction executes `SELECT stock_global_consumibles FROM items WHERE id=$1` without `FOR UPDATE`, followed by `UPDATE items SET stock_global_consumibles = stock_global_consumibles - $1`. Concurrent dispatches can overdraw stock below 0.

6. **TypeError on Optional Payload Field in WhatsApp Ingestion**
   - **File**: `backend/src/modules/ingest/ingest.service.js` (line 87)
   - **Code**:
     ```javascript
     const locId = await buscarOCrear(
       client, 'ubicaciones', 'nombre_ubicacion', zona,
       { nombre_ubicacion: zona.trim(), descripcion: `Auto-creada por reporte WhatsApp (${zona})` }
     );
     ```
   - **Observation**: `ingest.validation.js` defines `zona: z.string().optional()`. When `zona` is omitted in the parsed payload, `zona.trim()` throws an uncaught `TypeError: Cannot read properties of undefined (reading 'trim')`, crashing the ingestion handler with HTTP 500.

7. **HTTP 200 OK Returned for Business & Validation Errors**
   - **File**: `backend/src/modules/whatsapp/whatsapp.controller.js` (lines 8, 14, 24, 30, 40, 46, 64, 70, 80, 86, 96, 102, 112, 118)
   - **Observation**: All error branches return `reply.status(200).json(res.error(...))`. This violates HTTP REST standards and prevents API clients/gateways from detecting failures.

8. **Broken Standalone Migration Scripts**
   - **File**: `backend/run_migration.js` (line 3): `const db = require('./src/config/db');` fails with `MODULE_NOT_FOUND` because the file is `./src/config/database.js`.

---

### 1.3 Performance Bottlenecks Observations

1. **Massive N+1 Database Query Pattern in Asset Bulk Ingestion**
   - **File**: `backend/src/modules/activos/activos.service.js` (`bulkCreate`, lines 280–379)
   - **Observation**: For a payload of 500 items, `bulkCreate` executes up to 7 separate sequential SQL queries per item (`SELECT items`, `INSERT items`, `SELECT ubicaciones`, `INSERT ubicaciones`, `SELECT items for categoria`, `generateAutoId` with `SELECT LIKE`, and `INSERT INTO activos ON CONFLICT`). This generates ~3,000 round-trips inside a single transaction, holding a connection open for several seconds and causing connection pool starvation.

2. **Unindexed Regex Scan on Phone Lookups**
   - **File**: `backend/src/modules/whatsapp/whatsapp.service.js` (lines 16–17)
   - **Code**:
     ```javascript
     SELECT id, nombre, pin_hash, activo, en_terreno FROM usuarios 
     WHERE regexp_replace(telefono_whatsapp, '\\D', '', 'g') LIKE $1 LIMIT 1
     ```
   - **Observation**: Using `regexp_replace` inside the `WHERE` clause prevents PostgreSQL from utilizing standard B-Tree indexes on `telefono_whatsapp`, resulting in a sequential table scan on every incoming WhatsApp message.

3. **Synchronous JSON Logging and Event Loop Blocking**
   - **File**: `backend/src/common/utils/logger.js` (lines 5–7)
   - **Observation**: Production logs use synchronous `console.log(JSON.stringify(...))` on stdout rather than asynchronous streams. While `pino` is declared in `package.json`, it is completely unused.
   - **File**: `backend/src/modules/whatsapp/whatsapp.service.js` (line 150): `Buffer.from(base64Data, 'base64')` synchronously parses base64 payloads up to 50MB on the main event loop thread.

4. **Missing Database Foreign Key & Query Indexes**
   - **Observation across SQL migrations**: Indexes are missing on frequently filtered foreign keys:
     - `activos(item_id)`, `activos(usuario_actual_id)`, `activos(ubicacion_actual_id)`, `activos(estado)`, `activos(team)`
     - `movimientos(activo_id)`, `movimientos(usuario_id)`, `movimientos(fecha_movimiento)`
     - `mantenimientos(activo_id)`, `mantenimientos(estado)`
     - `audit_logs(usuario_id)`, `audit_logs(creado_en)`

---

### 1.4 Architectural & Clean Code Observations

1. **Layering / Separation of Concerns Violations**
   - **File**: `backend/src/modules/items/items.controller.js` (lines 34–41): `getCategorias` imports `db` directly and executes raw SQL queries in the controller layer rather than delegating to `items.service.js`.
   - **File**: `backend/src/modules/upload/upload.routes.js`: Business logic and Promise aggregation are placed directly in the router file without controller/service separation.

2. **Uncontrolled Startup Migration Execution**
   - **File**: `backend/src/server.js` (lines 14–15):
     ```javascript
     const runMigration = require('./migrations/20260812_corrections');
     await runMigration();
     ```
   - **Observation**: Hardcoded database mutations (`20260812_corrections.js`) run on every application startup. In multi-instance or containerized environments (Docker/Kubernetes), concurrent replica boots execute table alterations and regex updates simultaneously. There is no schema migration tracking table.

3. **Automated Testing Suite: 0% Test Coverage**
   - **File**: `backend/package.json` (lines 6–10)
   - **Observation**: `package.json` contains no test script (`npm test`), no test runner installed (no Jest, Vitest, Mocha, Supertest, or C8), and zero test files (`*.test.js`, `*.spec.js`) exist in the repository.

---

## 2. Logic Chain

```
[Observation 1.1.1: usuarios.routes.js lacks requireAdmin on GET routes]
  ↳ Any authenticated role (trabajador, supervisor, almacen) can query /api/usuarios
  ↳ Violates Requirement R2 & Acceptance Criteria; sensitive user PII is exposed.

[Observation 1.1.2: activos.routes.js requires requireAdmin on all mutations]
  ↳ Users with role 'almacen' receive 403 Forbidden when creating or updating assets.
  ↳ Violates Requirement R1 (Warehouse role cannot manage assets).

[Observation 1.1.4: upload.routes.js has no requireAuth and accepts any file]
  ↳ Anonymous internet clients can upload arbitrary files up to 25MB to cloud storage.
  ↳ Creates Storage Exhaustion DoS and Stored XSS / Malware distribution vectors.

[Observation 1.2.1: mantenimientos.service.js & whatsapp.service.js call db.query('BEGIN')]
  ↳ db.query() runs pool.query(), borrowing and releasing different clients per statement.
  ↳ Database transactions are non-atomic (broken); rollback fails and pool connections are corrupted.

[Observation 1.2.2: auth.controller.js uses throw err inside async function]
  ↳ In Express 4, unhandled throws in async functions do not trigger global error middleware.
  ↳ Results in unhandled promise rejection, hanging client connections and causing reliability drops.

[Observation 1.2.4: activos.service.js computes IDs via SELECT ... LIKE in JS]
  ↳ Concurrent requests obtain identical maxNum values.
  ↳ Generates duplicate asset serial numbers and collision errors.

[Observation 1.3.1: bulkCreate runs 5-7 individual queries per row in loop]
  ↳ Bulk creating 500 assets takes thousands of network round-trips.
  ↳ Starves the connection pool (max=10) and blocks all other API requests.

[Observation 1.4.2: server.js runs hardcoded data updates on every boot]
  ↳ Server restarts re-mutate catalog categories and brands.
  ↳ Multi-replica boots trigger concurrent schema alteration races.

[Observation 1.4.3: package.json has no test dependencies or test scripts]
  ↳ Backend has 0% automated test coverage, increasing regression risk across all modules.
```

---

## 3. Caveats

1. **Static Analysis in Read-Only Mode**: The audit was performed purely via static analysis, code inspection, and AST tracing without executing mutation scripts against the live production Supabase database.
2. **Supabase Bucket Policies**: Remote Supabase Storage bucket policies (RLS / Public read-write) were evaluated based on the backend API layer (`storage.service.js` and `upload.routes.js`); database-level RLS policies on the Supabase dashboard were not directly queried via SQL client.
3. **Frontend Compatibility**: Proposed API changes (such as fixing HTTP 200 error status codes in `whatsapp.controller.js` or enforcing RBAC on `GET /api/usuarios`) must be coordinated with frontend (`dashboard/script.js`) and n8n webhook nodes to ensure contract alignment.

---

## 4. Conclusion & Actionable Recommendations

### Severity Breakdown Table

| ID | Finding | Severity | Category | Target File(s) |
|---|---|---|---|---|
| **SEC-01** | RBAC bypass on `/api/usuarios` (GET endpoints exposed to non-admins) | **Critical** | Security | `usuarios.routes.js:7-10` |
| **SEC-02** | Unauthenticated public file upload & missing MIME filter | **Critical** | Security | `upload.routes.js:13-45` |
| **SEC-03** | Broken RBAC for `almacen` role (blocked from managing assets) | **High** | Security / Logic | `activos.routes.js:16-19` |
| **SEC-04** | Missing RBAC on catalog items, locations, and audit logs | **High** | Security | `items.routes.js`, `ubicaciones.routes.js`, `audit.routes.js` |
| **SEC-05** | Inoperative 2FA in login flow & plaintext secret storage | **High** | Security | `auth.service.js:10-67, 138` |
| **SEC-06** | Timing attack vulnerability on `X-API-Key` check | **Medium** | Security | `auth.middleware.js:12` |
| **BUG-01** | Non-atomic transactions via `pool.query('BEGIN')` | **Critical** | Logic Flaw | `mantenimientos.service.js`, `whatsapp.service.js` |
| **BUG-02** | Unhandled Promise Rejection on login error | **High** | Logic Flaw | `auth.controller.js:26` |
| **BUG-03** | Context mismatch `req.user.id` vs `req.user.sub` | **Medium** | Logic Flaw | `usuarios.controller.js:39` |
| **BUG-04** | Race condition in auto-serial number generation | **Medium** | Logic Flaw | `activos.service.js:28-51` |
| **BUG-05** | TypeError crash when `zona` is omitted in WhatsApp ingest | **Medium** | Logic Flaw | `ingest.service.js:87` |
| **PERF-01** | N+1 sequential queries in `bulkCreate` (3000 queries / 500 rows) | **High** | Performance | `activos.service.js:280-379` |
| **PERF-02** | Full table scan on phone number lookups | **Medium** | Performance | `whatsapp.service.js:16-17` |
| **PERF-03** | Event loop blocking on 50MB base64 decode & synchronous logging | **Medium** | Performance | `whatsapp.service.js:150`, `logger.js:5-7` |
| **ARCH-01** | Direct SQL query in controller (`items.controller.js`) | **Low** | Architecture | `items.controller.js:34` |
| **ARCH-02** | Repeated migration execution on server startup | **Medium** | Architecture | `server.js:14-15` |
| **TEST-01** | Zero automated tests & missing test framework | **High** | Quality Assurance | `package.json` |

---

### Concrete Implementation Proposals

#### 1. Implement Role-Based Access Control Middleware (`hasRole`)
```javascript
// backend/src/common/middleware/auth.middleware.js
const hasRole = (...allowedRoles) => (req, reply, next) => {
  if (!req.user || !allowedRoles.includes(req.user.rol)) {
    return reply.status(403).json(res.error('Acceso denegado. Permisos insuficientes.', 'FORBIDDEN'));
  }
  next();
};

module.exports = { requireApiKey, requireAuth, requireAdmin, hasRole };
```
*Apply in routes*:
- `/api/usuarios`: `router.use(requireAuth, requireAdmin)`
- `/api/audit`: `router.use(requireAuth, requireAdmin)`
- `/api/activos`: `router.post('/', requireAuth, hasRole('admin', 'almacen'), ...)`
- `/api/items`: `router.post('/', requireAuth, hasRole('admin', 'almacen'), ...)`

#### 2. Fix Database Transaction Management
Replace all occurrences of `db.query('BEGIN')` with dedicated transaction clients:
```javascript
// Pattern to replace in mantenimientos.service.js and whatsapp.service.js:
const client = await db.pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query('INSERT INTO mantenimientos ...', [...]);
  await client.query('UPDATE activos SET estado = $1 WHERE id = $2', ['en_mantenimiento', activo_id]);
  await client.query('COMMIT');
  return rows[0];
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

#### 3. Fix Async Error Handling in `auth.controller.js`
```javascript
exports.login = async (req, reply, next) => {
  try {
    const { email, pin } = req.body ?? {};
    if (!email || !pin) {
      return reply.status(400).json(res.error('Email y PIN son obligatorios.', 'VALIDATION_ERROR'));
    }
    const data = await svc.login(email, pin);
    return reply.json(res.success(data));
  } catch (err) {
    if (err.isOperational) {
      return reply.status(err.statusCode ?? 401).json(res.error(err.message, 'AUTH_ERROR'));
    }
    next(err); // Correct: Pass unexpected errors to global error middleware
  }
};
```

#### 4. Secure File Upload Route (`upload.routes.js`)
```javascript
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Solo JPEG, PNG y WebP.'));
  }
});
router.post('/', requireAuth, upload.single('foto'), ...);
router.post('/batch', requireAuth, upload.array('fotos', 5), ...);
```

#### 5. Constant-Time API Key Comparison
```javascript
const crypto = require('crypto');
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};
```

---

## 5. Verification Method

To independently verify all observations in this audit:

1. **Verify Security RBAC Vulnerability**:
   - Inspect `backend/src/modules/usuarios/usuarios.routes.js:7` (`router.get('/', requireAuth, ctrl.getAll)`).
   - Observe that `requireAdmin` is absent on `GET /`, `GET /:id`, and `GET /:id/activos`.
   - Inspect `backend/src/modules/activos/activos.routes.js:16` and observe `requireAdmin` blocking `almacen`.

2. **Verify Database Pool Transaction Flaw**:
   - Inspect `backend/src/modules/mantenimientos/mantenimientos.service.js:19` and `backend/src/modules/whatsapp/whatsapp.service.js:77`.
   - Inspect `backend/src/config/database.js:27` (`const query = (text, params) => pool.query(text, params);`).
   - Confirm that `db.query('BEGIN')` runs against `pool.query()` rather than a dedicated checkout client `client = await pool.connect()`.

3. **Verify Upload Authentication Flaw**:
   - Inspect `backend/src/modules/upload/upload.routes.js:13` and confirm absence of `requireAuth`.

4. **Verify Test Framework Absence**:
   - Inspect `backend/package.json:6-10` and verify absence of `test` script and test packages.
