'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
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

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

describe('Tier 4 — Real-World End-to-End Application Workflows (W1–W8)', () => {
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

  it('W1: New Equipment Onboarding, Kit Assembly, Photo Upload, Excel Export & Audit Trail', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([PNG_1X1], { type: 'image/png' }), 'kit.png');
    const up = await uploadMultipart(env.apiUrl, '/api/upload', fd, { token: adminToken });
    assert.equal(up.status, 200);

    const kit = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'WalkTest Kit W1',
        categoria: 'WalkTest Kits',
        numero_serie: 'WK-88001',
        fotos: [up.body.data.url],
      },
    });
    assert.equal(kit.status, 201);

    const probe = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Spectrum Probe W1',
        categoria: 'Testing Equipment',
        numero_serie: 'TE-88002',
      },
    });
    assert.equal(probe.status, 201);

    const attach = await httpJson(env.apiUrl, `/api/activos/${probe.body.data.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { parent_activo_id: kit.body.data.id },
    });
    assert.equal(attach.status, 200);

    const logRes = await httpJson(env.apiUrl, '/api/audit', {
      method: 'POST',
      token: adminToken,
      body: { accion: 'w1_kit_assembled', detalles: 'WK-88001' },
    });
    assert.ok(logRes.status === 200 || logRes.status === 201);

    const xlsx = await fetch(`${env.apiUrl}/api/activos/export-excel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [kit.body.data.id, probe.body.data.id] }),
    });
    assert.equal(xlsx.status, 200);
    const bytes = Buffer.from(await xlsx.arrayBuffer());
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it('W2: Field Technician WhatsApp Ingest -> Checkout without PIN -> Photo Proof -> Return', async () => {
    const ingest = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-ingest-secret': env.apiKey },
      body: {
        whatsapp_number: '+584121234567',
        parsed: {
          numero_inventario: 'PT-88100',
          equipo: 'Hilti Hammer Drill W2',
          zona: 'Sydney North',
          team: 'Networks',
        },
      },
    });
    assert.ok(ingest.status === 200 || ingest.status === 201);

    const assign = await httpJson(env.apiUrl, '/api/whatsapp/asignar', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PT-88100',
        zona: 'Parramatta Site',
      },
    });
    assert.equal(assign.status, 200);

    const photo = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PT-88100',
        base64_image: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
      },
    });
    assert.equal(photo.status, 200);

    const ret = await httpJson(env.apiUrl, '/api/whatsapp/devolver', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'PT-88100',
      },
    });
    assert.equal(ret.status, 200);

    const afterSearch = await httpJson(env.apiUrl, '/api/activos?search=PT-88100', { token: adminToken });
    assert.equal(afterSearch.status, 200);
    const found = afterSearch.body.data.find((x) => x.original_serial === 'PT-88100' || x.numero_serie === 'PT-88100');
    assert.ok(found, 'Expected ingested asset to be searchable by original_serial');
    assert.equal(found.estado, 'disponible');
    assert.equal(found.usuario_actual_id, null);
    assert.equal(found.fotos.length, 1);
  });

  it('W3: Maintenance & Calibration Alert Resolution Restores Asset Atomically', async () => {
    const alertsBefore = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.equal(alertsBefore.status, 200);
    assert.ok(alertsBefore.body.data.length > 0);
    const targetId = alertsBefore.body.data[0].activo_id;

    const maint = await httpJson(env.apiUrl, '/api/mantenimientos', {
      method: 'POST',
      token: adminToken,
      body: { activo_id: targetId, motivo: 'Annual calibration W3' },
    });
    assert.equal(maint.status, 201);

    const alertsDuring = await httpJson(env.apiUrl, '/api/alertas', { token: adminToken });
    assert.equal(alertsDuring.body.data.some((a) => a.activo_id === targetId), false);

    const attend = await httpJson(env.apiUrl, `/api/mantenimientos/${maint.body.data.id}/atendido`, {
      method: 'PUT',
      token: adminToken,
      body: {},
    });
    assert.equal(attend.status, 200);

    const assetAfter = await httpJson(env.apiUrl, `/api/activos/${targetId}`, { token: adminToken });
    assert.equal(assetAfter.body.data.estado, 'disponible');
  });

  it('W4 & W5: Multi-Role Session & Supervisor Bulk Field Reassignment', async () => {
    const sup = await createUserAndLogin(env.apiUrl, adminToken, {
      nombre: 'Supervisor W5',
      email: 'sup.w5@entelso.test',
      rol: 'supervisor',
      pin: 'SupW5Pass!',
    });

    const team = await httpJson(env.apiUrl, '/api/teams', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Field Squad W5' },
    });
    assert.equal(team.status, 201);

    const loc = await httpJson(env.apiUrl, '/api/ubicaciones', {
      method: 'POST',
      token: adminToken,
      body: { nombre_ubicacion: 'Depot W5' },
    });
    assert.equal(loc.status, 201);

    const a = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: { descripcion: 'Field Meter W5', categoria: 'Testing Equipment', numero_serie: 'TE-88500' },
    });
    assert.equal(a.status, 201);

    // Supervisor can reassign team & zone, cannot change category
    const okTeam = await httpJson(env.apiUrl, '/api/activos/bulk/team', {
      method: 'PATCH',
      token: sup.token,
      body: { ids: [a.body.data.id], team: 'Field Squad W5' },
    });
    assert.equal(okTeam.status, 200);

    const okZona = await httpJson(env.apiUrl, '/api/activos/bulk/zona', {
      method: 'PATCH',
      token: sup.token,
      body: { ids: [a.body.data.id], ubicacion_actual_id: loc.body.data.id },
    });
    assert.equal(okZona.status, 200);

    const deniedCat = await httpJson(env.apiUrl, '/api/activos/bulk/category', {
      method: 'PATCH',
      token: sup.token,
      body: { ids: [a.body.data.id], categoria: 'Power Tools' },
    });
    assert.equal(deniedCat.status, 403);
  });

  it('W6: Consumable Stock Replenishment, Exact Depletion to 0 & Over-Depletion Guard', async () => {
    const item = await httpJson(env.apiUrl, '/api/items', {
      method: 'POST',
      token: adminToken,
      body: { nombre: 'Cable Ties W6', tipo: 'consumible', stock_global_consumibles: 10 },
    });
    assert.equal(item.status, 201);
    const id = item.body.data.id;

    const add = await httpJson(env.apiUrl, `/api/items/${id}/stock`, {
      method: 'PATCH',
      token: adminToken,
      body: { cantidad: 15, operacion: 'sumar' },
    });
    assert.equal(add.status, 200);
    assert.equal(add.body.data.stock_global_consumibles, 25);

    const drain = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: { item_id: id, usuario_id: adminUser.id, cantidad: 25, tipo_movimiento: 'despacho' },
    });
    assert.equal(drain.status, 201);

    const over = await httpJson(env.apiUrl, '/api/movimientos', {
      method: 'POST',
      token: adminToken,
      body: { item_id: id, usuario_id: adminUser.id, cantidad: 1, tipo_movimiento: 'despacho' },
    });
    assert.equal(over.status, 400);
    assert.equal(over.body.success, false);
  });

  it('W7 & W8: Bilingual EN/ES Persistence, XSS Hardening, Zero Prod Traffic & Immutable .env Hashes', async () => {
    let sb = await createDashboardSandbox({
      dashboardUrl: env.dashboardUrl,
      apiUrl: env.apiUrl,
    });
    try {
      assert.equal(sb.window.i18n.getLang(), 'en');
      sb.window.i18n.setLang('es');
      sb = await sb.reload();
      assert.equal(sb.window.i18n.getLang(), 'es');
      assert.equal(sb.window.i18n.t('login.2fa.label'), 'Código de verificación 2FA');

      // Ensure XSS payload in QR serial and HTML escaping stays completely neutral
      const qrUri = sb.window.buildAssetQrDataUri('SN-<script>alert(1)</script>');
      assert.ok(qrUri.startsWith('data:image/svg+xml;charset=utf-8,'));
      assert.equal(sb.blockedNetworkCalls.length, 0);
    } finally {
      sb.close();
    }

    // Verify original untouched .env SHA-256 hashes
    assert.equal(
      sha256(path.join(WORKSPACE_ROOT, '_archive_backups', '.env')),
      '41E7F23417F900BBBAC6EC88B1E04095BC8456292977F439D34F281346A5E7CD'
    );
    assert.equal(
      sha256(path.join(REPO_ROOT, 'backend', '.env')),
      '39EC26397FD3DF27A331930911F02BFE884421FA22E100D41D2AF7FEB1B51EAE'
    );
  });
});
