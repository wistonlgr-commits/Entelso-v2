'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const {
  PNG_1X1,
  httpJson,
  uploadMultipart,
  loginAdmin,
  createTestUser,
} = require('../tier1/_f9_f12_helpers');

describe('Tier 2 — F10: WhatsApp Bot & Ingest Negative/Security Cases', () => {
  let env;
  let adminToken;

  before(async () => {
    env = await startIsolatedEnv();
    const auth = await loginAdmin(env.apiUrl);
    adminToken = auth.token;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F10-T2-1: Unregistered phone returns HTTP 404 across all WhatsApp action routes without mutating DB', async () => {
    const beforeAsset = await httpJson(env.apiUrl, '/api/activos/serial/DW-20V-459-XT', {
      token: adminToken,
    });
    assert.equal(beforeAsset.status, 200);
    const startEstado = beforeAsset.body.data.estado;

    const endpoints = [
      {
        path: '/api/whatsapp/asignar',
        body: {
          telefono: '+61499888777',
          numero_inventario: 'AE-KS-2024-001',
          zona: 'NSW',
        },
      },
      {
        path: '/api/whatsapp/mantenimiento',
        body: {
          telefono: '+61499888777',
          numero_inventario: 'DW-20V-459-XT',
          descripcion: 'Unauthorized report',
        },
      },
      {
        path: '/api/whatsapp/subir-foto',
        body: {
          telefono: '+61499888777',
          numero_inventario: 'DW-20V-459-XT',
          base64_image: PNG_1X1.toString('base64'),
        },
      },
      {
        path: '/api/whatsapp/devolver',
        body: {
          telefono: '+61499888777',
          numero_inventario: 'DW-20V-459-XT',
        },
      },
      {
        path: '/api/whatsapp/cambiar-estado',
        body: {
          telefono: '+61499888777',
          numero_inventario: 'DW-20V-459-XT',
          nuevo_estado: 'danado',
        },
      },
    ];

    for (const ep of endpoints) {
      const res = await httpJson(env.apiUrl, ep.path, {
        method: 'POST',
        body: ep.body,
      });
      assert.equal(res.status, 404, `${ep.path} with unregistered phone must return 404`);
      assert.equal(res.body.success, false);
    }

    const afterAsset = await httpJson(env.apiUrl, '/api/activos/serial/DW-20V-459-XT', {
      token: adminToken,
    });
    assert.equal(afterAsset.body.data.estado, startEstado);
  });

  it('F10-T2-2: Registered active user WITHOUT pin_hash succeeds via WhatsApp (PIN removed); inactive user returns 403', async () => {
    const noPinUser = await createTestUser(env.apiUrl, adminToken, {
      nombre: 'No PIN Tech',
      telefono_whatsapp: '+61400999888',
      rol: 'trabajador',
    });
    assert.ok(noPinUser.id);

    const noPinAssign = await httpJson(env.apiUrl, '/api/whatsapp/asignar', {
      method: 'POST',
      body: {
        telefono: '+61400999888',
        numero_inventario: 'AE-KS-2024-001',
      },
    });
    assert.equal(noPinAssign.status, 200);
    assert.equal(noPinAssign.body.success, true);

    // Return it back cleanly without PIN
    const noPinReturn = await httpJson(env.apiUrl, '/api/whatsapp/devolver', {
      method: 'POST',
      body: {
        telefono: '+61400999888',
        numero_inventario: 'AE-KS-2024-001',
      },
    });
    assert.equal(noPinReturn.status, 200);

    const inactiveUser = await createTestUser(env.apiUrl, adminToken, {
      nombre: 'Inactive WA Tech',
      telefono_whatsapp: '+61400999777',
      rol: 'trabajador',
    });
    await httpJson(env.apiUrl, `/api/usuarios/${inactiveUser.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { activo: false },
    });

    const inactiveConsult = await httpJson(env.apiUrl, '/api/whatsapp/consultar', {
      method: 'POST',
      body: {
        telefono: '+61400999777',
        numero_inventario: 'AE-KS-2024-001',
      },
    });
    assert.equal(inactiveConsult.status, 403);
  });

  it('F10-T2-3: Unregistered phone (404), short phone (400), nonexistent serial (404), missing fields (400)', async () => {
    const unknownPhone = await httpJson(env.apiUrl, '/api/whatsapp/consultar', {
      method: 'POST',
      body: { telefono: '+61499999999', numero_inventario: 'AE-KS-2024-001' },
    });
    assert.equal(unknownPhone.status, 404);

    const shortPhone = await httpJson(env.apiUrl, '/api/whatsapp/consultar', {
      method: 'POST',
      body: { telefono: '12345', numero_inventario: 'AE-KS-2024-001' },
    });
    assert.equal(shortPhone.status, 400);

    const missingSerial = await httpJson(env.apiUrl, '/api/whatsapp/consultar', {
      method: 'POST',
      body: { telefono: '+584121234567', numero_inventario: 'DOES-NOT-EXIST-999' },
    });
    assert.equal(missingSerial.status, 404);

    const missingParams = await httpJson(env.apiUrl, '/api/whatsapp/mantenimiento', {
      method: 'POST',
      body: { telefono: '+584121234567', numero_inventario: 'AE-KS-2024-001' },
    });
    assert.equal(missingParams.status, 400);
    assert.equal(missingParams.body.error.code, 'VALIDATION_ERROR');
  });

  it('F10-T2-4: Business state guards (assign damaged/maintenance, invalid status, non-assigned return 403)', async () => {
    const assignDamaged = await httpJson(env.apiUrl, '/api/whatsapp/asignar', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'ESC-FV-QLD-003',
      },
    });
    assert.equal(assignDamaged.status, 400);

    const assignMaint = await httpJson(env.apiUrl, '/api/whatsapp/asignar', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'FJK-90S-001',
      },
    });
    assert.equal(assignMaint.status, 400);

    const badStatus = await httpJson(env.apiUrl, '/api/whatsapp/cambiar-estado', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'AE-KS-2024-001',
        nuevo_estado: 'invalid_state',
      },
    });
    assert.equal(badStatus.status, 400);
    assert.equal(badStatus.body.error.code, 'INVALID_STATUS');

    // DW-20V-459-XT is assigned to Juan; María (+584127654321, trabajador) cannot return it
    const wrongReturner = await httpJson(env.apiUrl, '/api/whatsapp/devolver', {
      method: 'POST',
      body: {
        telefono: '+584127654321',
        numero_inventario: 'DW-20V-459-XT',
      },
    });
    assert.equal(wrongReturner.status, 403);
    assert.equal(wrongReturner.body.error.code, 'FORBIDDEN');
  });

  it('F10-T2-5: /subir-foto rejects 6th photo, spoofed SVG base64, corrupt base64, and disallowed MIME', async () => {
    const assetRes = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Photo Limit Test Tool',
        categoria: 'Testing Equipment',
        numero_serie: 'PHOTO-LIM-001',
      },
    });
    assert.equal(assetRes.status, 201);

    // Spoofed SVG claiming mimetype image/png (magic bytes check must reject)
    const svgB64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const spoofRes = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PHOTO-LIM-001',
        base64_image: svgB64,
        mimetype: 'image/png',
      },
    });
    assert.equal(spoofRes.status, 400);
    assert.equal(spoofRes.body.error.code, 'VALIDATION_ERROR');

    // Corrupt base64
    const corruptRes = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PHOTO-LIM-001',
        base64_image: 'not-valid-base64!!!',
      },
    });
    assert.equal(corruptRes.status, 400);
    assert.equal(corruptRes.body.error.code, 'VALIDATION_ERROR');

    // Multipart disallowed MIME (.svg)
    const badForm = new FormData();
    badForm.append('telefono', '+584121234567');
    badForm.append('numero_inventario', 'PHOTO-LIM-001');
    badForm.append('foto', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), 'evil.svg');
    const badMpRes = await uploadMultipart(env.apiUrl, '/api/whatsapp/subir-foto', badForm);
    assert.equal(badMpRes.status, 400);
    assert.equal(badMpRes.body.error.code, 'VALIDATION_ERROR');

    // Upload 5 valid photos, then 6th must fail with PHOTO_LIMIT_REACHED
    const pngB64 = PNG_1X1.toString('base64');
    for (let i = 0; i < 5; i++) {
      const okRes = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
        method: 'POST',
        body: {
          telefono: '+584121234567',
          numero_inventario: 'PHOTO-LIM-001',
          base64_image: pngB64,
        },
      });
      assert.equal(okRes.status, 200, `Upload #${i + 1} should succeed`);
    }

    const sixthRes = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PHOTO-LIM-001',
        base64_image: pngB64,
      },
    });
    assert.equal(sixthRes.status, 400);
    assert.equal(sixthRes.body.error.code, 'PHOTO_LIMIT_REACHED');
  });

  it('F10-T2-6: /api/ingest/whatsapp rejects missing/wrong x-api-key (401/403) and invalid schema (400)', async () => {
    const validPayload = {
      whatsapp_number: '+61412345000',
      parsed: { numero_inventario: 'ING-NEG-1', equipo: 'Test Tool' },
    };

    const missingKey = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      body: validPayload,
    });
    assert.equal(missingKey.status, 401);
    assert.equal(missingKey.body.error.code, 'UNAUTHORIZED');

    const diffLenKey = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-api-key': 'short' },
      body: validPayload,
    });
    assert.equal(diffLenKey.status, 403);
    assert.equal(diffLenKey.body.error.code, 'FORBIDDEN');

    const sameLenWrongKey = 'X'.repeat(env.apiKey.length);
    const sameLenRes = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-api-key': sameLenWrongKey },
      body: validPayload,
    });
    assert.equal(sameLenRes.status, 403);
    assert.equal(sameLenRes.body.error.code, 'FORBIDDEN');

    const badSchema1 = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-api-key': env.apiKey },
      body: { whatsapp_number: '123', parsed: { numero_inventario: 'A1', equipo: 'Drill' } },
    });
    assert.equal(badSchema1.status, 400);
    assert.equal(badSchema1.body.error.code, 'VALIDATION_ERROR');

    const badSchema2 = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-api-key': env.apiKey },
      body: { whatsapp_number: '+61412345000', parsed: { numero_inventario: 'A1' } },
    });
    assert.equal(badSchema2.status, 400);
    assert.equal(badSchema2.body.error.code, 'VALIDATION_ERROR');
  });

  it('F10-T2-7: Isolated whatsappLimiter returns 429 RATE_LIMIT_EXCEEDED after 300 requests', async () => {
    const rateEnv = await startIsolatedEnv({ enableDashboard: false, enableStorageMock: false });
    try {
      const payload = JSON.stringify({ numero_inventario: 'AE-KS-2024-001' });
      const headers = { 'Content-Type': 'application/json' };

      // Send 300 fast non-bcrypt requests in controlled batches
      let completed = 0;
      const batchSize = 25;
      while (completed < 300) {
        const count = Math.min(batchSize, 300 - completed);
        const batch = Array.from({ length: count }, () =>
          fetch(`${rateEnv.apiUrl}/api/whatsapp/consultar-kit`, {
            method: 'POST',
            headers,
            body: payload,
          }).then(async (r) => {
            await r.text();
            return r.status;
          })
        );
        const statuses = await Promise.all(batch);
        for (const s of statuses) {
          assert.equal(s, 200, `Expected 200 within 300-request limit, got ${s}`);
        }
        completed += count;
      }

      const overLimit = await httpJson(rateEnv.apiUrl, '/api/whatsapp/consultar-kit', {
        method: 'POST',
        body: { numero_inventario: 'AE-KS-2024-001' },
      });
      assert.equal(overLimit.status, 429);
      assert.equal(overLimit.body.success, false);
      assert.equal(overLimit.body.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(overLimit.headers.get('ratelimit-limit'), 'Expected RateLimit-Limit header');
      assert.equal(overLimit.headers.get('ratelimit-remaining'), '0');
    } finally {
      await rateEnv.close();
    }
  });
});
