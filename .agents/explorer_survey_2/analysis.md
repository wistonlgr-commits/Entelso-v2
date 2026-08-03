# Frontend Survey & RBAC UI Enforcement Analysis (R3)

## 1. Executive Summary & Objective
This report details the investigation of the frontend codebase in `dashboard/` (`index.html`, `script.js`, `i18n.js`) for Entelso. The goal of Requirement R3 is to enforce Role-Based Access Control (RBAC) across the frontend UI using the logged-in user's role (`admin`, `almacen`, `supervisor`, `trabajador`) and guarantee 100% localization in English via `window.i18n.t()`.

---

## 2. Authentication, Credentials & Role Storage
- **Storage Locations**:
  - `sessionStorage` and `localStorage` are used to persist authentication session data.
  - `entelso_token`: Contains the raw JWT Bearer token.
  - `entelso_user`: Contains the JSON stringified user object `{ id, nombre, email, rol, team, ... }`.
- **Session Manager Helper**:
  - Handled by `const session = { getToken(), getUser(), save(t, u), clear(), isLoggedIn() }` in `dashboard/script.js` (lines 42–54).
- **JWT Payload Structure**:
  - Token decoding helper `tokenEsValido(token)` in `dashboard/script.js` (lines 71–78) decodes `atob(token.split('.')[1])`.
  - The JWT payload contains `{ id, email, rol, iat, exp }`.
- **Role Retrieval**:
  - Primary access: `session.getUser()?.rol`.
  - Fallback access: Decoding `session.getToken()` payload property `rol`.
  - Hierarchy & Roles: `admin`, `almacen`, `supervisor`, `trabajador`.

---

## 3. Identification of Target DOM Elements & Current UI Handling

| Target Element / Feature | DOM Selector / Location | Current Rendering & Handling in Code | Required R3 Behavior |
| :--- | :--- | :--- | :--- |
| **Administration (Users) Tab** | `#menuUsuarios` in `index.html:163` <br> View: `#view-usuarios` (`index.html:622`) | Always visible in `#profileDropdown`. Click handler at `script.js:1326` calls `cargarUsuariosAdministracion()`. | **Hide (`display: none`) for non-admins** (`userRole !== 'admin'`). Block navigation to `#view-usuarios`. |
| **Audit Log Tab** | `#menuAudit` in `index.html:164` <br> View: `#view-audit` (`index.html:592`) | Always visible in `#profileDropdown`. Click handler at `script.js:1465` calls `cargarAuditLog()`. | **Hide (`display: none`) for non-admins** (`userRole !== 'admin'`). Block navigation to `#view-audit`. |
| **Add Asset Buttons** | `#openNewItemModal` (`index.html:183`) <br> `#openNewItemModal2` (`index.html:305`) | Always visible in Dashboard & Inventory headers. | **Hide (`display: none`) for `trabajador` and `supervisor`**. (Visible ONLY for `admin` and `almacen`). |
| **Bulk Import Buttons** | `#openImportModal2` (`index.html:182`) <br> `#openImportModal` (`index.html:304`) | Always visible in Dashboard & Inventory headers. | **Hide (`display: none`) for `trabajador` and `supervisor`**. (Import creates assets). |
| **Asset Edit Drawer Button** | `#drawerEditBtn` in `index.html:720` | Always rendered in `#historyDrawer` header. Event listener at `script.js:1583` triggers `window.editarActivo()`. | **Hide (`display: none`) for `trabajador` and `supervisor`**. (Visible ONLY for `admin` and `almacen`). |
| **Table Inline Action Controls** | `action-cell` in `renderInventoryTable()` (`script.js:556-568`) | Renders status update `<select>`, view details button (`.fa-eye`), and delete button (`.fa-trash`) for every row. | **`trabajador`**: Hide status dropdown and delete button. <br> **`supervisor`**: Keep status dropdown, hide delete button. <br> **`almacen` & `admin`**: Show all controls. |
| **Bulk Actions Dropdown** | `#bulkActionsBtn` (`index.html:283`) | Displayed when rows are checked in inventory table. | **Hide for `trabajador`**. Restrict delete action for `supervisor`. |
| **Management Buttons (Categories/Zones/Teams)** | `#openManageCategoriesBtn` (`index.html:281`) <br> `openManageZonas()` <br> `openManageTeams()` <br> `#btnNuevoEmpleadoTeams` (`index.html:376`) | Always visible in headers. | Hide asset/category/zone creation for `trabajador` and `supervisor`. Hide employee creation for non-admins. |

