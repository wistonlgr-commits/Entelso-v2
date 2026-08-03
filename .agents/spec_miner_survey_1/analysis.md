# Detailed Specification Analysis & Survey Report

**Project**: Entelso Inventory & Asset Tracking System  
**Phase**: Survey & Specification Mining  
**Target Architecture**: Node.js/Express Backend, Vanilla JS Frontend, PostgreSQL Database  

---

## 1. Executive Summary & Survey Scope

This document details the complete specification mining analysis conducted for implementing Role-Based Access Control (RBAC) and strict English localization across the Entelso system.

The application currently has rudimentary authentication (JWT with `requireAuth` and `requireAdmin` middleware) and partial language support (`i18n.js` with `window.i18n.t()`). However, there are permission gaps where endpoints only check for `admin` vs non-admin, leaving the intermediate roles (`almacen` and `supervisor`) indistinguishable from `trabajador` in backend enforcement. Furthermore, Spanish error messages in backend middleware/controllers and hardcoded Spanish fallbacks in frontend scripts leak untranslated text to end users.

---

## 2. Functional Requirements Breakdown

### R1. 4-Role Hierarchy & Database Schema
The database and backend middleware must enforce four discrete roles stored in `usuarios.rol`:

1. **Administrator (`admin`)**:
   - Full read/write access across all system entities.
   - Can manage users (`/api/usuarios`), view audit logs (`/api/audit`), perform bulk deletions, configure system parameters, and manage assets.

2. **Warehouse (`almacen`)**:
   - Operational asset manager.
   - Allowed: Create (`POST /api/activos`), update asset details (`PATCH /api/activos/:id`), assign/reassign assets, perform bulk asset status/category/zone updates.
   - Forbidden: User management (`/api/usuarios`), viewing audit logs (`/api/audit`).

3. **Supervisor (`supervisor`)**:
   - Field operations supervisor with restricted asset modification rights.
   - Allowed: Read-only access to assets, reassign asset owners/locations/teams (`usuario_actual_id`, `ubicacion_actual_id`, `team`), update asset operational status (`estado`), and initiate maintenance requests (`POST /api/mantenimientos`).
   - Forbidden: Creating new assets (`POST /api/activos`), deleting assets (`DELETE /api/activos`), editing core asset metadata (serial numbers, item type), user management, and audit log access.

4. **Worker (`trabajador`)**:
   - Read-only user.
   - Allowed: View assets (`GET /api/activos`), look up asset details, view alerts, scan QR codes.
   - Forbidden: Creating, editing, reassigning, or deleting assets; scheduling maintenance; user management; audit logs.

---

## 3. Security Boundaries & Authorization Model

### 3.1 Authentication Strategy
- **Mechanism**: JSON Web Tokens (JWT) sent via `Authorization: Bearer <token>` header.
- **Payload Structure**: `{ sub: user.id, nombre: user.nombre, email: user.email, rol: user.rol }`.
- **Client Storage**: Managed via `sessionStorage` (with `localStorage` fallback synchronization for tab persistence).

### 3.2 Backend Middleware Architecture
The backend require enhanced middleware components in `backend/src/common/middleware/auth.middleware.js`:
- `requireAuth`: Verifies JWT signature and attaches `req.user` (`{ sub, nombre, email, rol }`). Returns 401 `UNAUTHORIZED` or `TOKEN_EXPIRED` if invalid.
- `requireAdmin`: Enforces `req.user.rol === 'admin'`. Returns 403 `FORBIDDEN` if non-admin.
- `requireRoles(...allowedRoles)`: Flexible middleware verifying `allowedRoles.includes(req.user.rol)`. Returns 403 `FORBIDDEN` if role is not authorized.
- `restrictSupervisorUpdates`: Express middleware for `PATCH /api/activos/:id` that validates incoming request payload fields when `req.user.rol === 'supervisor'`. Allows only `['estado', 'usuario_actual_id', 'ubicacion_actual_id', 'team', 'notas']`.

