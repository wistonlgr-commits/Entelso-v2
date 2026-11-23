'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin } = require('../tier1/_f9_f12_helpers');

async function createUserAndLogin(apiUrl, adminToken, { nombre, email, rol, pin }) {
  const cr = await httpJson(apiUrl, '/api/usuarios', {
    method: 'POST',
    token: adminToken,
    body: { nombre, email, rol, pin },
  });
  assert.equal(cr.status, 201);
  const lg = await httpJson(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, pin },
  });
  assert.equal(lg.status, 200);
  return { user: cr.body.data, token: lg.body.data.token };
}

describe('Tier 2 — F8: Activos Negative, Boundary, RBAC & SSRF Guards', () => {
  let env;
  let adminToken;
  let supToken;

  before(async () => {
    env = await startIsolatedEnv();
    const auth = await loginAdmin(env.apiUrl);
    adminToken = auth.token;
    const sup = await createUserAndLogin(env.apiUrl, adminToken, {
      nombre: 'Supervisor F8',
      email: 'sup.f8@entelso.test',
      rol: 'supervisor',
      pin: 'SupF8Pass!',
    });
    supToken = sup.token;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F8-T2-1: Duplicate numero_serie on POST /api/activos is rejected with 400', async () => {
    const first = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Dup Tool', categoria: 'Hand Tools', numero_serie: 'HT-93001' },
    });
    assert.equal(first.status, 201);

    const dup = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Dup Tool', categoria: 'Hand Tools', numero_serie: 'HT-93001' },
    });
    assert.equal(dup.status, 400);
    assert.equal(dup.body.success, false);
  });

  it('F8-T2-2: Supervisor is blocked (403) from forbidden PATCH /:id fields and PATCH /bulk/category', async () => {
    const a = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Guarded Asset', categoria: 'Hand Tools', numero_serie: 'HT-93002' },
    });
    assert.equal(a.status, 201);

    const badPatch = await httpJson(env.apiUrl, `/api/activos/${a.body.data.id}`, {
      method: 'PATCH',
      token: supToken,
      body: { numero_serie: 'HT-99999' },
    });
    assert.equal(badPatch.status, 403);
    assert.match(badPatch.body.error.message, /Supervisors are restricted/);

    const badBulkCat = await httpJson(env.apiUrl, '/api/activos/bulk/category', {
      method: 'PATCH',
      token: supToken,
      body: { ids: [a.body.data.id], categoria: 'Power Tools' },
    });
    assert.equal(badBulkCat.status, 403);
  });

  it('F8-T2-3: Quantity 0 transitions asset to sin_stock and restoring >0 transitions back to disponible', async () => {
    const a = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Safety Gloves', categoria: 'Safety & PPE', numero_serie: 'SP-93003', cantidad: 0 },
    });
    assert.equal(a.status, 201);
    assert.equal(a.body.data.estado, 'sin_stock');

    const restock = await httpJson(env.apiUrl, `/api/activos/${a.body.data.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 5 },
    });
    assert.equal(restock.status, 200);
    assert.equal(restock.body.data.estado, 'disponible');
  });

  it('F8-T2-4: Missing/invalid asset IDs and empty bulk payloads return 400/404 cleanly', async () => {
    const missing = await httpJson(env.apiUrl, '/api/activos/999999', { token: adminToken });
    assert.equal(missing.status, 404);

    const emptyBulk = await httpJson(env.apiUrl, '/api/activos/bulk', {
      method: 'POST',
      token: adminToken,
      body: { activos: [] },
    });
    assert.equal(emptyBulk.status, 400);
  });

  it('F8-T2-5: export-excel skips blocked SSRF/metadata/external image URLs safely and still returns 200 XLSX', async () => {
    const a = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'SSRF Probe Asset',
        categoria: 'Hand Tools',
        numero_serie: 'HT-93005',
        fotos: ['http://169.254.169.254/latest/meta-data/', 'https://example.invalid/blocked.png'],
      },
    });
    assert.equal(a.status, 201);

    const expRes = await fetch(`${env.apiUrl}/api/activos/export-excel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [a.body.data.id] }),
    });
    assert.equal(expRes.status, 200);
    const buf = Buffer.from(await expRes.arrayBuffer());
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
  });
});