---

## 4. Comprehensive Role-Based Permissions Matrix

| UI Component / Action | Admin (`admin`) | Warehouse (`almacen`) | Supervisor (`supervisor`) | Worker (`trabajador`) |
| :--- | :---: | :---: | :---: | :---: |
| View Assets & Scanned QR Details | ✅ Visible | ✅ Visible | ✅ Visible | ✅ Visible |
| Administration Tab (`#menuUsuarios`) | ✅ Visible | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Audit Log Tab (`#menuAudit`) | ✅ Visible | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Add Asset Button (`#openNewItemModal`) | ✅ Visible | ✅ Visible | ❌ Hidden | ❌ Hidden |
| Bulk Import Button (`#openImportModal`) | ✅ Visible | ✅ Visible | ❌ Hidden | ❌ Hidden |
| Edit Asset Button (`#drawerEditBtn`) | ✅ Visible | ✅ Visible | ❌ Hidden | ❌ Hidden |
| Update Asset Status (Table Dropdown) | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Hidden/Disabled |
| Schedule Maintenance (`#openAgendarModal`) | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Hidden |
| Delete Asset (`eliminarActivo`) | ✅ Allowed | ✅ Allowed | ❌ Hidden | ❌ Hidden |
| User Management Actions (CRUD Users) | ✅ Allowed | ❌ Hidden | ❌ Hidden | ❌ Hidden |

---

## 5. i18n Setup & Static Text String Assessment
- **Engine**: `dashboard/i18n.js` initializes `window.i18n = { t, setLang, getLang, applyTranslations }`.
- **Default Language**: English (`'en'`).
- **Translations Dictionary**: Contains complete English (`TRANSLATIONS.en`) and Spanish (`TRANSLATIONS.es`) keys.
- **Hardcoded Spanish Text Issues Identified in `dashboard/script.js`**:
  1. `script.js:565`: `title="Detalles"` -> Change to `title="${t('modal.detalles_titulo') || 'Details'}"`.
  2. `script.js:1412`: `msgEl.textContent = 'El nombre y la contraseña/PIN son obligatorios.';` -> Change to `msgEl.textContent = window.i18n.t('usuarios.err_requerido');`.
  3. `script.js:1419`: `msgEl.textContent = 'La contraseña/PIN debe tener al menos 4 caracteres.';` -> Change to `msgEl.textContent = window.i18n.t('usuarios.err_min');`.
  4. `script.js:1450 & 1462`: `btn.textContent = 'Crear Usuario';` -> Change to `btn.textContent = window.i18n.t('usuarios.btn_crear') || 'Create User';`.
  5. `script.js:1377`: `window.customAlert(window.i18n.t('usuarios.eliminado') || "Usuario eliminado");` -> Update fallback to `'User deleted successfully.'`.

---

## 6. Exact Proposed Code Changes for R3 Implementation

### A. Changes in `dashboard/script.js`

1. **Add Central UI Permission Enforcer Function `aplicarPermisosUI()`**:
```javascript
function aplicarPermisosUI() {
  const user = session.getUser();
  const role = user?.rol || 'trabajador';

  const isAdmin = role === 'admin';
  const isAlmacen = role === 'almacen';
  const isSupervisor = role === 'supervisor';
  const isTrabajador = role === 'trabajador';

  // 1. Navigation / Profile Dropdown Tabs
  const menuUsuarios = document.getElementById('menuUsuarios');
  if (menuUsuarios) menuUsuarios.style.display = isAdmin ? '' : 'none';

  const menuAudit = document.getElementById('menuAudit');
  if (menuAudit) menuAudit.style.display = isAdmin ? '' : 'none';

  // 2. Add Asset & Import Buttons (only admin & almacen)
  const canAddAsset = isAdmin || isAlmacen;
  ['openNewItemModal', 'openNewItemModal2', 'openImportModal', 'openImportModal2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = canAddAsset ? '' : 'none';
  });

  // 3. Maintenance Scheduling (admin, almacen, supervisor)
  const canScheduleMaint = isAdmin || isAlmacen || isSupervisor;
  const openAgendarModal = document.getElementById('openAgendarModal');
  if (openAgendarModal) openAgendarModal.style.display = canScheduleMaint ? '' : 'none';

  // 4. Management Modals & Buttons
  const openManageCategoriesBtn = document.getElementById('openManageCategoriesBtn');
  if (openManageCategoriesBtn) openManageCategoriesBtn.style.display = (isAdmin || isAlmacen) ? '' : 'none';

  const btnNuevoEmpleadoTeams = document.getElementById('btnNuevoEmpleadoTeams');
  if (btnNuevoEmpleadoTeams) btnNuevoEmpleadoTeams.style.display = isAdmin ? '' : 'none';
}
```

