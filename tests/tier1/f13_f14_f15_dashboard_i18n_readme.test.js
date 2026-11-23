'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DASH_DIR = path.join(REPO_ROOT, 'dashboard');
const QRCode = require(path.join(REPO_ROOT, 'backend', 'node_modules', 'qrcode'));
const { startDashboardServer } = require('../harness/dashboard_server');
const { createDashboardSandbox } = require('../harness/dom_sandbox');

describe('Tier 1 — F13, F14 & F15: Dashboard DOM/QR, i18n Parity, Config & Conservative Naming/README', () => {
  let srv;

  before(async () => {
    srv = await startDashboardServer();
  });

  after(async () => {
    if (srv) await srv.close();
  });

  it('F13-T1-1: buildAssetQrDataUri generates real ISO/IEC 18004 scannable local SVG QR codes without external calls', async () => {
    const sb = await createDashboardSandbox({
      dashboardUrl: srv.url,
      apiUrl: 'http://127.0.0.1:3001',
      originUrl: 'http://localhost:8080/',
    });
    try {
      const serial = 'PT-00042';
      const uri = sb.window.buildAssetQrDataUri(serial, '61439759528');
      assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'));
      const svg = decodeURIComponent(uri.slice('data:image/svg+xml;charset=utf-8,'.length));
      assert.ok(svg.includes('<svg') && svg.includes('INFO PT-00042'));
      assert.ok(!svg.includes('qrserver.com'));

      // Verify underlying QR matrix matches ISO/IEC 18004 reference bit-for-bit
      const payload = 'https://wa.me/61439759528?text=' + encodeURIComponent('INFO ' + serial);
      const mat = sb.window.encodeIsoQrMatrix(payload);
      const size = mat.length;
      const fmtBits = [
        mat[8][0], mat[8][1], mat[8][2], mat[8][3], mat[8][4], mat[8][5], mat[8][7], mat[8][8],
        mat[7][8], mat[5][8], mat[4][8], mat[3][8], mat[2][8], mat[1][8], mat[0][8],
      ];
      let fmtVal = 0;
      for (const b of fmtBits) fmtVal = (fmtVal << 1) | b;
      const maskId = ((fmtVal ^ 0x5412) >> 10) & 7;
      const ref = QRCode.create([{ data: payload, mode: 'byte' }], { errorCorrectionLevel: 'M', maskPattern: maskId });
      assert.equal(size, ref.modules.size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          assert.equal(mat[r][c], ref.modules.get(r, c), `Bit mismatch at (${r},${c})`);
        }
      }
    } finally {
      sb.close();
    }
  });

  it('F13-T1-2: dashboard/config.js stays strictly local on localhost/127.0.0.1 and configures Coolify URL only on non-local host', () => {
    const configCode = fs.readFileSync(path.join(DASH_DIR, 'config.js'), 'utf8');

    const localCtx = { window: { location: { hostname: 'localhost', protocol: 'http:' } } };
    vm.runInNewContext(configCode, localCtx);
    assert.equal(localCtx.window.ENTELSO_API_BASE, undefined);

    const prodCtx = { window: { location: { hostname: 'inventory.entelso.com', protocol: 'https:' } } };
    vm.runInNewContext(configCode, prodCtx);
    assert.match(prodCtx.window.ENTELSO_API_BASE, /^https:\/\//);

    const overrideCtx = {
      window: {
        ENTELSO_API_BASE: 'https://custom-api.entelso.com',
        location: { hostname: 'inventory.entelso.com', protocol: 'https:' },
      },
    };
    vm.runInNewContext(configCode, overrideCtx);
    assert.equal(overrideCtx.window.ENTELSO_API_BASE, 'https://custom-api.entelso.com');
  });

  it('F14-T1-1: i18n.js has 100% EN/ES key parity, 0 duplicate keys, defaults to EN, and persists ES across reload', async () => {
    const i18nSrc = fs.readFileSync(path.join(DASH_DIR, 'i18n.js'), 'utf8');
    // Check zero duplicate keys in EN and ES blocks via regex key scan
    const enBlock = i18nSrc.slice(i18nSrc.indexOf('en: {'), i18nSrc.indexOf('es: {'));
    const esBlock = i18nSrc.slice(i18nSrc.indexOf('es: {'), i18nSrc.indexOf('/* ── i18n Engine'));
    const extractKeys = (block) => [...block.matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]);
    const enKeys = extractKeys(enBlock);
    const esKeys = extractKeys(esBlock);

    assert.equal(enKeys.length, new Set(enKeys).size, 'Duplicate keys found in en');
    assert.equal(esKeys.length, new Set(esKeys).size, 'Duplicate keys found in es');
    assert.deepEqual([...enKeys].sort(), [...esKeys].sort(), 'EN/ES key mismatch');
    assert.ok(enKeys.length >= 530);

    // Check all data-i18n* attributes in index.html exist in i18n
    const html = fs.readFileSync(path.join(DASH_DIR, 'index.html'), 'utf8');
    const enSet = new Set(enKeys);
    for (const m of html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) {
      assert.ok(enSet.has(m[1]), `Missing HTML i18n key: ${m[1]}`);
    }

    // Check default EN and persistence of ES across reload
    let sb = await createDashboardSandbox({ dashboardUrl: srv.url, apiUrl: 'http://127.0.0.1:3001' });
    try {
      assert.equal(sb.window.i18n.getLang(), 'en');
      sb.window.i18n.setLang('es');
      assert.equal(sb.window.i18n.getLang(), 'es');
      sb = await sb.reload();
      assert.equal(sb.window.i18n.getLang(), 'es');
    } finally {
      sb.close();
    }
  });

  it('F15-T1-1: Conservative naming contract preserves all 8 tables, canonical columns, routes, and 8 env vars', () => {
    const initSql = fs.readFileSync(path.join(REPO_ROOT, 'init.sql'), 'utf8');
    for (const tbl of ['usuarios', 'ubicaciones', 'items', 'activos', 'movimientos', 'mantenimientos', 'audit_logs', 'teams']) {
      assert.match(initSql, new RegExp(`CREATE TABLE\\s+${tbl}\\b`, 'i'), `Missing table ${tbl}`);
    }
    for (const col of ['numero_serie', 'original_serial', 'categoria_padre', 'telefono_whatsapp', 'default_zona', 'pin_hash', 'parent_activo_id', 'cantidad', 'activo', 'rol', 'team', 'estado', 'fotos', 'notas', 'meta']) {
      assert.match(initSql, new RegExp(`\\b${col}\\b`), `Missing column ${col}`);
    }
    const appJs = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'src', 'app.js'), 'utf8');
    for (const route of ['/health', '/api/auth', '/api/ingest', '/api/alertas', '/api/activos', '/api/items', '/api/movimientos', '/api/usuarios', '/api/ubicaciones', '/api/mantenimientos', '/api/upload', '/api/audit', '/api/whatsapp', '/api/teams']) {
      assert.ok(appJs.includes(`'${route}'`), `Missing route mount ${route}`);
    }
    const envJs = fs.readFileSync(path.join(REPO_ROOT, 'backend', 'src', 'config', 'environment.js'), 'utf8');
    for (const v of ['PORT', 'NODE_ENV', 'DATABASE_URL', 'API_KEY', 'JWT_SECRET', 'CORS_ORIGIN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
      assert.match(envJs, new RegExp(`\\b${v}:`), `Missing env var ${v}`);
    }
  });

  it('F15-T1-2: entelso-inventory/README.md exists, explains setup & startup clearly, and has zero placeholder notes', () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    assert.ok(readme.length > 500, 'README.md too short');
    assert.ok(!readme.includes('Milestone M4'), 'Placeholder M4 note must be removed');
    assert.match(readme, /npm start/);
    assert.match(readme, /docker compose/);
    assert.match(readme, /\.env\.example/);
    assert.match(readme, /\/health/);
    assert.match(readme, /Coolify/i);
  });
});
