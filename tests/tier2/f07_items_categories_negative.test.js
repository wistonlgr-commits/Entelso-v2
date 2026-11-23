'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  httpJson,
  loginAsSeedAdmin,
  nextTag,
} = require('../tier1/_f5_f8_helpers');

describe('F7 — Items, Categories & Stock Guard Negative Cases (Tier 2)', () => {
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

  it('F7-T2-1: PATCH /api/items/:id/stock rejects subtracting more than available (400 INSUFFICIENT_STOCK) without changing stock', async () => {
    const tag = nextTag('depl');
    const createRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `Deplete Guard ${tag}`, tipo: 'consumible', stock_global_consumibles: 5 },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.json.data.id;

    const failRes = await httpJson(apiUrl, `/api/items/${id}/stock`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 6, operacion: 'restar' },
    });
    assert.equal(failRes.status, 400);
    assert.equal(failRes.json.error.code, 'INSUFFICIENT_STOCK');

    const checkRes = await httpJson(apiUrl, `/api/items/${id}`, { token: adminToken });
    assert.equal(checkRes.status, 200);
    assert.equal(checkRes.json.data.stock_global_consumibles, 5);
  });

  it('F7-T2-2: 5-way concurrent stock subtraction prevents negative stock (stock=10, 5x -4 -> max 2 succeed, final stock=2)', async () => {
    const tag = nextTag('race_stk');
    const createRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `Concurrent Stock ${tag}`, tipo: 'consumible', stock_global_consumibles: 10 },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.json.data.id;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        httpJson(apiUrl, `/api/items/${id}/stock`, {
          method: 'PATCH',
          token: adminToken,
          body: { cantidad: 4, operacion: 'restar' },
        })
      )
    );

    const successes = responses.filter((r) => r.status === 200);
    const failures = responses.filter((r) => r.status === 400);

    assert.equal(successes.length, 2, `Expected exactly 2 successes, got ${successes.length}`);
    assert.equal(failures.length, 3, `Expected 3 INSUFFICIENT_STOCK rejections, got ${failures.length}`);
    for (const f of failures) {
      assert.equal(f.json.error.code, 'INSUFFICIENT_STOCK');
    }

    const finalRes = await httpJson(apiUrl, `/api/items/${id}`, { token: adminToken });
    assert.equal(finalRes.status, 200);
    assert.ok(finalRes.json.data.stock_global_consumibles >= 0, 'Stock must never drop below 0');
    assert.equal(finalRes.json.data.stock_global_consumibles, 2);
  });

  it('F7-T2-3: PATCH /api/items/:id/stock rejects non-consumible items (400) and invalid cantidad/operacion (400 VALIDATION_ERROR)', async () => {
    const tag = nextTag('noncons');
    const toolRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `NonConsumible ${tag}`, tipo: 'herramienta' },
    });
    assert.equal(toolRes.status, 201);
    const toolId = toolRes.json.data.id;

    const toolStockRes = await httpJson(apiUrl, `/api/items/${toolId}/stock`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 1, operacion: 'sumar' },
    });
    assert.equal(toolStockRes.status, 400);
    assert.equal(toolStockRes.json.error.code, 'VALIDATION_ERROR');

    const badBodies = [
      { cantidad: 0, operacion: 'sumar' },
      { cantidad: -5, operacion: 'restar' },
      { cantidad: 2, operacion: 'multiplicar' },
    ];
    for (const body of badBodies) {
      const r = await httpJson(apiUrl, `/api/items/${toolId}/stock`, {
        method: 'PATCH',
        token: adminToken,
        body,
      });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    }
  });

  it('F7-T2-4: POST /api/items rejects duplicate nombre (409 DUPLICATE_KEY), negative stock, and invalid tipo (400 VALIDATION_ERROR)', async () => {
    const tag = nextTag('dup_it');
    const first = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `UniqueItem_${tag}`, tipo: 'herramienta' },
    });
    assert.equal(first.status, 201);

    const dup = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `UniqueItem_${tag}`, tipo: 'herramienta' },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, 'DUPLICATE_KEY');

    const negStock = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `NegStock_${tag}`, tipo: 'consumible', stock_global_consumibles: -1 },
    });
    assert.equal(negStock.status, 400);
    assert.equal(negStock.json.error.code, 'VALIDATION_ERROR');

    const badTipo = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `BadTipo_${tag}`, tipo: 'vehiculo' },
    });
    assert.equal(badTipo.status, 400);
    assert.equal(badTipo.json.error.code, 'VALIDATION_ERROR');
  });

  it('F7-T2-5: DELETE /api/items/:id and DELETE /api/items/categorias/:nombre return 409 CATEGORY_IN_USE when linked to an activo', async () => {
    const tag = nextTag('inuse');
    const catName = `InUseCat_${tag}`;
    const itemRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: `InUseItem_${tag}`, tipo: 'herramienta', categoria_padre: catName },
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.json.data.id;

    const assetRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { item_id: itemId },
    });
    assert.equal(assetRes.status, 201);

    const delItemRes = await httpJson(apiUrl, `/api/items/${itemId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delItemRes.status, 409);
    assert.equal(delItemRes.json.error.code, 'CATEGORY_IN_USE');

    const delCatRes = await httpJson(apiUrl, `/api/items/categorias/${encodeURIComponent(catName)}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delCatRes.status, 409);
    assert.equal(delCatRes.json.error.code, 'CATEGORY_IN_USE');
  });

  it('F7-T2-6: Category edge cases: duplicate (409), rename collision (409), missing (404), and URL-encoded Safety & PPE', async () => {
    const tag = nextTag('cat_edge');
    const c1 = `EdgeCat1_${tag}`;
    const c2 = `EdgeCat2_${tag}`;

    assert.equal(
      (await httpJson(apiUrl, '/api/items/categorias', {
        method: 'POST',
        token: adminToken,
        body: { nombre: c1, tipo: 'herramienta' },
      })).status,
      201
    );
    assert.equal(
      (await httpJson(apiUrl, '/api/items/categorias', {
        method: 'POST',
        token: adminToken,
        body: { nombre: c2, tipo: 'herramienta' },
      })).status,
      201
    );

    const dupCat = await httpJson(apiUrl, '/api/items/categorias', {
      method: 'POST',
      token: adminToken,
      body: { nombre: c1.toLowerCase(), tipo: 'herramienta' },
    });
    assert.equal(dupCat.status, 409);
    assert.equal(dupCat.json.error.code, 'DUPLICATE_KEY');

    const renameCollision = await httpJson(apiUrl, `/api/items/categorias/${encodeURIComponent(c1)}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: c2 },
    });
    assert.equal(renameCollision.status, 409);
    assert.equal(renameCollision.json.error.code, 'DUPLICATE_KEY');

    const renameMissing = await httpJson(apiUrl, `/api/items/categorias/NonExistent_${tag}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: `StillMissing_${tag}` },
    });
    assert.equal(renameMissing.status, 404);
    assert.equal(renameMissing.json.error.code, 'NOT_FOUND');

    const delMissing = await httpJson(apiUrl, `/api/items/categorias/NonExistent_${tag}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delMissing.status, 404);
    assert.equal(delMissing.json.error.code, 'NOT_FOUND');

    // URL-encoded '&' and spaces
    const createPpe = await httpJson(apiUrl, '/api/items/categorias', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Safety & PPE', tipo: 'herramienta' },
    });
    assert.equal(createPpe.status, 201);

    const renamePpe = await httpJson(apiUrl, '/api/items/categorias/Safety%20%26%20PPE', {
      method: 'PUT',
      token: adminToken,
      body: { nombre: `Safety & PPE Updated ${tag}` },
    });
    assert.equal(renamePpe.status, 200);
    assert.equal(renamePpe.json.data.nombre, `Safety & PPE Updated ${tag}`);
  });
});
