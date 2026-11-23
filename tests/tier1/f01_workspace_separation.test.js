'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');

const { startDashboardServer } = require(path.join(HARNESS_DIR, 'dashboard_server'));
const { startIsolatedEnv } = require(path.join(HARNESS_DIR, 'test_env'));

function walkFiles(dir, { excludeDirs = new Set() } = {}) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excludeDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, { excludeDirs }));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

describe('F1 Tier 1: Workspace Separation & Non-Deletion', () => {
  it('F1-T1-01: entelso-inventory/ contains the exact allowed top-level entries', () => {
    const entries = fs.readdirSync(REPO_ROOT).filter((name) => name !== '.git').sort();
    const expected = [
      '.env.example',
      '.gitignore',
      'README.md',
      'backend',
      'dashboard',
      'docker-compose.yml',
      'init.sql',
      'tests',
    ].sort();
    assert.deepEqual(entries, expected);
  });

  it('F1-T1-02: External grouped folders exist outside entelso-inventory with expected moved files', () => {
    const requiredPaths = [
      path.join(WORKSPACE_ROOT, '_archive_backups', '.env'),
      path.join(WORKSPACE_ROOT, '_archive_backups', 'backups', 'db_backup_2026-10-30.json'),
      path.join(WORKSPACE_ROOT, '_real_data', 'Calibration'),
      path.join(WORKSPACE_ROOT, '_real_data', 'Inventory'),
      path.join(WORKSPACE_ROOT, '_real_data', 'Proyecto subir fotos'),
      path.join(WORKSPACE_ROOT, '_scripts_and_n8n', 'items.controller.js.append'),
      path.join(WORKSPACE_ROOT, '_scripts_and_n8n', 'n8n'),
      path.join(WORKSPACE_ROOT, '_reports_and_review', 'audit_report.md'),
      path.join(WORKSPACE_ROOT, '_reports_and_review', 'revisar'),
    ];
    for (const p of requiredPaths) {
      assert.ok(fs.existsSync(p), `Missing expected external path: ${p}`);
    }

    const n8nJson = fs.readdirSync(path.join(WORKSPACE_ROOT, '_scripts_and_n8n', 'n8n')).filter((f) => f.endsWith('.json'));
    assert.ok(n8nJson.length >= 1, 'Expected moved n8n JSON files in _scripts_and_n8n/n8n');

    const revisarXlsx = fs.readdirSync(path.join(WORKSPACE_ROOT, '_reports_and_review', 'revisar')).filter((f) => f.endsWith('.xlsx'));
    assert.ok(revisarXlsx.length >= 2, 'Expected moved .xlsx files in _reports_and_review/revisar');
  });

  it('F1-T1-03: All local src/href asset references in dashboard HTML pages resolve inside dashboard/ with HTTP 200', async () => {
    const dashDir = path.join(REPO_ROOT, 'dashboard');
    const htmlFiles = [
      'index.html',
      'manual.html',
      'video_dashboard.html',
      'video_whatsapp.html',
    ];

    const localRefs = new Set();
    const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    for (const relHtml of htmlFiles) {
      const content = fs.readFileSync(path.join(dashDir, relHtml), 'utf8');
      let m;
      while ((m = attrRe.exec(content)) !== null) {
        const ref = m[1].trim();
        if (
          !ref ||
          ref.startsWith('http://') ||
          ref.startsWith('https://') ||
          ref.startsWith('data:') ||
          ref.startsWith('#') ||
          ref.startsWith('mailto:') ||
          ref.startsWith('javascript:')
        ) {
          continue;
        }
        const cleanRef = ref.split('?')[0].split('#')[0].replace(/^\/+/, '');
        if (cleanRef) localRefs.add(cleanRef);
      }
    }

    // Also ensure redirect stubs exist
    for (const stub of ['manual/index.html', 'video_dashboard/index.html', 'video_whatsapp/index.html']) {
      assert.ok(fs.existsSync(path.join(dashDir, stub)), `Missing redirect stub: ${stub}`);
      localRefs.add(stub);
    }

    assert.ok(localRefs.has('LOGOTYPE-BLUE.png'));
    assert.ok(localRefs.has('Entelso_Enterprise_Operations_Manual.pdf'));
    assert.ok(localRefs.has('script.js'));
    assert.ok(localRefs.has('i18n.js'));
    assert.ok(localRefs.has('style.css'));

    const srv = await startDashboardServer();
    try {
      for (const ref of localRefs) {
        const diskPath = path.join(dashDir, ref);
        assert.ok(fs.existsSync(diskPath), `Referenced dashboard asset missing on disk: ${ref}`);
        const res = await fetch(`${srv.url}/${ref}`);
        assert.equal(res.status, 200, `Expected HTTP 200 for /${ref}, got ${res.status}`);
        await res.arrayBuffer();
      }
    } finally {
      await srv.close();
    }
  });

  it('F1-T1-04: All relative require(...) imports in backend/src/**/*.js resolve inside backend/src/', () => {
    const srcDir = path.join(REPO_ROOT, 'backend', 'src');
    const jsFiles = walkFiles(srcDir).filter((f) => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'Expected backend/src/*.js files');

    const reqRe = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
    for (const file of jsFiles) {
      const text = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = reqRe.exec(text)) !== null) {
        const rel = m[1];
        const base = path.resolve(path.dirname(file), rel);
        const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
        const resolved = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
        assert.ok(resolved, `Unresolved relative require('${rel}') in ${path.relative(REPO_ROOT, file)}`);
        const relToSrc = path.relative(srcDir, resolved);
        assert.ok(!relToSrc.startsWith('..') && !path.isAbsolute(relToSrc), `Import escaped backend/src/: ${resolved}`);
      }
    }
  });

  it('F1-T1-05: Unused dashboard duplicates reside in _archive_backups/unused_dashboard/ and are absent from dashboard/', () => {
    const unusedDir = path.join(WORKSPACE_ROOT, '_archive_backups', 'unused_dashboard');
    const dashDir = path.join(REPO_ROOT, 'dashboard');
    const archivedItems = [
      'Entelso_Operations_Manual.pdf',
      'logo-white.png',
      'video_demo.html',
      'video_demo',
      path.join('images', 'entelso_workflow_demo.gif'),
      path.join('images', 'view_alertas.png'),
      path.join('images', 'view_import.png'),
      path.join('images', 'view_inventory.png'),
      path.join('images', 'view_kpi.png'),
      path.join('images', 'view_mantenimiento.png'),
      path.join('images', 'view_teams.png'),
      path.join('images', 'view_zonas.png'),
    ];
    for (const item of archivedItems) {
      assert.ok(fs.existsSync(path.join(unusedDir, item)), `Expected archived unused asset: ${item}`);
      assert.ok(!fs.existsSync(path.join(dashDir, item)), `Unused duplicate should not exist in dashboard/: ${item}`);
    }
  });

  it('F1-T1-06: Backend in entelso-inventory boots autonomously and responds UP on /health', async () => {
    const env = await startIsolatedEnv();
    try {
      const res = await fetch(`${env.apiUrl}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'UP');
    } finally {
      await env.close();
    }
  });
});
