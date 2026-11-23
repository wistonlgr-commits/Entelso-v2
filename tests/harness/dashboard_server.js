'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function startDashboardServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const requestedPort = options.port ?? 0;
  const rootDir = path.resolve(options.rootDir || path.resolve(__dirname, '../../dashboard'));

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, `http://${host}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const rawPathname = parsedUrl.pathname || '/';
    // Reject obvious traversal or backslash before decoding too
    if (rawPathname.includes('\\') || rawPathname.includes('\0') || /(^|\/)\.\.(\/|$)/.test(rawPathname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (decodedPath.includes('\0') || decodedPath.includes('\\') || /(^|\/)\.\.(\/|$)/.test(decodedPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const relPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    // Block dotfiles / container metadata
    const baseName = path.posix.basename(relPath);
    const baseLower = baseName.toLowerCase();
    if (baseName.startsWith('.') || baseLower === 'dockerfile' || baseLower === 'nginx.conf') {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let targetPath = path.resolve(rootDir, relPath);
    if (targetPath !== rootDir && !targetPath.startsWith(rootDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let stat;
    try {
      stat = fs.statSync(targetPath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    if (stat.isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
      try {
        stat = fs.statSync(targetPath);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
    }

    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(targetPath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const port = server.address().port;
  return {
    server,
    host,
    port,
    url: `http://${host}:${port}`,
    rootDir,
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
  startDashboardServer,
  MIME_TYPES,
};
