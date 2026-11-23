'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
const BACKEND_MODULES = path.join(REPO_ROOT, 'backend', 'node_modules');

const { Pool, Client } = require(path.join(BACKEND_MODULES, 'pg'));
const { createClient } = require(path.join(BACKEND_MODULES, '@supabase', 'supabase-js'));
const bcrypt = require(path.join(BACKEND_MODULES, 'bcrypt'));

const { PgSqliteAdapter } = require('./pg_sqlite_adapter');
const { createPgWireServer } = require('./pg_wire_server');
const { startStorageMock } = require('./storage_mock');
const { startDashboardServer } = require('./dashboard_server');
const { createDashboardSandbox } = require('./dom_sandbox');
const { startIsolatedEnv } = require('./test_env');

const EXPECTED_ARCHIVE_ENV_SHA256 = '41E7F23417F900BBBAC6EC88B1E04095BC8456292977F439D34F281346A5E7CD';
const EXPECTED_BACKEND_ENV_SHA256 = '39EC26397FD3DF27A331930911F02BFE884421FA22E100D41D2AF7FEB1B51EAE';

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

describe('E2E-M1 Isolated Native Test Harness Sanity Suite', () => {
  const archiveEnvPath = path.join(WORKSPACE_ROOT, '_archive_backups', '.env');
  const backendEnvPath = path.join(REPO_ROOT, 'backend', '.env');

  it('1. Preserves .env and backend/.env SHA-256 hashes before harness execution', () => {
    assert.equal(sha256File(archiveEnvPath), EXPECTED_ARCHIVE_ENV_SHA256);
    assert.equal(sha256File(backendEnvPath), EXPECTED_BACKEND_ENV_SHA256);
  });

  describe('2. PGv3 Wire Server + SQLite Adapter over real pg.Pool', () => {
    let adapter;
    let pgServer;
    let pool;

    before(async () => {
      adapter = new PgSqliteAdapter();
      const initSql = fs.readFileSync(path.join(REPO_ROOT, 'init.sql'), 'utf8');
      adapter.loadInitSql(initSql);
      pgServer = createPgWireServer(adapter);
      const { pgUrl } = await pgServer.start();
      pool = new Pool({ connectionString: pgUrl });
    });

    after(async () => {
      if (pool) await pool.end();
      if (pgServer) await pgServer.close();
      if (adapter) adapter.close();
    });

    it('handles Simple Query, empty query, and multi-statement queries', async () => {
      const r1 = await pool.query('SELECT 1 AS ok');
      assert.equal(r1.rows[0].ok, 1);

      const rEmpty = await pool.query('   -- only comment\n');
      assert.equal(rEmpty.rows.length, 0);

      const rMulti = await pool.query('SELECT 10 AS x; SELECT 20 AS y;');
      assert.ok(Array.isArray(rMulti));
      assert.equal(rMulti[0].rows[0].x, 10);
      assert.equal(rMulti[1].rows[0].y, 20);

      const rCnt = await pool.query('SELECT COUNT(*)::int AS cnt FROM usuarios');
      assert.equal(typeof rCnt.rows[0].cnt, 'number');
      assert.ok(rCnt.rows[0].cnt >= 7);
    });

    it('handles Extended Query, JSONB (3802), BOOL (16), DATE (1082), TIMESTAMP (1114), and named prepared statements', async () => {
      const res = await pool.query(
        'SELECT id, nombre, activo, is_2fa_enabled, preferencias, fecha_registro FROM usuarios WHERE email = $1',
        ['admin@entelso.com']
      );
      assert.equal(res.rows.length, 1);
      const row = res.rows[0];
      assert.equal(typeof row.id, 'number');
      assert.equal(row.activo, true);
      assert.equal(row.is_2fa_enabled, false);
      assert.equal(typeof row.preferencias, 'object');
      assert.equal(row.preferencias.alertas_calibracion, true);
      assert.ok(row.fecha_registro instanceof Date);
      assert.ok(!Number.isNaN(row.fecha_registro.getTime()));

      // Named prepared statement reuse (pg skips Parse on 2nd call)
      const q1 = await pool.query({ name: 'find_item_by_tipo', text: 'SELECT id, nombre FROM items WHERE tipo = $1 LIMIT 2', values: ['consumible'] });
      const q2 = await pool.query({ name: 'find_item_by_tipo', text: 'SELECT id, nombre FROM items WHERE tipo = $1 LIMIT 2', values: ['herramienta'] });
      assert.equal(q1.rows.length, 2);
      assert.equal(q2.rows.length, 2);
    });

    it('supports = ANY($1::int[]), v_alertas_inventario, jsonb concat, and regexp_replace', async () => {
      const anyRes = await pool.query('SELECT id FROM activos WHERE id = ANY($1::int[]) ORDER BY id', [[1, 2, 3]]);
      assert.deepEqual(anyRes.rows.map((r) => r.id), [1, 2, 3]);

      const emptyAny = await pool.query('SELECT id FROM activos WHERE id = ANY($1::int[])', [[]]);
      assert.equal(emptyAny.rows.length, 0);

      const alertRes = await pool.query('SELECT activo_id, dias_restantes, fecha_vencimiento FROM v_alertas_inventario ORDER BY dias_restantes ASC');
      assert.ok(alertRes.rows.length > 0);
      assert.equal(typeof alertRes.rows[0].dias_restantes, 'number');
      assert.ok(alertRes.rows[0].fecha_vencimiento instanceof Date);

      const phoneRes = await pool.query(
        "SELECT id FROM usuarios WHERE regexp_replace(telefono_whatsapp, '\\D', '', 'g') LIKE $1",
        ['%584121000001']
      );
      assert.equal(phoneRes.rows.length, 1);

      const jsonConcat = await pool.query(
        "SELECT jsonb_array_length(COALESCE(NULL, '[]'::jsonb) || $1::jsonb) AS len",
        [JSON.stringify(['https://example.local/a.png'])]
      );
      assert.equal(jsonConcat.rows[0].len, 1);
    });

    it('supports ON CONFLICT DO UPDATE / DO NOTHING with RETURNING, boolean params, and PortalSuspended (rows limit)', async () => {
      const up1 = await pool.query(
        `INSERT INTO ubicaciones (nombre_ubicacion, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre_ubicacion) DO UPDATE SET descripcion = COALESCE(EXCLUDED.descripcion, ubicaciones.descripcion)
         RETURNING id, descripcion`,
        ['Zone-Harness', 'First']
      );
      assert.equal(up1.rowCount, 1);
      assert.equal(up1.rows[0].descripcion, 'First');

      const up2 = await pool.query(
        `INSERT INTO ubicaciones (nombre_ubicacion, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre_ubicacion) DO UPDATE SET descripcion = COALESCE(EXCLUDED.descripcion, ubicaciones.descripcion)
         RETURNING id, descripcion`,
        ['Zone-Harness', 'Updated']
      );
      assert.equal(up2.rowCount, 1);
      assert.equal(up2.rows[0].id, up1.rows[0].id);
      assert.equal(up2.rows[0].descripcion, 'Updated');

      const doNothing = await pool.query(
        'INSERT INTO ubicaciones (nombre_ubicacion, descripcion) VALUES ($1, $2) ON CONFLICT (nombre_ubicacion) DO NOTHING RETURNING *',
        ['Zone-Harness', 'Ignored']
      );
      assert.equal(doNothing.rowCount, 0);
      assert.equal(doNothing.rows.length, 0);

      // Boolean wire param roundtrip
      const uInsert = await pool.query(
        'INSERT INTO usuarios (nombre, email, activo, en_terreno) VALUES ($1, $2, $3, $4) RETURNING id, activo, en_terreno',
        ['Bool Test', 'bool@entelso.test', true, false]
      );
      assert.equal(uInsert.rows[0].activo, true);
      assert.equal(uInsert.rows[0].en_terreno, false);
      const uSelect = await pool.query('SELECT id FROM usuarios WHERE email = $1 AND activo = TRUE', ['bool@entelso.test']);
      assert.equal(uSelect.rows.length, 1);

      // PortalSuspended ('s') verification over PGv3 wire protocol (maxRows = 3 on >=10 rows)
      const net = require('node:net');
      const frames = await new Promise((resolve, reject) => {
        const u = new URL(pgServer.pgUrl);
        const sock = net.createConnection({ host: u.hostname, port: Number(u.port) });
        let buf = Buffer.alloc(0);
        let stage = 0;
        const seen = [];
        const frame = (type, payload) => {
          const b = Buffer.allocUnsafe(5 + payload.length);
          b[0] = type.charCodeAt(0);
          b.writeInt32BE(4 + payload.length, 1);
          payload.copy(b, 5);
          return b;
        };
        sock.on('connect', () => {
          const params = Buffer.from('user\0test\0database\0entelso_test\0\0', 'utf8');
          const startup = Buffer.allocUnsafe(8 + params.length);
          startup.writeInt32BE(8 + params.length, 0);
          startup.writeInt32BE(196608, 4);
          params.copy(startup, 8);
          sock.write(startup);
        });
        sock.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 5) {
            const type = String.fromCharCode(buf[0]);
            const len = buf.readInt32BE(1);
            if (buf.length < 1 + len) break;
            buf = buf.subarray(1 + len);
            seen.push(type);
            if (stage === 0 && type === 'Z') {
              stage = 1;
              const p = Buffer.concat([Buffer.from('\0SELECT id FROM activos ORDER BY id\0', 'utf8'), Buffer.from([0, 0])]);
              const b = Buffer.from('\0\0\0\0\0\0\0\0', 'utf8');
              const d = Buffer.from('P\0', 'utf8');
              const e1 = Buffer.allocUnsafe(5);
              e1[0] = 0;
              e1.writeUInt32BE(3, 1);
              sock.write(Buffer.concat([frame('P', p), frame('B', b), frame('D', d), frame('E', e1), frame('H', Buffer.alloc(0))]));
            } else if (stage === 1 && type === 's') {
              stage = 2;
              const e2 = Buffer.allocUnsafe(5);
              e2[0] = 0;
              e2.writeUInt32BE(0, 1);
              sock.write(Buffer.concat([frame('E', e2), frame('S', Buffer.alloc(0))]));
            } else if (stage === 2 && type === 'Z') {
              sock.write(frame('X', Buffer.alloc(0)));
              sock.end();
              resolve(seen);
            }
          }
        });
        sock.on('error', reject);
      });
      assert.ok(frames.includes('s'), 'Expected PortalSuspended (s) frame');
      assert.equal(frames.filter((t) => t === 'D').length >= 10, true);
    });

    it('supports transactions (COMMIT / ROLLBACK), failed-tx 25P02 state, and WITH RECURSIVE UPDATE', async () => {
      // Add parent_activo_id strictly inside this test to exercise WITH RECURSIVE UPDATE
      await pool.query('ALTER TABLE activos ADD COLUMN IF NOT EXISTS parent_activo_id INT REFERENCES activos(id)');
      const child = await pool.query(
        "INSERT INTO activos (item_id, numero_serie, parent_activo_id, estado) VALUES (5, 'KIT-CHILD-01', 1, 'disponible') RETURNING id"
      );
      const upd = await pool.query(
        `WITH RECURSIVE kit_hierarchy AS (
          SELECT id FROM activos WHERE id = ANY($2::int[])
          UNION
          SELECT a.id FROM activos a INNER JOIN kit_hierarchy k ON a.parent_activo_id = k.id
        )
        UPDATE activos SET estado = $1 WHERE id IN (SELECT id FROM kit_hierarchy)`,
        ['en_uso', [1]]
      );
      assert.equal(upd.rowCount, 2);
      const checkChild = await pool.query('SELECT estado FROM activos WHERE id = $1', [child.rows[0].id]);
      assert.equal(checkChild.rows[0].estado, 'en_uso');

      // ROLLBACK verification
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO ubicaciones (nombre_ubicacion) VALUES ('Rollback-Zone')");
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const rbCheck = await pool.query("SELECT id FROM ubicaciones WHERE nombre_ubicacion = 'Rollback-Zone'");
      assert.equal(rbCheck.rows.length, 0);

      // Failed transaction -> 25P02 until ROLLBACK
      const txClient = await pool.connect();
      try {
        await txClient.query('BEGIN');
        await assert.rejects(
          () => txClient.query("INSERT INTO activos (item_id, numero_serie) VALUES (5, 'AE-KS-2024-001')"),
          (err) => err.code === '23505'
        );
        await assert.rejects(
          () => txClient.query('SELECT 1'),
          (err) => err.code === '25P02'
        );
        await txClient.query('ROLLBACK');
        const okAfter = await txClient.query('SELECT 1 AS ok');
        assert.equal(okAfter.rows[0].ok, 1);
      } finally {
        txClient.release();
      }
    });

    it('maps PostgreSQL SQLSTATE codes authentically (23505, 23503, 23514, 42710, 42P01, 42703)', async () => {
      // 23505 unique
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie) VALUES (5, 'AE-KS-2024-001')"),
        (e) => e.code === '23505'
      );
      // 23503 foreign key
      await assert.rejects(
        () => pool.query("INSERT INTO activos (item_id, numero_serie) VALUES (999999, 'NO-FK-999')"),
        (e) => e.code === '23503'
      );
      // 23514 check constraint
      await assert.rejects(
        () => pool.query("INSERT INTO items (nombre, tipo, stock_global_consumibles) VALUES ('Bad Stock', 'consumible', -1)"),
        (e) => e.code === '23514'
      );
      // 42710 duplicate enum without IF NOT EXISTS
      await assert.rejects(
        () => pool.query("ALTER TYPE estado_activo_enum ADD VALUE 'disponible'"),
        (e) => e.code === '42710'
      );
      // IF NOT EXISTS succeeds idempotently
      await pool.query("ALTER TYPE estado_activo_enum ADD VALUE IF NOT EXISTS 'sin_stock'");
      // 42P01 missing table (no silent schema invention!)
      await assert.rejects(
        () => pool.query('SELECT * FROM nonexistent_table_xyz'),
        (e) => e.code === '42P01'
      );
      // 42703 missing column (no silent schema invention!)
      await assert.rejects(
        () => pool.query('SELECT nonexistent_col_xyz FROM items'),
        (e) => e.code === '42703'
      );
    });

    it('serializes overlapping concurrent write transactions cleanly without SQLITE_BUSY while allowing concurrent reads', async () => {
      const c1 = await pool.connect();
      const c2 = await pool.connect();
      try {
        await c1.query('BEGIN');
        await c1.query("INSERT INTO items (nombre, tipo) VALUES ('Concurrent-W1', 'herramienta')");

        // Mid-transaction read on another connection must succeed immediately in WAL mode without waiting for c1 COMMIT
        const midRead = await pool.query("SELECT nombre FROM items WHERE nombre = 'Concurrent-W1'");
        assert.equal(midRead.rows.length, 0);

        // Start c2 overlapping write transaction while c1 still holds the transaction open
        const c2Promise = (async () => {
          await c2.query('BEGIN');
          await c2.query("INSERT INTO items (nombre, tipo) VALUES ('Concurrent-W2', 'herramienta')");
          await c2.query('COMMIT');
        })();

        // Delay c1 COMMIT so c2 genuinely contends for the write lock across event-loop ticks
        await new Promise((r) => setTimeout(r, 150));
        await c1.query('COMMIT');
        await c2Promise;

        const verifyRes = await pool.query(
          "SELECT nombre FROM items WHERE nombre IN ('Concurrent-W1', 'Concurrent-W2') ORDER BY nombre"
        );
        assert.deepEqual(
          verifyRes.rows.map((r) => r.nombre),
          ['Concurrent-W1', 'Concurrent-W2']
        );
      } finally {
        c1.release();
        c2.release();
      }
    });

    it('preserves SQL string literals and comments across ::jsonb ||, INTERVAL, cast hints, RETURNING, and DEFAULT NOW()', async () => {
      // 1. String literal containing ::jsonb || must not be rewritten
      const jsonLitIns = await pool.query(
        "INSERT INTO items (nombre, tipo) VALUES ('a::jsonb || b::jsonb', 'herramienta') RETURNING nombre"
      );
      assert.equal(jsonLitIns.rows[0].nombre, 'a::jsonb || b::jsonb');

      const jsonLitSel = await pool.query("SELECT 'a::jsonb || b' AS s");
      assert.equal(jsonLitSel.rows[0].s, 'a::jsonb || b');

      // 2. String literal containing ::int / ANY() must keep OID.TEXT (not NaN)
      const castLitSel = await pool.query("SELECT 'NOW() ILIKE ::int = ANY($1::int[])' AS s");
      assert.equal(typeof castLitSel.rows[0].s, 'string');
      assert.equal(castLitSel.rows[0].s, 'NOW() ILIKE ::int = ANY($1::int[])');

      // 3. String literals containing INTERVAL must not corrupt SQL across quote boundaries
      const intLit1 = await pool.query("SELECT 'foo - INTERVAL ' AS a, '1 day' AS b");
      assert.equal(intLit1.rows[0].a, 'foo - INTERVAL ');
      assert.equal(intLit1.rows[0].b, '1 day');

      const intLit2 = await pool.query("SELECT 'CURRENT_DATE + INTERVAL ' || '''1 day''' AS s");
      assert.equal(intLit2.rows[0].s, "CURRENT_DATE + INTERVAL '1 day'");

      // 4. Genuine INTERVAL rewrite still works
      const realInterval = await pool.query("SELECT (CURRENT_DATE - INTERVAL '6 months') AS d");
      assert.ok(realInterval.rows[0].d);

      // 5. SELECT with 'RETURNING' in string literal on a fresh Client reports accurate rowCount === 1
      await pool.query("INSERT INTO items (nombre, tipo) VALUES ('RETURNING', 'herramienta')");
      const freshClient = new Client({ connectionString: pgServer.pgUrl });
      await freshClient.connect();
      try {
        const retSel = await freshClient.query("SELECT nombre FROM items WHERE nombre = 'RETURNING'");
        assert.equal(retSel.rows.length, 1);
        assert.equal(retSel.rowCount, 1);

        const auditIns = await freshClient.query(
          "INSERT INTO audit_logs (accion, detalles) VALUES ('TEST', 'Error returning item')"
        );
        assert.equal(auditIns.rowCount, 1);
        assert.equal(auditIns.rows.length, 0);
      } finally {
        await freshClient.end();
      }

      // 6. DEFAULT NOW() in DDL translates to DEFAULT CURRENT_TIMESTAMP cleanly
      await pool.query('CREATE TABLE tmp_default_now_test (id SERIAL PRIMARY KEY, created_at TIMESTAMP DEFAULT NOW())');
      const defIns = await pool.query('INSERT INTO tmp_default_now_test DEFAULT VALUES RETURNING id, created_at');
      assert.equal(defIns.rowCount, 1);
      assert.ok(defIns.rows[0].created_at instanceof Date);
    });
  });

  describe('3. Storage Mock + @supabase/supabase-js', () => {
    let storage;

    before(async () => {
      storage = await startStorageMock();
    });

    after(async () => {
      if (storage) await storage.close();
    });

    it('handles upload, duplicate 409, upsert 200, public GET, 404, /__mock__/requests, and @supabase/supabase-js', async () => {
      const pngSample = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

      const rPost = await fetch(`${storage.url}/storage/v1/object/entelso-media/test.png`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', 'x-upsert': 'false' },
        body: pngSample,
      });
      assert.equal(rPost.status, 200);
      const jPost = await rPost.json();
      assert.equal(jPost.Key, 'entelso-media/test.png');
      assert.ok(jPost.Id);

      // Duplicate with x-upsert: false -> 409
      const rDup = await fetch(`${storage.url}/storage/v1/object/entelso-media/test.png`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', 'x-upsert': 'false' },
        body: pngSample,
      });
      assert.equal(rDup.status, 409);

      // Upsert with x-upsert: true -> 200
      const rUpsert = await fetch(`${storage.url}/storage/v1/object/entelso-media/test.png`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', 'x-upsert': 'true' },
        body: pngSample,
      });
      assert.equal(rUpsert.status, 200);

      // Public GET
      const rGet = await fetch(`${storage.url}/storage/v1/object/public/entelso-media/test.png`);
      assert.equal(rGet.status, 200);
      assert.equal(rGet.headers.get('content-type'), 'image/png');
      const gotBuf = Buffer.from(await rGet.arrayBuffer());
      assert.deepEqual(gotBuf, pngSample);

      // Missing -> 404
      const r404 = await fetch(`${storage.url}/storage/v1/object/public/entelso-media/missing.png`);
      assert.equal(r404.status, 404);

      // @supabase/supabase-js client compatibility
      const sb = createClient(storage.url, 'test-service-key');
      const { data: upData, error: upErr } = await sb.storage
        .from('entelso-media')
        .upload('sdk-photo.png', pngSample, { contentType: 'image/png', upsert: false });
      assert.equal(upErr, null);
      assert.equal(upData.path, 'sdk-photo.png');
      assert.equal(upData.fullPath, 'entelso-media/sdk-photo.png');

      const { data: pubData } = sb.storage.from('entelso-media').getPublicUrl('sdk-photo.png');
      assert.ok(pubData.publicUrl.startsWith(storage.url));
      const sdkFetch = await fetch(pubData.publicUrl);
      assert.equal(sdkFetch.status, 200);

      const inspectRes = await fetch(`${storage.url}/__mock__/requests`);
      assert.equal(inspectRes.status, 200);
      const inspectJson = await inspectRes.json();
      assert.ok(inspectJson.requestCount >= 6);
      assert.equal(inspectJson.objects.length, 2);
    });

    it('blocks raw HTTP .. / %2e%2e traversal with 400 while allowing photo..jpg and treating missing x-upsert on POST as 409', async () => {
      const rawHttpRequest = (method, reqPath, headers = {}, body = null) =>
        new Promise((resolve, reject) => {
          const u = new URL(storage.url);
          const req = http.request(
            {
              host: u.hostname,
              port: Number(u.port),
              method,
              path: reqPath,
              headers,
            },
            (res) => {
              const chunks = [];
              res.on('data', (c) => chunks.push(c));
              res.on('end', () => {
                resolve({
                  status: res.statusCode,
                  body: Buffer.concat(chunks).toString('utf8'),
                });
              });
            }
          );
          req.on('error', reject);
          if (body !== null) req.write(body);
          req.end();
        });

      const traversalPaths = [
        ['POST', '/storage/v1/object/entelso-media/sub/../secret.txt'],
        ['GET', '/storage/v1/object/public/entelso-media/folder/../secret.txt'],
        ['POST', '/storage/v1/object/entelso-media/../secret.txt'],
        ['POST', '/storage/v1/object/entelso-media/%2e%2e/secret.txt'],
        ['POST', '/storage/v1/object/%2e%2e/secret.txt'],
        ['GET', '/storage/v1/object/public/%2e%2e/secret.txt'],
      ];

      for (const [method, p] of traversalPaths) {
        const res = await rawHttpRequest(method, p, { 'content-type': 'text/plain' }, method === 'POST' ? 'x' : null);
        assert.equal(res.status, 400, `Expected 400 InvalidPath for ${method} ${p}, got ${res.status}: ${res.body}`);
        assert.equal(JSON.parse(res.body).error, 'InvalidPath');
      }

      // Filename containing '..' inside a single segment must remain valid (200)
      const okDotFile = await rawHttpRequest(
        'POST',
        '/storage/v1/object/entelso-media/photo..jpg',
        { 'content-type': 'image/jpeg' },
        Buffer.from('ffd8ffe0', 'hex')
      );
      assert.equal(okDotFile.status, 200);

      // Second POST to same key WITHOUT x-upsert header must return 409 Duplicate
      const dupNoHeader = await rawHttpRequest(
        'POST',
        '/storage/v1/object/entelso-media/photo..jpg',
        { 'content-type': 'image/jpeg' },
        Buffer.from('ffd8ffe0', 'hex')
      );
      assert.equal(dupNoHeader.status, 409);
      assert.equal(JSON.parse(dupNoHeader.body).error, 'Duplicate');
    });
  });

  describe('4. Dashboard Static Server', () => {
    let dash;

    before(async () => {
      dash = await startDashboardServer();
    });

    after(async () => {
      if (dash) await dash.close();
    });

    it('serves index, JS/CSS/PNG/PDF, directory index, 404 for missing, and blocks path traversal', async () => {
      const rIndex = await fetch(`${dash.url}/`);
      assert.equal(rIndex.status, 200);
      assert.match(rIndex.headers.get('content-type'), /text\/html/);
      const html = await rIndex.text();
      assert.ok(html.includes('Entelso'));

      const rJs = await fetch(`${dash.url}/script.js?v=12`);
      assert.equal(rJs.status, 200);
      assert.match(rJs.headers.get('content-type'), /application\/javascript/);

      const rI18n = await fetch(`${dash.url}/i18n.js?v=12`);
      assert.equal(rI18n.status, 200);

      const rCss = await fetch(`${dash.url}/style.css?v=12`);
      assert.equal(rCss.status, 200);
      assert.match(rCss.headers.get('content-type'), /text\/css/);

      const rPng = await fetch(`${dash.url}/logo-blue.png`);
      assert.equal(rPng.status, 200);
      assert.equal(rPng.headers.get('content-type'), 'image/png');

      const rPdf = await fetch(`${dash.url}/Entelso_Enterprise_Operations_Manual.pdf`);
      assert.equal(rPdf.status, 200);
      assert.equal(rPdf.headers.get('content-type'), 'application/pdf');

      const rDir = await fetch(`${dash.url}/manual/`);
      assert.equal(rDir.status, 200);
      assert.match(rDir.headers.get('content-type'), /text\/html/);

      const rMissing = await fetch(`${dash.url}/missing-file.js`);
      assert.equal(rMissing.status, 404);

      for (const badPath of ['/../../backend/.env', '/%2e%2e/backend/.env', '/..%5cinit.sql', '/.dockerignore', '/dockerfile', '/NGINX.CONF']) {
        const rTrav = await fetch(`${dash.url}${badPath}`);
        assert.ok([400, 403, 404].includes(rTrav.status), `Expected traversal blocked for ${badPath}, got ${rTrav.status}`);
        assert.notEqual(rTrav.status, 200);
      }
    });
  });

  describe('5. Full Isolated Backend + DOM Sandbox + Env Isolation Integration', () => {
    let env;
    let sandbox;

    before(async () => {
      env = await startIsolatedEnv();
    });

    after(async () => {
      if (sandbox) sandbox.close();
      if (env) await env.close();
    });

    it('boots real backend/src/server.js cleanly with GET /health -> 200 and isolated storage config', async () => {
      const healthRes = await fetch(`${env.apiUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.status, 'UP');
      assert.equal(healthJson.env, 'test');

      const logs = env.getLogs();
      assert.ok(logs.stdout.includes('20261008_add_cantidad_sin_stock'), 'Expected startup migration log');
    });

    it('neutralizes backend/.env fallback when SUPABASE_URL is explicitly empty', async () => {
      const noStorageEnv = await startIsolatedEnv({ enableStorageMock: false });
      try {
        const res = await fetch(`${noStorageEnv.apiUrl}/health`);
        assert.equal(res.status, 200);
        // Attempt upload without auth or check that server did not load backend/.env SUPABASE_URL
        const pool = new Pool({ connectionString: noStorageEnv.pgUrl });
        const hash = await bcrypt.hash('TestPass123', 4);
        await pool.query("INSERT INTO usuarios (nombre, email, rol, pin_hash) VALUES ('NoSB', 'nosb@test.local', 'admin', $1)", [hash]);
        await pool.end();

        const loginRes = await fetch(`${noStorageEnv.apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'nosb@test.local', pin: 'TestPass123' }),
        });
        const loginJson = await loginRes.json();
        const token = loginJson.data.token;

        const fd = new FormData();
        fd.append('foto', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'test.png');
        const upRes = await fetch(`${noStorageEnv.apiUrl}/api/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        // Should fail with 500 Supabase not configured (NOT reach real external supabase.co!)
        assert.equal(upRes.status, 500);
        const upBody = await upRes.text();
        assert.ok(!upBody.includes('supabase.co'), 'Must never leak/use production Supabase URL');
      } finally {
        await noStorageEnv.close();
      }
    });

    it('loads dashboard in DOM sandbox, authenticates against isolated backend, and blocks external network calls', async () => {
      // Create deterministic harness test admin in isolated DB so test works regardless of seed hash changes
      const pool = new Pool({ connectionString: env.pgUrl });
      const testHash = await bcrypt.hash('HarnessPass123!', 4);
      await pool.query(
        "INSERT INTO usuarios (nombre, email, rol, pin_hash) VALUES ('Harness Admin', 'harness.admin@entelso.test', 'admin', $1)",
        [testHash]
      );
      await pool.end();

      sandbox = await createDashboardSandbox({
        dashboardUrl: env.dashboardUrl,
        apiUrl: env.apiUrl,
      });

      await sandbox.fireDOMContentLoaded();
      assert.equal(typeof sandbox.window.i18n.t, 'function');
      assert.ok(sandbox.window.i18n.t('login.titulo').length > 0);

      // Submit loginForm via sandbox
      sandbox.document.getElementById('loginEmail').value = 'harness.admin@entelso.test';
      sandbox.document.getElementById('loginPin').value = 'HarnessPass123!';
      const form = sandbox.document.getElementById('loginForm');
      form.dispatchEvent(new sandbox.window.Event('submit', { bubbles: true, cancelable: true }));

      await sandbox.flushMicrotasks(250);

      const appShell = sandbox.document.getElementById('appShell');
      assert.equal(appShell.style.display, 'flex');
      assert.ok(sandbox.apiRequests.some((r) => r.url.includes('/api/auth/login') && r.status === 200));
      assert.ok(sandbox.apiRequests.some((r) => r.url.includes('/api/activos')));

      // Verify authenticated API call against real view in init.sql returns 200
      const token = sandbox.sessionStorage.getItem('entelso_token');
      assert.ok(token, 'Expected JWT saved in sessionStorage');
      const alertRes = await fetch(`${env.apiUrl}/api/alertas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(alertRes.status, 200);
      const alertJson = await alertRes.json();
      assert.equal(alertJson.success, true);
      assert.ok(Array.isArray(alertJson.data) && alertJson.data.length > 0);

      // Verify zero external network requests slipped through
      assert.equal(sandbox.blockedNetworkCalls.length, 0);

      // Verify external fetch attempt is intercepted and recorded without hitting the network
      await assert.rejects(
        () => sandbox.window.fetch('https://example-prod.supabase.co/test'),
        /Blocked external network call/
      );
      assert.equal(sandbox.blockedNetworkCalls.length, 1);

      // Verify external img.src assignment is recorded in blockedNetworkCalls
      const img = sandbox.document.createElement('img');
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=TEST';
      assert.ok(sandbox.blockedNetworkCalls.some((c) => c.type === 'img.src' && c.url.includes('api.qrserver.com')));

      // Verify reload() preserves localStorage
      sandbox.localStorage.setItem('harness_persist_key', 'persisted_val');
      sandbox = await sandbox.reload();
      assert.equal(sandbox.localStorage.getItem('harness_persist_key'), 'persisted_val');
    });

    it('preserves mutated localStorage across reload() with initialLocalStorage, tracks innerHTML external assets, and returns textarea.value', async () => {
      let sb = await createDashboardSandbox({
        dashboardUrl: env.dashboardUrl,
        apiUrl: env.apiUrl,
        initialLocalStorage: { probe_key: 'initial' },
      });
      try {
        assert.equal(sb.localStorage.getItem('probe_key'), 'initial');
        sb.localStorage.setItem('probe_key', 'mutated');
        sb = await sb.reload();
        assert.equal(sb.localStorage.getItem('probe_key'), 'mutated');

        const hostDiv = sb.document.createElement('div');
        hostDiv.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?data=LEAK">';
        assert.ok(
          sb.blockedNetworkCalls.some((c) => c.type === 'img.src' && c.url.includes('api.qrserver.com')),
          'Expected innerHTML external img.src to be recorded in blockedNetworkCalls'
        );

        hostDiv.innerHTML = '<textarea id="ta">hello</textarea>';
        const ta = hostDiv.querySelector('#ta');
        assert.equal(ta.textContent, 'hello');
        assert.equal(ta.value, 'hello');
        ta.value = 'updated';
        assert.equal(ta.value, 'updated');
      } finally {
        sb.close();
      }
    });
  });

  it('6. Preserves .env and backend/.env SHA-256 hashes after all harness tests', () => {
    assert.equal(sha256File(archiveEnvPath), EXPECTED_ARCHIVE_ENV_SHA256);
    assert.equal(sha256File(backendEnvPath), EXPECTED_BACKEND_ENV_SHA256);
  });
});