---

## 4. Exact Role Permission Matrix

The following matrix maps the four roles against all system endpoints, UI views, and UI controls:

| Feature / Resource | Endpoint or UI Control | `admin` | `almacen` | `supervisor` | `trabajador` |
|---|---|---|---|---|---|
| **View Assets** | `GET /api/activos`, `GET /api/activos/:id`, `GET /api/activos/serial/:serial` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Create Asset** | `POST /api/activos`, `POST /api/activos/bulk` | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Full Asset Edit** | `PATCH /api/activos/:id` (serial, item_id, photos, dates) | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Reassign Asset** | `PATCH /api/activos/:id` (`usuario_actual_id`, `ubicacion_actual_id`, `team`) | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) |
| **Update Asset Status** | `PATCH /api/activos/:id` (`estado`), `PATCH /api/activos/bulk/status` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) |
| **Delete Asset** | `DELETE /api/activos/:id`, `DELETE /api/activos/bulk/all`, `POST /api/activos/bulk/delete` | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Schedule Maintenance** | `POST /api/mantenimientos` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) |
| **Resolve Maintenance** | `PUT /api/mantenimientos/:id/atendido` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) |
| **Audit Logs API** | `GET /api/audit`, `POST /api/audit` | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Users CRUD API** | `GET/POST/PUT/DELETE /api/usuarios` | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Teams Management API** | `POST/DELETE /api/teams` | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Zones Management API** | `POST/PUT/DELETE /api/ubicaciones` | ✅ Allowed | ✅ Allowed | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **UI Navigation: Admin Tab** | `id="menuUsuarios"` (User Management) | 👁️ Visible | 🙈 Hidden | 🙈 Hidden | 🙈 Hidden |
| **UI Navigation: Audit Tab** | `id="menuAudit"` (Activity Log) | 👁️ Visible | 🙈 Hidden | 🙈 Hidden | 🙈 Hidden |
| **UI Button: Add Asset** | `id="openModalBtn"`, `#openNewItemModal2` | 👁️ Visible | 👁️ Visible | 🙈 Hidden | 🙈 Hidden |
| **UI Button: Bulk Import** | `#btnBulkImport` | 👁️ Visible | 👁️ Visible | 🙈 Hidden | 🙈 Hidden |
| **UI Button: Edit Asset** | `.btn-edit` / Asset Drawer Edit actions | 👁️ Visible | 👁️ Visible | ⚠️ Status/Assign Only | 🙈 Hidden |
| **UI Button: Delete Asset** | Asset Drawer Delete button | 👁️ Visible | 👁️ Visible | 🙈 Hidden | 🙈 Hidden |

---

## 5. Audit of Localization Files & Dictionary Usage (`window.i18n.t()`)

### 5.1 System Architecture
The localization system uses `dashboard/i18n.js` with `window.i18n.t(key)` and DOM attributes (`data-i18n`, `data-i18n-ph`, `data-i18n-title`). The default language is set to English (`'en'`).

### 5.2 Identified Gaps & Spanish String Leaks

1. **Backend Middleware Error Messages (`backend/src/common/middleware/auth.middleware.js`)**:
   - `Clave de API no provista.` -> Should return standard error code `UNAUTHORIZED` and English message `"API Key not provided."`.
   - `Clave de API inválida.` -> Should return `FORBIDDEN` and `"Invalid API Key."`.
   - `Token de acceso no provisto.` -> Should return `UNAUTHORIZED` and `"Access token required."`.
   - `La sesión expiró. Vuelve a iniciar sesión.` -> Should return `TOKEN_EXPIRED` and `"Session expired. Please log in again."`.
   - `Token inválido.` -> Should return `INVALID_TOKEN` and `"Invalid token."`.
   - `Acceso denegado. Se requieren privilegios de administrador.` -> Should return `FORBIDDEN` and `"Access denied. Administrator privileges required."`.

