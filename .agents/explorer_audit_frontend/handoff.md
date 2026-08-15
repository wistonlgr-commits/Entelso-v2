# Comprehensive Technical Audit Report: Entelso-v2 Frontend Codebase

**Date**: 2026-08-14  
**Auditor**: Frontend Codebase Auditor (Teamwork Explorer)  
**Scope**: `dashboard/` (`index.html`, `script.js`, `style.css`, `i18n.js`, `manual.html`, video guides, `Dockerfile`), assets, and frontend-to-backend interface parity.

---

## 1. Observation

Direct technical observations from inspecting the codebase (`dashboard/index.html`, `dashboard/script.js`, `dashboard/style.css`, `dashboard/i18n.js`, `backend/src/modules/`):

### 1.1 Security Vulnerabilities

#### [VULN-01] Stored & DOM Cross-Site Scripting (XSS) via Unsanitized `innerHTML`
- **Location**: `dashboard/script.js:3472-3478` (Team Management)
  ```javascript
  container.innerHTML = window.teamsList.map(t => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); font-size:14px;">
          <span>${t.nombre}</span>
          <button class="icon-btn" onclick="deleteTeam(${t.id})" style="color:var(--accent-red)"><i class="fa-solid fa-trash"></i></button>
      </div>
  `).join('');
  ```
  `t.nombre` is interpolated directly into `innerHTML` without `escapeHTML()`.
- **Location**: `dashboard/script.js:3889-3914` (Category Management)
  ```javascript
  <strong style="color:var(--text-1); font-size:14px;">${c.nombre}</strong>
  <input type="text" id="cat-name-${c.id}" class="form-input" value="${c.nombre}" style="width: 50%;">
  ```
  `c.nombre` is interpolated unescaped in text nodes and attribute values.
- **Location**: `dashboard/script.js:1443-1454` (User Management Table)
  ```javascript
  tr.innerHTML = `
    <td>${u.id}</td>
    <td>${u.nombre}</td>
    <td>${u.email}</td>
    <td><span class="status-badge status-${u.rol}">${window.i18n.t('usuarios.role_' + u.rol) || u.rol}</span></td>
    <td>
      <button class="icon-btn" title="..." onclick="window.editarEmpleado(${u.id})"><i class="fa-solid fa-pen"></i></button>
      <button class="icon-btn" title="..." onclick="eliminarUsuario(${u.id})"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>
    </td>
  `;
  ```
  `u.nombre` and `u.email` are rendered directly with unescaped HTML injection vectors.
- **Location**: `dashboard/script.js:759-762` (Employee Team Select)
  ```javascript
  ${window.teamsList.map(t => `<option value="${t.nombre}" ${emp.team === t.nombre ? 'selected' : ''}>${t.nombre}</option>`).join('')}
  ```
- **Location**: `dashboard/script.js:1788-1797` (Timeline History Details)
  ```javascript
  let detailText = `Por: ${mov.nombre_usuario}`;
  if (mov.ubicacion_origen && mov.ubicacion_destino) {
    detailText += ` | De: ${mov.ubicacion_origen} ➔ A: ${mov.ubicacion_destino}`;
  }
  ...
  <div class="timeline-detail">${detailText}</div>
  ```
  `mov.nombre_usuario`, `mov.ubicacion_origen`, and `mov.ubicacion_destino` are unescaped in the timeline DOM.
- **Location**: `dashboard/script.js:974` (Alerts Table)
  ```javascript
  <strong>${escapeHTML(a.equipo)}</strong><br>
  <span style="font-size:12px;color:var(--text-2); display:block; margin-top:2px;">${a.zona}</span>
  ```
  `a.zona` is not escaped.

#### [VULN-02] DOM XSS via `document.write` in Popup Print Windows
- **Location**: `dashboard/script.js:1831, 1856`
  ```javascript
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>QR - ${title}</title><style>...</style></head><body><h2>${title}</h2><p>${subtitle}</p><img src="${qrImg.src}" /><script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`);
  w.document.close();
  ```
