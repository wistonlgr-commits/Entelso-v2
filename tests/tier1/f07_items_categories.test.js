'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  httpJson,
  loginAsSeedAdmin,
  nextTag,
} = require('./_f5_f8_helpers');

describe('F7 — Items & Category CRUD + Stock Guard (Tier 1)', () => {
  let env;
  let apiUrl;
  let adminToken;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
    const adminLogin = await loginAsSeedAdmin(apiUrl);
    adminToken = adminLogin.token;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F7-T1-1: GET /api/items, ?tipo=consumible, and /:id return seeded items with expected fields', async () => {
    const allRes = await httpJson(apiUrl, '/api/items', { token: adminToken });
    assert.equal(allRes.status, 200);
    assert.ok(Array.isArray(allRes.json.data) && allRes.json.data.length >= 12);

    const first = allRes.json.data[0];
    for (const key of ['id', 'nombre', 'tipo', 'stock_global_consumibles', 'categoria_padre', 'marca']) {
      assert.ok(Object.prototype.hasOwnProperty.call(first, key), `Missing field ${key}`);
    }

    const consRes = await httpJson(apiUrl, '/api/items?tipo=consumible', { token: adminToken });
    assert.equal(consRes.status, 200);
    assert.ok(consRes.json.data.length >= 4);
    assert.ok(consRes.json.data.every((item) => item.tipo === 'consumible'));

    const singleRes = await httpJson(apiUrl, `/api/items/${first.id}`, { token: adminToken });
    assert.equal(singleRes.status, 200);
    assert.equal(singleRes.json.data.id, first.id);
    assert.equal(singleRes.json.data.nombre, first.nombre);
  });

  it('F7-T1-2: POST /api/items creates herramienta, consumible, and kit (201) and PUT /api/items/:id updates fields (200)', async () => {
    const tag = nextTag('it');

    const toolRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Tool Model ${tag}`,
        tipo: 'herramienta',
        categoria_padre: 'Power Tools',
        marca: 'Makita',
      },
    });
    assert.equal(toolRes.status, 201);
    assert.equal(toolRes.json.data.tipo, 'herramienta');
    assert.equal(toolRes.json.data.stock_global_consumibles, 0);

    const consRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Consumible Model ${tag}`,
        tipo: 'consumible',
        stock_global_consumibles: 25,
        categoria_padre: 'Consumables',
        marca: '3M',
      },
    });
    assert.equal(consRes.status, 201);
    assert.equal(consRes.json.data.tipo, 'consumible');
    assert.equal(consRes.json.data.stock_global_consumibles, 25);

    const kitRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Kit Model ${tag}`,
        tipo: 'kit',
        categoria_padre: 'Walktest Kits',
        marca: 'VIAVI',
      },
    });
    assert.equal(kitRes.status, 201);
    assert.equal(kitRes.json.data.tipo, 'kit');
    assert.equal(kitRes.json.data.categoria_padre, 'Walktest Kits');
    assert.equal(kitRes.json.data.marca, 'VIAVI');

    const putRes = await httpJson(apiUrl, `/api/items/${kitRes.json.data.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        nombre: `Kit Model Updated ${tag}`,
        marca: 'Keysight',
      },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.json.data.nombre, `Kit Model Updated ${tag}`);
    assert.equal(putRes.json.data.marca, 'Keysight');
  });

  it('F7-T1-3: PATCH /api/items/:id/stock atomically increments and decrements consumible stock down to exact 0 boundary', async () => {
    const tag = nextTag('stk');
    const createRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `Stock Item ${tag}`,
        tipo: 'consumible',
        stock_global_consumibles: 10,
      },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.json.data.id;

    const addRes = await httpJson(apiUrl, `/api/items/${id}/stock`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 15, operacion: 'sumar' },
    });
    assert.equal(addRes.status, 200);
    assert.equal(addRes.json.data.stock_global_consumibles, 25);

    const subRes = await httpJson(apiUrl, `/api/items/${id}/stock`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 25, operacion: 'restar' },
    });
    assert.equal(subRes.status, 200);
    assert.equal(subRes.json.data.stock_global_consumibles, 0);
  });

  it('F7-T1-4: Category CRUD lifecycle (POST, GET, PUT rename, DELETE unused)', async () => {
    const tag = nextTag('cat');
    const catName = `Cat_${tag}`;
    const renamedName = `CatRenamed_${tag}`;

    const createRes = await httpJson(apiUrl, '/api/items/categorias', {
      method: 'POST',
      token: adminToken,
      body: { nombre: catName, tipo: 'herramienta' },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json.data.nombre, catName);

    const listRes = await httpJson(apiUrl, '/api/items/categorias', { token: adminToken });
    assert.equal(listRes.status, 200);
    const found = listRes.json.data.find((c) => c.nombre === catName);
    assert.ok(found, 'Created category must appear in GET /api/items/categorias');
    assert.equal(found.id, catName);
    assert.equal(found.tipo, 'herramienta');
    assert.equal(typeof found.total_modelos, 'number');

    const renameRes = await httpJson(apiUrl, `/api/items/categorias/${encodeURIComponent(catName)}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: renamedName },
    });
    assert.equal(renameRes.status, 200);
    assert.equal(renameRes.json.data.nombre, renamedName);

    const listAfterRename = await httpJson(apiUrl, '/api/items/categorias', { token: adminToken });
    assert.ok(listAfterRename.json.data.some((c) => c.nombre === renamedName));
    assert.ok(!listAfterRename.json.data.some((c) => c.nombre === catName));

    const delRes = await httpJson(apiUrl, `/api/items/categorias/${encodeURIComponent(renamedName)}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.data.deleted, true);

    const listAfterDel = await httpJson(apiUrl, '/api/items/categorias', { token: adminToken });
    assert.ok(!listAfterDel.json.data.some((c) => c.nombre === renamedName));
  });

  it('F7-T1-5: DELETE /api/items/:id removes an unused item and subsequent GET returns 404', async () => {
    const tag = nextTag('del_it');
    const createRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `Disposable Item ${tag}`, tipo: 'herramienta' },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.json.data.id;

    const delRes = await httpJson(apiUrl, `/api/items/${id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.data.deleted, true);

    const getRes = await httpJson(apiUrl, `/api/items/${id}`, { token: adminToken });
    assert.equal(getRes.status, 404);
    assert.equal(getRes.json.error.code, 'NOT_FOUND');
  });
});
