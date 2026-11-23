'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  httpJson,
  loginAsSeedAdmin,
  provisionAndLoginRole,
  nextTag,
} = require('./_f5_f8_helpers');

describe('F6 — RBAC & Route Hierarchy (Tier 1)', () => {
  let env;
  let apiUrl;
  let adminToken;
  let almacenAuth;
  let supervisorAuth;
  let trabajadorAuth;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
    const adminLogin = await loginAsSeedAdmin(apiUrl);
    adminToken = adminLogin.token;

    almacenAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'almacen',
      team: 'Transmission',
    });
    supervisorAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'supervisor',
      team: 'Calibration',
    });
    trabajadorAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'trabajador',
      team: 'Energy',
    });
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F6-T1-1: Admin provisions roles via POST /api/usuarios (201) and performs full usuarios CRUD (200)', async () => {
    const tag = nextTag('rbac_u');
    const createRes = await httpJson(apiUrl, '/api/usuarios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `User ${tag}`,
        email: `${tag}@entelso.test`,
        rol: 'almacen',
        team: 'Transmission',
        pin: 'pass1234',
      },
    });
    assert.equal(createRes.status, 201);
    const createdId = createRes.json.data.id;
    assert.equal(createRes.json.data.rol, 'almacen');

    const listRes = await httpJson(apiUrl, '/api/usuarios', { token: adminToken });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.json.data));
    assert.ok(listRes.json.data.some((u) => u.id === createdId));

    const getRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, { token: adminToken });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.data.id, createdId);

    const assetsRes = await httpJson(apiUrl, `/api/usuarios/${createdId}/activos`, { token: adminToken });
    assert.equal(assetsRes.status, 200);
    assert.ok(Array.isArray(assetsRes.json.data));

    const putRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: `Updated ${tag}` },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.json.data.nombre, `Updated ${tag}`);

    const delRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.data.deleted, true);
  });

  it('F6-T1-2: GET /api/usuarios/asignables succeeds for all 4 roles and exposes only minimal public fields', async () => {
    const tokens = [adminToken, almacenAuth.token, supervisorAuth.token, trabajadorAuth.token];
    const allowedKeys = new Set(['id', 'nombre', 'team', 'activo']);

    for (const token of tokens) {
      const res = await httpJson(apiUrl, '/api/usuarios/asignables', { token });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(Array.isArray(res.json.data) && res.json.data.length >= 4);

      for (const row of res.json.data) {
        const keys = Object.keys(row);
        for (const k of keys) {
          assert.ok(allowedKeys.has(k), `Unexpected field "${k}" leaked in /api/usuarios/asignables`);
        }
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'email'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'telefono_whatsapp'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'pin_hash'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'secret_2fa'), false);
      }
    }
  });

  it('F6-T1-3: GET /api/audit succeeds (200) for admin and includes logged entries', async () => {
    const postRes = await httpJson(apiUrl, '/api/audit', {
      method: 'POST',
      token: adminToken,
      body: {
        accion: 'F6_AUDIT_TEST',
        detalles: 'RBAC audit verification',
        meta: { source: 'f06_tier1' },
      },
    });
    assert.equal(postRes.status, 200);

    const getRes = await httpJson(apiUrl, '/api/audit', { token: adminToken });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.success, true);
    assert.ok(Array.isArray(getRes.json.data));
    assert.ok(getRes.json.data.some((l) => l.accion === 'F6_AUDIT_TEST'));
  });

  it('F6-T1-4: almacen succeeds on activos create, bulk create (201), full patch, bulk category, bulk delete, and delete', async () => {
    const tag = nextTag('alm_a');
    const createRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        descripcion: `Almacen Drill ${tag}`,
        categoria: 'Power Tools',
        numero_serie: `PT-${String(Math.floor(10000 + Math.random() * 80000))}`,
        notas: 'Created by almacen',
      },
    });
    assert.equal(createRes.status, 201);
    const id1 = createRes.json.data.id;

    const patchRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'PATCH',
      token: almacenAuth.token,
      body: {
        numero_serie: `PT-${String(Math.floor(10000 + Math.random() * 80000))}`,
        notas: 'Updated serial & notes by almacen',
      },
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.data.notas, 'Updated serial & notes by almacen');

    const bulkCreateRes = await httpJson(apiUrl, '/api/activos/bulk', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        activos: [
          { descripcion: `Bulk Almacen A ${tag}`, categoria: 'Hand Tools', estado: 'Available' },
          { descripcion: `Bulk Almacen B ${tag}`, categoria: 'Hand Tools', estado: 'Available' },
        ],
      },
    });
    assert.equal(bulkCreateRes.status, 201);
    assert.equal(bulkCreateRes.json.data.inserted, 2);

    const listRes = await httpJson(apiUrl, `/api/activos?search=${encodeURIComponent(tag)}`, {
      token: almacenAuth.token,
    });
    assert.equal(listRes.status, 200);
    const bulkIds = listRes.json.data.map((a) => a.id);
    assert.ok(bulkIds.length >= 2);

    const bulkCatRes = await httpJson(apiUrl, '/api/activos/bulk/category', {
      method: 'PATCH',
      token: almacenAuth.token,
      body: { ids: [bulkIds[0]], categoria: 'Testing Equipment' },
    });
    assert.equal(bulkCatRes.status, 200);

    const bulkDelRes = await httpJson(apiUrl, '/api/activos/bulk/delete', {
      method: 'POST',
      token: almacenAuth.token,
      body: { ids: bulkIds },
    });
    assert.equal(bulkDelRes.status, 200);

    const delSingleRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'DELETE',
      token: almacenAuth.token,
    });
    assert.equal(delSingleRes.status, 200);
  });

  it('F6-T1-5: supervisor succeeds (200) on allowlisted PATCH /api/activos/:id and bulk status/zona/team/usuario', async () => {
    const tag = nextTag('sup_a');
    const a1 = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Sup Target 1 ${tag}`, categoria: 'Hand Tools' },
    });
    const a2 = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Sup Target 2 ${tag}`, categoria: 'Hand Tools' },
    });
    assert.equal(a1.status, 201);
    assert.equal(a2.status, 201);
    const id1 = a1.json.data.id;
    const id2 = a2.json.data.id;

    const ubicRes = await httpJson(apiUrl, '/api/ubicaciones', { token: supervisorAuth.token });
    assert.equal(ubicRes.status, 200);
    const zonaId = ubicRes.json.data[0].id;

    // PATCH /:id with allowlisted fields including observaciones alias
    const patchRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: {
        estado: 'en_uso',
        ubicacion_actual_id: zonaId,
        team: 'Transmission',
        usuario_actual_id: trabajadorAuth.user.id,
        notas: 'Supervisor note',
        observaciones: 'Supervisor obs',
      },
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.data.estado, 'en_uso');
    assert.equal(patchRes.json.data.team, 'Transmission');

    const bStatus = await httpJson(apiUrl, '/api/activos/bulk/status', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], estado: 'disponible' },
    });
    assert.equal(bStatus.status, 200);

    const bZona = await httpJson(apiUrl, '/api/activos/bulk/zona', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], ubicacion_actual_id: zonaId },
    });
    assert.equal(bZona.status, 200);

    const bTeam = await httpJson(apiUrl, '/api/activos/bulk/team', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], team: 'Energy' },
    });
    assert.equal(bTeam.status, 200);

    const bUser = await httpJson(apiUrl, '/api/activos/bulk/usuario', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], usuario_actual_id: trabajadorAuth.user.id },
    });
    assert.equal(bUser.status, 200);
  });

  it('F6-T1-6: almacen succeeds on items, stock, ubicaciones, mantenimientos, and movimientos writes', async () => {
    const tag = nextTag('alm_ops');
    const itemRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        nombre: `Almacen Consumible ${tag}`,
        tipo: 'consumible',
        stock_global_consumibles: 10,
      },
    });
    assert.equal(itemRes.status, 201);
    const consItemId = itemRes.json.data.id;

    const stockRes = await httpJson(apiUrl, `/api/items/${consItemId}/stock`, {
      method: 'PATCH',
      token: almacenAuth.token,
      body: { cantidad: 5, operacion: 'sumar' },
    });
    assert.equal(stockRes.status, 200);
    assert.equal(stockRes.json.data.stock_global_consumibles, 15);

    const locRes = await httpJson(apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: almacenAuth.token,
      body: { nombre_ubicacion: `Zone ${tag}`, descripcion: 'Almacen created zone' },
    });
    assert.equal(locRes.status, 201);
    const locId = locRes.json.data.id;

    const toolRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Almacen Tool ${tag}`, categoria: 'Power Tools' },
    });
    assert.equal(toolRes.status, 201);
    const asset = toolRes.json.data;

    const maintRes = await httpJson(apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { activo_id: asset.id, motivo: 'Scheduled calibration' },
    });
    assert.equal(maintRes.status, 201);
    const maintId = maintRes.json.data.id;

    const attRes = await httpJson(apiUrl, `/api/mantenimientos/${maintId}/atendido`, {
      method: 'PUT',
      token: almacenAuth.token,
      body: {},
    });
    assert.equal(attRes.status, 200);

    const movRes = await httpJson(apiUrl, '/api/movimientos', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        item_id: consItemId,
        usuario_id: trabajadorAuth.user.id,
        ubicacion_destino_id: locId,
        cantidad: 2,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(movRes.status, 201);
  });
});
