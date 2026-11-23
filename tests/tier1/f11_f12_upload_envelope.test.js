'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin, PNG_1X1, uploadMultipart } = require('./_f9_f12_helpers');

describe('Tier 1 — F11 & F12: Upload Storage Mock, API Response Envelope & Reverse-Proxy Safety', () => {
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

  it('F11-T1-1: POST /api/upload stores image in isolated storage mock and returns retrievable URL', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([PNG_1X1], { type: 'image/png' }), 'single.png');
    const up = await uploadMultipart(env.apiUrl, '/api/upload', fd, { token: adminToken });
    assert.equal(up.status, 200);
    assert.equal(up.body.success, true);
    assert.ok(up.body.data.url.startsWith(env.storageUrl));
    assert.equal(typeof up.body.message, 'string');

    const imgRes = await fetch(up.body.data.url);
    assert.equal(imgRes.status, 200);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    assert.deepEqual(bytes, PNG_1X1);
  });

  it('F11-T1-2: POST /api/upload/batch uploads multiple images and stores all objects in mock storage', async () => {
    const fd = new FormData();
    fd.append('fotos', new Blob([PNG_1X1], { type: 'image/png' }), 'batch1.png');
    fd.append('fotos', new Blob([PNG_1X1], { type: 'image/png' }), 'batch2.png');
    const up = await uploadMultipart(env.apiUrl, '/api/upload/batch', fd, { token: adminToken });
    assert.equal(up.status, 200);
    assert.equal(up.body.success, true);
    assert.equal(up.body.data.urls.length, 2);
    for (const u of up.body.data.urls) assert.ok(u.startsWith(env.storageUrl));
  });

  it('F12-T1-1: Success response includes { success: true, data, timestamp } and distinguishes message vs pagination', async () => {
    const res = await httpJson(env.apiUrl, '/api/activos', { token: adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(typeof res.body.timestamp === 'string' && !Number.isNaN(Date.parse(res.body.timestamp)));
  });

  it('F12-T1-2: Error response includes consistent { success: false, error: { code, message }, message, timestamp }', async () => {
    const res = await httpJson(env.apiUrl, '/api/does-not-exist', { token: adminToken });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(res.body.message, res.body.error.message);
    assert.ok(typeof res.body.timestamp === 'string');
  });

  it('F12-T1-3: Express trust proxy handles X-Forwarded-For behind Coolify/Traefik without rate-limit errors', async () => {
    const res = await httpJson(env.apiUrl, '/api/auth/me', {
      token: adminToken,
      headers: { 'X-Forwarded-For': '203.0.113.42' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.rol, 'admin');
  });
});
