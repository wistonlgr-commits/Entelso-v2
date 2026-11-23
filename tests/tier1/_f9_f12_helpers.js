'use strict';

const assert = require('node:assert/strict');

// Valid minimal 1x1 image buffers with genuine headers and magic bytes
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const JPEG_1X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x04,
  0x03, 0x03, 0x04, 0x05, 0x08, 0x05, 0x05, 0x04, 0x04, 0x05, 0x0a, 0x07,
  0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c, 0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d,
  0x0e, 0x12, 0x10, 0x0d, 0x0e, 0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10,
  0x11, 0x13, 0x14, 0x15, 0x15, 0x15, 0x0c, 0x0f, 0x17, 0x18, 0x16, 0x14,
  0x18, 0x12, 0x14, 0x15, 0x14, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x7f, 0x00, 0xff, 0xd9,
]);

const GIF_1X1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Valid 1x1 lossless WebP (RIFF + size + WEBP + VP8L chunk)
const WEBP_1X1 = Buffer.from(
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
  'base64'
);

async function httpJson(baseUrl, path, options = {}) {
  const {
    method = 'GET',
    token = null,
    headers = {},
    body = undefined,
    rawBody = undefined,
  } = options;

  const finalHeaders = { ...headers };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let payload = rawBody;
  if (rawBody === undefined && body !== undefined) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: payload,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.status,
    headers: res.headers,
    text,
    body: json,
  };
}

async function uploadMultipart(baseUrl, path, formData, options = {}) {
  const { token = null, headers = {} } = options;
  const finalHeaders = { ...headers };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: finalHeaders,
    body: formData,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.status,
    headers: res.headers,
    text,
    body: json,
  };
}

async function loginUser(apiUrl, email, pin = 'password') {
  const res = await httpJson(apiUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, pin },
  });
  assert.equal(res.status, 200, `Login failed for ${email}: ${res.status} ${res.text}`);
  assert.equal(res.body?.success, true);
  assert.ok(res.body?.data?.token, 'Expected JWT token on login');
  return {
    token: res.body.data.token,
    usuario: res.body.data.usuario,
  };
}

async function loginAdmin(apiUrl) {
  return loginUser(apiUrl, 'admin@entelso.com', 'password');
}

async function createTestUser(apiUrl, adminToken, userData) {
  const res = await httpJson(apiUrl, '/api/usuarios', {
    method: 'POST',
    token: adminToken,
    body: userData,
  });
  assert.equal(res.status, 201, `Failed creating test user: ${res.status} ${res.text}`);
  return res.body.data;
}

function assertIsoTimestamp(ts, label = 'timestamp') {
  assert.equal(typeof ts, 'string', `${label} must be a string`);
  const parsed = Date.parse(ts);
  assert.ok(!Number.isNaN(parsed), `${label} must be a valid ISO-8601 date, got: ${ts}`);
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, `${label} must be ISO-8601 UTC`);
}

module.exports = {
  PNG_1X1,
  JPEG_1X1,
  GIF_1X1,
  WEBP_1X1,
  httpJson,
  uploadMultipart,
  loginUser,
  loginAdmin,
  createTestUser,
  assertIsoTimestamp,
};