- **Location**: `dashboard/script.js:3724-3738` (Bulk QR Label Print)
  ```javascript
  html += `
    <div class="label">
      <img src="${qrSrc}" />
      <div class="label-id">${item.numero_serie}</div>
      <div class="label-name">${item.nombre_item}</div>
    </div>
  `;
  ...
  w.document.write(html);
  ```
  Unescaped strings written directly into an active document context.

#### [VULN-03] Modal Dialog HTML Injection in `customAlert` and `customConfirm`
- **Location**: `dashboard/script.js:3987, 4019`
  ```javascript
  msgEl.innerHTML = msg;
  overlay.style.display = 'flex';
  ```
  Passing user input or error messages containing `<img src=x onerror=...>` executes scripts inside the main app context.

#### [VULN-04] `javascript:` Pseudo-protocol Injection in Attachment Links
- **Location**: `dashboard/script.js:1734, 4059`
  ```javascript
  const a = document.createElement('a');
  a.href = fotoUrl; // If fotoUrl is 'javascript:alert(document.cookie)'
  a.target = '_blank';
  ```

#### [VULN-05] Insecure Token Storage & Cross-Tab Mirroring
- **Location**: `dashboard/script.js:47-69`
  ```javascript
  const session = {
    getToken:   ()        => sessionStorage.getItem('entelso_token') || localStorage.getItem('entelso_token'),
    getUser:    ()        => JSON.parse(sessionStorage.getItem('entelso_user') || localStorage.getItem('entelso_user') || 'null'),
    save:       (t, u)    => { 
      sessionStorage.setItem('entelso_token', t); sessionStorage.setItem('entelso_user', JSON.stringify(u)); 
      localStorage.setItem('entelso_token', t); localStorage.setItem('entelso_user', JSON.stringify(u)); 
    },
    ...
  };
  ```
  JWT is permanently duplicated into `localStorage`. Any XSS execution guarantees persistent full-account takeover without expiration upon window close. No HttpOnly/SameSite cookie option is supported.

#### [VULN-06] Data Leakage via Unauthenticated Third-Party QR Server
- **Location**: `dashboard/script.js:1637, 2314, 3720`
  ```javascript
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}&margin=4`;
  ```
  All asset IDs, serial numbers, and internal equipment identifiers are transmitted in plain text via GET requests to `api.qrserver.com`.

#### [VULN-07] Complete Absence of Client-Side RBAC UI Enclosure
- **Location**: `dashboard/script.js:246-260, 1418-1425`
  The user role (`user.rol`) is only used as cosmetic text (`document.getElementById('userDisplayRole').textContent = rol;`).
  All navigational entries ("User Management", "Delete All", "Bulk Delete", "Add User", "Manage Zones", "Manage Teams", "Bulk Import") are rendered for all roles (`trabajador`, `supervisor`, `almacen`, `admin`).

#### [VULN-08] Missing Security Headers & Container Hardening
- **Location**: `dashboard/Dockerfile:1-4`
  ```dockerfile
  FROM nginx:alpine
  COPY . /usr/share/nginx/html
  EXPOSE 80
  ```
  No custom `nginx.conf` providing `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, or `Permissions-Policy`.
  Hardcoded development IP/domain fallback in `dashboard/script.js:14-16`:
  `'https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io'`

---

### 1.2 Bugs, Logic Flaws & Edge Cases

#### [BUG-01] Critical: Kit Assignment & Removal Completely Broken (`res.success` on `Response` object)
- **Location**: `dashboard/script.js:4152-4166, 4173-4187`
  ```javascript
  const res = await apiFetch('/api/activos/' + child.id, {
    method: 'PATCH',
    body: JSON.stringify({ parent_activo_id: kitId })
  });
  if (res.success) { // res is a Fetch Response object, so res.success is always undefined!
    registrarAuditLog(`Added asset ${child.id} to kit ${kitId}`);
    await cargarActivos(true);
    window.renderKitContents(kitId);
  } else {
    alert(res.message); // Displays "undefined" alert popup!
  }
  ```
  Adding or removing items to/from kits always triggers an alert with `"undefined"` despite backend HTTP 200 success.

