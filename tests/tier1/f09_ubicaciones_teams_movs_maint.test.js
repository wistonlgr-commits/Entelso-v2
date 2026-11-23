'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin } = require('./_f9_f12_helpers');

describe('Tier 1 — F9: Ubicaciones, Teams, Movimientos, Mantenimientos & Alertas', () => {
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

  it('F9-T1-1: Ubicaciones CRUD lifecycle (GET, POST, PUT, GET /:id/activos, DELETE)', async () => {
    const listRes = await httpJson(env.apiUrl, '/api/ubicaciones', { token: adminToken });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    const almacen = listRes.body.data.find((u) => u.nombre_ubicacion === 'Almacén Central');
    assert.ok(almacen, 'Seeded Almacén Central should exist');

    const almacenAssets = await httpJson(env.apiUrl, `/api/ubicaciones/${almacen.id}/activos`, {
      token: adminToken,
    });
    assert.equal(almacenAssets.status, 200);
    assert.ok(
      almacenAssets.body.data.some((a) => a.numero_serie === 'AE-KS-2024-001'),
      'Expected AE-KS-2024-001 in Almacén Central'
    );

    const createRes = await httpJson(env.apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: adminToken,
      body: { nombre_ubicacion: 'Zone F9 Alpha', descripcion: 'Temporary test zone' },
    });
    assert.equal(createRes.status, 201);
    const createdId = createRes.body.data.id;
    assert.ok(createdId);
    assert.equal(createRes.body.data.nombre_ubicacion, 'Zone F9 Alpha');

    const getRes = await httpJson(env.apiUrl, `/api/ubicaciones/${createdId}`, { token: adminToken });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.nombre_ubicacion, 'Zone F9 Alpha');

    const updateRes = await httpJson(env.apiUrl, `/api/ubicaciones/${createdId}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre_ubicacion: 'Zone F9 Beta', descripcion: 'Updated description' },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.nombre_ubicacion, 'Zone F9 Beta');

    const emptyAssets = await httpJson(env.apiUrl, `/api/ubicaciones/${createdId}/activos`, {
      token: adminToken,
    });
    assert.equal(emptyAssets.status, 200);
    assert.deepEqual(emptyAssets.body.data, []);

    const delRes = await httpJson(env.apiUrl, `/api/ubicaciones/${createdId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.deleted, true);

    const afterDel = await httpJson(env.apiUrl, `/api/ubicaciones/${createdId}`, { token: adminToken });
    assert.equal(afterDel.status, 404);
  });

  it('F9-T1-2: Teams CRUD lifecycle (GET, POST, DELETE)', async () => {
    const initialRes = await httpJson(env.apiUrl, '/api/teams', { token: adminToken });
    assert.equal(initialRes.status, 200);
    assert.ok(initialRes.body.data.some((t) => t.nombre === 'Transmission'));

    const createRes = await httpJson(env.apiUrl, '/api/teams', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'QA Field Ops' },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.nombre, 'QA Field Ops');
    const teamId = createRes.body.data.id;

    const listAfterCreate = await httpJson(env.apiUrl, '/api/teams', { token: adminToken });
    assert.equal(listAfterCreate.status, 200);
    assert.ok(listAfterCreate.body.data.some((t) => t.id === teamId && t.nombre === 'QA Field Ops'));

    const delRes = await httpJson(env.apiUrl, `/api/teams/${teamId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.deleted, true);

    const listAfterDelete = await httpJson(env.apiUrl, '/api/teams', { token: adminToken });
    assert.equal(listAfterDelete.status, 200);
    assert.equal(listAfterDelete.body.data.some((t) => t.id === teamId), false);
  });

  it('F9-T1-3: Movimientos for consumible & herramienta update state/stock and support GET filters', async () => {
    const itemsRes = await httpJson(env.apiUrl, '/api/items?tipo=consumible', { token: adminToken });
    assert.equal(itemsRes.status, 200);
    const cinta = itemsRes.body.data.find((i) => i.nombre === 'Cinta Aislante 3M');
    assert.ok(cinta);
    const startStock = cinta.stock_global_consumibles;

    // Consumible despacho (-10)
    const consOut = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: cinta.id,
        usuario_id: adminUser.id,
        cantidad: 10,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(consOut.status, 201);

    const afterOut = await httpJson(env.apiUrl, `/api/items/${cinta.id}`, { token: adminToken });
    assert.equal(afterOut.body.data.stock_global_consumibles, startStock - 10);

    // Consumible ingreso (+5)
    const consIn = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: cinta.id,
        usuario_id: adminUser.id,
        cantidad: 5,
        tipo_movimiento: 'ingreso',
      },
    });
    assert.equal(consIn.status, 201);

    const afterIn = await httpJson(env.apiUrl, `/api/items/${cinta.id}`, { token: adminToken });
    assert.equal(afterIn.body.data.stock_global_consumibles, startStock - 5);

    // Herramienta despacho & devolucion
    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/AE-KS-2024-001', {
      token: adminToken,
    });
    assert.equal(assetRes.status, 200);
    const asset = assetRes.body.data;
    assert.equal(asset.estado, 'disponible');

    const toolOut = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: asset.item_id,
        activo_id: asset.id,
        usuario_id: adminUser.id,
        ubicacion_origen_id: asset.ubicacion_actual_id,
        cantidad: 1,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(toolOut.status, 201);

    const assetInUse = await httpJson(env.apiUrl, `/api/activos/${asset.id}`, { token: adminToken });
    assert.equal(assetInUse.body.data.estado, 'en_uso');
    assert.equal(assetInUse.body.data.usuario_actual_id, adminUser.id);

    const toolReturn = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        item_id: asset.item_id,
        activo_id: asset.id,
        usuario_id: adminUser.id,
        ubicacion_destino_id: asset.ubicacion_actual_id,
        cantidad: 1,
        tipo_movimiento: 'devolucion',
      },
    });
    assert.equal(toolReturn.status, 201);

    const assetReturned = await httpJson(env.apiUrl, `/api/activos/${asset.id}`, { token: adminToken });
    assert.equal(assetReturned.body.data.estado, 'disponible');
    assert.equal(assetReturned.body.data.usuario_actual_id, null);

    // GET /api/movimientos filters
    const filtered = await httpJson(
      env.apiUrl,
      `/api/movimientos?activo_id=${asset.id}&tipo_movimiento=devolucion&numero_serie=AE-KS-2024-001`,
      { token: adminToken }
    );
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.length >= 1);
    assert.ok(
      filtered.body.data.every(
        (m) => m.numero_serie === 'AE-KS-2024-001' && m.tipo_movimiento === 'devolucion'
      )
    );
  });

  it('F9-T1-4: Mantenimientos lifecycle (POST -> En Proceso + en_mantenimiento, PUT atendido -> Atendido + disponible)', async () => {
    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/FLK-87V-9901', {
      token: adminToken,
    });
    assert.equal(assetRes.status, 200);
    const asset = assetRes.body.data;
    assert.equal(asset.estado, 'disponible');

    const createMaint = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: {
        activo_id: asset.id,
        motivo: 'Annual calibration check',
        notas: 'Scheduled in F9-T1-4',
        creado_por: adminUser.id,
      },
    });
    assert.equal(createMaint.status, 201);
    const maintId = createMaint.body.data.id;
    assert.equal(createMaint.body.data.estado, 'En Proceso');

    const assetDuring = await httpJson(env.apiUrl, `/api/activos/${asset.id}`, { token: adminToken });
    assert.equal(assetDuring.body.data.estado, 'en_mantenimiento');

    const listMaint = await httpJson(env.apiUrl, '/api/mantenimientos', { token: adminToken });
    assert.equal(listMaint.status, 200);
    const found = listMaint.body.data.find((m) => m.id === maintId);
    assert.ok(found, 'Created maintenance record should appear in GET /api/mantenimientos');
    assert.equal(found.numero_serie, 'FLK-87V-9901');
    assert.equal(found.estado, 'En Proceso');

    const attendRes = await httpJson(env.apiUrl, `/api/mantenimientos/${maintId}/atendido`, {
      method: 'PUT',
      token: adminToken,
    });
    assert.equal(attendRes.status, 200);
    assert.equal(attendRes.body.data.estado, 'Atendido');

    const assetAfter = await httpJson(env.apiUrl, `/api/activos/${asset.id}`, { token: adminToken });
    assert.equal(assetAfter.body.data.estado, 'disponible');
  });

  it('F9-T1-5: Alertas endpoints (/, /calibracion, /tag) return seeded alerts and exclude non-alertable states', async () => {
    const allRes = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.equal(allRes.status, 200);
    const allAlerts = allRes.body.data;

    assert.ok(
      allAlerts.some((a) => a.numero_serie === 'DW-20V-459-XT' && a.tipo_alerta === 'Calibración Próxima')
    );
    assert.ok(
      allAlerts.some((a) => a.numero_serie === 'AE-KS-2023-002' && a.tipo_alerta === 'Tag Vencido')
    );
    assert.ok(
      allAlerts.some((a) => a.numero_serie === 'TEK-TBS1104-007' && a.tipo_alerta === 'Calibración Próxima')
    );
    assert.ok(
      allAlerts.some((a) => a.numero_serie === 'TEK-TBS1104-007' && a.tipo_alerta === 'Tag Próximo')
    );

    // Excluded states: en_mantenimiento, danado, desconocido
    assert.equal(allAlerts.some((a) => a.numero_serie === 'FJK-90S-001'), false);
    assert.equal(allAlerts.some((a) => a.numero_serie === 'ESC-FV-QLD-003'), false);
    assert.equal(allAlerts.some((a) => a.numero_serie === 'FLK-87V-TAS-002'), false);

    const calRes = await httpJson(env.apiUrl, '/api/alertas/calibracion', { token: adminToken });
    assert.equal(calRes.status, 200);
    assert.ok(calRes.body.data.length >= 2);
    assert.ok(
      calRes.body.data.every((a) =>
        ['Calibración Vencida', 'Calibración Próxima'].includes(a.tipo_alerta)
      )
    );

    const tagRes = await httpJson(env.apiUrl, '/api/alertas/tag', { token: adminToken });
    assert.equal(tagRes.status, 200);
    assert.ok(tagRes.body.data.length >= 2);
    assert.ok(tagRes.body.data.every((a) => ['Tag Vencido', 'Tag Próximo'].includes(a.tipo_alerta)));
  });

  it('F9-T1-6: Putting alerted asset into maintenance hides its alerts; attending restores them', async () => {
    const tekRes = await httpJson(env.apiUrl, '/api/activos/serial/TEK-TBS1104-007', {
      token: adminToken,
    });
    assert.equal(tekRes.status, 200);
    const tek = tekRes.body.data;

    const alertsBefore = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.ok(alertsBefore.body.data.some((a) => a.activo_id === tek.id));

    const maintRes = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: { activo_id: tek.id, motivo: 'Tag & calibration renewal' },
    });
    assert.equal(maintRes.status, 201);

    const alertsDuring = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.equal(alertsDuring.body.data.some((a) => a.activo_id === tek.id), false);

    const attendRes = await httpJson(
      env.apiUrl,
      `/api/mantenimientos/${maintRes.body.data.id}/atendido`,
      { method: 'PUT', token: adminToken }
    );
    assert.equal(attendRes.status, 200);

    const alertsAfter = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.ok(alertsAfter.body.data.some((a) => a.activo_id === tek.id));
  });
});
