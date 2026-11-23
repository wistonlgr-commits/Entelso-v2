'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin } = require('../tier1/_f9_f12_helpers');

describe('Tier 2 — F9: Ubicaciones, Teams, Movimientos & Mantenimientos Negative/Rollback Cases', () => {
  let env;
  let adminToken;
  let adminUser;

  before(async () => {
    env = await startIsolatedEnv();
    const auth = await loginAdmin(env.apiUrl);
    adminToken = auth.token;
    adminUser = auth.usuario;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F9-T2-1: Pure-HTTP POST /api/movimientos transaction rolls back activos update on FK failure', async () => {
    const assetBeforeRes = await httpJson(env.apiUrl, '/api/activos/serial/AE-KS-2024-001', {
      token: adminToken,
    });
    assert.equal(assetBeforeRes.status, 200);
    const assetBefore = assetBeforeRes.body.data;
    assert.equal(assetBefore.estado, 'disponible');
    assert.equal(assetBefore.usuario_actual_id, null);

    const movsBeforeRes = await httpJson(
      env.apiUrl,
      `/api/movimientos?activo_id=${assetBefore.id}`,
      { token: adminToken }
    );
    assert.equal(movsBeforeRes.status, 200);
    const movCountBefore = movsBeforeRes.body.data.length;

    // Statement 1 updates activos to en_uso + usuario_actual_id; Statement 2 fails FK on ubicacion_origen_id
    const failMove = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: assetBefore.item_id,
        activo_id: assetBefore.id,
        usuario_id: adminUser.id,
        ubicacion_origen_id: 999999,
        cantidad: 1,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(failMove.status, 400);
    assert.equal(failMove.body.success, false);
    assert.equal(failMove.body.error.code, 'FOREIGN_KEY_ERROR');

    // Verify activos state rolled back cleanly
    const assetAfterRes = await httpJson(env.apiUrl, `/api/activos/${assetBefore.id}`, {
      token: adminToken,
    });
    assert.equal(assetAfterRes.status, 200);
    assert.equal(assetAfterRes.body.data.estado, 'disponible');
    assert.equal(assetAfterRes.body.data.usuario_actual_id, null);
    assert.equal(assetAfterRes.body.data.ubicacion_actual_id, assetBefore.ubicacion_actual_id);

    const movsAfterRes = await httpJson(
      env.apiUrl,
      `/api/movimientos?activo_id=${assetBefore.id}`,
      { token: adminToken }
    );
    assert.equal(movsAfterRes.body.data.length, movCountBefore);
  });

  it('F9-T2-2: Ubicaciones guards (ON DELETE SET NULL on assets, duplicate name 409, short name 400, missing ID 404)', async () => {
    const tempLocRes = await httpJson(env.apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: adminToken,
      body: { nombre_ubicacion: 'Temp Zone SetNull' },
    });
    assert.equal(tempLocRes.status, 201);
    const tempLocId = tempLocRes.body.data.id;

    const assignedAsset = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Temp Zone Tool',
        categoria: 'Hand Tools',
        ubicacion_actual_id: tempLocId,
      },
    });
    assert.equal(assignedAsset.status, 201);

    const fkDel = await httpJson(env.apiUrl, `/api/ubicaciones/${tempLocId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(fkDel.status, 200);

    const checkAsset = await httpJson(env.apiUrl, `/api/activos/${assignedAsset.body.data.id}`, {
      token: adminToken,
    });
    assert.equal(checkAsset.status, 200);
    assert.equal(checkAsset.body.data.ubicacion_actual_id, null);

    const dupCreate = await httpJson(env.apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: adminToken,
      body: { nombre_ubicacion: 'Almacén Central' },
    });
    assert.equal(dupCreate.status, 409);
    assert.equal(dupCreate.body.error.code, 'DUPLICATE_KEY');

    const shortCreate = await httpJson(env.apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: adminToken,
      body: { nombre_ubicacion: 'X' },
    });
    assert.equal(shortCreate.status, 400);
    assert.equal(shortCreate.body.error.code, 'VALIDATION_ERROR');

    const get404 = await httpJson(env.apiUrl, '/api/ubicaciones/999999', { token: adminToken });
    assert.equal(get404.status, 404);
    assert.equal(get404.body.error.code, 'NOT_FOUND');

    const put404 = await httpJson(env.apiUrl, '/api/ubicaciones/999999', {
      method: 'PUT',
      token: adminToken,
      body: { nombre_ubicacion: 'DoesNotExist' },
    });
    assert.equal(put404.status, 404);
    assert.equal(put404.body.error.code, 'NOT_FOUND');

    const del404 = await httpJson(env.apiUrl, '/api/ubicaciones/999999', {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(del404.status, 404);
    assert.equal(del404.body.error.code, 'NOT_FOUND');
  });

  it('F9-T2-3: Teams guards (duplicate nombre and empty nombre return 400)', async () => {
    const dupTeam = await httpJson(env.apiUrl, '/api/teams', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Transmission' },
    });
    assert.equal(dupTeam.status, 400);
    assert.equal(dupTeam.body.success, false);

    const emptyTeam = await httpJson(env.apiUrl, '/api/teams', {
      method: 'POST',
      token: adminToken,
      body: { nombre: '' },
    });
    assert.equal(emptyTeam.status, 400);
    assert.equal(emptyTeam.body.error.code, 'VALIDATION_ERROR');
  });

  it('F9-T2-4: Movimientos validation & stock guard (over-depletion, consumible+activo, tool quantity/missing activo, invalid type)', async () => {
    const itemsRes = await httpJson(env.apiUrl, '/api/items', { token: adminToken });
    const cinta = itemsRes.body.data.find((i) => i.nombre === 'Cinta Aislante 3M');
    const stockBefore = cinta.stock_global_consumibles;

    const overDeplete = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: cinta.id,
        usuario_id: adminUser.id,
        cantidad: stockBefore + 500,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(overDeplete.status, 400);
    assert.equal(overDeplete.body.success, false);

    const cintaAfter = await httpJson(env.apiUrl, `/api/items/${cinta.id}`, { token: adminToken });
    assert.equal(cintaAfter.body.data.stock_global_consumibles, stockBefore);

    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/FLK-87V-9901', {
      token: adminToken,
    });
    const toolAsset = assetRes.body.data;

    const consWithAsset = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: cinta.id,
        activo_id: toolAsset.id,
        usuario_id: adminUser.id,
        cantidad: 1,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(consWithAsset.status, 400);

    const toolQtyTwo = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: toolAsset.item_id,
        activo_id: toolAsset.id,
        usuario_id: adminUser.id,
        cantidad: 2,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(toolQtyTwo.status, 400);

    const toolNoAsset = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: toolAsset.item_id,
        usuario_id: adminUser.id,
        cantidad: 1,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(toolNoAsset.status, 400);

    const badType = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: cinta.id,
        usuario_id: adminUser.id,
        cantidad: 1,
        tipo_movimiento: 'not_a_movement',
      },
    });
    assert.equal(badType.status, 400);
    assert.equal(badType.body.error.code, 'VALIDATION_ERROR');
  });

  it('F9-T2-5: Mantenimientos negative cases (missing ID on atendido, empty motivo, nonexistent activo_id)', async () => {
    const attend404 = await httpJson(env.apiUrl, '/api/mantenimientos/999999/atendido', {
      method: 'PUT',
      token: adminToken,
    });
    assert.equal(attend404.status, 404);
    assert.equal(attend404.body.error.code, 'NOT_FOUND');

    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/FLK-87V-9901', {
      token: adminToken,
    });
    const emptyMotivo = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: { activo_id: assetRes.body.data.id, motivo: '   ' },
    });
    assert.equal(emptyMotivo.status, 400);
    assert.equal(emptyMotivo.body.error.code, 'VALIDATION_ERROR');

    const badActivo = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: { activo_id: 999999, motivo: 'Check missing asset' },
    });
    assert.equal(badActivo.status, 400);
    assert.equal(badActivo.body.error.code, 'FOREIGN_KEY_ERROR');
  });

  it('F9-T2-6: POST /api/mantenimientos rollback when creado_por FK fails leaves asset disponible', async () => {
    const assetBeforeRes = await httpJson(env.apiUrl, '/api/activos/serial/FLK-87V-9901', {
      token: adminToken,
    });
    const assetBefore = assetBeforeRes.body.data;
    assert.equal(assetBefore.estado, 'disponible');

    const maintBeforeRes = await httpJson(env.apiUrl, '/api/mantenimientos', { token: adminToken });
    const countBefore = maintBeforeRes.body.data.length;

    const failMaint = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        activo_id: assetBefore.id,
        motivo: 'Should rollback on FK failure',
        creado_por: 999999,
      },
    });
    assert.equal(failMaint.status, 400);
    assert.equal(failMaint.body.error.code, 'FOREIGN_KEY_ERROR');

    const assetAfterRes = await httpJson(env.apiUrl, `/api/activos/${assetBefore.id}`, {
      token: adminToken,
    });
    assert.equal(assetAfterRes.body.data.estado, 'disponible');

    const maintAfterRes = await httpJson(env.apiUrl, '/api/mantenimientos', { token: adminToken });
    assert.equal(maintAfterRes.body.data.length, countBefore);
  });
});
