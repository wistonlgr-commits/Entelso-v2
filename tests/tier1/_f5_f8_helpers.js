'use strict';

const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const SEED_ADMIN_EMAIL = 'admin@entelso.com';
const SEED_PASSWORD = 'password';

// Valid 1x1 RGBA PNG (68 bytes)
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_1X1_BUFFER = Buffer.from(PNG_1X1_BASE64, 'base64');

let uniqueCounter = 0;
function nextTag(prefix = 't') {
  uniqueCounter += 1;
  return `${prefix}_${Date.now()}_${uniqueCounter}`;
}

async function httpJson(baseUrl, urlPath, opts = {}) {
  const {
    method = 'GET',
    token = null,
    headers = {},
    body,
    rawBody,
  } = opts;

  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
  } else if (body !== undefined) {
    if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: reqHeaders,
    body: payload,
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return {
    status: res.status,
    headers: res.headers,
    json,
    text,
  };
}

async function httpBuffer(baseUrl, urlPath, opts = {}) {
  const {
    method = 'GET',
    token = null,
    headers = {},
    body,
  } = opts;

  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  let payload;
  if (body !== undefined) {
    if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: reqHeaders,
    body: payload,
  });

  const arrayBuf = await res.arrayBuffer();
  return {
    status: res.status,
    headers: res.headers,
    buffer: Buffer.from(arrayBuf),
  };
}

async function login(apiUrl, email, pin = SEED_PASSWORD, totpCode = undefined) {
  const payload = { email, pin };
  if (totpCode !== undefined) {
    payload.totpCode = totpCode;
  }
  const res = await httpJson(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: payload,
  });
  return {
    status: res.status,
    headers: res.headers,
    json: res.json,
    token: res.json?.data?.token ?? null,
    usuario: res.json?.data?.usuario ?? null,
  };
}

async function loginAsSeedAdmin(apiUrl) {
  const res = await login(apiUrl, SEED_ADMIN_EMAIL, SEED_PASSWORD);
  assert.equal(res.status, 200, `Seed admin login failed: ${JSON.stringify(res.json)}`);
  assert.ok(res.token, 'Seed admin login must return JWT token');
  return { token: res.token, usuario: res.usuario };
}

async function provisionRoleUser(apiUrl, adminToken, opts = {}) {
  const tag = nextTag(opts.rol || 'user');
  const payload = {
    nombre: opts.nombre || `Test ${tag}`,
    rol: opts.rol || 'trabajador',
  };
  if (opts.email !== null) {
    payload.email = opts.email || `${tag}@entelso.test`;
  }
  if (opts.telefono_whatsapp !== undefined && opts.telefono_whatsapp !== null) {
    payload.telefono_whatsapp = opts.telefono_whatsapp;
  }
  if (opts.team !== undefined) payload.team = opts.team;
  if (opts.default_zona !== undefined) payload.default_zona = opts.default_zona;

  if (!opts.omitPin) {
    if (opts.password !== undefined) {
      payload.password = opts.password;
    } else if (opts.pin !== undefined) {
      payload.pin = opts.pin;
    } else {
      payload.pin = SEED_PASSWORD;
    }
  }

  const res = await httpJson(apiUrl, '/api/usuarios', {
    method: 'POST',
    token: adminToken,
    body: payload,
  });
  assert.equal(
    res.status,
    201,
    `Failed to provision ${payload.rol} user: ${res.status} ${JSON.stringify(res.json)}`
  );
  return {
    user: res.json.data,
    credentials: {
      email: payload.email || null,
      pin: opts.omitPin ? null : (payload.pin || payload.password),
    },
  };
}

async function provisionAndLoginRole(apiUrl, adminToken, opts = {}) {
  const { user, credentials } = await provisionRoleUser(apiUrl, adminToken, opts);
  const auth = await login(apiUrl, credentials.email, credentials.pin);
  assert.equal(
    auth.status,
    200,
    `Provisioned ${user.rol} login failed: ${auth.status} ${JSON.stringify(auth.json)}`
  );
  return { user, credentials, token: auth.token };
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(base32Str) {
  const clean = String(base32Str || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/\s+/g, '');

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotp(secret, timeMs = Date.now(), stepSec = 30, digits = 6) {
  const key = base32Decode(secret);
  const counter = BigInt(Math.floor(timeMs / 1000 / stepSec));
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter, 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % (10 ** digits);
  return String(otp).padStart(digits, '0');
}

async function generateStableTotp(secret, stepSec = 30, digits = 6) {
  const stepMs = stepSec * 1000;
  const rem = Date.now() % stepMs;
  if (rem > stepMs - 800) {
    await new Promise((r) => setTimeout(r, stepMs - rem + 50));
  }
  return generateTotp(secret, Date.now(), stepSec, digits);
}

function signJwt(payload, secret, opts = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const iat = opts.iat !== undefined ? opts.iat : nowSec;
  const exp = opts.exp !== undefined ? opts.exp : nowSec + (opts.expiresInSec ?? 7200);

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const bodyB64 = Buffer.from(JSON.stringify({ ...payload, iat, exp })).toString('base64url');
  const signingInput = `${headerB64}.${bodyB64}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

module.exports = {
  SEED_ADMIN_EMAIL,
  SEED_PASSWORD,
  PNG_1X1_BUFFER,
  nextTag,
  httpJson,
  httpBuffer,
  login,
  loginAsSeedAdmin,
  provisionRoleUser,
  provisionAndLoginRole,
  base32Decode,
  generateTotp,
  generateStableTotp,
  signJwt,
};
