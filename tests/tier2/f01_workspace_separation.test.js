'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(__dirname, '../..');
const HARNESS_DIR = path.join(REPO_ROOT, 'tests', 'harness');

const { startDashboardServer } = require(path.join(HARNESS_DIR, 'dashboard_server'));

function walkEntries(dir, { excludeDirs = new Set(['node_modules']) } = {}) {
  const files = [];
  const dirs = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      dirs.push(full);
      const sub = walkEntries(full, { excludeDirs });
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }
  return { files, dirs };
}

describe('F1 Tier 2: Workspace Separation Boundaries & Negative Checks', () => {
  it('F1-T2-01: Zero *.append files exist anywhere inside entelso-inventory/', () => {
    const { files } = walkEntries(REPO_ROOT);
    const appendFiles = files.filter((f) => f.endsWith('.append'));
    assert.deepEqual(appendFiles, []);
  });

  it('F1-T2-02: Zero loose scripts, SQL dumps, spreadsheets, or archives in entelso-inventory/ or backend/ root', () => {
    const badExt = new Set(['.js', '.sql', '.xlsx', '.xls', '.csv', '.zip', '.json']);
    for (const root of [REPO_ROOT, path.join(REPO_ROOT, 'backend')]) {
      const allowedJson = new Set(['package.json', 'package-lock.json']);
      const entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile());
      for (const e of entries) {
        const ext = path.extname(e.name).toLowerCase();
        if (e.name === 'init.sql' && root === REPO_ROOT) continue;
        if (ext === '.json' && root.endsWith('backend') && allowedJson.has(e.name)) continue;
        assert.ok(!badExt.has(ext), `Unexpected loose file in ${root}: ${e.name}`);
      }
    }
  });

  it('F1-T2-03: Zero backup, scratch, review, n8n, or legacy directories inside entelso-inventory/', () => {
    const forbiddenDirs = new Set([
      'backups',
      'scratch',
      'revisar',
      'n8n',
      'Entelso Logo Png',
      'legacy_.agents',
      '_archive_backups',
      '_real_data',
      '_scripts_and_n8n',
      '_reports_and_review',
    ]);
    const { dirs } = walkEntries(REPO_ROOT);
    const matches = dirs.filter((d) => forbiddenDirs.has(path.basename(d)));
    assert.deepEqual(matches, []);
  });

  it('F1-T2-04: Dashboard static server blocks path traversal and hidden/config files', async () => {
    const srv = await startDashboardServer();
    try {
      const probePaths = [
        '/../_archive_backups/.env',
        '/%2e%2e/_archive_backups/.env',
        '/.dockerignore',
        '/Dockerfile',
        '/nginx.conf',
        '/../backend/.env',
        '/..%5cbackend%5c.env',
      ];
      for (const p of probePaths) {
        const res = await fetch(`${srv.url}${p}`);
        const text = await res.text();
        assert.ok([400, 403, 404].includes(res.status), `Expected 400/403/404 for ${p}, got ${res.status}`);
        assert.ok(!text.includes('JWT_SECRET') && !text.includes('proxy_pass'), `Config leaked on ${p}`);
      }
    } finally {
      await srv.close();
    }
  });

  it('F1-T2-05: Active backend/src/ and dashboard/ contain zero references to external archive folders', () => {
    const forbiddenTokens = ['_archive_backups', '_real_data', '_scripts_and_n8n', '_reports_and_review'];
    const targets = [
      ...walkEntries(path.join(REPO_ROOT, 'backend', 'src')).files,
      ...walkEntries(path.join(REPO_ROOT, 'dashboard')).files,
    ].filter((f) => /\.(js|html|css|conf)$/i.test(f));

    for (const f of targets) {
      const content = fs.readFileSync(f, 'utf8');
      for (const tok of forbiddenTokens) {
        assert.ok(!content.includes(tok), `Forbidden external folder reference "${tok}" in ${f}`);
      }
    }
  });

  it('F1-T2-06: workspace root .git/ remains preserved and entelso-inventory/.git/ is allowed for standalone deploy', () => {
    const rootGitHead = path.join(WORKSPACE_ROOT, '.git', 'HEAD');
    assert.ok(fs.existsSync(rootGitHead), 'Expected .git/HEAD at workspace root');
    assert.ok(fs.readFileSync(rootGitHead, 'utf8').trim().length > 0);
    const repoGitDir = path.join(REPO_ROOT, '.git');
    if (fs.existsSync(repoGitDir)) {
      const repoGitHead = path.join(repoGitDir, 'HEAD');
      assert.ok(fs.existsSync(repoGitHead), 'Expected valid .git/HEAD inside entelso-inventory/');
      assert.ok(fs.readFileSync(repoGitHead, 'utf8').trim().length > 0);
    }
  });
});