#### [BUG-02] Critical: Missing `showToast` Function Causes Runtime `ReferenceError`
- **Location**: `dashboard/script.js:3636, 3638, 3641, 3653, 3655, 3658`
  ```javascript
  if (json.success) {
      input.value = '';
      await loadZonas();
      showToast(window.i18n.t('zonas.toast_creada') || 'Zone created successfully');
  }
  ```
  `showToast` is called directly without being defined anywhere in the frontend codebase, crashing zone creation and deletion actions with `Uncaught ReferenceError: showToast is not defined`.

#### [BUG-03] Critical: Non-Existent Post-Deletion Callbacks (`window.loadInventory`, `window.loadUsuarios`)
- **Location**: `dashboard/script.js:3547, 3549`
  ```javascript
  if (currentBulkMode === 'activos') {
      if(window.loadInventory) await window.loadInventory();
  } else {
      if(window.loadUsuarios) await window.loadUsuarios();
  }
  ```
  The real loading functions are `cargarActivos()` and `cargarUsuarios()`. Because `window.loadInventory` and `window.loadUsuarios` are `undefined`, tables do not refresh after bulk deletion.

#### [BUG-04] Critical: Bulk QR Export Object Property Mismatch Produces "undefined" Labels
- **Location**: `dashboard/script.js:3695, 3719, 3725, 3726`
  ```javascript
  const itemsToExport = inventoryData.filter(item => checked.includes(item.db_id));
  ...
  const qrPayload = `https://wa.me/${waNumber}?text=${encodeURIComponent('INFO ' + item.numero_serie)}`;
  ...
  <div class="label-id">${item.numero_serie}</div>
  <div class="label-name">${item.nombre_item}</div>
  ```
  `inventoryData` objects are mapped to properties `item.id`, `item.serie`, and `item.equipo`. `item.numero_serie` and `item.nombre_item` are `undefined`. The generated print sheet prints `"undefined"` for ID/Name and generates QR payloads with `INFO%20undefined`.

#### [BUG-05] Medium: Inconsistent Hardcoded WhatsApp Phone Numbers
- **Location**: `dashboard/script.js:1633` (`'61439759528'`) vs `dashboard/script.js:3718` (`'61426287346'`).
  Bulk QR labels use a different destination phone number from individual drawer QR codes.

#### [BUG-06] Medium: Stale Background Polling Storm on Session Expiry
- **Location**: `dashboard/script.js:98-101, 128-130`
  When `apiFetch` encounters a 401 response:
  ```javascript
  if (res.status === 401) {
    session.clear();
    mostrarLogin();
    throw new Error('SESION_EXPIRADA');
  }
  ```
  `clearInterval(autoRefreshInterval)` is NOT called here (only in explicit `logoutBtn` click). The 60-second polling interval continues running in the background on the login screen, causing repeated failed 401 network requests.

#### [BUG-07] Medium: Unhandled Promise Hang in `customAlert` / `customConfirm`
- **Location**: `dashboard/script.js:3974-4036`
  `customAlert` and `customConfirm` do not register `Escape` key listeners or backdrop click handlers. If dismissed via DOM manipulation or backdrop clicks, the returned Promise remains pending indefinitely.

#### [BUG-08] Low: Server Alert API Stubbed Out on Frontend
- **Location**: `dashboard/script.js:470`
  `async function cargarAlertas() { renderizarAlertas([]); }`
  The backend `/api/alertas` endpoint is never called; alert calculations are computed entirely on the client using hardcoded date diff heuristics.

---

### 1.3 Performance Bottlenecks

#### [PERF-01] High: Unbatched DOM Mutations in Table Rendering
- **Location**: `dashboard/script.js:611-626, 748-781, 856, 1442`
  Rows are created and appended one-by-one directly to `tbody` inside a `forEach` loop without using a `DocumentFragment` or batch HTML string construction.

#### [PERF-02] High: Unconstrained Global `MutationObserver` & Memory Leak in Datepickers
- **Location**: `dashboard/script.js:4191-4194`
  ```javascript
  const initFlatpickr = (node) => { if (node.querySelectorAll) { node.querySelectorAll('[data-type="date"]').forEach(el => { if (!el._flatpickr) { flatpickr(el, { dateFormat: 'Y-m-d', locale: 'en' }); } }); } };
  const observer = new MutationObserver((mutations) => { mutations.forEach(m => { m.addedNodes.forEach(node => { initFlatpickr(node); }); }); });
  observer.observe(document.body, { childList: true, subtree: true });
  ```
  Observing the entire document subtree creates significant overhead on every DOM mutation. Existing Flatpickr instances are never destroyed via `fp.destroy()` when DOM nodes are overwritten by `innerHTML = ''`, resulting in detached DOM node memory leaks.

#### [PERF-03] High: Synchronous Render-Blocking Scripts in `<head>`
- **Location**: `dashboard/index.html:13-19`
  ```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  <script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/en.js"></script>
  <script src="i18n.js?v=9"></script>
  ```
  `xlsx.bundle.js` (~700 KB) and `chart.js` (~200 KB) block First Contentful Paint (FCP) and Time to Interactive (TTI) on initial page load.

#### [PERF-04] Medium: Base64 Storage Quota Exhaustion in `localStorage`
- **Location**: `dashboard/script.js:1323`
  ```javascript
  localStorage.setItem('profile_pic', b64);
  ```
  Storing raw base64 image data in `localStorage` rapidly exhausts the standard 5 MB per-origin quota, throwing unhandled `QuotaExceededError` exceptions.

---

### 1.4 UI/UX, Accessibility & Localization

#### [A11Y-01] Medium: Non-Compliant Color Contrast (WCAG 2.1 AA)
- **Location**: `dashboard/style.css:30, 462, 1274`
  `--text-3: #484f58` on `--bg-base: #0f1117` yields a contrast ratio of **2.43:1** (fails WCAG AA threshold of **4.5:1** for normal text).
  `--text-2: #8b949e` on `#1c2128` yields **4.1:1** (fails 4.5:1).

