# Milestone 2 (M2) Implementation Blueprint — Backend API Route Security

## Overview
This document provides exact, file-by-file implementation instructions for Worker M2 to enforce Role-Based Access Control (RBAC) security across backend API routes in Entelso v2.

---

## Target Files & Detailed Code Changes

### 1. `backend/src/modules/usuarios/usuarios.routes.js`

#### Requirement
Protect all `/api/usuarios` CRUD endpoints with `requireAdmin`. Non-admin roles (`almacen`, `supervisor`, `trabajador`) must receive `403 Forbidden`.

#### Implementation Plan
Import `requireAdmin` alongside `requireAuth` from `../../common/middleware/auth.middleware`.
Apply `requireAdmin` to all user endpoints, or use router-level middleware `router.use(requireAuth, requireAdmin)`.

#### Proposed Code for `backend/src/modules/usuarios/usuarios.routes.js`
```javascript
const router   = require('express').Router();
const ctrl     = require('./usuarios.controller');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createUserSchema, updateUserSchema } = require('./usuarios.validation');

// Require authentication and admin privileges for all user endpoints
router.use(requireAuth, requireAdmin);

router.get('/',             ctrl.getAll);
router.delete('/bulk/others', ctrl.removeAllOthers);
router.get('/:id',          ctrl.getById);
router.get('/:id/activos',  ctrl.getAssets);
router.post('/',            validate(createUserSchema), ctrl.create);
router.put('/:id',          validate(updateUserSchema), ctrl.update);
router.delete('/:id',       ctrl.remove);

module.exports = router;
```

---

### 2. `backend/src/modules/audit/audit.routes.js`

#### Requirement
Protect `GET /api/audit` with `requireAdmin` so only admins can retrieve activity logs. Keep `POST /api/audit` accessible to any authenticated user (`requireAuth`) so background logging from frontend actions can occur regardless of role.

#### Implementation Plan
Import `requireAdmin` from `../../common/middleware/auth.middleware`.
Apply `requireAdmin` middleware to `router.get('/', requireAdmin, auditController.getLogs)`.

#### Proposed Code for `backend/src/modules/audit/audit.routes.js`
```javascript
const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../../common/middleware/auth.middleware');
const auditController = require('./audit.controller');

const router = Router();

router.use(requireAuth);
router.get('/', requireAdmin, auditController.getLogs);
router.post('/', auditController.createLog);

module.exports = router;
```

---

### 3. `backend/src/modules/activos/activos.routes.js`

#### Requirement
Configure access control using `requireRoles(...)`:
- `GET /` endpoints (`GET /`, `GET /serial/:serial`, `GET /:id`): `requireAuth` (allows `admin`, `almacen`, `supervisor`, `trabajador`).
- Asset Creation & Deletion (`POST /`, `POST /bulk`, `DELETE /:id`, `POST /bulk-delete` / `POST /bulk/delete`): `requireRoles('admin', 'almacen')`.
- Single Asset Update (`PATCH /:id`): `requireRoles('admin', 'almacen', 'supervisor')`.
- Bulk Asset Updates (`PATCH /bulk-estado` / `/bulk/status`, `PATCH /bulk-zona` / `/bulk/zona`, `PATCH /bulk-team` / `/bulk/team`): `requireRoles('admin', 'almacen', 'supervisor')`.

#### Proposed Code for `backend/src/modules/activos/activos.routes.js`
```javascript
const router   = require('express').Router();
const ctrl     = require('./activos.controller');
const { requireAuth, requireAdmin, requireRoles } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const { createAssetSchema, updateAssetSchema, bulkCreateAssetSchema } = require('./activos.validation');

// Read endpoints accessible by all 4 roles
router.get('/',                requireAuth, ctrl.getAll);
router.get('/serial/:serial',  requireAuth, ctrl.getBySerial);
router.get('/:id',             requireAuth, ctrl.getById);

// Admin-only global deletion
router.delete('/bulk/all',     requireAuth, requireAdmin, ctrl.removeAll);

// Creation and Deletion endpoints (admin, almacen)
router.post('/',               requireAuth, requireRoles('admin', 'almacen'), validate(createAssetSchema), ctrl.create);
router.post('/bulk',          requireAuth, requireRoles('admin', 'almacen'), validate(bulkCreateAssetSchema), ctrl.bulkCreate);
router.delete('/:id',          requireAuth, requireRoles('admin', 'almacen'), ctrl.remove);
router.post('/bulk/delete',    requireAuth, requireRoles('admin', 'almacen'), ctrl.bulkRemoveSelected);
router.post('/bulk-delete',    requireAuth, requireRoles('admin', 'almacen'), ctrl.bulkRemoveSelected);

// Category bulk update (admin, almacen)
router.patch('/bulk/category', requireAuth, requireRoles('admin', 'almacen'), ctrl.bulkUpdateCategory);

// Status, Zone, and Team bulk updates (admin, almacen, supervisor)
router.patch('/bulk/status',   requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateStatus);
router.patch('/bulk-estado',   requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateStatus);
router.patch('/bulk/zona',     requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateZona);
router.patch('/bulk-zona',     requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateZona);
router.patch('/bulk/team',     requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateTeam);
router.patch('/bulk-team',     requireAuth, requireRoles('admin', 'almacen', 'supervisor'), ctrl.bulkUpdateTeam);

// Individual asset patch (admin, almacen, supervisor - controller enforces field restrictions for supervisor)
router.patch('/:id',           requireAuth, requireRoles('admin', 'almacen', 'supervisor'), validate(updateAssetSchema), ctrl.update);

module.exports = router;
```

