'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { startIsolatedEnv } = require('../harness/test_env');
const {
  httpJson,
  loginAsSeedAdmin,
  provisionAndLoginRole,
  nextTag,
} = require('./_f5_f8_helpers');

describe('F6 — RBAC & Route Hierarchy (Tier 1)', () => {
  let env;
  let apiUrl;
  let adminToken;
  let almacenAuth;
  let supervisorAuth;
  let trabajadorAuth;

  before(async () => {
    env = await startIsolatedEnv();
    apiUrl = env.apiUrl;
    const adminLogin = await loginAsSeedAdmin(apiUrl);
    adminToken = adminLogin.token;

    almacenAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'almacen',
      team: 'Transmission',
    });
    supervisorAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'supervisor',
      team: 'Calibration',
    });
    trabajadorAuth = await provisionAndLoginRole(apiUrl, adminToken, {
      rol: 'trabajador',
      team: 'Energy',
    });
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F6-T1-1: Admin provisions roles via POST /api/usuarios (201) and performs full usuarios CRUD (200)', async () => {
    const tag = nextTag('rbac_u');
    const createRes = await httpJson(apiUrl, '/api/usuarios', {
      method: 'POST',
      token: adminToken,
      body: {
        nombre: `User ${tag}`,
        email: `${tag}@entelso.test`,
        rol: 'almacen',
        team: 'Transmission',
        pin: 'pass1234',
      },
    });
    assert.equal(createRes.status, 201);
    const createdId = createRes.json.data.id;
    assert.equal(createRes.json.data.rol, 'almacen');

    const listRes = await httpJson(apiUrl, '/api/usuarios', { token: adminToken });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.json.data));
    assert.ok(listRes.json.data.some((u) => u.id === createdId));

    const getRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, { token: adminToken });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.data.id, createdId);

    const assetsRes = await httpJson(apiUrl, `/api/usuarios/${createdId}/activos`, { token: adminToken });
    assert.equal(assetsRes.status, 200);
    assert.ok(Array.isArray(assetsRes.json.data));

    const putRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, {
      method: 'PUT',
      token: adminToken,
      body: { nombre: `Updated ${tag}` },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.json.data.nombre, `Updated ${tag}`);

    const delRes = await httpJson(apiUrl, `/api/usuarios/${createdId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.data.deleted, true);
  });

  it('F6-T1-2: GET /api/usuarios/asignables succeeds for all 4 roles and exposes only minimal public fields', async () => {
    const tokens = [adminToken, almacenAuth.token, supervisorAuth.token, trabajadorAuth.token];
    const allowedKeys = new Set(['id', 'nombre', 'team', 'activo']);

    for (const token of tokens) {
      const res = await httpJson(apiUrl, '/api/usuarios/asignables', { token });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(Array.isArray(res.json.data) && res.json.data.length >= 4);

      for (const row of res.json.data) {
        const keys = Object.keys(row);
        for (const k of keys) {
          assert.ok(allowedKeys.has(k), `Unexpected field "${k}" leaked in /api/usuarios/asignables`);
        }
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'email'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'telefono_whatsapp'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'pin_hash'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(row, 'secret_2fa'), false);
      }
    }
  });

  it('F6-T1-3: GET /api/audit succeeds (200) for admin and includes logged entries', async () => {
    const postRes = await httpJson(apiUrl, '/api/audit', {
      method: 'POST',
      token: adminToken,
      body: {
        accion: 'F6_AUDIT_TEST',
        detalles: 'RBAC audit verification',
        meta: { source: 'f06_tier1' },
      },
    });
    assert.equal(postRes.status, 200);

    const getRes = await httpJson(apiUrl, '/api/audit', { token: adminToken });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.success, true);
    assert.ok(Array.isArray(getRes.json.data));
    assert.ok(getRes.json.pagination && typeof getRes.json.pagination.total === 'number');
    assert.ok(getRes.json.data.some((l) => l.accion === 'F6_AUDIT_TEST'));
  });

  it('F6-T1-3b: Audit log captures real mutations with diffs, scrubs secrets/base64, paginates, filters, and fails safely', async () => {
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');

    // 1. Non-blocking fault-tolerance check in isolated subprocess: logSafe must never throw even if createLog fails
    const auditSvcPath = path.resolve(__dirname, '../../backend/src/modules/audit/audit.service.js');
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        `const svc = require(${JSON.stringify(auditSvcPath)});
         svc.createLog = async () => { throw new Error('Simulated audit DB outage'); };
         svc.logSafe({ userId: 1, accion: 'test.outage' }).then((r) => {
           if (r !== null) process.exit(2);
           console.log('LOGSAFE_OK');
         });`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
          API_KEY: 'test-api-key-123456',
          JWT_SECRET: 'test-jwt-secret-key-32-chars-minimum',
          NODE_ENV: 'test',
        },
      }
    );
    assert.ok(out.includes('LOGSAFE_OK'), 'Expected logSafe to swallow DB outage safely');

    // 2. Secret & base64 scrubbing on POST /api/audit
    const scrubRes = await httpJson(apiUrl, '/api/audit', {
      method: 'POST',
      token: adminToken,
      body: {
        accion: 'F6_SCRUB_TEST',
        detalles: 'Uploaded data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        meta: {
          module: 'security',
          password: 'SuperSecretPassword!',
          pin_hash: '$2b$10$secret',
          secret_2fa: 'JBSWY3DPEHPK3PXP',
          token: 'eyJhbGciOiJIUzI1NiJ9.fake',
          base64_image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
          safeField: 'kept_ok',
        },
      },
    });
    assert.equal(scrubRes.status, 200);

    // 3. Automatic backend audit on asset create + status update with before->after diff
    const serial = `AUD-${Math.floor(10000 + Math.random() * 80000)}`;
    const cRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Audit Test Meter', categoria: 'Testing Equipment', numero_serie: serial },
    });
    assert.equal(cRes.status, 201);
    const aid = cRes.json.data.id;

    const uRes = await httpJson(apiUrl, `/api/activos/${aid}`, {
      method: 'PATCH',
      token: adminToken,
      body: { estado: 'en_mantenimiento', notas: 'Audit diff check' },
    });
    assert.equal(uRes.status, 200);

    // 4. Filter by module=equipment and search q=<serial> (allow non-blocking background audit write to flush)
    let filtered = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      filtered = await httpJson(apiUrl, `/api/audit?module=equipment&q=${encodeURIComponent(serial)}&limit=10&offset=0`, {
        token: adminToken,
      });
      if (filtered.status === 200 && filtered.json.data.some((l) => l.accion === 'asset.updated')) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(filtered.status, 200);
    assert.ok(filtered.json.data.length >= 2);
    const updLog = filtered.json.data.find((l) => l.accion === 'asset.updated');
    assert.ok(updLog, 'Expected automatic asset.updated audit entry');
    assert.ok(updLog.fecha_iso && !Number.isNaN(Date.parse(updLog.fecha_iso)), 'Expected valid ISO UTC fecha_iso');
    assert.equal(updLog.meta?.target, serial);
    assert.ok(
      Array.isArray(updLog.meta?.changes) &&
      updLog.meta.changes.some((c) => c.field === 'estado' && c.to === 'en_mantenimiento'),
      'Expected structured estado before->after diff in meta.changes'
    );

    // 5. Verify scrubbed log never contains secrets or base64 data URI
    const scrubQuery = await httpJson(apiUrl, '/api/audit?q=F6_SCRUB_TEST&limit=5', { token: adminToken });
    assert.equal(scrubQuery.status, 200);
    const scrubRow = scrubQuery.json.data.find((l) => l.accion === 'F6_SCRUB_TEST');
    assert.ok(scrubRow, 'Expected F6_SCRUB_TEST row');
    const serialized = JSON.stringify(scrubRow);
    assert.ok(!serialized.includes('SuperSecretPassword!'), 'password leaked into audit log');
    assert.ok(!serialized.includes('$2b$10$secret'), 'pin_hash leaked into audit log');
    assert.ok(!serialized.includes('JBSWY3DPEHPK3PXP'), 'secret_2fa leaked into audit log');
    assert.ok(!serialized.includes('eyJhbGciOiJIUzI1NiJ9'), 'token leaked into audit log');
    assert.ok(!serialized.includes('iVBORw0KGgo'), 'base64 image leaked into audit log');
    assert.equal(scrubRow.meta?.safeField, 'kept_ok');

    // 6. Real SQL pagination (limit & offset & hasMore)
    const p1 = await httpJson(apiUrl, '/api/audit?limit=2&offset=0', { token: adminToken });
    const p2 = await httpJson(apiUrl, '/api/audit?limit=2&offset=2', { token: adminToken });
    assert.equal(p1.status, 200);
    assert.equal(p2.status, 200);
    assert.equal(p1.json.data.length, 2);
    assert.equal(p1.json.pagination.limit, 2);
    assert.equal(p1.json.pagination.offset, 0);
    assert.equal(p1.json.pagination.hasMore, p1.json.pagination.total > 2);
    if (p2.json.data.length > 0) {
      assert.notEqual(p1.json.data[0].id, p2.json.data[0].id);
    }

    // 7. Legacy null-detalles/null-meta row renders cleanly via API
    const legacyPost = await httpJson(apiUrl, '/api/audit', {
      method: 'POST',
      token: adminToken,
      body: { accion: 'Inició sesión en el sistema' },
    });
    assert.equal(legacyPost.status, 200);
    const legacySec = await httpJson(apiUrl, '/api/audit?module=security&limit=20', { token: adminToken });
    assert.equal(legacySec.status, 200);
    const legacyRow = legacySec.json.data.find((l) => l.accion === 'Inició sesión en el sistema');
    assert.ok(legacyRow, 'Legacy login row must match module=security filter');
    assert.equal(legacyRow.detalles, '');
    assert.equal(legacyRow.meta, null);
  });

  it('F6-T1-4: almacen succeeds on activos create, bulk create (201), full patch, bulk category, bulk delete, and delete', async () => {
    const tag = nextTag('alm_a');
    const createRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        descripcion: `Almacen Drill ${tag}`,
        categoria: 'Power Tools',
        numero_serie: `PT-${String(Math.floor(10000 + Math.random() * 80000))}`,
        notas: 'Created by almacen',
      },
    });
    assert.equal(createRes.status, 201);
    const id1 = createRes.json.data.id;

    const patchRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'PATCH',
      token: almacenAuth.token,
      body: {
        numero_serie: `PT-${String(Math.floor(10000 + Math.random() * 80000))}`,
        notas: 'Updated serial & notes by almacen',
      },
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.data.notas, 'Updated serial & notes by almacen');

    const bulkCreateRes = await httpJson(apiUrl, '/api/activos/bulk', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        activos: [
          { descripcion: `Bulk Almacen A ${tag}`, categoria: 'Hand Tools', estado: 'Available' },
          { descripcion: `Bulk Almacen B ${tag}`, categoria: 'Hand Tools', estado: 'Available' },
        ],
      },
    });
    assert.equal(bulkCreateRes.status, 201);
    assert.equal(bulkCreateRes.json.data.inserted, 2);

    const listRes = await httpJson(apiUrl, `/api/activos?search=${encodeURIComponent(tag)}`, {
      token: almacenAuth.token,
    });
    assert.equal(listRes.status, 200);
    const bulkIds = listRes.json.data.map((a) => a.id);
    assert.ok(bulkIds.length >= 2);

    const bulkCatRes = await httpJson(apiUrl, '/api/activos/bulk/category', {
      method: 'PATCH',
      token: almacenAuth.token,
      body: { ids: [bulkIds[0]], categoria: 'Testing Equipment' },
    });
    assert.equal(bulkCatRes.status, 200);

    const bulkDelRes = await httpJson(apiUrl, '/api/activos/bulk/delete', {
      method: 'POST',
      token: almacenAuth.token,
      body: { ids: bulkIds },
    });
    assert.equal(bulkDelRes.status, 200);

    const delSingleRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'DELETE',
      token: almacenAuth.token,
    });
    assert.equal(delSingleRes.status, 200);
  });

  it('F6-T1-5: supervisor succeeds (200) on allowlisted PATCH /api/activos/:id and bulk status/zona/team/usuario', async () => {
    const tag = nextTag('sup_a');
    const a1 = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Sup Target 1 ${tag}`, categoria: 'Hand Tools' },
    });
    const a2 = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Sup Target 2 ${tag}`, categoria: 'Hand Tools' },
    });
    assert.equal(a1.status, 201);
    assert.equal(a2.status, 201);
    const id1 = a1.json.data.id;
    const id2 = a2.json.data.id;

    const ubicRes = await httpJson(apiUrl, '/api/ubicaciones', { token: supervisorAuth.token });
    assert.equal(ubicRes.status, 200);
    const zonaId = ubicRes.json.data[0].id;

    // PATCH /:id with allowlisted fields including observaciones alias
    const patchRes = await httpJson(apiUrl, `/api/activos/${id1}`, {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: {
        estado: 'en_uso',
        ubicacion_actual_id: zonaId,
        team: 'Transmission',
        usuario_actual_id: trabajadorAuth.user.id,
        notas: 'Supervisor note',
        observaciones: 'Supervisor obs',
      },
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.data.estado, 'en_uso');
    assert.equal(patchRes.json.data.team, 'Transmission');

    const bStatus = await httpJson(apiUrl, '/api/activos/bulk/status', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], estado: 'disponible' },
    });
    assert.equal(bStatus.status, 200);

    const bZona = await httpJson(apiUrl, '/api/activos/bulk/zona', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], ubicacion_actual_id: zonaId },
    });
    assert.equal(bZona.status, 200);

    const bTeam = await httpJson(apiUrl, '/api/activos/bulk/team', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], team: 'Energy' },
    });
    assert.equal(bTeam.status, 200);

    const bUser = await httpJson(apiUrl, '/api/activos/bulk/usuario', {
      method: 'PATCH',
      token: supervisorAuth.token,
      body: { ids: [id1, id2], usuario_actual_id: trabajadorAuth.user.id },
    });
    assert.equal(bUser.status, 200);
  });

  it('F6-T1-6: almacen succeeds on items, stock, ubicaciones, mantenimientos, and movimientos writes', async () => {
    const tag = nextTag('alm_ops');
    const itemRes = await httpJson(apiUrl, '/api/items', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        nombre: `Almacen Consumible ${tag}`,
        tipo: 'consumible',
        stock_global_consumibles: 10,
      },
    });
    assert.equal(itemRes.status, 201);
    const consItemId = itemRes.json.data.id;

    const stockRes = await httpJson(apiUrl, `/api/items/${consItemId}/stock`, {
      method: 'PATCH',
      token: almacenAuth.token,
      body: { cantidad: 5, operacion: 'sumar' },
    });
    assert.equal(stockRes.status, 200);
    assert.equal(stockRes.json.data.stock_global_consumibles, 15);

    const locRes = await httpJson(apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: almacenAuth.token,
      body: { nombre_ubicacion: `Zone ${tag}`, descripcion: 'Almacen created zone' },
    });
    assert.equal(locRes.status, 201);
    const locId = locRes.json.data.id;

    const toolRes = await httpJson(apiUrl, '/api/activos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { descripcion: `Almacen Tool ${tag}`, categoria: 'Power Tools' },
    });
    assert.equal(toolRes.status, 201);
    const asset = toolRes.json.data;

    const maintRes = await httpJson(apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: almacenAuth.token,
      body: { activo_id: asset.id, motivo: 'Scheduled calibration' },
    });
    assert.equal(maintRes.status, 201);
    const maintId = maintRes.json.data.id;

    const attRes = await httpJson(apiUrl, `/api/mantenimientos/${maintId}/atendido`, {
      method: 'PUT',
      token: almacenAuth.token,
      body: {},
    });
    assert.equal(attRes.status, 200);

    const movRes = await httpJson(apiUrl, '/api/movimientos', {
      method: 'POST',
      token: almacenAuth.token,
      body: {
        item_id: consItemId,
        usuario_id: trabajadorAuth.user.id,
        ubicacion_destino_id: locId,
        cantidad: 2,
        tipo_movimiento: 'despacho',
      },
    });
    assert.equal(movRes.status, 201);
  });
});
