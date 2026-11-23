'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '../..');
const { startDashboardServer } = require('../harness/dashboard_server');
const { createDashboardSandbox } = require('../harness/dom_sandbox');

describe('Tier 2 — F13, F14 & F15: Dashboard XSS Safety, i18n Quality & Natural README Negative Checks', () => {
  let srv;

  before(async () => {
    srv = await startDashboardServer();
  });

  after(async () => {
    if (srv) await srv.close();
  });

  it('F13-T2-1: escapeHTML and safeUrl neutralize XSS vectors and javascript:/data:text/html URLs', async () => {
    const sb = await createDashboardSandbox({ dashboardUrl: srv.url, apiUrl: 'http://127.0.0.1:3001' });
    try {
      const escaped = sb.window.escapeHTML('<img src=x onerror="alert(1)"> & \'test\'');
      assert.ok(!escaped.includes('<img'));
      assert.ok(escaped.includes('&lt;img') && escaped.includes('&amp;') && escaped.includes('&#39;'));
      assert.equal(sb.window.escapeHTML(null), '');
      assert.equal(sb.window.escapeHTML(0), '0');

      assert.equal(sb.window.safeUrl('javascript:alert(1)'), '');
      assert.equal(sb.window.safeUrl('data:text/html,<script>alert(1)</script>'), '');
      assert.equal(sb.window.safeUrl('//evil.example/x.png'), '');
      assert.equal(sb.window.safeUrl('https://cdn.entelso.com/pic.png'), 'https://cdn.entelso.com/pic.png');
    } finally {
      sb.close();
    }
  });

  it('F13-T2-2: buildAssetQrDataUri escapes XML special characters in long serial labels without breaking SVG', async () => {
    const sb = await createDashboardSandbox({ dashboardUrl: srv.url, apiUrl: 'http://127.0.0.1:3001' });
    try {
      const uri = sb.window.buildAssetQrDataUri('1234567890123456&<>"\'');
      const svg = decodeURIComponent(uri.slice('data:image/svg+xml;charset=utf-8,'.length));
      assert.ok(!svg.includes('<>"'), 'Raw XML chars leaked into SVG');
      assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(svg), 'Unescaped ampersand found in SVG');
    } finally {
      sb.close();
    }
  });

  it('F14-T2-1: i18n Spanish block contains zero leftover "Team" strings and unknown keys return key safely', async () => {
    const sb = await createDashboardSandbox({ dashboardUrl: srv.url, apiUrl: 'http://127.0.0.1:3001' });
    try {
      sb.window.i18n.setLang('es');
      assert.equal(sb.window.i18n.has('nonexistent.key.xyz'), false);
      assert.equal(sb.window.i18n.t('nonexistent.key.xyz'), 'nonexistent.key.xyz');
      const i18nSrc = fs.readFileSync(path.join(REPO_ROOT, 'dashboard', 'i18n.js'), 'utf8');
      const esBlock = i18nSrc.slice(i18nSrc.indexOf('es: {'), i18nSrc.indexOf('/* ── i18n Engine'));
      const values = [...esBlock.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
      for (const val of values) {
        assert.ok(!/\bTeam\b/.test(val), `Untranslated English "Team" found in ES i18n value: ${val}`);
      }
    } finally {
      sb.close();
    }
  });

  it('F15-T2-1: README.md contains zero AI buzzword clichés and zero leaked credentials', () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const aiCliches = [
      /\brobusto\b/i,
      /\bintegral\b/i,
      /\becosistema\b/i,
      /\bsin fisuras\b/i,
      /\bvanguardia\b/i,
      /\bimpulsar\b/i,
      /\bpotente\b/i,
      /\bde punta a punta\b/i,
      /\bBienvenido a\b/i,
    ];
    for (const re of aiCliches) {
      assert.ok(!re.test(readme), `AI cliché matched in README.md: ${re}`);
    }
    const secrets = ['eyJhbGciOi'];
    const envPath = path.join(REPO_ROOT, 'backend', '.env');
    if (fs.existsSync(envPath)) {
      const envTxt = fs.readFileSync(envPath, 'utf8');
      for (const line of envTxt.split(/\r?\n/)) {
        const m = line.match(/^\s*(DATABASE_URL|API_KEY|JWT_SECRET|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|SUPABASE_URL)\s*=\s*(.+)\s*$/);
        if (m) {
          const val = m[2].replace(/^['"]|['"]$/g, '').trim();
          if (val.length >= 10) secrets.push(val);
        }
      }
    }
    for (const secret of secrets) {
      assert.ok(!readme.includes(secret), 'Secret leaked in README.md');
    }
  });
});
