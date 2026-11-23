'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  SEED_ADMIN_EMAIL,
  SEED_PASSWORD,
  httpJson,
  login,
  loginAsSeedAdmin,
  provisionAndLoginRole,
  generateStableTotp,
} = require('./_f5_f8_helpers');

describe('F5 — Auth, JWT & 2FA (Tier 1)', () => {
  let env;
  let apiUrl;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F5-T1-1: POST /api/auth/login succeeds for seeded admin (case-insensitive email) with valid JWT and sanitized usuario', async () => {
    for (const emailInput of [SEED_ADMIN_EMAIL, SEED_ADMIN_EMAIL.toUpperCase()]) {
      const res = await login(apiUrl, emailInput, SEED_PASSWORD);
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(typeof res.token, 'string');
      assert.equal(res.token.split('.').length, 3, 'JWT must have 3 dot-separated parts');

      const u = res.usuario;
      assert.ok(u && typeof u === 'object');
      assert.equal(typeof u.id, 'number');
      assert.equal(u.email.toLowerCase(), SEED_ADMIN_EMAIL);
      assert.equal(u.rol, 'admin');
      assert.ok(u.nombre);
      assert.equal(Object.prototype.hasOwnProperty.call(u, 'pin_hash'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(u, 'secret_2fa'), false);
    }
  });

  it('F5-T1-2: GET /api/auth/me returns authenticated user profile without sensitive fields', async () => {
    const { token, usuario } = await loginAsSeedAdmin(apiUrl);
    const res = await httpJson(apiUrl, '/api/auth/me', { token });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);

    const profile = res.json.data;
    assert.equal(profile.id, usuario.id);
    assert.equal(profile.email, SEED_ADMIN_EMAIL);
    assert.equal(profile.rol, 'admin');
    assert.equal(profile.activo, true);
    assert.equal(typeof profile.en_terreno, 'boolean');
    assert.ok(profile.preferencias && typeof profile.preferencias === 'object');
    assert.equal(Object.prototype.hasOwnProperty.call(profile, 'pin_hash'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(profile, 'secret_2fa'), false);
  });

  it('F5-T1-3: PUT /api/auth/me updates nombre and preferencias and persists across GET /api/auth/me', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'trabajador',
      nombre: 'Profile Original',
    });

    const newPrefs = {
      alertas_calibracion: false,
      alertas_asignacion: true,
      resumen_semanal: true,
    };
    const updateRes = await httpJson(apiUrl, '/api/auth/me', {
      method: 'PUT',
      token,
      body: {
        nombre: 'Profile Updated Name',
        preferencias: newPrefs,
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.json.success, true);
    assert.equal(updateRes.json.data.nombre, 'Profile Updated Name');
    assert.deepEqual(updateRes.json.data.preferencias, newPrefs);

    const meRes = await httpJson(apiUrl, '/api/auth/me', { token });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.json.data.nombre, 'Profile Updated Name');
    assert.deepEqual(meRes.json.data.preferencias, newPrefs);
  });

  it('F5-T1-4: POST /api/auth/change-password updates credentials; old fails (401) and new succeeds (200)', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { credentials, token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'supervisor',
      pin: 'initialPass123',
    });

    const changeRes = await httpJson(apiUrl, '/api/auth/change-password', {
      method: 'POST',
      token,
      body: {
        oldPassword: 'initialPass123',
        newPassword: 'updatedPass456',
      },
    });
    assert.equal(changeRes.status, 200);
    assert.equal(changeRes.json.success, true);

    const oldLogin = await login(apiUrl, credentials.email, 'initialPass123');
    assert.equal(oldLogin.status, 401);

    const newLogin = await login(apiUrl, credentials.email, 'updatedPass456');
    assert.equal(newLogin.status, 200);
    assert.ok(newLogin.token);
  });

  it('F5-T1-5: POST /api/auth/setup-2fa and POST /api/auth/verify-2fa enable 2FA with valid RFC 6238 TOTP', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'almacen',
    });

    const setupRes = await httpJson(apiUrl, '/api/auth/setup-2fa', {
      method: 'POST',
      token,
    });
    assert.equal(setupRes.status, 200);
    assert.equal(setupRes.json.success, true);
    const { secret, qrCode } = setupRes.json.data;
    assert.equal(typeof secret, 'string');
    assert.ok(/^[A-Z2-7]+=*$/.test(secret), '2FA secret must be valid base32');
    assert.ok(typeof qrCode === 'string' && qrCode.startsWith('data:image/png;base64,'));

    const totp = await generateStableTotp(secret);
    const verifyRes = await httpJson(apiUrl, '/api/auth/verify-2fa', {
      method: 'POST',
      token,
      body: { token: totp },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.json.success, true);
    assert.equal(verifyRes.json.data.success, true);
  });

  it('F5-T1-6: POST /api/auth/login succeeds with valid email, pin, and totpCode once 2FA is enabled', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { credentials, token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'almacen',
    });

    const setupRes = await httpJson(apiUrl, '/api/auth/setup-2fa', {
      method: 'POST',
      token,
    });
    assert.equal(setupRes.status, 200);
    const { secret } = setupRes.json.data;

    const verifyCode = await generateStableTotp(secret);
    const verifyRes = await httpJson(apiUrl, '/api/auth/verify-2fa', {
      method: 'POST',
      token,
      body: { token: verifyCode },
    });
    assert.equal(verifyRes.status, 200);

    const loginCode = await generateStableTotp(secret);
    const loginRes = await login(apiUrl, credentials.email, credentials.pin, loginCode);
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.json.success, true);
    assert.equal(loginRes.token.split('.').length, 3);
  });
});
