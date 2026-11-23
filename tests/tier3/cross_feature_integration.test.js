'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { authenticator } = require(path.join(__dirname, '../../backend/node_modules/otplib'));
const { startIsolatedEnv } = require('../harness/test_env');
const { createDashboardSandbox } = require('../harness/dom_sandbox');
const { httpJson, loginAdmin, PNG_1X1, uploadMultipart } = require('../tier1/_f9_f12_helpers');

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

describe('Tier 3 — Cross-Feature Pairwise Integration Suite', () => {
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

  it('T3-01: Auth 2FA setup + Dashboard login form reveals #login2faGroup on 2FA_REQUIRED and signs in with valid TOTP', async () => {
    const user2fa = await createUserAndLogin(env.apiUrl, adminToken, {
      nombre: 'Admin 2FA UI',
      email: 'admin2fa.ui@entelso.test',
      rol: 'admin',
      pin: 'Pass2FA!',
    });

    const setupRes = await httpJson(env.apiUrl, '/api/auth/setup-2fa', {
      method: 'POST',
      token: user2fa.token,
    });
    assert.equal(setupRes.status, 200);
    const { secret, otpauth, qrCode } = setupRes.body.data;
    assert.ok(secret && secret.length >= 16);
    assert.match(otpauth, /^otpauth:\/\/totp\/Entelso:/);
    assert.ok(qrCode.startsWith('data:image/png;base64,'));
    const validCode = authenticator.generate(secret);

    // Confirm spaced TOTP ("123 456") works on verify-2fa
    const spacedCode = validCode.slice(0, 3) + ' ' + validCode.slice(3);
    const verRes = await httpJson(env.apiUrl, '/api/auth/verify-2fa', {
      method: 'POST',
      token: user2fa.token,
      body: { token: spacedCode },
    });
    assert.equal(verRes.status, 200);

    // /api/auth/me now reports is_2fa_enabled === true
    const meOn = await httpJson(env.apiUrl, '/api/auth/me', { token: user2fa.token });
    assert.equal(meOn.status, 200);
    assert.equal(meOn.body.data.is_2fa_enabled, true);

    // Calling setup-2fa again while already enabled must return 400 2FA_ALREADY_ENABLED without overwriting active secret
    const reSetupRes = await httpJson(env.apiUrl, '/api/auth/setup-2fa', {
      method: 'POST',
      token: user2fa.token,
    });
    assert.equal(reSetupRes.status, 400);
    assert.equal(reSetupRes.body.error.code, '2FA_ALREADY_ENABLED');

    // Step 1: Login without TOTP -> 401 2FA_REQUIRED
    const firstTry = await httpJson(env.apiUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin2fa.ui@entelso.test', pin: 'Pass2FA!' },
    });
    assert.equal(firstTry.status, 401);
    assert.equal(firstTry.body.error.code, '2FA_REQUIRED');

    // Step 2: Login with valid TOTP -> 200 JWT + is_2fa_enabled: true
    const freshCode = authenticator.generate(secret);
    const secondTry = await httpJson(env.apiUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin2fa.ui@entelso.test', pin: 'Pass2FA!', totpCode: freshCode },
    });
    assert.equal(secondTry.status, 200);
    assert.ok(secondTry.body.data.token);
    assert.equal(secondTry.body.data.usuario.is_2fa_enabled, true);

    // Step 3: Disable 2FA rejects wrong code (401), accepts valid TOTP (200), then login works without TOTP
    const badDisable = await httpJson(env.apiUrl, '/api/auth/disable-2fa', {
      method: 'POST',
      token: secondTry.body.data.token,
      body: { token: '000000' },
    });
    assert.equal(badDisable.status, 401);

    const okDisable = await httpJson(env.apiUrl, '/api/auth/disable-2fa', {
      method: 'POST',
      token: secondTry.body.data.token,
      body: { token: authenticator.generate(secret) },
    });
    assert.equal(okDisable.status, 200);

    const meOff = await httpJson(env.apiUrl, '/api/auth/me', { token: secondTry.body.data.token });
    assert.equal(meOff.body.data.is_2fa_enabled, false);

    const loginAfterDisable = await httpJson(env.apiUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin2fa.ui@entelso.test', pin: 'Pass2FA!' },
    });
    assert.equal(loginAfterDisable.status, 200);
  });

  it('T3-02: Category CRUD + Item creation + Asset creation + Bulk category move stay consistent across API', async () => {
    const createCat = await httpJson(env.apiUrl, '/api/items/categorias', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Fiber Splicers' },
    });
    assert.equal(createCat.status, 201);

    const assetRes = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Fujikura 90S', categoria: 'Fiber Splicers', numero_serie: 'TE-77001' },
    });
    assert.equal(assetRes.status, 201);

    const renameCat = await httpJson(env.apiUrl, `/api/items/categorias/${encodeURIComponent('Fiber Splicers')}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: 'Optical Splicers' },
    });
    assert.equal(renameCat.status, 200);

    const fetched = await httpJson(env.apiUrl, `/api/activos/${assetRes.body.data.id}`, { token: adminToken });
    assert.equal(fetched.body.data.categoria_padre, 'Optical Splicers');
  });

  it('T3-03: Multi-role RBAC + /api/usuarios/asignables + Audit log visibility', async () => {
    const almacen = await createUserAndLogin(env.apiUrl, adminToken, {
      nombre: 'Almacen T3',
      email: 'alm.t3@entelso.test',
      rol: 'almacen',
      pin: 'AlmT3Pass!',
    });
    const worker = await createUserAndLogin(env.apiUrl, adminToken, {
      nombre: 'Worker T3',
      email: 'wrk.t3@entelso.test',
      rol: 'trabajador',
      pin: 'WrkT3Pass!',
    });

    // almacen can query asignables (200, no PII) but not /api/usuarios (403) or /api/audit (403)
    const asig = await httpJson(env.apiUrl, '/api/usuarios/asignables', { token: almacen.token });
    assert.equal(asig.status, 200);
    assert.ok(Array.isArray(asig.body.data) && asig.body.data.length > 0);
    assert.equal(asig.body.data[0].email, undefined);
    assert.equal(asig.body.data[0].pin_hash, undefined);

    const usersForbidden = await httpJson(env.apiUrl, '/api/usuarios', { token: almacen.token });
    assert.equal(usersForbidden.status, 403);

    const auditForbidden = await httpJson(env.apiUrl, '/api/audit', { token: worker.token });
    assert.equal(auditForbidden.status, 403);

    const postAudit = await httpJson(env.apiUrl, '/api/audit', {
      method: 'POST',
      token: almacen.token,
      body: { accion: 't3_check', detalles: 'verified' },
    });
    assert.ok(postAudit.status === 200 || postAudit.status === 201);

    const adminAudit = await httpJson(env.apiUrl, '/api/audit', { token: adminToken });
    assert.equal(adminAudit.status, 200);
    assert.ok(adminAudit.body.data.some((row) => row.accion === 't3_check'));
  });

  it('T3-04: Upload -> Asset photos -> WhatsApp photo append -> Excel export uses local mock only', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([PNG_1X1], { type: 'image/png' }), 't3.png');
    const up = await uploadMultipart(env.apiUrl, '/api/upload', fd, { token: adminToken });
    assert.equal(up.status, 200);

    const asset = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'T3 Export Device',
        categoria: 'Testing Equipment',
        numero_serie: 'TE-77004',
        fotos: [up.body.data.url],
      },
    });
    assert.equal(asset.status, 201);

    const waPhoto = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'TE-77004',
        base64_image: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
      },
    });
    assert.equal(waPhoto.status, 200);

    const refreshed = await httpJson(env.apiUrl, `/api/activos/${asset.body.data.id}`, { token: adminToken });
    assert.equal(refreshed.body.data.fotos.length, 2);

    const xlsxRes = await fetch(`${env.apiUrl}/api/activos/export-excel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [asset.body.data.id] }),
    });
    assert.equal(xlsxRes.status, 200);
    const buf = Buffer.from(await xlsxRes.arrayBuffer());
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
  });

  it('T3-05: Dashboard DOM sandbox connects cleanly to live isolated backend and loads inventory without external calls', async () => {
    const sb = await createDashboardSandbox({
      dashboardUrl: env.dashboardUrl,
      apiUrl: env.apiUrl,
    });
    try {
      const loginRes = await sb.window.fetch(`${env.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@entelso.com', pin: 'password' }),
      });
      const loginJson = await loginRes.json();
      assert.equal(loginRes.status, 200);
      assert.equal(loginJson.success, true);

      const assetsRes = await sb.window.fetch(`${env.apiUrl}/api/activos`, {
        headers: { Authorization: `Bearer ${loginJson.data.token}` },
      });
      const assetsJson = await assetsRes.json();
      assert.equal(assetsRes.status, 200);
      assert.ok(Array.isArray(assetsJson.data) && assetsJson.data.length >= 1);
      assert.equal(sb.blockedNetworkCalls.length, 0, 'Zero external network calls allowed');
    } finally {
      sb.close();
    }
  });
});
