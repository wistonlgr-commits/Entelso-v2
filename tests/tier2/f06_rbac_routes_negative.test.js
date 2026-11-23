'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  httpJson,
  loginAsSeedAdmin,
  provisionAndLoginRole,
  nextTag,
} = require('../tier1/_f5_f8_helpers');

describe('F6 — RBAC & Route Hierarchy Negative Cases (Tier 2)', () => {
  let env;
  let apiUrl;
  let adminToken;
  let almacenAuth;
  let supervisorAuth;
  let trabajadorAuth;
  let sampleAssetId;
  let sampleItemId;
  let sampleUbicId;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
    const adminLogin = await loginAsSeedAdmin(apiUrl);
    adminToken = adminLogin.token;

    almacenAuth = await provisionAndLoginRole(apiUrl, adminToken, { rol: 'almacen' });
    supervisorAuth = await provisionAndLoginRole(apiUrl, adminToken, { rol: 'supervisor' });
    trabajadorAuth = await provisionAndLoginRole(apiUrl, adminToken, { rol: 'trabajador' });

    const activosRes = await httpJson(apiUrl, '/api/activos', { token: adminToken });
    sampleAssetId = activosRes.json.data[0].id;
    const itemsRes = await httpJson(apiUrl, '/api/items', { token: adminToken });
    sampleItemId = itemsRes.json.data[0].id;
    const ubicRes = await httpJson(apiUrl, '/api/ubicaciones', { token: adminToken });
    sampleUbicId = ubicRes.json.data[0].id;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F6-T2-1: almacen, supervisor, and trabajador receive 403 FORBIDDEN on all admin usuarios endpoints', async () => {
    const nonAdmins = [almacenAuth, supervisorAuth, trabajadorAuth];
    for (const actor of nonAdmins) {
      const checks = [
        { method: 'GET', path: '/api/usuarios' },
        { method: 'GET', path: `/api/usuarios/${actor.user.id}` },
        { method: 'GET', path: `/api/usuarios/${actor.user.id}/activos` },
        {
          method: 'POST',
          path: '/api/usuarios',
          body: { nombre: 'Blocked User', rol: 'trabajador', email: `${nextTag('blk')}@entelso.test`, pin: 'pass1234' },
        },
        { method: 'PUT', path: `/api/usuarios/${actor.user.id}`, body: { nombre: 'Nope' } },
        { method: 'DELETE', path: `/api/usuarios/${actor.user.id}` },
        { method: 'DELETE', path: '/api/usuarios/bulk/others' },
      ];

      for (const reqSpec of checks) {
        const res = await httpJson(apiUrl, reqSpec.path, {
          method: reqSpec.method,
          token: actor.token,
          body: reqSpec.body,
        });
        assert.equal(
          res.status,
          403,
          `Expected 403 for ${actor.user.rol} on ${reqSpec.method} ${reqSpec.path}, got ${res.status}`
        );
        assert.equal(res.json.error.code, 'FORBIDDEN');
      }
    }
  });

  it('F6-T2-2: almacen, supervisor, and trabajador receive 403 FORBIDDEN on GET /api/audit and POST/DELETE /api/teams', async () => {
    const nonAdmins = [almacenAuth, supervisorAuth, trabajadorAuth];
    for (const actor of nonAdmins) {
      const auditRes = await httpJson(apiUrl, '/api/audit', { token: actor.token });
      assert.equal(auditRes.status, 403);
      assert.equal(auditRes.json.error.code, 'FORBIDDEN');

      const teamPost = await httpJson(apiUrl, '/api/teams', {
        method: 'POST',
        token: actor.token,
        body: { nombre: `BlockedTeam_${nextTag('tm')}` },
      });
      assert.equal(teamPost.status, 403);
      assert.equal(teamPost.json.error.code, 'FORBIDDEN');

      const teamDel = await httpJson(apiUrl, '/api/teams/1', {
        method: 'DELETE',
        token: actor.token,
      });
      assert.equal(teamDel.status, 403);
      assert.equal(teamDel.json.error.code, 'FORBIDDEN');
    }
  });

  it('F6-T2-3: supervisor receives 403 with exact message when PATCH /api/activos/:id includes any forbidden field', async () => {
    const forbiddenPayloads = [
      { numero_serie: 'PT-99999' },
      { descripcion: 'Tampered Name' },
      { item_id: sampleItemId },
      { fecha_prox_cali: '2027-01-01' },
      { fotos: ['http://127.0.0.1/a.png'] },
      { parent_activo_id: null },
      { cantidad: 5 },
      { marca: 'TamperedBrand' },
      { categoria: 'Power Tools' },
    ];

    for (const body of forbiddenPayloads) {
      const res = await httpJson(apiUrl, `/api/activos/${sampleAssetId}`, {
        method: 'PATCH',
        token: supervisorAuth.token,
        body: { estado: 'disponible', ...body },
      });
      assert.equal(res.status, 403, `Expected 403 for supervisor payload ${JSON.stringify(body)}, got ${res.status}`);
      assert.equal(res.json.success, false);
      assert.equal(res.json.error.code, 'FORBIDDEN');
      assert.equal(
        res.json.error.message,
        'Supervisors are restricted to status and reassignment updates only.'
      );
    }
  });

  it('F6-T2-4: supervisor & trabajador blocked (403) from activos creation/deletion/category; trabajador blocked from PATCH/bulk/*', async () => {
    const createDeleteRoutes = [
      { method: 'POST', path: '/api/activos', body: { descripcion: 'Blocked', categoria: 'Power Tools' } },
      { method: 'POST', path: '/api/activos/bulk', body: { activos: [{ descripcion: 'Blocked' }] } },
      { method: 'DELETE', path: `/api/activos/${sampleAssetId}` },
      { method: 'POST', path: '/api/activos/bulk/delete', body: { ids: [sampleAssetId] } },
      { method: 'POST', path: '/api/activos/bulk-delete', body: { ids: [sampleAssetId] } },
      { method: 'PATCH', path: '/api/activos/bulk/category', body: { ids: [sampleAssetId], categoria: 'Hand Tools' } },
      { method: 'PATCH', path: '/api/activos/bulk-category', body: { ids: [sampleAssetId], categoria: 'Hand Tools' } },
    ];

    for (const actor of [supervisorAuth, trabajadorAuth]) {
      for (const spec of createDeleteRoutes) {
        const res = await httpJson(apiUrl, spec.path, {
          method: spec.method,
          token: actor.token,
          body: spec.body,
        });
        assert.equal(res.status, 403, `Expected 403 for ${actor.user.rol} on ${spec.method} ${spec.path}`);
        assert.equal(res.json.error.code, 'FORBIDDEN');
      }
    }

    const trabajadorPatchRoutes = [
      { method: 'PATCH', path: `/api/activos/${sampleAssetId}`, body: { estado: 'disponible' } },
      { method: 'PATCH', path: '/api/activos/bulk/status', body: { ids: [sampleAssetId], estado: 'disponible' } },
      { method: 'PATCH', path: '/api/activos/bulk-status', body: { ids: [sampleAssetId], estado: 'disponible' } },
      { method: 'PATCH', path: '/api/activos/bulk/zona', body: { ids: [sampleAssetId], ubicacion_actual_id: sampleUbicId } },
      { method: 'PATCH', path: '/api/activos/bulk-zona', body: { ids: [sampleAssetId], ubicacion_actual_id: sampleUbicId } },
      { method: 'PATCH', path: '/api/activos/bulk/team', body: { ids: [sampleAssetId], team: 'Energy' } },
      { method: 'PATCH', path: '/api/activos/bulk-team', body: { ids: [sampleAssetId], team: 'Energy' } },
      { method: 'PATCH', path: '/api/activos/bulk/usuario', body: { ids: [sampleAssetId], usuario_actual_id: trabajadorAuth.user.id } },
      { method: 'PATCH', path: '/api/activos/bulk-usuario', body: { ids: [sampleAssetId], usuario_actual_id: trabajadorAuth.user.id } },
    ];

    for (const spec of trabajadorPatchRoutes) {
      const res = await httpJson(apiUrl, spec.path, {
        method: spec.method,
        token: trabajadorAuth.token,
        body: spec.body,
      });
      assert.equal(res.status, 403, `Expected 403 for trabajador on ${spec.method} ${spec.path}`);
      assert.equal(res.json.error.code, 'FORBIDDEN');
    }
  });

  it('F6-T2-5: almacen, supervisor, and trabajador receive 403 on DELETE /api/activos/bulk/all', async () => {
    for (const actor of [almacenAuth, supervisorAuth, trabajadorAuth]) {
      const res = await httpJson(apiUrl, '/api/activos/bulk/all', {
        method: 'DELETE',
        token: actor.token,
      });
      assert.equal(res.status, 403, `Expected 403 for ${actor.user.rol} on DELETE /api/activos/bulk/all`);
      assert.equal(res.json.error.code, 'FORBIDDEN');
    }
  });

  it('F6-T2-6: supervisor and trabajador receive 403 on items, categories, ubicaciones, mantenimientos, and movimientos writes', async () => {
    const writeSpecs = [
      { method: 'POST', path: '/api/items', body: { nombre: 'Blocked Item', tipo: 'herramienta' } },
      { method: 'PUT', path: `/api/items/${sampleItemId}`, body: { nombre: 'Blocked Update' } },
      { method: 'DELETE', path: `/api/items/${sampleItemId}` },
      { method: 'PATCH', path: `/api/items/${sampleItemId}/stock`, body: { cantidad: 1, operacion: 'sumar' } },
      { method: 'POST', path: '/api/items/categorias', body: { nombre: 'BlockedCat', tipo: 'herramienta' } },
      { method: 'PUT', path: '/api/items/categorias/AnyCat', body: { nombre: 'RenamedCat' } },
      { method: 'DELETE', path: '/api/items/categorias/AnyCat' },
      { method: 'POST', path: '/api/ubicaciones', body: { nombre_ubicacion: 'Blocked Zone' } },
      { method: 'PUT', path: `/api/ubicaciones/${sampleUbicId}`, body: { nombre_ubicacion: 'Blocked Rename' } },
      { method: 'DELETE', path: `/api/ubicaciones/${sampleUbicId}` },
      { method: 'POST', path: '/api/mantenimientos', body: { activo_id: sampleAssetId, motivo: 'Blocked' } },
      { method: 'PUT', path: '/api/mantenimientos/1/atendido', body: {} },
      {
        method: 'POST',
        path: '/api/movimientos',
        body: { item_id: sampleItemId, usuario_id: trabajadorAuth.user.id, cantidad: 1, tipo_movimiento: 'ingreso' },
      },
    ];

    for (const actor of [supervisorAuth, trabajadorAuth]) {
      for (const spec of writeSpecs) {
        const res = await httpJson(apiUrl, spec.path, {
          method: spec.method,
          token: actor.token,
          body: spec.body,
        });
        assert.equal(res.status, 403, `Expected 403 for ${actor.user.rol} on ${spec.method} ${spec.path}, got ${res.status}`);
        assert.equal(res.json.error.code, 'FORBIDDEN');
      }
    }
  });

  it('F6-T2-7: Route hierarchy prevents /:id interception, unauthenticated requests return 401, and DELETE /api/usuarios/bulk/others works for admin', async () => {
    const unauthRoutes = [
      { method: 'GET', path: '/api/usuarios' },
      { method: 'GET', path: '/api/usuarios/asignables' },
      { method: 'GET', path: '/api/activos' },
      { method: 'GET', path: '/api/items' },
      { method: 'GET', path: '/api/audit' },
    ];
    for (const spec of unauthRoutes) {
      const res = await httpJson(apiUrl, spec.path, { method: spec.method });
      assert.equal(res.status, 401);
      assert.equal(res.json.error.code, 'UNAUTHORIZED');
    }

    const bySerial = await httpJson(apiUrl, '/api/activos/serial/AE-KS-2024-001', { token: adminToken });
    assert.equal(bySerial.status, 200);
    assert.equal(bySerial.json.data.numero_serie, 'AE-KS-2024-001');

    const exportRes = await fetch(`${apiUrl}/api/activos/export-excel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(exportRes.status, 200);
    await exportRes.arrayBuffer();

    const bulkStatus = await httpJson(apiUrl, '/api/activos/bulk/status', {
      method: 'PATCH',
      token: adminToken,
      body: { ids: [sampleAssetId], estado: 'disponible' },
    });
    assert.equal(bulkStatus.status, 200);

    const cats = await httpJson(apiUrl, '/api/items/categorias', { token: adminToken });
    assert.equal(cats.status, 200);
    assert.ok(Array.isArray(cats.json.data));

    const asignables = await httpJson(apiUrl, '/api/usuarios/asignables', { token: adminToken });
    assert.equal(asignables.status, 200);
    assert.ok(Array.isArray(asignables.json.data));

    // Verify DELETE /api/usuarios/bulk/others is not captured by /:id in a dedicated isolated env
    const isoEnv = await startIsolatedEnv();
    try {
      const { token: isoAdminToken, usuario: isoAdmin } = await loginAsSeedAdmin(isoEnv.apiUrl);
      // Clear seeded movimientos referencing other users first
      const wipeAssets = await httpJson(isoEnv.apiUrl, '/api/activos/bulk/all', {
        method: 'DELETE',
        token: isoAdminToken,
      });
      assert.equal(wipeAssets.status, 200);

      const bulkOthers = await httpJson(isoEnv.apiUrl, '/api/usuarios/bulk/others', {
        method: 'DELETE',
        token: isoAdminToken,
      });
      assert.equal(bulkOthers.status, 200);
      assert.equal(bulkOthers.json.data.deleted, true);
      assert.equal(bulkOthers.json.data.kept, isoAdmin.id);

      const remaining = await httpJson(isoEnv.apiUrl, '/api/usuarios', { token: isoAdminToken });
      assert.equal(remaining.status, 200);
      assert.equal(remaining.json.data.length, 1);
      assert.equal(remaining.json.data[0].id, isoAdmin.id);
    } finally {
      await isoEnv.close();
    }
  });
});
