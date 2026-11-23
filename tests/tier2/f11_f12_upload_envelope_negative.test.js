'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const { httpJson, loginAdmin, uploadMultipart } = require('../tier1/_f9_f12_helpers');

describe('Tier 2 — F11 & F12: Upload & Envelope Security / Negative Cases', () => {
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

  it('F11-T2-1: Unauthenticated POST /api/upload and /api/upload/batch are rejected with 401', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'unauth.png');
    const r1 = await uploadMultipart(env.apiUrl, '/api/upload', fd);
    assert.equal(r1.status, 401);
    const r2 = await uploadMultipart(env.apiUrl, '/api/upload/batch', fd);
    assert.equal(r2.status, 401);
  });

  it('F11-T2-2: Disallowed MIME types (.svg, .html) return operational 400 VALIDATION_ERROR', async () => {
    const fdSvg = new FormData();
    fdSvg.append('foto', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }), 'xss.svg');
    const rSvg = await uploadMultipart(env.apiUrl, '/api/upload', fdSvg, { token: adminToken });
    assert.equal(rSvg.status, 400);
    assert.equal(rSvg.body.error.code, 'VALIDATION_ERROR');

    const fdHtml = new FormData();
    fdHtml.append('foto', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'bad.html');
    const rHtml = await uploadMultipart(env.apiUrl, '/api/upload', fdHtml, { token: adminToken });
    assert.equal(rHtml.status, 400);
  });

  it('F11-T2-3: Empty upload requests without file return 400 VALIDATION_ERROR', async () => {
    const fd = new FormData();
    const r1 = await uploadMultipart(env.apiUrl, '/api/upload', fd, { token: adminToken });
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error.code, 'VALIDATION_ERROR');

    const r2 = await uploadMultipart(env.apiUrl, '/api/upload/batch', fd, { token: adminToken });
    assert.equal(r2.status, 400);
  });

  it('F12-T2-1: Non-string JSON inputs on auth/login return 400 VALIDATION_ERROR (never 500)', async () => {
    const res = await httpJson(env.apiUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: { $ne: '' }, pin: ['1234'] },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('F12-T2-2: WhatsApp /subir-foto accepts line-wrapped base64 JPEG from n8n/Evolution API', async () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+8jUAAAAASUVORK5CYII=',
      'base64'
    );
    const b64 = tinyPng.toString('base64');
    const wrapped = b64.slice(0, 32) + '\r\n' + b64.slice(32, 64) + '\n' + b64.slice(64);
    const res = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'YOK-AQ7280-SA-01',
        base64_image: wrapped,
        mimetype: 'image/png',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});
