'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const { PgSqliteAdapter } = require('./pg_sqlite_adapter');
const { createPgWireServer } = require('./pg_wire_server');
const { startStorageMock } = require('./storage_mock');
const { startDashboardServer } = require('./dashboard_server');

const OS_ENV_WHITELIST = [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOME',
  'LANG',
];

function reserveEphemeralPort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

function buildIsolatedEnv(overrides = {}) {
  const cleanEnv = {};
  for (const key of OS_ENV_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== undefined) {
      cleanEnv[key] = process.env[key];
    }
  }
  return Object.assign(cleanEnv, overrides);
}

async function waitForHealth(apiUrl, proc, getExitInfo, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const exitInfo = getExitInfo();
    if (exitInfo.exited) {
      throw new Error(
        `Backend process exited prematurely (code=${exitInfo.code}, signal=${exitInfo.signal})`
      );
    }

    try {
      const res = await fetch(`${apiUrl}/health`);
      if (res.status === 200) {
        const body = await res.json();
        if (body && body.status === 'UP') {
          return body;
        }
      }
      lastError = new Error(`Unexpected /health status ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  throw new Error(
    `Timed out waiting for ${apiUrl}/health after ${timeoutMs}ms: ${lastError ? lastError.message : 'unknown'}`
  );
}

async function startIsolatedEnv(options = {}) {
  const repoRoot = path.resolve(__dirname, '../..');
  const backendEntry = path.join(repoRoot, 'backend', 'src', 'server.js');
  const initSqlPath = options.initSqlPath || path.join(repoRoot, 'init.sql');
  const enableStorageMock = options.enableStorageMock !== false;
  const enableDashboard = options.enableDashboard !== false;
  const healthTimeoutMs = options.healthTimeoutMs ?? 35000;

  const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'entelso-test-cwd-'));
  let adapter = null;
  let pgServer = null;
  let storageServer = null;
  let dashboardServer = null;
  let backendProc = null;
  let closed = false;

  const stdoutChunks = [];
  const stderrChunks = [];

  function getLogs() {
    return {
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
    };
  }

  async function close() {
    if (closed) return;
    closed = true;

    if (backendProc && backendProc.exitCode === null && backendProc.signalCode === null) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        backendProc.once('exit', finish);
        try {
          backendProc.kill('SIGTERM');
        } catch {
          try {
            backendProc.kill();
          } catch {
            finish();
          }
        }
        setTimeout(() => {
          if (!settled) {
            try {
              backendProc.kill('SIGKILL');
            } catch {
              // ignore
            }
            finish();
          }
        }, 3000).unref();
      });
    }

    await Promise.allSettled([
      dashboardServer ? dashboardServer.close() : Promise.resolve(),
      storageServer ? storageServer.close() : Promise.resolve(),
      pgServer ? pgServer.close() : Promise.resolve(),
    ]);

    if (adapter) {
      try {
        adapter.close();
      } catch {
        // ignore
      }
    }

    try {
      fs.rmSync(tempCwd, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
  }

  try {
    adapter = new PgSqliteAdapter();
    if (options.loadInitSql !== false) {
      const initSql = fs.readFileSync(initSqlPath, 'utf8');
      adapter.loadInitSql(initSql);
    }

    pgServer = createPgWireServer(adapter);
    const { pgUrl } = await pgServer.start();

    if (enableStorageMock) {
      storageServer = await startStorageMock();
    }
    if (enableDashboard) {
      dashboardServer = await startDashboardServer();
    }

    const apiPort = await reserveEphemeralPort('127.0.0.1');
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const jwtSecret = 'test-jwt-secret-key-1234567890';
    const apiKey = 'test-ingest-api-key-123456';

    const childEnv = buildIsolatedEnv({
      PORT: String(apiPort),
      NODE_ENV: 'test',
      DATABASE_URL: pgUrl,
      API_KEY: apiKey,
      JWT_SECRET: jwtSecret,
      CORS_ORIGIN: '*',
      SUPABASE_URL: storageServer ? storageServer.url : '',
      SUPABASE_SERVICE_KEY: storageServer ? 'test-supabase-service-key' : '',
      ...(options.envOverrides || {}),
    });

    const exitState = { exited: false, code: null, signal: null };
    backendProc = spawn(process.execPath, [backendEntry], {
      cwd: tempCwd,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendProc.stdout.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      stdoutChunks.push(str);
      if (options.logOutput) process.stdout.write(`[backend stdout] ${str}`);
    });
    backendProc.stderr.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      stderrChunks.push(str);
      if (options.logOutput) process.stderr.write(`[backend stderr] ${str}`);
    });
    backendProc.on('exit', (code, signal) => {
      exitState.exited = true;
      exitState.code = code;
      exitState.signal = signal;
    });

    await waitForHealth(apiUrl, backendProc, () => exitState, healthTimeoutMs);

    return {
      apiUrl,
      apiPort,
      pgServer,
      pgUrl,
      adapter,
      storageServer,
      storageUrl: storageServer ? storageServer.url : null,
      dashboardServer,
      dashboardUrl: dashboardServer ? dashboardServer.url : null,
      backendProc,
      jwtSecret,
      apiKey,
      tempCwd,
      getLogs,
      close,
    };
  } catch (err) {
    const logs = getLogs();
    await close();
    err.message = `${err.message}\n--- backend stdout ---\n${logs.stdout}\n--- backend stderr ---\n${logs.stderr}`;
    throw err;
  }
}

module.exports = {
  startIsolatedEnv,
  reserveEphemeralPort,
  buildIsolatedEnv,
};