2. **Backend Controllers Error Messages (`backend/src/modules/*/`)**:
   - `Activo no encontrado.` (`activos.controller.js:10,17`) -> `"Asset not found."`
   - `Se requiere un array de IDs.` (`activos.controller.js:45`) -> `"Array of IDs is required."`
   - `Faltan datos.` (`activos.controller.js:54,64,74,84`) -> `"Missing required fields."`
   - `Activo eliminado.` (`activos.controller.js:30`) -> `"Asset deleted."`
   - `Ubicación no encontrada.` (`ubicaciones.controller.js:10,17,29,37`) -> `"Location not found."`
   - `No se puede eliminar la zona porque tiene equipos asignados.` (`ubicaciones.controller.js:41`) -> `"Cannot delete zone because assets are assigned to it."`
   - `Usuario no encontrado.` (`usuarios.controller.js:10,17,27`) -> `"User not found."`
   - `Item no encontrado.` (`items.controller.js:10`) -> `"Item not found."`

3. **Frontend JavaScript Fallback Strings (`dashboard/script.js`)**:
   - Line 1381: `window.i18n.t('usuarios.err_eliminar') || "Error al eliminar"` -> Spanish fallback `"Error al eliminar"`.
   - Line 1383: `window.i18n.t('seg.err_red') || "Error de red"` -> Spanish fallback `"Error de red"`.
   - Line 1412: `msgEl.textContent = 'El nombre y la contraseña/PIN son obligatorios.'` -> Hardcoded Spanish string.
   - Line 1529: `window.i18n.t('drawer.no_encontrado') || "No se encontró el equipo en el inventario."` -> Spanish fallback.
   - Line 1967: `msgEl.textContent = data.message || 'Error en la importación.'` -> Hardcoded Spanish string.
   - Line 2116: `fotoStatus.textContent = 'Error: ' + (data.message || 'Error al subir');` -> Hardcoded Spanish string.
   - Line 2119: `fotoStatus.textContent = 'Error de red al subir la imagen.'` -> Hardcoded Spanish string.
   - Line 2709: `window.i18n.t('drawer.err_eliminar') || "Error eliminando"` -> Spanish fallback.
   - Line 2722: `window.i18n.t('drawer.err_actualizar') || "Error actualizando"` -> Spanish fallback.
   - Line 3124: `"No se pudo actualizar"` -> Spanish fallback string.

4. **HTML Fallback Texts in `dashboard/index.html`**:
   - Default text in buttons/placeholders in static HTML (e.g. line 305 `Nuevo`, line 373 `Buscar empleado, ID, team...`, line 1186 `Cancelar`). These should have English default text in HTML nodes so if JS loads before `applyTranslations()`, no Spanish is briefly visible.

---