#### [A11Y-02] Medium: Missing ARIA Modal Semantics and Focus Trapping
- **Location**: `dashboard/index.html:691, 781, 820, 850, 962, 1030, 1047, 1069, 1088, 1185, 1209, 1223, 1240`
  Modals lack `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and keyboard focus traps. Opening a modal does not transfer focus to the first interactive element, and closing it does not return focus to the trigger button.

#### [A11Y-03] Low: Icon-Only Buttons Missing Accessible Labels
- **Location**: `dashboard/index.html:65, 97, 101, 321, 695, 746-748, 785, 824, 854, 966, 1034, 1051, 1073, 1093, 1189, 1213, 1227, 1244, 1258`
  Buttons containing only `<i>` FontAwesome elements lack `aria-label` or visually hidden `.sr-only` text.

#### [I18N-01] Medium: Hardcoded & Missing Translation Keys
- **Location**: `dashboard/index.html:357` (`<th>Brand</th>`), `dashboard/index.html:800` (`<label>Status</label>`), `dashboard/index.html:866` (`<label>Original / Manufacturer Serial</label>`), `dashboard/index.html:876` (`<label>Brand</label>`), `dashboard/index.html:1253` (`placeholder="Nueva categoría..."`).
- **Location**: `dashboard/script.js:1660-1661` (`'Last Test/tag'`, `'Next Test/tag'`), `dashboard/script.js:1692` (`'Saving...'`, `'Save Notes'`, `'✓ Saved'`), `dashboard/script.js:2030` (`${parsedData.length} equipos listos para importar.`).
- **Location**: `dashboard/i18n.js:542-569` Spanish dictionary contains English strings for bulk import.

#### [UI-01] Medium: Redundant Dual Asset Views
- **Location**: `dashboard/index.html:737-777` (`historyDrawer`) vs `dashboard/index.html:962-1026` (`assetDetailsModal`).
  Clicking a table row opens the Drawer; clicking the table eye icon opens the Asset Details Modal. Both views show overlapping metadata, photos, and notes with inconsistent layout structures.

---

### 1.5 Architectural & Clean Code Analysis

#### [ARCH-01] High: Monolithic Single-File Anti-Pattern
- **Location**: `dashboard/script.js` (4,196 lines, 192 KB).
  A single script handles HTTP networking, JWT session management, Chart.js instances, Excel parsing/generation, DOM templating, event listeners, and business validation.

#### [ARCH-02] High: Severe Global Namespace Pollution
- **Location**: `dashboard/script.js` attaches ~35 functions and mutable objects directly to `window`:
  `window.OFFICIAL_CATEGORIES`, `window.getAssetCategory`, `window.translateTipo`, `window.appUIInitialized`, `window.inventoryData`, `window.currentDataActivos`, `window.currentFilteredData`, `window.activeSmartFilters`, `window.uploadedPhotos`, `window.teamsList`, `window.zonasList`, `window.ubicacionesData`, `window.simularIngresoEquipo`, `window.marcarMantenimientoAtendido`, `window.actualizarEstadoHerramienta`, `window.eliminarActivo`, `window.editarEmpleado`, `window.editarActivo`, `window.eliminarUsuario`, `window.deleteTeam`, `window.openManageTeams`, `window.openBulkDelete`, `window.openManageZonas`, `window.deleteZona`, `window.updateBulkActionsState`, `window.toggleCatEdit`, `window.saveCatEdit`, `window.deleteCategory`, `window.customAlert`, `window.customConfirm`, `window.verDetallesActivo`, `window.renderKitContents`, `window.promptAddKitItem`, `window.removeKitItem`, `window.toggleLoginLang`, `window.openDrawerAsset`.

#### [ARCH-03] Medium: Dual-Schema State Synchronization Hazards
- **Location**: `dashboard/script.js:349, 389, 4040, 4100, 4137`
  `inventoryData` holds normalized frontend models (`db_id`, `id`, `equipo`, `zona`, `team`, `status`), while `window.currentDataActivos` holds raw backend SQL records (`id`, `numero_serie`, `nombre_item`, `nombre_ubicacion`). Functions interchangeably access one or the other, causing property lookup failures (e.g. `[BUG-04]`).

---

## 2. Logic Chain

1. **Observations [VULN-01, VULN-02, VULN-03]** demonstrate that unsanitized external strings (team names, category names, user names, asset titles, and error messages) are concatenated directly into `.innerHTML` and `document.write()` contexts.
   $\rightarrow$ Any attacker or authenticated user who creates a team or user name containing `<img src=x onerror=...>` will execute arbitrary JavaScript in the context of any administrator viewing the dashboard.
   $\rightarrow$ Combined with **Observation [VULN-05]** where JWT tokens and session data are permanently stored in `localStorage`, the XSS vulnerability allows immediate exfiltration of administrator credentials and full persistent account takeover.

2. **Observations [VULN-07, VULN-08]** demonstrate that no client-side RBAC guards exist in UI navigation, combined with missing `requireAdmin` middlewares in backend `ubicaciones.routes.js` and `items.routes.js`.
   $\rightarrow$ Lower-privileged roles (`trabajador`) can access admin views and successfully execute DELETE/POST requests to wipe physical zones and item categories.

3. **Observation [BUG-01]** shows that `window.promptAddKitItem` and `window.removeKitItem` test `if (res.success)` directly against the fetch `Response` object instead of checking `res.ok` or parsing `await res.json()`.
   $\rightarrow$ The condition evaluates to `false` on every successful request, triggering `alert(res.message)` which displays `alert(undefined)`. Kit additions/removals appear broken to users.

4. **Observation [BUG-02]** shows that `btnCreateZona` and `deleteZona` invoke `showToast(...)` directly when `showToast` is not declared in the codebase.
   $\rightarrow$ Every attempt to create or delete a physical zone in the UI immediately throws `Uncaught ReferenceError: showToast is not defined`, halting execution and preventing visual confirmation.

5. **Observation [BUG-04]** shows that `exportQRLabelsBtn` maps over `inventoryData` while referencing non-existent properties `item.numero_serie` and `item.nombre_item`.
   $\rightarrow$ The bulk QR export sheet renders `"undefined"` for all printed labels and encodes broken URLs (`INFO%20undefined`).

6. **Observation [PERF-02]** demonstrates that a `MutationObserver` attaches Flatpickr instances recursively across `document.body` without destroying previous instances.
   $\rightarrow$ In long-lived dashboard sessions with 60-second auto-refresh cycles, DOM nodes and event listeners accumulate unbounded in browser memory.

---

## 3. Caveats

- **Read-Only Investigation**: All analysis was performed statically via source code inspection; no modifications were made to project files.
- **Dynamic Network Mode**: Live automated penetration testing and dynamic network interception were not executed.
- **Backend Parity Scope**: Backend controllers and routes were audited strictly for frontend authorization parity and API contract matching.

---

## 4. Conclusion & Prioritized Remediation Roadmap

### Severity Summary Table

| Severity | Issue Count | Key Areas |
|---|---|---|
| **Critical** | 4 | Kit Management Broken (`res.success`), Missing `showToast` Crash, Missing Bulk Delete Callbacks, Broken Bulk QR Export (`undefined` labels) |
| **High** | 7 | Stored/DOM XSS (`innerHTML`), Print Window XSS (`document.write`), Insecure JWT `localStorage` Mirroring, Complete Lack of Client RBAC, Backend RBAC Route Gaps, Monolithic Script Architecture, Memory Leaks from Global `MutationObserver` |
| **Medium** | 9 | Base64 Quota Exhaustion, Unauthenticated Third-Party QR Leaks, Hardcoded Phone Inconsistencies, Stale 401 Polling Storms, Render-Blocking Assets, WCAG AA Color Contrast Failures, Missing ARIA Modal Semantics, Missing i18n Strings, Dual Redundant Detail Views |
| **Low** | 3 | Missing Button `aria-label`s, Server Alerts Endpoint Stubbed, Hardcoded Spanish Fallbacks in English Mode |

---

### Prioritized Remediation Plan

#### Phase 1: Critical Bug & Security Hotfixes (Immediate)

1. **Fix Kit Management (`dashboard/script.js:4152-4187`)**:
   - Replace `if (res.success)` with:
     ```javascript
     const res = await apiFetch('/api/activos/' + child.id, {
       method: 'PATCH',
       body: JSON.stringify({ parent_activo_id: kitId })
     });
     const data = await res.json();
     if (res.ok && data.success) {
       registrarAuditLog(`Added asset ${child.id} to kit ${kitId}`);
       await cargarActivos(true);
       window.renderKitContents(kitId);
     } else {
       window.customAlert(data.message || window.i18n.t('api.error'));
     }
     ```

2. **Define or Replace `showToast` (`dashboard/script.js:3636-3658`)**:
   - Implement a lightweight toast notification container or replace calls with `window.customAlert()`.

3. **Fix Bulk Delete Callbacks (`dashboard/script.js:3546-3550`)**:
   - Replace `window.loadInventory` with `cargarActivos()` and `window.loadUsuarios` with `cargarUsuarios()`.

4. **Fix Bulk QR Export Properties (`dashboard/script.js:3719, 3725, 3726`)**:
   - Change `item.numero_serie` to `item.id || item.serie` and `item.nombre_item` to `item.equipo`.
   - Unify WhatsApp phone number to use dynamic config `localStorage.getItem('entelso_wa_number') || '61439759528'`.

5. **Sanitize DOM Insertions & Eliminate `innerHTML` Injection**:
   - Replace raw template string insertions with `escapeHTML()` sanitization across team lists, category lists, user tables, and timeline history.
   - Use `textContent` for plain text DOM nodes instead of `innerHTML`.

6. **Migrate Token Storage to Secure Session-Only**:
   - Remove `localStorage.setItem('entelso_token')` mirroring. Retain JWT strictly in `sessionStorage` or transition to HttpOnly, SameSite=Strict cookies.

#### Phase 2: Authorization & Robustness Improvements

1. **Implement Client-Side Role-Based UI Enclosure**:
   - Add a centralized `applyRBAC(user)` helper:
     ```javascript
     function applyRBAC(user) {
       const isAdmin = user && user.rol === 'admin';
       document.querySelectorAll('[data-role="admin"]').forEach(el => {
         el.style.display = isAdmin ? '' : 'none';
       });
     }
     ```
   - Tag administrative buttons (`openAddUserModal`, `bulkDeleteBtn`, `menuUsuarios`, `openManageZonas`, `openManageTeams`, `openImportModal`) with `data-role="admin"`.
2. **Harmonize Backend RBAC**:
   - Add `requireAdmin` to mutative endpoints in `backend/src/modules/ubicaciones/ubicaciones.routes.js` and `backend/src/modules/items/items.routes.js`.
3. **Localize QR Code Generation**:
   - Replace external `api.qrserver.com` calls with an in-bundle offline library (e.g. `qrcode` or `kjua`) to prevent sensitive asset metadata leakage.
4. **Fix 401 Polling Storms**:
   - In `apiFetch`, ensure `if (autoRefreshInterval) clearInterval(autoRefreshInterval);` is invoked whenever a 401 triggers `mostrarLogin()`.

#### Phase 3: Performance, Accessibility & Clean Architecture

1. **Refactor Monolithic Vanilla JS into ES Modules**:
   ```
   dashboard/src/
   ├── api/             # apiFetch, authService, assetsService, teamsService
   ├── state/           # sessionStore, inventoryStore, uiStore
   ├── components/      # table, modal, drawer, qrGenerator, kpiStrip
   ├── utils/           # escapeHTML, dateFormatter, i18n
   └── app.js           # entry point & router
   ```
2. **Optimize Asset Delivery & Rendering**:
   - Add `defer` to `<script>` tags in `index.html`.
   - Dynamically load `xlsx.bundle.js` only when the user opens the import/export modals.
   - Replace global `MutationObserver` with explicit Flatpickr initialization during modal mount and `.destroy()` during modal teardown.
   - Use `DocumentFragment` for batch table row insertions.
3. **WCAG 2.1 AA Compliance**:
   - Adjust `--text-3` to `#768390` in dark mode to achieve >4.5:1 contrast.
   - Add `role="dialog"`, `aria-modal="true"`, and keyboard focus trapping to all modal overlays.
   - Consolidate `assetDetailsModal` and `historyDrawer` into a single, cohesive detail view.