2. **Hook `aplicarPermisosUI()` into Session Initialization**:
   - In `mostrarApp()` (line 119) and `actualizarInfoUsuario(user)` (line 241).

3. **Update `openDrawer(item)` (line 1583)**:
```javascript
  const userRole = session.getUser()?.rol || 'trabajador';
  const canEditAsset = userRole === 'admin' || userRole === 'almacen';
  const drawerEditBtn = document.getElementById('drawerEditBtn');
  if (drawerEditBtn) drawerEditBtn.style.display = canEditAsset ? '' : 'none';
```

4. **Update `renderInventoryTable()` Row Action Cells (lines 556–568)**:
```javascript
  const userRole = session.getUser()?.rol || 'trabajador';
  const canUpdateStatus = userRole !== 'trabajador';
  const canDeleteAsset = userRole === 'admin' || userRole === 'almacen';

  const statusDropdownHTML = canUpdateStatus ? `
    <select class="form-input" style="font-size:11px; padding:2px 4px; width:110px;" onchange="window.actualizarEstadoHerramienta('${item.db_id}', this.value)" onclick="event.stopPropagation()">
       <option value="">${t('inv.actualizar')}</option>
       <option value="disponible">${t('estado.disponible')}</option>
       <option value="en_uso">${t('estado.en_uso')}</option>
       <option value="en_mantenimiento">${t('estado.en_mantenimiento')}</option>
       <option value="danado">${t('estado.danado')}</option>
    </select>
  ` : '';

  const deleteBtnHTML = canDeleteAsset ? `
    <button class="icon-btn" onclick="event.stopPropagation(); window.eliminarActivo(${item.db_id})" title="${t('bulk.btn_eliminar') || 'Delete'}" style="flex-shrink:0;"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>
  ` : '';

  const detailsBtnHTML = `
    <button class="icon-btn" onclick="event.stopPropagation(); window.verDetallesActivo(${item.db_id})" title="${t('modal.detalles_titulo') || 'Details'}" style="flex-shrink:0;"><i class="fa-solid fa-eye" style="color:var(--accent-blue)"></i></button>
  `;

  // Combine inside action cell
```

5. **Guard Admin Views (`#view-usuarios` and `#view-audit`)**:
   - In event listeners for `#menuUsuarios` and `#menuAudit`, add checks:
```javascript
   if (session.getUser()?.rol !== 'admin') {
     window.customAlert(window.i18n.t('err.FORBIDDEN'));
     return;
   }
```

6. **Fix Hardcoded Strings in `script.js`**:
   - Lines 1412, 1419, 1450, 1462, 1377: Use `window.i18n.t(...)` keys.

---

## 7. Verification Method
1. Log in as `trabajador`:
   - Verify `#menuUsuarios` and `#menuAudit` are NOT present in the profile dropdown.
   - Verify `#openNewItemModal` and `#openNewItemModal2` are NOT visible.
   - Verify drawer edit button is hidden and row status dropdown/delete buttons are hidden.
2. Log in as `supervisor`:
   - Verify `#menuUsuarios` and `#menuAudit` are hidden.
   - Verify `#openNewItemModal` is hidden.
   - Verify status update dropdown is visible, but `#drawerEditBtn` and delete buttons are hidden.
3. Log in as `almacen`:
   - Verify `#menuUsuarios` and `#menuAudit` are hidden.
   - Verify `#openNewItemModal`, `#openImportModal`, and `#drawerEditBtn` are visible.
4. Log in as `admin`:
   - Verify full access to all tabs, buttons, and controls.
5. Check language switching (EN/ES):
   - Verify all messages, buttons, and titles render properly using `window.i18n.t()`.
