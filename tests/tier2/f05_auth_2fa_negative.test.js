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
  provisionRoleUser,
  provisionAndLoginRole,
  generateStableTotp,
  signJwt,
} = require('../tier1/_f5_f8_helpers');

describe('F5 — Auth, JWT & 2FA Negative / Boundary Cases (Tier 2)', () => {
  let env;
  let apiUrl;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F5-T2-1: POST /api/auth/login rejects missing, empty, or non-string email/pin with 400 VALIDATION_ERROR', async () => {
    const invalidBodies = [
      {},
      { email: '', pin: SEED_PASSWORD },
      { email: '   ', pin: SEED_PASSWORD },
      { email: 12345, pin: SEED_PASSWORD },
      { email: SEED_ADMIN_EMAIL, pin: '' },
      { email: SEED_ADMIN_EMAIL, pin: '   ' },
      { email: SEED_ADMIN_EMAIL, pin: { nested: true } },
    ];

    for (const body of invalidBodies) {
      const res = await httpJson(apiUrl, '/api/auth/login', {
        method: 'POST',
        body,
      });
      assert.equal(res.status, 400, `Expected 400 for body ${JSON.stringify(body)}, got ${res.status}`);
      assert.equal(res.json.success, false);
      assert.equal(res.json.error.code, 'VALIDATION_ERROR');
    }
  });

  it('F5-T2-2: POST /api/auth/login rejects wrong pin and non-existent email with 401', async () => {
    const wrongPin = await login(apiUrl, SEED_ADMIN_EMAIL, 'definitely-wrong-pin');
    assert.equal(wrongPin.status, 401);
    assert.equal(wrongPin.json.success, false);

    const unknownUser = await login(apiUrl, 'nobody.here@entelso.test', SEED_PASSWORD);
    assert.equal(unknownUser.status, 401);
    assert.equal(unknownUser.json.success, false);
  });

  it('F5-T2-3: POST /api/auth/login returns 401 for inactive user and 403 for user without pin_hash', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);

    const { user: inactiveUser, credentials: inactiveCreds } = await provisionRoleUser(apiUrl, adminToken, {
      rol: 'trabajador',
    });
    const deactivateRes = await httpJson(apiUrl, `/api/usuarios/${inactiveUser.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { activo: false },
    });
    assert.equal(deactivateRes.status, 200);

    const inactiveLogin = await login(apiUrl, inactiveCreds.email, inactiveCreds.pin);
    assert.equal(inactiveLogin.status, 401);
    assert.equal(inactiveLogin.json.success, false);

    const { credentials: noPinCreds } = await provisionRoleUser(apiUrl, adminToken, {
      rol: 'trabajador',
      omitPin: true,
    });
    const noPinLogin = await login(apiUrl, noPinCreds.email, 'anything');
    assert.equal(noPinLogin.status, 403);
    assert.equal(noPinLogin.json.success, false);
  });

  it('F5-T2-4: GET /api/auth/me rejects missing header (401 UNAUTHORIZED), bad/wrong-secret JWT (401 INVALID_TOKEN), and expired JWT (401 TOKEN_EXPIRED)', async () => {
    const noHeader = await httpJson(apiUrl, '/api/auth/me');
    assert.equal(noHeader.status, 401);
    assert.equal(noHeader.json.error.code, 'UNAUTHORIZED');

    const malformed = await httpJson(apiUrl, '/api/auth/me', {
      token: 'not.a.valid.jwt',
    });
    assert.equal(malformed.status, 401);
    assert.equal(malformed.json.error.code, 'INVALID_TOKEN');

    const wrongSecretToken = signJwt(
      { sub: 1, nombre: 'Carlos Admin', email: SEED_ADMIN_EMAIL, rol: 'admin' },
      'completely-wrong-secret-key-9999',
      { expiresInSec: 3600 }
    );
    const wrongSecretRes = await httpJson(apiUrl, '/api/auth/me', {
      token: wrongSecretToken,
    });
    assert.equal(wrongSecretRes.status, 401);
    assert.equal(wrongSecretRes.json.error.code, 'INVALID_TOKEN');

    const expiredToken = signJwt(
      { sub: 1, nombre: 'Carlos Admin', email: SEED_ADMIN_EMAIL, rol: 'admin' },
      env.jwtSecret,
      { iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) - 60 }
    );
    const expiredRes = await httpJson(apiUrl, '/api/auth/me', {
      token: expiredToken,
    });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.json.error.code, 'TOKEN_EXPIRED');
  });

  it('F5-T2-5: POST /api/auth/change-password rejects wrong oldPassword (401) and <4-char newPassword (400)', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'trabajador',
      pin: 'goodOldPass',
    });

    const wrongOld = await httpJson(apiUrl, '/api/auth/change-password', {
      method: 'POST',
      token,
      body: { oldPassword: 'wrongOldPass', newPassword: 'newValidPassword' },
    });
    assert.equal(wrongOld.status, 401);
    assert.equal(wrongOld.json.success, false);

    const shortNew = await httpJson(apiUrl, '/api/auth/change-password', {
      method: 'POST',
      token,
      body: { oldPassword: 'goodOldPass', newPassword: '123' },
    });
    assert.equal(shortNew.status, 400);
    assert.equal(shortNew.json.success, false);
  });

  it('F5-T2-6: 2FA enforcement blocks verify before setup (400 2FA_NOT_SETUP), missing totpCode (401 2FA_REQUIRED), and invalid totpCode (401 INVALID_2FA_TOKEN)', async () => {
    const { token: adminToken } = await loginAsSeedAdmin(apiUrl);
    const { credentials, token } = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'supervisor',
    });

    const preVerify = await httpJson(apiUrl, '/api/auth/verify-2fa', {
      method: 'POST',
      token,
      body: { token: '123456' },
    });
    assert.equal(preVerify.status, 400);
    assert.equal(preVerify.json.error.code, '2FA_NOT_SETUP');

    const setupRes = await httpJson(apiUrl, '/api/auth/setup-2fa', {
      method: 'POST',
      token,
    });
    assert.equal(setupRes.status, 200);
    const { secret } = setupRes.json.data;

    const validTotp = await generateStableTotp(secret);
    const verifyRes = await httpJson(apiUrl, '/api/auth/verify-2fa', {
      method: 'POST',
      token,
      body: { token: validTotp },
    });
    assert.equal(verifyRes.status, 200);

    const missingCodeLogin = await login(apiUrl, credentials.email, credentials.pin);
    assert.equal(missingCodeLogin.status, 401);
    assert.equal(missingCodeLogin.json.error.code, '2FA_REQUIRED');
    assert.equal(missingCodeLogin.json.error.details?.requires2FA, true);

    const badCode = validTotp === '000000' ? '999999' : '000000';
    const wrongCodeLogin = await login(apiUrl, credentials.email, credentials.pin, badCode);
    assert.equal(wrongCodeLogin.status, 401);
    assert.equal(wrongCodeLogin.json.error.code, 'INVALID_2FA_TOKEN');
  });

  it('F5-T2-7: Isolated loginLimiter skips successful logins and returns 429 RATE_LIMIT_EXCEEDED after 100 failed attempts', async () => {
    const rateEnv = await startIsolatedEnv();
    try {
      // Successful login should NOT consume failed-attempt quota (skipSuccessfulRequests: true)
      for (let i = 0; i < 3; i += 1) {
        const okRes = await login(rateEnv.apiUrl, SEED_ADMIN_EMAIL, SEED_PASSWORD);
        assert.equal(okRes.status, 200);
      }

      // Send 100 failed login attempts (non-existent email exits before bcrypt for fast execution)
      for (let i = 0; i < 100; i += 1) {
        const failRes = await login(rateEnv.apiUrl, `nonexistent-${i}@entelso.test`, 'wrong');
        assert.equal(failRes.status, 401, `Attempt #${i + 1} expected 401, got ${failRes.status}`);
      }

      const limitedRes = await login(rateEnv.apiUrl, 'nonexistent-101@entelso.test', 'wrong');
      assert.equal(limitedRes.status, 429);
      assert.equal(limitedRes.json.success, false);
      assert.equal(limitedRes.json.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(limitedRes.headers.get('ratelimit-limit'), 'Expected ratelimit-limit header');
      assert.ok(limitedRes.headers.get('ratelimit-remaining') !== null, 'Expected ratelimit-remaining header');
    } finally {
      await rateEnv.close();
    }
  });
});