---

### 4. `backend/src/modules/activos/activos.controller.js` & `activos.validation.js`

#### Requirement
When `req.user.rol === 'supervisor'`, `PATCH /api/activos/:id` must strictly limit modifications to reassignment and status fields (`usuario_actual_id`, `ubicacion_actual_id`, `team`, `estado`, `observaciones` / `notas`). Attempting to modify restricted fields (e.g. `fecha_ultima_cali`, `fecha_prox_cali`, `fotos`) must return `403 Forbidden`.

#### Proposed Code for `backend/src/modules/activos/activos.controller.js` (`exports.update`)
```javascript
exports.update = async (req, reply, next) => {
  try {
    // If user is supervisor, enforce strict field level access control
    if (req.user && req.user.rol === 'supervisor') {
      const allowedSupervisorFields = [
        'usuario_actual_id',
        'ubicacion_actual_id',
        'team',
        'estado',
        'observaciones',
        'notas'
      ];
      const bodyKeys = Object.keys(req.body);
      const forbiddenKeys = bodyKeys.filter(k => !allowedSupervisorFields.includes(k));
      if (forbiddenKeys.length > 0) {
        return reply.status(403).json(
          res.error('Supervisores solo tienen permitido modificar campos de reasignación y estado.', 'FORBIDDEN')
        );
      }
    }

    // Normalize observaciones to notas for DB storage if provided
    if (req.body.observaciones !== undefined && req.body.notas === undefined) {
      req.body.notas = req.body.observaciones;
    }

    reply.json(res.success(await svc.update(req.params.id, req.body)));
  } catch (e) {
    next(e);
  }
};
```

#### Proposed Code for `backend/src/modules/activos/activos.validation.js` (`updateAssetSchema`)
Update Zod schema so `notas` and `observaciones` pass validation:
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
}).refine(noConflicto, conflictMsg);
```

---

## Role Access Matrix Summary

| Route | Verb | admin | almacen | supervisor | trabajador | Notes |
|---|---|:---:|:---:|:---:|:---:|---|
| `/api/usuarios` | ALL | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 | Protected by `requireAdmin` |
| `/api/audit` | GET | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 | Protected by `requireAdmin` |
| `/api/audit` | POST | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | Log creation for user actions |
| `/api/activos` | GET | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | All roles can view assets |
| `/api/activos/:id` | GET | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | All roles can view single asset |
| `/api/activos` | POST | ✅ 201 | ✅ 201 | ❌ 403 | ❌ 403 | `requireRoles('admin', 'almacen')` |
| `/api/activos/bulk` | POST | ✅ 201 | ✅ 201 | ❌ 403 | ❌ 403 | `requireRoles('admin', 'almacen')` |
| `/api/activos/:id` | DELETE | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | `requireRoles('admin', 'almacen')` |
| `/api/activos/bulk/delete` | POST | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | `requireRoles('admin', 'almacen')` |
| `/api/activos/:id` | PATCH | ✅ 200 | ✅ 200 | ⚠️ Partial | ❌ 403 | Supervisor allowed ONLY assignment & status fields |
| `/api/activos/bulk/status` | PATCH | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 | `requireRoles('admin', 'almacen', 'supervisor')` |
| `/api/activos/bulk/zona` | PATCH | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 | `requireRoles('admin', 'almacen', 'supervisor')` |
| `/api/activos/bulk/team` | PATCH | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 403 | `requireRoles('admin', 'almacen', 'supervisor')` |