## 6. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth | User Login | Authenticates user via email and PIN, issuing JWT | `email`, `pin` | `{ token, usuario }` | Returns 401/400 on invalid credentials | `auth.controller.js` |
| 2 | Auth | Profile & 2FA | Retrieves profile, changes password, configures 2FA TOTP | `old_password`, `new_password`, `totp_token` | `{ success: true }` | Returns 400 on invalid token/pass | `auth.controller.js` |
| 3 | Users | User Management CRUD | Admin creates, edits, lists, and deletes system users | `nombre`, `email`, `rol`, `team`, `pin` | User JSON object | Returns 403 for non-admins, 400 on validation error | `usuarios.controller.js` |
| 4 | Assets | Asset Inventory List | Retrieves asset records with optional filtering & search | `estado`, `item_id`, `search` | Array of asset records | Returns empty array if no match | `activos.controller.js` |
| 5 | Assets | Asset Creation | Creates asset record and auto-links or creates catalog item | `descripcion`, `numero_serie`, `estado`, `team` | Created asset object | Returns 403 for supervisor/trabajador, 400 if validation fails | `activos.controller.js` |
| 6 | Assets | Asset Edit & Reassignment | Updates asset fields (status, user assignment, zone, team) | `id`, JSON patch body | Updated asset object | Returns 403 for unauthorized fields or roles | `activos.controller.js` |
| 7 | Assets | Asset Deletion | Deletes single or bulk assets along with associated history | `id` or array of `ids` | `{ deleted: true }` | Returns 403 for non-admin/non-almacen | `activos.controller.js` |
| 8 | Maintenance | Schedule & Resolve Maintenance | Records asset maintenance entries and marks them resolved | `activo_id`, `motivo`, `fecha_estimada_retorno` | Maintenance record | Returns 403 for trabajador, 404 if asset not found | `mantenimientos.controller.js` |
| 9 | Movements | Movement Audit History | Logs and queries transfer, ingress, dispatch, and return events | `activo_id`, `tipo_movimiento`, `usuario_id` | Array of movement logs | Returns 401 if unauthorized | `movimientos.controller.js` |
| 10 | Alerts | Calibration & Tag Expiry Alerts | Queries upcoming or overdue calibration and inspection dates | N/A | Array of alert records from SQL view | Returns 401 if unauthorized | `alertas.controller.js` |
| 11 | Audit | System Audit Logs | Records administrative actions for governance inspection | `accion`, `detalles` | Array of log entries | Returns 403 for non-admin users | `audit.controller.js` |
| 12 | Teams | Teams Administration | Lists, creates, and deletes operational teams | `nombre` | Team record | Returns 403 for non-admins on mutation | `teams.controller.js` |
| 13 | Locations | Physical Zones Management | Lists, creates, updates, and deletes physical zones | `nombre_ubicacion`, `descripcion` | Zone record | Returns 400 if zone has assigned assets on delete | `ubicaciones.controller.js` |
| 14 | Ingest | Bulk Import (Excel/CSV) | Parses uploaded files and inserts assets in bulk | Multi-part file upload | Import count summary | Returns 400 on malformed file headers | `ingest.controller.js` |
| 15 | Media | Asset Photo Upload | Uploads image files to storage directory | Multi-part image file | `{ url }` | Returns 400 if no file provided | `upload.routes.js` |

---

## 7. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Security Enforcement | `trabajador` sending `POST /api/activos` | Returns 403 Forbidden error response (`FORBIDDEN`). |
| 2 | Security Enforcement | `almacen` requesting `GET /api/usuarios` | Returns 403 Forbidden error response (`FORBIDDEN`). |
| 3 | Security Enforcement | `supervisor` requesting `DELETE /api/activos/1` | Returns 403 Forbidden error response (`FORBIDDEN`). |
| 4 | Asset Modification | `supervisor` requesting `PATCH /api/activos/1` with body `{ "numero_serie": "NEW-SERIAL" }` | Rejected with 403 Forbidden or restricted field error; supervisor cannot modify serial number. |
| 5 | Database Constraint | Asset payload containing both `usuario_actual_id` AND `ubicacion_actual_id` | Throws operational error: "An asset cannot have both a user and a location simultaneously." (violates `chk_ubicacion_usuario`). |
| 6 | Bulk Delete | Non-admin sending `DELETE /api/activos/bulk/all` | Returns 403 Forbidden error response. |
| 7 | Zone Deletion | `DELETE /api/ubicaciones/:id` when assets are currently assigned to that zone | Returns 400 Bad Request: "Cannot delete zone because assets are assigned to it." |
| 8 | Localization | Backend returning raw Spanish string in response message | If frontend renders `json.message` directly without `i18n.t()`, Spanish text leaks to UI. |
| 9 | Authentication | Request sent with expired JWT | Returns 401 Unauthorized with code `TOKEN_EXPIRED`. |
| 10 | UI Access Control | Non-admin user directly clicking profile menu item for User Management (`#menuUsuarios`) | Tab/view must be hidden in DOM and click handler guarded by role check. |
