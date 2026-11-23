'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function decodeAndValidateSegments(rawSegs) {
  const decoded = [];
  for (const seg of rawSegs) {
    let d;
    try {
      d = decodeURIComponent(seg);
    } catch {
      return null;
    }
    if (!d || d === '.' || d === '..' || d.includes('\\') || d.includes('/') || d.includes('\0')) {
      return null;
    }
    decoded.push(d);
  }
  return decoded;
}

function sendInvalidPath(res) {
  sendJson(res, 400, { statusCode: '400', error: 'InvalidPath', message: 'Invalid storage path' });
}

async function startStorageMock(options = {}) {
  const host = options.host || '127.0.0.1';
  const requestedPort = options.port ?? 0;
  const requireAuthHeader = Boolean(options.requireAuthHeader);

  const objects = new Map();
  const requests = [];
  let boundPort = null;

  function recordRequest(req, pathname, status) {
    requests.push({
      method: req.method,
      url: pathname,
      headers: {
        authorization: req.headers.authorization ? '[present]' : undefined,
        apikey: req.headers.apikey ? '[present]' : undefined,
        'content-type': req.headers['content-type'],
        'x-upsert': req.headers['x-upsert'],
      },
      timestamp: new Date().toISOString(),
      status,
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const rawUrl = req.url || '/';
      const rawPath = rawUrl.split('?')[0] || '/';
      let pathname = rawPath;
      if (/^https?:\/\//i.test(rawPath)) {
        try {
          pathname = new URL(rawUrl).pathname;
        } catch {
          sendInvalidPath(res);
          return;
        }
      }

      // Inspection endpoint: GET /__mock__/requests
      if (req.method === 'GET' && pathname === '/__mock__/requests') {
        const baseUrl = `http://${host}:${boundPort}`;
        const list = [];
        for (const entry of objects.values()) {
          list.push({
            key: entry.fullKey,
            contentType: entry.contentType,
            size: entry.buffer.length,
            uploadedAt: entry.uploadedAt,
            publicUrl: `${baseUrl}/storage/v1/object/public/${entry.fullKey}`,
          });
        }
        sendJson(res, 200, {
          requestCount: requests.length,
          requests,
          objects: list,
        });
        return;
      }

      // Reset endpoint: POST /__mock__/reset
      if (req.method === 'POST' && pathname === '/__mock__/reset') {
        objects.clear();
        requests.length = 0;
        sendJson(res, 200, { ok: true });
        return;
      }

      const segments = pathname.split('/').filter(Boolean);

      // Public download: GET / HEAD /storage/v1/object/public/:bucket/*
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        segments.length >= 6 &&
        segments[0] === 'storage' &&
        segments[1] === 'v1' &&
        segments[2] === 'object' &&
        segments[3] === 'public'
      ) {
        const bucketSegs = decodeAndValidateSegments([segments[4]]);
        const objectSegs = decodeAndValidateSegments(segments.slice(5));
        if (!bucketSegs || !objectSegs || objectSegs.length === 0) {
          recordRequest(req, pathname, 400);
          sendInvalidPath(res);
          return;
        }
        const bucket = bucketSegs[0];
        const objectPath = objectSegs.join('/');

        const fullKey = `${bucket}/${objectPath}`;
        const entry = objects.get(fullKey);
        if (!entry) {
          recordRequest(req, pathname, 404);
          sendJson(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          return;
        }

        recordRequest(req, pathname, 200);
        res.writeHead(200, {
          'Content-Type': entry.contentType,
          'Content-Length': entry.buffer.length,
          'Cache-Control': entry.cacheControl,
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(entry.buffer);
        }
        return;
      }

      // Delete objects: DELETE /storage/v1/object/:bucket
      if (
        req.method === 'DELETE' &&
        segments.length === 4 &&
        segments[0] === 'storage' &&
        segments[1] === 'v1' &&
        segments[2] === 'object'
      ) {
        const bucketSegs = decodeAndValidateSegments([segments[3]]);
        if (!bucketSegs) {
          recordRequest(req, pathname, 400);
          sendInvalidPath(res);
          return;
        }
        const bucket = bucketSegs[0];
        const bodyBuf = await readRawBody(req);
        let prefixes = [];
        try {
          const parsedBody = JSON.parse(bodyBuf.toString('utf8') || '{}');
          if (Array.isArray(parsedBody.prefixes)) prefixes = parsedBody.prefixes;
        } catch {
          // ignore
        }
        const deleted = [];
        for (const p of prefixes) {
          const clean = String(p).replace(/^\/+/, '');
          const fullKey = `${bucket}/${clean}`;
          if (objects.has(fullKey)) {
            deleted.push({ name: clean });
            objects.delete(fullKey);
          }
        }
        recordRequest(req, pathname, 200);
        sendJson(res, 200, deleted);
        return;
      }

      // Upload: POST or PUT /storage/v1/object/:bucket/*
      if (
        (req.method === 'POST' || req.method === 'PUT') &&
        segments.length >= 5 &&
        segments[0] === 'storage' &&
        segments[1] === 'v1' &&
        segments[2] === 'object' &&
        segments[3] !== 'public'
      ) {
        if (requireAuthHeader && !req.headers.authorization && !req.headers.apikey) {
          recordRequest(req, pathname, 401);
          sendJson(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'Missing auth header' });
          return;
        }

        const bucketSegs = decodeAndValidateSegments([segments[3]]);
        const objectSegs = decodeAndValidateSegments(segments.slice(4));
        if (!bucketSegs || !objectSegs || objectSegs.length === 0) {
          recordRequest(req, pathname, 400);
          sendInvalidPath(res);
          return;
        }
        const bucket = bucketSegs[0];
        const objectPath = objectSegs.join('/');

        const fullKey = `${bucket}/${objectPath}`;
        const upsertHeader = String(req.headers['x-upsert'] || '').toLowerCase();
        if (req.method === 'POST' && upsertHeader !== 'true' && objects.has(fullKey)) {
          recordRequest(req, pathname, 409);
          sendJson(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
          return;
        }

        const buffer = await readRawBody(req);
        const contentType = req.headers['content-type'] || 'application/octet-stream';
        const cacheControl = req.headers['cache-control'] || 'max-age=3600';
        const id = crypto.randomUUID();

        objects.set(fullKey, {
          id,
          bucket,
          key: objectPath,
          fullKey,
          contentType,
          buffer,
          cacheControl,
          upsert: upsertHeader === 'true',
          uploadedAt: new Date().toISOString(),
        });

        recordRequest(req, pathname, 200);
        sendJson(res, 200, { Key: fullKey, Id: id });
        return;
      }

      recordRequest(req, pathname, 404);
      sendJson(res, 404, { statusCode: '404', error: 'NotFound', message: 'Unsupported mock storage route' });
    } catch (err) {
      sendJson(res, 500, { statusCode: '500', error: 'InternalError', message: err.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', reject);
      boundPort = server.address().port;
      resolve();
    });
  });

  const url = `http://${host}:${boundPort}`;

  return {
    server,
    host,
    port: boundPort,
    url,
    objects,
    requests,
    reset() {
      objects.clear();
      requests.length = 0;
    },
    close() {
      return new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      });
    },
  };
}

module.exports = {
  startStorageMock,
};
