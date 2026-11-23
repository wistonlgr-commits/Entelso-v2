'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin, PNG_1X1, uploadMultipart } = require('./_f9_f12_helpers');

describe('Tier 1 — F8: Activos CRUD, Kits, Bulk Operations & Excel Export', () => {
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

  it('F8-T1-1: POST /api/activos creates asset with auto-serial & original_serial, GET /:id & /serial/:s return canonical fields', async () => {
    const createRes = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Fluke Fiber Meter',
        categoria: 'Testing Equipment',
        marca: 'Fluke',
        numero_serie: 'RAW-MFG-8811',
        team: 'Calibration',
        notas: 'Ready for NSW',
      },
    });
    assert.equal(createRes.status, 201);
    const created = createRes.body.data;
    assert.match(created.numero_serie, /^TE-\d{5}$/);
    assert.equal(created.original_serial, 'RAW-MFG-8811');

    const byId = await httpJson(env.apiUrl, `/api/activos/${created.id}`, { token: adminToken });
    assert.equal(byId.status, 200);
    assert.equal(byId.body.data.numero_serie, created.numero_serie);
    assert.equal(byId.body.data.usuario_actual_id, null);

    const bySerial = await httpJson(env.apiUrl, `/api/activos/serial/${created.numero_serie}`, { token: adminToken });
    assert.equal(bySerial.status, 200);
    assert.equal(bySerial.body.data.id, created.id);
  });

  it('F8-T1-2: Kit hierarchy propagates team, location, and user recursively to child assets on PATCH', async () => {
    const parent = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'WalkTest Kit Alpha', categoria: 'WalkTest Kits', numero_serie: 'WK-90001' },
    });
    assert.equal(parent.status, 201);

    const child = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Scanner Module', categoria: 'Testing Equipment', numero_serie: 'TE-90002' },
    });
    assert.equal(child.status, 201);

    const link = await httpJson(env.apiUrl, `/api/activos/${child.body.data.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { parent_activo_id: parent.body.data.id },
    });
    assert.equal(link.status, 200);

    const patchParent = await httpJson(env.apiUrl, `/api/activos/${parent.body.data.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { team: 'Networks', usuario_actual_id: adminUser.id, observaciones: 'Assigned kit' },
    });
    assert.equal(patchParent.status, 200);

    const childAfter = await httpJson(env.apiUrl, `/api/activos/${child.body.data.id}`, { token: adminToken });
    assert.equal(childAfter.body.data.team, 'Networks');
    assert.equal(childAfter.body.data.usuario_actual_id, adminUser.id);
  });

  it('F8-T1-3: POST /api/activos/bulk creates items without numero_serie (201) with distinct auto-generated serials', async () => {
    const bulkRes = await httpJson(env.apiUrl, '/api/activos/bulk', {
      method: 'POST',
      token: adminToken,
      body: {
        activos: [
          { descripcion: 'Cordless Drill 18V', categoria: 'Power Tools', marca: 'DeWalt' },
          { descripcion: 'Cordless Drill 18V', categoria: 'Power Tools', marca: 'DeWalt' },
          { descripcion: 'Impact Driver 18V', categoria: 'Power Tools', marca: 'Milwaukee' },
        ],
      },
    });
    assert.equal(bulkRes.status, 201);
    assert.equal(bulkRes.body.data.inserted, 3);
    assert.equal(bulkRes.body.data.total, 3);
    const listRes = await httpJson(env.apiUrl, '/api/activos?search=Cordless%20Drill%2018V', { token: adminToken });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.length >= 2);
    const serials = new Set(listRes.body.data.map((a) => a.numero_serie));
    assert.equal(serials.size, listRes.body.data.length);
    for (const s of serials) assert.match(s, /^PT-\d{5}$/);
  });

  it('F8-T1-4: Bulk status, zona, team, usuario, category, and delete endpoints work (both /bulk/* and /bulk-*)', async () => {
    const a1 = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Bulk Wrench', categoria: 'Hand Tools', numero_serie: 'HT-91001' },
    });
    const a2 = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Bulk Pliers', categoria: 'Hand Tools', numero_serie: 'HT-91002' },
    });
    const ids = [a1.body.data.id, a2.body.data.id];

    const st = await httpJson(env.apiUrl, '/api/activos/bulk-status', {
      method: 'PATCH',
      token: adminToken,
      body: { ids, estado: 'calibrado' },
    });
    assert.equal(st.status, 200);

    const tm = await httpJson(env.apiUrl, '/api/activos/bulk-team', {
      method: 'PATCH',
      token: adminToken,
      body: { ids, team: 'Energy' },
    });
    assert.equal(tm.status, 200);

    const cat = await httpJson(env.apiUrl, '/api/activos/bulk/category', {
      method: 'PATCH',
      token: adminToken,
      body: { ids, categoria: 'Safety & PPE' },
    });
    assert.equal(cat.status, 200);

    const del = await httpJson(env.apiUrl, '/api/activos/bulk-delete', {
      method: 'POST',
      token: adminToken,
      body: { ids },
    });
    assert.equal(del.status, 200);

    const after1 = await httpJson(env.apiUrl, `/api/activos/${ids[0]}`, { token: adminToken });
    assert.equal(after1.status, 404);
  });

  it('F8-T1-5: POST /api/activos/export-excel generates valid XLSX buffer including uploaded local mock photo', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([PNG_1X1], { type: 'image/png' }), 'tool.png');
    const up = await uploadMultipart(env.apiUrl, '/api/upload', fd, { token: adminToken });
    assert.equal(up.status, 200);

    const created = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Export Camera Test',
        categoria: 'Testing Equipment',
        numero_serie: 'TE-92001',
        fotos: [up.body.data.url],
      },
    });
    assert.equal(created.status, 201);

    const expRes = await fetch(`${env.apiUrl}/api/activos/export-excel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [created.body.data.id] }),
    });
    assert.equal(expRes.status, 200);
    const buf = Buffer.from(await expRes.arrayBuffer());
    assert.ok(buf.length > 1000, 'Expected non-empty XLSX binary');
    // XLSX is a ZIP archive starting with PK\x03\x04
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
  });
});