---

## 5. Verification Method

To independently verify all findings and validate future remediations:

1. **Kit Management Bug Verification**:
   - Open Dashboard $\rightarrow$ Click any equipment marked as a Kit (or change an item category to WalkTest Kit).
   - In the Asset Details Modal, click "Add Item" and enter a valid serial number.
   - Observe the alert displaying `undefined` due to `res.success` check on `Response` (`script.js:4156`).

2. **Missing `showToast` Runtime Crash Verification**:
   - Open Zones view $\rightarrow$ Click "Manage Zones" $\rightarrow$ Enter a new zone name $\rightarrow$ Click "Add".
   - Open Browser Developer Tools Console $\rightarrow$ Observe `Uncaught ReferenceError: showToast is not defined` (`script.js:3636`).

3. **Bulk QR Code Export Bug Verification**:
   - In All Equipment table, select 2 items using the checkbox $\rightarrow$ Click "Export QR Labels".
   - Inspect the popup window $\rightarrow$ Observe that label IDs and equipment names are rendered as `"undefined"`, and QR code links point to `INFO%20undefined` (`script.js:3725`).

4. **DOM XSS Injection Verification**:
   - Open "Manage Teams" modal $\rightarrow$ Add team named `<img src=x onerror=console.log("XSS_TEAMS_TRIGGERED")>`.
   - Inspect DOM $\rightarrow$ Observe unescaped HTML execution in `teamsListContainer` (`script.js:3473`).

5. **Stale Polling Storm Verification**:
   - Log into dashboard $\rightarrow$ In Developer Tools Application tab, manually delete `sessionStorage.getItem('entelso_token')`.
   - Trigger any API call to get redirected to the Login Screen.
   - Inspect the Network tab $\rightarrow$ Observe GET `/api/activos` firing every 60 seconds and failing with 401 continuously while on the login screen (`script.js:128`).
