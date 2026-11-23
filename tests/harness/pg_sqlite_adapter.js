'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const OID = {
  BOOL: 16,
  INT8: 20,
  INT4: 23,
  TEXT: 25,
  FLOAT8: 701,
  JSON: 114,
  VARCHAR: 1043,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  JSONB: 3802,
};

function oidTypeSize(oid) {
  switch (oid) {
    case OID.BOOL:
      return 1;
    case OID.INT4:
      return 4;
    case OID.INT8:
    case OID.FLOAT8:
    case OID.TIMESTAMP:
    case OID.TIMESTAMPTZ:
      return 8;
    case OID.DATE:
      return 4;
    default:
      return -1;
  }
}

function pgTypeToOid(pgType) {
  if (!pgType) return OID.TEXT;
  const t = String(pgType).toLowerCase().trim();
  if (t === 'boolean' || t === 'bool') return OID.BOOL;
  if (t === 'bigint' || t === 'int8' || t === 'bigserial') return OID.INT8;
  if (t === 'integer' || t === 'int' || t === 'int4' || t === 'serial' || t === 'smallint' || t === 'int2') return OID.INT4;
  if (t === 'float' || t === 'float8' || t === 'real' || t === 'double precision' || t === 'double') return OID.FLOAT8;
  if (t === 'numeric' || t === 'decimal') return OID.NUMERIC;
  if (t === 'date') return OID.DATE;
  if (t === 'timestamp' || t === 'timestamp without time zone') return OID.TIMESTAMP;
  if (t === 'timestamptz' || t === 'timestamp with time zone') return OID.TIMESTAMPTZ;
  if (t === 'jsonb') return OID.JSONB;
  if (t === 'json') return OID.JSON;
  return OID.TEXT;
}

function makePgError(code, message, detail = null) {
  const err = new Error(message);
  err.severity = 'ERROR';
  err.code = code;
  if (detail) err.detail = detail;
  return err;
}

function mapSqliteError(err) {
  if (err && err.code && err.severity) return err;
  const msg = String(err && err.message ? err.message : err);
  const codeNum = err && typeof err.errcode === 'number' ? err.errcode : null;

  if (codeNum === 2067 || codeNum === 1555 || /UNIQUE constraint failed/i.test(msg)) {
    return makePgError('23505', 'duplicate key value violates unique constraint', msg);
  }
  if (codeNum === 787 || /FOREIGN KEY constraint failed/i.test(msg)) {
    return makePgError('23503', 'insert or update on table violates foreign key constraint', msg);
  }
  if (codeNum === 275 || /CHECK constraint failed/i.test(msg)) {
    return makePgError('23514', 'new row violates check constraint', msg);
  }
  if (codeNum === 1299 || /NOT NULL constraint failed/i.test(msg)) {
    return makePgError('23502', 'null value in column violates not-null constraint', msg);
  }
  if (/no such table/i.test(msg)) {
    return makePgError('42P01', msg);
  }
  if (/no such column/i.test(msg) || /has no column named/i.test(msg)) {
    return makePgError('42703', msg);
  }
  if (/duplicate column name/i.test(msg)) {
    return makePgError('42701', msg);
  }
  return makePgError('42601', msg);
}

/**
 * Splits a SQL string into top-level statements, respecting single-quoted strings,
 * double-quoted identifiers, dollar-quoted strings, and SQL comments.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    // Single-line comment -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment /* ... */ (supports nesting)
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    // Single-quoted string '...'
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Double-quoted identifier "..."
    if (ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Dollar-quoted string $tag$...$tag$
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[0];
        const endIdx = sql.indexOf(tag, i + tag.length);
        if (endIdx !== -1) {
          i = endIdx + tag.length;
          continue;
        }
      }
    }

    if (ch === ';') {
      const piece = sql.slice(start, i);
      if (stripSqlComments(piece).trim().length > 0) {
        statements.push(piece.trim());
      }
      start = i + 1;
    }
    i++;
  }

  const tail = sql.slice(start);
  if (stripSqlComments(tail).trim().length > 0) {
    statements.push(tail.trim());
  }
  return statements;
}

function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += ' ';
      continue;
    }
    if (ch === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      out += sql.slice(start, i);
      continue;
    }
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      out += sql.slice(start, i);
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Splits a SQL segment into tokens preserving string literals and quoted identifiers.
 */
function tokenizeSql(sql) {
  const tokens = [];
  let i = 0;
  const n = sql.length;
  let codeStart = 0;

  while (i < n) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      if (i > codeStart) tokens.push({ type: 'code', text: sql.slice(codeStart, i) });
      const s = i;
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      tokens.push({ type: 'comment', text: sql.slice(s, i) });
      codeStart = i;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      if (i > codeStart) tokens.push({ type: 'code', text: sql.slice(codeStart, i) });
      const s = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'comment', text: sql.slice(s, i) });
      codeStart = i;
      continue;
    }
    if (ch === "'") {
      if (i > codeStart) tokens.push({ type: 'code', text: sql.slice(codeStart, i) });
      const s = i;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'string', text: sql.slice(s, i) });
      codeStart = i;
      continue;
    }
    if (ch === '"') {
      if (i > codeStart) tokens.push({ type: 'code', text: sql.slice(codeStart, i) });
      const s = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      tokens.push({ type: 'ident', text: sql.slice(s, i) });
      codeStart = i;
      continue;
    }
    i++;
  }
  if (codeStart < n) {
    tokens.push({ type: 'code', text: sql.slice(codeStart) });
  }
  return tokens;
}

function createTokenPrefix(sql) {
  let prefix = '__PGTOK_';
  while (sql.includes(prefix)) {
    prefix += '_';
  }
  return prefix;
}

function maskTokens(sql, maskTypes) {
  const tokens = tokenizeSql(sql);
  const prefix = createTokenPrefix(sql);
  const saved = [];
  let masked = '';
  for (const t of tokens) {
    if (maskTypes.has(t.type)) {
      const idx = saved.length;
      saved.push(t);
      masked += `${prefix}${idx}__`;
    } else {
      masked += t.text;
    }
  }
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenRe = new RegExp(`${escapedPrefix}(\\d+)__`, 'g');
  const restore = (str) => str.replace(tokenRe, (_m, idxStr) => saved[Number(idxStr)].text);
  return { masked, saved, prefix, escapedPrefix, tokenRe, restore, tokens };
}

function unquoteSqlString(lit) {
  if (typeof lit !== 'string' || lit.length < 2) return lit;
  return lit.slice(1, -1).replace(/''/g, "'");
}

function splitTopLevelCommas(str) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let i = 0;
  const n = str.length;
  while (i < n) {
    const ch = str[i];
    if (ch === "'") {
      i++;
      while (i < n) {
        if (str[i] === "'" && str[i + 1] === "'") i += 2;
        else if (str[i] === "'") { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < n) {
        if (str[i] === '"' && str[i + 1] === '"') i += 2;
        else if (str[i] === '"') { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  const last = str.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function findMatchingParen(str, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = str.length;
  while (i < n) {
    const ch = str[i];
    if (ch === "'") {
      i++;
      while (i < n) {
        if (str[i] === "'" && str[i + 1] === "'") i += 2;
        else if (str[i] === "'") { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < n) {
        if (str[i] === '"' && str[i + 1] === '"') i += 2;
        else if (str[i] === '"') { i++; break; }
        else i++;
      }
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function parsePgArrayLiteral(val, elemTypeHint) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) {
    return coerceArrayElements(val, elemTypeHint);
  }
  const s = String(val).trim();
  if (!s.startsWith('{') || !s.endsWith('}')) {
    return coerceArrayElements([val], elemTypeHint);
  }
  const inner = s.slice(1, -1).trim();
  if (inner === '') return [];

  const items = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && inner[i] === ' ') i++;
    if (i >= inner.length) break;
    if (inner[i] === '"') {
      i++;
      let buf = '';
      while (i < inner.length) {
        if (inner[i] === '\\' && i + 1 < inner.length) {
          buf += inner[i + 1];
          i += 2;
        } else if (inner[i] === '"') {
          i++;
          break;
        } else {
          buf += inner[i++];
        }
      }
      items.push(buf);
      while (i < inner.length && inner[i] !== ',') i++;
      if (inner[i] === ',') i++;
    } else {
      let end = inner.indexOf(',', i);
      if (end === -1) end = inner.length;
      const raw = inner.slice(i, end).trim();
      items.push(raw.toUpperCase() === 'NULL' ? null : raw);
      i = end + 1;
    }
  }
  return coerceArrayElements(items, elemTypeHint);
}

function coerceArrayElements(items, elemTypeHint) {
  const hint = String(elemTypeHint || '').toLowerCase();
  const isInt = /^(int|int2|int4|int8|integer|bigint|smallint|serial)/.test(hint);
  const isFloat = /^(float|float4|float8|real|double|numeric|decimal)/.test(hint);
  return items.map((el) => {
    if (el === null || el === undefined) return null;
    if (isInt) {
      const n = Number(el);
      return Number.isFinite(n) ? Math.trunc(n) : el;
    }
    if (isFloat) {
      const n = Number(el);
      return Number.isFinite(n) ? n : el;
    }
    return el;
  });
}

function normalizeParamForSqlite(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  if (val instanceof Date) {
    return val.toISOString().replace('T', ' ').replace('Z', '+00');
  }
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    return new Uint8Array(val);
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

function normalizeBoolWireValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val ? 1 : 0;
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'on') return 1;
  if (s === 'false' || s === 'f' || s === '0' || s === 'no' || s === 'off') return 0;
  return val;
}

class PgSqliteAdapter {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(os.tmpdir(), `entelso_e2e_${crypto.randomUUID()}.db`);
    this.enums = new Map(); // enumName (lower) -> Set<string>
    this.tableCols = new Map(); // tableName (lower) -> Map<colName (lower), pgType>
    this.viewCols = new Map(); // viewName (lower) -> Map<colName (lower), pgType>
    this.sessions = new Set();
    this._writeLockHolder = null;
    this._writeWaiters = [];
    this.closed = false;
  }

  acquireWriteLock(session) {
    if (this.closed) {
      return Promise.reject(makePgError('57P01', 'database adapter is closed'));
    }
    if (this._writeLockHolder === session) {
      return Promise.resolve();
    }
    if (this._writeLockHolder === null) {
      this._writeLockHolder = session;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._writeWaiters.push({ session, resolve });
    });
  }

  releaseWriteLock(session) {
    if (this._writeLockHolder !== session) {
      return;
    }
    this._writeLockHolder = null;
    while (this._writeWaiters.length > 0) {
      const next = this._writeWaiters.shift();
      if (this.closed || next.session.closed) {
        next.resolve();
        continue;
      }
      this._writeLockHolder = next.session;
      next.resolve();
      break;
    }
  }

  _cancelWriteWaiter(session) {
    if (this._writeWaiters.length === 0) return;
    const remaining = [];
    for (const w of this._writeWaiters) {
      if (w.session === session) {
        w.resolve();
      } else {
        remaining.push(w);
      }
    }
    this._writeWaiters = remaining;
  }

  openSession() {
    if (this.closed) {
      throw new Error('PgSqliteAdapter is already closed');
    }
    const db = new DatabaseSync(this.dbPath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this._registerUdfs(db);
    const session = new AdapterSession(this, db);
    this.sessions.add(session);
    return session;
  }

  _registerUdfs(db) {
    db.function('__pg_enum', { deterministic: false }, (typeName, val) => {
      if (val === null || val === undefined) return 1;
      const set = this.enums.get(String(typeName).toLowerCase());
      if (!set) return 0;
      return set.has(String(val)) ? 1 : 0;
    });

    db.function('lower', { deterministic: true }, (s) => {
      if (s === null || s === undefined) return null;
      return String(s).toLowerCase();
    });

    db.function('upper', { deterministic: true }, (s) => {
      if (s === null || s === undefined) return null;
      return String(s).toUpperCase();
    });

    db.function('regexp_replace', { deterministic: true }, (str, pattern, replacement, flags) => {
      if (str === null || str === undefined) return null;
      const f = flags ? String(flags) : '';
      const re = new RegExp(String(pattern), f);
      return String(str).replace(re, replacement == null ? '' : String(replacement));
    });

    db.function('jsonb_array_length', { deterministic: true }, (val) => {
      if (val === null || val === undefined) return null;
      try {
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    });

    db.function('__pg_jsonb_concat', { deterministic: true }, (a, b) => {
      if (a === null || a === undefined) a = '[]';
      if (b === null || b === undefined) return typeof a === 'string' ? a : JSON.stringify(a);
      try {
        const pa = typeof a === 'string' ? JSON.parse(a) : a;
        const pb = typeof b === 'string' ? JSON.parse(b) : b;
        if (Array.isArray(pa) && Array.isArray(pb)) {
          return JSON.stringify([...pa, ...pb]);
        }
        if (Array.isArray(pa)) {
          return JSON.stringify([...pa, pb]);
        }
        if (pa && typeof pa === 'object' && pb && typeof pb === 'object') {
          return JSON.stringify({ ...pa, ...pb });
        }
        return JSON.stringify([pa, pb]);
      } catch {
        return String(a) + String(b);
      }
    });
  }

  loadInitSql(sqlText) {
    const session = this.openSession();
    try {
      const statements = splitSqlStatements(sqlText);
      for (const stmt of statements) {
        session.execute(stmt, []);
      }
    } finally {
      session.close();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._writeLockHolder = null;
    while (this._writeWaiters.length > 0) {
      const w = this._writeWaiters.shift();
      w.resolve();
    }
    for (const s of [...this.sessions]) {
      try {
        s.close();
      } catch {
        // ignore close errors
      }
    }
    this.sessions.clear();
    if (this.dbPath !== ':memory:') {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(this.dbPath + suffix);
        } catch {
          // ignore if absent
        }
      }
    }
  }
}

function getWithMainCommand(sql) {
  let i = 0;
  const n = sql.length;
  // Skip "WITH [RECURSIVE]"
  const head = sql.match(/^\s*WITH\s+(?:RECURSIVE\s+)?/i);
  if (!head) return 'SELECT';
  i = head[0].length;

  while (i < n) {
    while (i < n && /\s/.test(sql[i])) i++;
    // Read CTE name
    const nameM = sql.slice(i).match(/^(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*/);
    if (!nameM) break;
    i += nameM[0].length;
    // Optional column list (...)
    if (sql[i] === '(') {
      const endCol = findMatchingParen(sql, i);
      if (endCol === -1) break;
      i = endCol + 1;
      while (i < n && /\s/.test(sql[i])) i++;
    }
    // Expect AS (...)
    const asM = sql.slice(i).match(/^AS\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?/i);
    if (!asM) break;
    i += asM[0].length;
    if (sql[i] !== '(') break;
    const endCte = findMatchingParen(sql, i);
    if (endCte === -1) break;
    i = endCte + 1;
    while (i < n && /\s/.test(sql[i])) i++;
    if (sql[i] === ',') {
      i++;
      continue;
    }
    break;
  }

  const rest = sql.slice(i).trim();
  const cmdM = rest.match(/^([A-Za-z]+)/);
  return cmdM ? cmdM[1].toUpperCase() : 'SELECT';
}

class AdapterSession {
  constructor(adapter, db) {
    this.adapter = adapter;
    this.db = db;
    this.txState = 'I'; // 'I' = idle, 'T' = in transaction, 'E' = aborted transaction
    this.closed = false;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.adapter.sessions.delete(this);
    this.adapter._cancelWriteWaiter(this);
    try {
      if (this.txState !== 'I') {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // ignore
        }
        this.txState = 'I';
      }
      this.db.close();
    } catch {
      // ignore
    } finally {
      this.adapter.releaseWriteLock(this);
    }
  }

  _needsWriteLock(cleaned) {
    if (!cleaned) return false;
    if (/^(BEGIN(\s+(TRANSACTION|WORK|ISOLATION\b.*))?|START\s+TRANSACTION)$/i.test(cleaned)) {
      return this.txState === 'I';
    }
    if (/^(COMMIT(\s+(TRANSACTION|WORK))?|END(\s+(TRANSACTION|WORK))?|ROLLBACK(\s+(TRANSACTION|WORK))?)$/i.test(cleaned)) {
      return false;
    }
    if (this.txState !== 'I') {
      return false;
    }
    const cmdMatch = cleaned.match(/^([A-Za-z]+)/);
    const firstWord = cmdMatch ? cmdMatch[1].toUpperCase() : 'SELECT';
    if (
      firstWord === 'SELECT' ||
      firstWord === 'VALUES' ||
      firstWord === 'PRAGMA' ||
      firstWord === 'SET' ||
      firstWord === 'RESET' ||
      firstWord === 'DISCARD' ||
      firstWord === 'SHOW' ||
      firstWord === 'EXPLAIN'
    ) {
      return false;
    }
    if (firstWord === 'WITH') {
      const mainCmd = getWithMainCommand(cleaned);
      return mainCmd !== 'SELECT' && mainCmd !== 'VALUES';
    }
    return true;
  }

  async executeAsync(sql, rawParams = [], paramOids = []) {
    if (this.closed) {
      throw makePgError('57P01', 'terminating connection');
    }
    const cleaned = stripSqlComments(sql).trim();
    if (!cleaned) {
      return { command: 'EMPTY', rowCount: 0, fields: [], rows: [] };
    }

    const needsLock = this._needsWriteLock(cleaned);
    if (needsLock) {
      await this.adapter.acquireWriteLock(this);
      if (this.closed || this.adapter.closed) {
        this.adapter.releaseWriteLock(this);
        throw makePgError('57P01', 'terminating connection');
      }
    }

    try {
      return this.execute(sql, rawParams, paramOids);
    } finally {
      if (this.txState === 'I' && this.adapter._writeLockHolder === this) {
        this.adapter.releaseWriteLock(this);
      }
    }
  }

  execute(sql, rawParams = [], paramOids = []) {
    const cleaned = stripSqlComments(sql).trim();
    if (!cleaned) {
      return { command: 'EMPTY', rowCount: 0, fields: [], rows: [] };
    }

    const upper = cleaned.toUpperCase();

    // Transaction control statements
    if (/^(BEGIN(\s+(TRANSACTION|WORK|ISOLATION\b.*))?|START\s+TRANSACTION)$/i.test(cleaned)) {
      if (this.txState === 'E') {
        throw makePgError('25P02', 'current transaction is aborted, commands ignored until end of transaction block');
      }
      if (this.txState === 'I') {
        this.db.exec('BEGIN');
        this.txState = 'T';
      }
      return { command: 'BEGIN', rowCount: null, fields: [], rows: [] };
    }

    if (/^(COMMIT(\s+(TRANSACTION|WORK))?|END(\s+(TRANSACTION|WORK))?)$/i.test(cleaned)) {
      if (this.txState === 'T') {
        try {
          this.db.exec('COMMIT');
          this.txState = 'I';
          return { command: 'COMMIT', rowCount: null, fields: [], rows: [] };
        } catch (err) {
          try {
            this.db.exec('ROLLBACK');
          } catch {
            // ignore
          }
          this.txState = 'I';
          throw mapSqliteError(err);
        }
      }
      if (this.txState === 'E') {
        this.db.exec('ROLLBACK');
        this.txState = 'I';
        return { command: 'ROLLBACK', rowCount: null, fields: [], rows: [] };
      }
      return { command: 'COMMIT', rowCount: null, fields: [], rows: [] };
    }

    if (/^ROLLBACK(\s+(TRANSACTION|WORK))?$/i.test(cleaned)) {
      if (this.txState === 'T' || this.txState === 'E') {
        this.db.exec('ROLLBACK');
        this.txState = 'I';
      }
      return { command: 'ROLLBACK', rowCount: null, fields: [], rows: [] };
    }

    if (this.txState === 'E') {
      throw makePgError('25P02', 'current transaction is aborted, commands ignored until end of transaction block');
    }

    try {
      return this._executeNormal(cleaned, upper, rawParams, paramOids);
    } catch (err) {
      const pgErr = mapSqliteError(err);
      if (this.txState === 'T') {
        this.txState = 'E';
      }
      throw pgErr;
    }
  }

  _executeNormal(sql, upper, rawParams, paramOids) {
    // Handle SET / RESET / DISCARD / SHOW session commands benignly
    if (/^SET\s+/i.test(sql) || /^RESET\s+/i.test(sql) || /^DISCARD\s+/i.test(sql)) {
      return { command: 'SET', rowCount: null, fields: [], rows: [] };
    }

    // DDL: DROP TYPE
    const dropTypeMatch = sql.match(/^DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:"?([A-Za-z_][A-Za-z0-9_]*)"?\s*)?(?:CASCADE|RESTRICT)?$/i);
    if (dropTypeMatch && dropTypeMatch[1]) {
      this.adapter.enums.delete(dropTypeMatch[1].toLowerCase());
      return { command: 'DROP', rowCount: null, fields: [], rows: [] };
    }

    // DDL: CREATE TYPE ... AS ENUM (...)
    const createTypeMatch = sql.match(/^CREATE\s+TYPE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+AS\s+ENUM\s*\(([\s\S]*)\)$/i);
    if (createTypeMatch) {
      const typeName = createTypeMatch[1].toLowerCase();
      const values = new Set();
      const parts = splitTopLevelCommas(createTypeMatch[2]);
      for (const p of parts) {
        const m = p.match(/^'((?:[^']|'')*)'$/);
        if (m) values.add(m[1].replace(/''/g, "'"));
      }
      this.adapter.enums.set(typeName, values);
      return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
    }

    // DDL: ALTER TYPE <name> ADD VALUE [IF NOT EXISTS] '<val>'
    const alterTypeMatch = sql.match(/^ALTER\s+TYPE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ADD\s+VALUE\s+(IF\s+NOT\s+EXISTS\s+)?'((?:[^']|'')*)'$/i);
    if (alterTypeMatch) {
      const typeName = alterTypeMatch[1].toLowerCase();
      const ifNotExists = Boolean(alterTypeMatch[2]);
      const newVal = alterTypeMatch[3].replace(/''/g, "'");
      const set = this.adapter.enums.get(typeName);
      if (!set) {
        throw makePgError('42704', `type "${alterTypeMatch[1]}" does not exist`);
      }
      if (set.has(newVal)) {
        if (!ifNotExists) {
          throw makePgError('42710', `enum label "${newVal}" already exists`);
        }
        return { command: 'ALTER', rowCount: null, fields: [], rows: [] };
      }
      set.add(newVal);
      return { command: 'ALTER', rowCount: null, fields: [], rows: [] };
    }

    // DDL: DROP VIEW / DROP TABLE
    const dropObjMatch = sql.match(/^DROP\s+(VIEW|TABLE)\s+(IF\s+EXISTS\s+)?(?:"?([A-Za-z_][A-Za-z0-9_]*)"?)(?:\s+(?:CASCADE|RESTRICT))?$/i);
    if (dropObjMatch) {
      const kind = dropObjMatch[1].toUpperCase();
      const ifExists = dropObjMatch[2] ? 'IF EXISTS ' : '';
      const name = dropObjMatch[3];
      if (kind === 'TABLE') this.adapter.tableCols.delete(name.toLowerCase());
      else this.adapter.viewCols.delete(name.toLowerCase());
      this.db.exec(`DROP ${kind} ${ifExists}"${name}"`);
      return { command: 'DROP', rowCount: null, fields: [], rows: [] };
    }

    // DDL: CREATE TABLE
    if (/^CREATE\s+TABLE\s+/i.test(sql)) {
      return this._executeCreateTable(sql);
    }

    // DDL: ALTER TABLE ... ADD [COLUMN] ...
    if (/^ALTER\s+TABLE\s+/i.test(sql)) {
      return this._executeAlterTable(sql);
    }

    // DDL: CREATE [OR REPLACE] VIEW
    if (/^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+/i.test(sql)) {
      return this._executeCreateView(sql);
    }

    // DDL: CREATE [UNIQUE] INDEX
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(sql)) {
      const idxSql = sql.replace(/\bCONCURRENTLY\b/gi, '');
      this.db.exec(idxSql);
      return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
    }

    // DML / DQL execution
    return this._executeDmlOrDql(sql, rawParams, paramOids);
  }

  _translateColumnDef(defStr, tableColsMap) {
    // Check if table-level constraint
    if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(defStr)) {
      return this._translateDmlSql(defStr, []).sql;
    }

    const colMatch = defStr.match(/^("?[A-Za-z_][A-Za-z0-9_]*"?)\s+([\s\S]+)$/);
    if (!colMatch) return defStr;

    const rawCol = colMatch[1];
    const colName = rawCol.replace(/^"|"$/g, '').toLowerCase();
    let rest = colMatch[2].trim();

    // Match data type at beginning of rest
    let sqliteType = 'TEXT';
    let pgType = 'text';
    let extraCheck = '';
    let remainder = '';

    const typePatterns = [
      { re: /^SERIAL\b/i, fn: () => { sqliteType = 'INTEGER'; pgType = 'integer'; } },
      { re: /^BIGSERIAL\b/i, fn: () => { sqliteType = 'INTEGER'; pgType = 'bigint'; } },
      { re: /^(?:INTEGER|INT4|INT)\b/i, fn: () => { sqliteType = 'INTEGER'; pgType = 'integer'; } },
      { re: /^(?:BIGINT|INT8)\b/i, fn: () => { sqliteType = 'INTEGER'; pgType = 'bigint'; } },
      { re: /^(?:SMALLINT|INT2)\b/i, fn: () => { sqliteType = 'INTEGER'; pgType = 'integer'; } },
      { re: /^(?:NUMERIC|DECIMAL)\s*(?:\([^)]+\))?/i, fn: () => { sqliteType = 'NUMERIC'; pgType = 'numeric'; } },
      { re: /^(?:DOUBLE\s+PRECISION|REAL|FLOAT8|FLOAT4|FLOAT)\b/i, fn: () => { sqliteType = 'REAL'; pgType = 'float'; } },
      { re: /^(?:CHARACTER\s+VARYING|VARCHAR|CHAR)\s*(?:\([^)]+\))?/i, fn: () => { sqliteType = 'TEXT'; pgType = 'text'; } },
      { re: /^TEXT\b/i, fn: () => { sqliteType = 'TEXT'; pgType = 'text'; } },
      { re: /^(?:BOOLEAN|BOOL)\b/i, fn: () => { sqliteType = 'BOOLEAN'; pgType = 'boolean'; } },
      { re: /^DATE\b/i, fn: () => { sqliteType = 'DATE'; pgType = 'date'; } },
      { re: /^TIMESTAMP(?:\s+WITH(?:OUT)?\s+TIME\s+ZONE)?\b|^TIMESTAMPTZ\b/i, fn: () => { sqliteType = 'TIMESTAMP'; pgType = 'timestamp'; } },
      { re: /^JSONB?\b/i, fn: () => { sqliteType = 'JSONB'; pgType = 'jsonb'; } },
    ];

    let matched = false;
    let isSerial = false;
    for (const tp of typePatterns) {
      const m = rest.match(tp.re);
      if (m) {
        tp.fn();
        isSerial = /^(SERIAL|BIGSERIAL)\b/i.test(m[0]);
        remainder = rest.slice(m[0].length).trim();
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Check enum types or fallback identifier
      const enumMatch = rest.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?/);
      if (enumMatch) {
        const typeName = enumMatch[1].toLowerCase();
        remainder = rest.slice(enumMatch[0].length).trim();
        if (this.adapter.enums.has(typeName)) {
          sqliteType = 'TEXT';
          pgType = `enum:${typeName}`;
          extraCheck = ` CHECK (${rawCol} IS NULL OR __pg_enum('${typeName}', ${rawCol}))`;
        } else {
          sqliteType = enumMatch[1];
          pgType = typeName;
        }
      }
    }

    tableColsMap.set(colName, pgType);

    if (isSerial && /^PRIMARY\s+KEY\b/i.test(remainder)) {
      remainder = remainder.replace(/^PRIMARY\s+KEY\b/i, 'PRIMARY KEY AUTOINCREMENT');
    }

    // Translate any defaults/casts in remainder (e.g., DEFAULT NOW(), '[]'::jsonb)
    if (remainder) {
      remainder = this._rewriteOutsideLiterals(remainder, (code) =>
        code.replace(/\bDEFAULT\s+NOW\s*\(\s*\)/gi, 'DEFAULT CURRENT_TIMESTAMP')
      );
      remainder = this._translateDmlSql(remainder, []).sql;
    }

    return `${rawCol} ${sqliteType}${extraCheck}${remainder ? ' ' + remainder : ''}`;
  }

  _executeCreateTable(sql) {
    const m = sql.match(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?([A-Za-z_][A-Za-z0-9_]*)"?)\s*\(([\s\S]*)\)$/i);
    if (!m) {
      this.db.exec(sql);
      return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
    }
    const ifNotExists = m[1] || '';
    const tableName = m[2];
    const body = m[3];
    const colsMap = new Map();
    const defs = splitTopLevelCommas(body).map((d) => this._translateColumnDef(d, colsMap));
    const translated = `CREATE TABLE ${ifNotExists}"${tableName}" (\n  ${defs.join(',\n  ')}\n)`;
    this.db.exec(translated);
    this.adapter.tableCols.set(tableName.toLowerCase(), colsMap);
    return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
  }

  _executeAlterTable(sql) {
    const addColMatch = sql.match(
      /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?([A-Za-z_][A-Za-z0-9_]*)"?)\s+ADD\s+(?:COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i
    );
    if (!addColMatch) {
      this.db.exec(sql);
      return { command: 'ALTER', rowCount: null, fields: [], rows: [] };
    }

    const tableName = addColMatch[1];
    const tableLower = tableName.toLowerCase();
    const ifNotExists = Boolean(addColMatch[2]);
    const colDef = addColMatch[3].trim();

    // Verify table exists in SQLite (do NOT auto-create missing tables)
    const exists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name)=?1`).get(tableLower);
    if (!exists) {
      throw makePgError('42P01', `relation "${tableName}" does not exist`);
    }

    const colNameMatch = colDef.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?\s+/);
    if (colNameMatch && ifNotExists) {
      const colLower = colNameMatch[1].toLowerCase();
      const info = this.db.prepare(`PRAGMA table_info("${exists.name}")`).all();
      if (info.some((c) => String(c.name).toLowerCase() === colLower)) {
        return { command: 'ALTER', rowCount: null, fields: [], rows: [] };
      }
    }

    let colsMap = this.adapter.tableCols.get(tableLower);
    if (!colsMap) {
      colsMap = new Map();
      this.adapter.tableCols.set(tableLower, colsMap);
    }

    const translatedDef = this._translateColumnDef(colDef, colsMap);
    this.db.exec(`ALTER TABLE "${exists.name}" ADD COLUMN ${translatedDef}`);
    return { command: 'ALTER', rowCount: null, fields: [], rows: [] };
  }

  _executeCreateView(sql) {
    const m = sql.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+AS\s+([\s\S]+)$/i);
    if (!m) {
      this.db.exec(sql);
      return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
    }
    const viewName = m[1];
    const selectSql = m[2];
    const { sql: translatedSelect, castHints } = this._translateDmlSql(selectSql, []);
    this.db.exec(`DROP VIEW IF EXISTS "${viewName}"`);
    this.db.exec(`CREATE VIEW "${viewName}" AS ${translatedSelect}`);

    // Record view column types in viewCols
    const viewColsMap = new Map();
    const probe = this.db.prepare(`SELECT * FROM "${viewName}" LIMIT 0`);
    const cols = probe.columns();
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const colName = String(c.name).toLowerCase();
      let pgType = null;
      if (c.table && c.column) {
        const tblMap = this.adapter.tableCols.get(String(c.table).toLowerCase());
        if (tblMap) pgType = tblMap.get(String(c.column).toLowerCase());
      }
      if (!pgType && c.type) {
        pgType = c.type.toLowerCase();
      }
      if (!pgType && castHints && castHints[i]) {
        pgType = castHints[i];
      }
      if (!pgType) {
        if (colName === 'dias_restantes' || colName.endsWith('_id')) pgType = 'integer';
        else if (colName.startsWith('fecha_')) pgType = 'date';
      }
      if (pgType) viewColsMap.set(colName, pgType);
    }
    this.adapter.viewCols.set(viewName.toLowerCase(), viewColsMap);
    return { command: 'CREATE', rowCount: null, fields: [], rows: [] };
  }

  /**
   * Determines which $N parameter indices bind to boolean columns based on SQL context.
   */
  _detectBooleanParams(sql, paramOids) {
    const boolParamIndices = new Set();
    if (Array.isArray(paramOids)) {
      for (let i = 0; i < paramOids.length; i++) {
        if (paramOids[i] === OID.BOOL) boolParamIndices.add(i + 1);
      }
    }

    const { masked: stripped } = maskTokens(sql, new Set(['comment', 'string']));
    const isBoolCol = (tblHint, colName) => {
      const c = colName.replace(/^"|"$/g, '').toLowerCase();
      if (tblHint) {
        const t = tblHint.replace(/^"|"$/g, '').toLowerCase();
        const m = this.adapter.tableCols.get(t) || this.adapter.viewCols.get(t);
        if (m && m.get(c) === 'boolean') return true;
      }
      for (const m of this.adapter.tableCols.values()) {
        if (m.get(c) === 'boolean') return true;
      }
      return false;
    };

    // INSERT INTO tbl (col1, col2, ...) VALUES ($1, $2, ...)
    const insMatch = stripped.match(/INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([^)]+)\)\s*VALUES\s*\(([^;]+?)\)(?:\s+ON\s+CONFLICT|\s+RETURNING|$)/i);
    if (insMatch) {
      const tbl = insMatch[1];
      const cols = splitTopLevelCommas(insMatch[2]).map((c) => c.replace(/^"|"$/g, '').trim());
      const vals = splitTopLevelCommas(insMatch[3]);
      for (let i = 0; i < Math.min(cols.length, vals.length); i++) {
        const pm = vals[i].trim().match(/^\$(\d+)(?:::bool(?:ean)?)?$/i);
        if (pm && isBoolCol(tbl, cols[i])) {
          boolParamIndices.add(Number(pm[1]));
        }
      }
    }

    // UPDATE tbl SET col = $n ...
    const updTblMatch = stripped.match(/UPDATE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+SET\s+/i);
    const updTbl = updTblMatch ? updTblMatch[1] : null;
    const assignRe = /(?:([A-Za-z_][A-Za-z0-9_]*)\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*(?:=|!=|<>)\s*\$(\d+)/g;
    let am;
    while ((am = assignRe.exec(stripped)) !== null) {
      const tblHint = am[1] || updTbl;
      if (isBoolCol(tblHint, am[2])) {
        boolParamIndices.add(Number(am[3]));
      }
    }

    // Explicit $n::bool / $n::boolean
    const castBoolRe = /\$(\d+)\s*::\s*bool(?:ean)?\b/gi;
    let cm;
    while ((cm = castBoolRe.exec(stripped)) !== null) {
      boolParamIndices.add(Number(cm[1]));
    }

    return boolParamIndices;
  }

  _translateDmlSql(rawSql, rawParams, paramOids = []) {
    const boolParamIndices = this._detectBooleanParams(rawSql, paramOids);
    const normalizedInputParams = rawParams.map((v, idx) => {
      if (boolParamIndices.has(idx + 1)) {
        return normalizeBoolWireValue(v);
      }
      return normalizeParamForSqlite(v);
    });

    // Step 1: Work on tokens so string literals and comments are protected
    let sql = this._rewriteOutsideLiterals(rawSql, (chunk) => chunk);

    // 1a. Rewrite EXTRACT(EPOCH FROM (exprA - exprB)) and EXTRACT(EPOCH FROM expr)
    sql = this._rewriteExtractEpoch(sql);

    // 1b. Rewrite INTERVAL expressions: <base> (+|-) INTERVAL '...'
    sql = this._rewriteIntervals(sql);

    // 1c. Rewrite standalone NOW() -> datetime('now')
    sql = this._rewriteOutsideLiterals(sql, (code) => code.replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')"));

    // 1d. Rewrite JSONB concatenation: COALESCE(..., '[]'::jsonb) || $n::jsonb or <expr>::jsonb || <expr>::jsonb
    sql = this._rewriteJsonbConcat(sql);

    // 1e. Rewrite = ANY($n[::type[]]) and != ALL($n[::type[]])
    const anyExpanded = this._rewriteAnyAll(sql, rawParams);
    sql = anyExpanded.sql;

    // 1f. Rewrite ILIKE -> LIKE (SQLite lower() UDF + case-insensitive LIKE)
    sql = this._rewriteOutsideLiterals(sql, (code) => code.replace(/\bILIKE\b/gi, 'LIKE'));

    // 1g. Extract SELECT projection cast hints before stripping ::type casts
    const castHints = this._extractSelectCastHints(sql);

    // 1h. Rewrite remaining explicit PG casts ::type
    sql = this._rewriteCasts(sql);

    // Step 2: Renumber $N placeholders and build compact boundParams array
    const placeholderMap = new Map(); // original 1-based idx -> new 1-based idx
    const boundParams = [];

    // Seed expanded ANY/ALL literal params first or map sequentially during scan
    const finalSql = this._rewriteOutsideLiterals(sql, (code) => {
      // Replace temporary __ANY_PARAM_k__ markers and $N placeholders
      return code.replace(/__ANY_PARAM_(\d+)__|\$(\d+)/g, (full, anyIdx, pgIdx) => {
        if (anyIdx !== undefined) {
          const val = anyExpanded.extraParams[Number(anyIdx)];
          boundParams.push(normalizeParamForSqlite(val));
          return `?${boundParams.length}`;
        }
        const origIdx = Number(pgIdx);
        if (!placeholderMap.has(origIdx)) {
          const val = origIdx - 1 < normalizedInputParams.length ? normalizedInputParams[origIdx - 1] : null;
          boundParams.push(val);
          placeholderMap.set(origIdx, boundParams.length);
        }
        return `?${placeholderMap.get(origIdx)}`;
      });
    });

    return { sql: finalSql, boundParams, castHints };
  }

  _rewriteOutsideLiterals(sql, fn) {
    const tokens = tokenizeSql(sql);
    return tokens
      .map((t) => (t.type === 'code' ? fn(t.text) : t.text))
      .join('');
  }

  _rewriteExtractEpoch(sql) {
    // Scan case-insensitively outside strings for EXTRACT(
    let out = '';
    let i = 0;
    const tokens = tokenizeSql(sql);
    const flat = tokens.map((t) => t.text).join('');
    // Compute code ranges
    const isCode = new Uint8Array(flat.length);
    let pos = 0;
    for (const t of tokens) {
      if (t.type === 'code') {
        isCode.fill(1, pos, pos + t.text.length);
      }
      pos += t.text.length;
    }

    i = 0;
    while (i < flat.length) {
      if (isCode[i] && /^EXTRACT\s*\(/i.test(flat.slice(i))) {
        const openIdx = flat.indexOf('(', i);
        const closeIdx = findMatchingParen(flat, openIdx);
        if (closeIdx !== -1) {
          const inner = flat.slice(openIdx + 1, closeIdx).trim();
          const epochMatch = inner.match(/^EPOCH\s+FROM\s+([\s\S]+)$/i);
          if (epochMatch) {
            let expr = epochMatch[1].trim();
            if (expr.startsWith('(') && findMatchingParen(expr, 0) === expr.length - 1) {
              expr = expr.slice(1, -1).trim();
            }
            // Find top-level '-' subtraction
            let splitPos = -1;
            let depth = 0;
            for (let k = 0; k < expr.length; k++) {
              const c = expr[k];
              if (c === "'") {
                k++;
                while (k < expr.length && !(expr[k] === "'" && expr[k + 1] !== "'")) {
                  if (expr[k] === "'" && expr[k + 1] === "'") k++;
                  k++;
                }
              } else if (c === '(') depth++;
              else if (c === ')') depth--;
              else if (c === '-' && depth === 0 && k > 0) {
                splitPos = k;
                break;
              }
            }
            const stripTs = (s) => s.replace(/::\s*(?:timestamp(?:tz)?|date)\b/gi, '').trim();
            if (splitPos !== -1) {
              const lhs = stripTs(expr.slice(0, splitPos));
              const rhs = stripTs(expr.slice(splitPos + 1));
              out += `(unixepoch(${lhs}) - unixepoch(${rhs}))`;
            } else {
              out += `unixepoch(${stripTs(expr)})`;
            }
            i = closeIdx + 1;
            continue;
          }
        }
      }
      out += flat[i++];
    }
    return out;
  }

  _rewriteIntervals(sql) {
    // Match <base> (+|-) INTERVAL '<qty> <unit>' outside strings/comments
    const { masked, saved, escapedPrefix, restore } = maskTokens(sql, new Set(['comment', 'string', 'ident']));
    const identPart = `(?:[A-Za-z_][A-Za-z0-9_]*|${escapedPrefix}\\d+__)`;
    const basePart = `(?:CURRENT_DATE|CURRENT_TIMESTAMP|NOW\\s*\\(\\s*\\)|(?:${identPart}\\s*\\.\\s*)?${identPart})`;
    const intervalRe = new RegExp(
      `(?:^|(?<=[^A-Za-z0-9_]))(${basePart})\\s*([+-])\\s*INTERVAL\\s+(${escapedPrefix}(\\d+)__)`,
      'gi'
    );
    const rewritten = masked.replace(intervalRe, (full, base, op, _tok, specIdxStr) => {
      const specTok = saved[Number(specIdxStr)];
      if (!specTok || specTok.type !== 'string') return full;
      for (const bm of base.matchAll(new RegExp(`${escapedPrefix}(\\d+)__`, 'g'))) {
        const bt = saved[Number(bm[1])];
        if (!bt || bt.type !== 'ident') return full;
      }
      const restoredBase = restore(base);
      const cleanSpec = unquoteSqlString(specTok.text).trim().replace(/\s+/g, ' ');
      const modifier = `${op}${cleanSpec}`.replace(/'/g, "''");
      const baseUpper = restoredBase.toUpperCase();
      if (baseUpper === 'CURRENT_DATE') {
        return `date(CURRENT_DATE, '${modifier}')`;
      }
      if (baseUpper === 'CURRENT_TIMESTAMP' || /^NOW\s*\(\s*\)$/i.test(restoredBase)) {
        return `datetime('now', '${modifier}')`;
      }
      return `date(${restoredBase}, '${modifier}')`;
    });
    return restore(rewritten);
  }

  _rewriteJsonbConcat(sql) {
    const { masked, saved, escapedPrefix, restore } = maskTokens(sql, new Set(['comment', 'string', 'ident']));
    const tokExpr = `${escapedPrefix}\\d+__`;
    // Handle COALESCE(col, '[]'::jsonb) || ($n | '...') ::jsonb
    const coalRe = new RegExp(
      `COALESCE\\s*\\(\\s*([^,]+?)\\s*,\\s*(${escapedPrefix}(\\d+)__)(?:\\s*::\\s*jsonb?)?\\s*\\)\\s*\\|\\|\\s*(\\$\\d+|${escapedPrefix}(\\d+)__)(?:\\s*::\\s*jsonb?)?`,
      'gi'
    );
    let out = masked.replace(coalRe, (full, col, _defTok, defIdxStr, rhs, rhsIdxStr) => {
      const defTok = saved[Number(defIdxStr)];
      if (!defTok || defTok.type !== 'string') return full;
      const defJson = unquoteSqlString(defTok.text);
      if (defJson !== '[]' && defJson !== '{}') return full;
      if (rhsIdxStr !== undefined) {
        const rhsTok = saved[Number(rhsIdxStr)];
        if (!rhsTok || rhsTok.type !== 'string') return full;
      }
      return `__pg_jsonb_concat(COALESCE(${restore(col.trim())}, '${defJson}'), ${restore(rhs.trim())})`;
    });
    // Handle explicit <expr>::jsonb || <expr>::jsonb
    const atom = `(?:\\$\\d+|${tokExpr}|[A-Za-z_][A-Za-z0-9_.]*)`;
    const binRe = new RegExp(
      `(${atom})\\s*::\\s*jsonb?\\s*\\|\\|\\s*(${atom})(?:\\s*::\\s*jsonb?)?`,
      'gi'
    );
    out = out.replace(binRe, (full, lhs, rhs) => {
      for (const side of [lhs, rhs]) {
        for (const m of side.matchAll(new RegExp(`${escapedPrefix}(\\d+)__`, 'g'))) {
          const t = saved[Number(m[1])];
          if (!t || (t.type !== 'string' && t.type !== 'ident')) return full;
        }
      }
      return `__pg_jsonb_concat(${restore(lhs.trim())}, ${restore(rhs.trim())})`;
    });
    return restore(out);
  }

  _rewriteAnyAll(sql, rawParams) {
    const extraParams = [];
    const rewritten = this._rewriteOutsideLiterals(sql, (code) => {
      return code.replace(
        /(\S+(?:\s*\.\s*\S+)?)\s*(=|!=|<>)\s*(ANY|ALL)\s*\(\s*\$(\d+)(?:\s*::\s*([A-Za-z0-9_]+)\s*\[\s*\])?\s*\)/gi,
        (_m, lhs, op, quant, pgIdxStr, elemType) => {
          const idx = Number(pgIdxStr) - 1;
          const rawVal = idx >= 0 && idx < rawParams.length ? rawParams[idx] : null;
          const parsed = parsePgArrayLiteral(rawVal, elemType);
          const isNeg = op === '!=' || op === '<>';

          if (!parsed || parsed.length === 0) {
            if (quant.toUpperCase() === 'ANY' && !isNeg) return '0=1';
            if (quant.toUpperCase() === 'ALL' && isNeg) return '1=1';
            return '0=1';
          }

          const placeholders = parsed.map((el) => {
            const k = extraParams.length;
            extraParams.push(el);
            return `__ANY_PARAM_${k}__`;
          });

          if (quant.toUpperCase() === 'ALL' && isNeg) {
            return `${lhs} NOT IN (${placeholders.join(', ')})`;
          }
          return `${lhs} IN (${placeholders.join(', ')})`;
        }
      );
    });
    return { sql: rewritten, extraParams };
  }

  _extractSelectCastHints(sql) {
    const { masked } = maskTokens(sql, new Set(['comment', 'string']));
    const m = masked.match(/^(?:WITH\b[\s\S]*?\)\s*)?SELECT\s+([\s\S]+?)(?:\s+FROM\b|\s+WHERE\b|\s+GROUP\b|\s+ORDER\b|\s+LIMIT\b|$)/i);
    if (!m) return [];
    const proj = splitTopLevelCommas(m[1]);
    return proj.map((expr) => {
      const castM = expr.match(/::\s*(int|int2|int4|int8|integer|bigint|smallint|bool|boolean|jsonb|json|date|timestamp(?:tz)?|float|float8|real|numeric|decimal|text|varchar)\b/i);
      if (castM) {
        const t = castM[1].toLowerCase();
        if (t === 'bool' || t === 'boolean') return 'boolean';
        if (t === 'int8' || t === 'bigint') return 'bigint';
        if (/^(int|int2|int4|integer|smallint)$/.test(t)) return 'integer';
        if (t === 'jsonb') return 'jsonb';
        if (t === 'json') return 'json';
        if (t === 'date') return 'date';
        if (t.startsWith('timestamp')) return 'timestamp';
        if (/^(float|float8|real)$/.test(t)) return 'float';
        if (/^(numeric|decimal)$/.test(t)) return 'numeric';
        return 'text';
      }
      if (/^COUNT\s*\(/i.test(expr.trim())) return 'bigint';
      if (/^jsonb_array_length\s*\(/i.test(expr.trim())) return 'integer';
      return null;
    });
  }

  _rewriteCasts(sql) {
    return this._rewriteOutsideLiterals(sql, (code) => {
      // Convert explicit scalar casts on simple expressions when helpful, strip remaining ::type
      return code
        .replace(/::\s*(?:jsonb?|text|varchar(?:\(\d+\))?|character\s+varying(?:\(\d+\))?|int(?:eger|2|4|8)?|bigint|smallint|numeric(?:\([^)]+\))?|decimal(?:\([^)]+\))?|float(?:4|8)?|real|double\s+precision|bool(?:ean)?|date|timestamp(?:tz)?(?:\s+with(?:out)?\s+time\s+zone)?)(?:\[\])?/gi, '')
        .replace(/\bCAST\s*\(([\s\S]+?)\s+AS\s+VARCHAR(?:\(\d+\))?\s*\)/gi, 'CAST($1 AS TEXT)');
    });
  }

  _inferFields(colMetas, rows, castHints, rawSql) {
    return colMetas.map((cm, idx) => {
      const colName = cm.name;
      const lowerName = String(colName).toLowerCase();
      let pgType = null;

      // 1. Direct table/view schema lookup
      if (cm.table && cm.column) {
        const tblLower = String(cm.table).toLowerCase();
        const colLower = String(cm.column).toLowerCase();
        const tblMap = this.adapter.tableCols.get(tblLower) || this.adapter.viewCols.get(tblLower);
        if (tblMap && tblMap.has(colLower)) {
          pgType = tblMap.get(colLower);
        }
      }

      // 2. Declared SQLite column type
      if (!pgType && cm.type) {
        pgType = cm.type.toLowerCase();
      }

      // 3. Explicit cast hint from SELECT projection
      if (!pgType && castHints && castHints[idx]) {
        pgType = castHints[idx];
      }

      // 4. Known computed column aliases
      if (!pgType) {
        const codeOnlySql = tokenizeSql(rawSql)
          .filter((t) => t.type === 'code')
          .map((t) => t.text)
          .join(' ');
        if (lowerName === 'dias_restantes' || lowerName === 'total_modelos') {
          pgType = 'integer';
        } else if (lowerName === 'count' && /jsonb_array_length/i.test(codeOnlySql)) {
          pgType = 'integer';
        } else if (lowerName === 'count' && /\bCOUNT\s*\(/i.test(codeOnlySql)) {
          pgType = 'bigint';
        } else if (lowerName === 'fotos' || lowerName === 'preferencias' || lowerName === 'meta') {
          pgType = 'jsonb';
        } else if (lowerName === 'fecha_vencimiento' || lowerName === 'fecha_ultima_cali' || lowerName === 'fecha_prox_cali' || lowerName === 'fecha_ultimo_tag' || lowerName === 'fecha_prox_tag') {
          pgType = 'date';
        }
      }

      let oid = pgType ? pgTypeToOid(pgType) : OID.TEXT;

      // 5. Runtime value fallback when still TEXT
      if (!pgType && oid === OID.TEXT && rows.length > 0) {
        for (const r of rows) {
          const v = r[idx];
          if (v !== null && v !== undefined) {
            if (typeof v === 'number') {
              oid = Number.isInteger(v) ? OID.INT4 : OID.FLOAT8;
            }
            break;
          }
        }
      }

      return {
        name: colName,
        tableID: 0,
        columnID: idx + 1,
        dataTypeID: oid,
        dataTypeSize: oidTypeSize(oid),
        dataTypeModifier: -1,
      };
    });
  }

  _executeDmlOrDql(rawSql, rawParams, paramOids) {
    const { sql, boundParams, castHints } = this._translateDmlSql(rawSql, rawParams, paramOids);
    const trimmed = stripSqlComments(sql).trim();
    const cmdMatch = trimmed.match(/^([A-Za-z]+)/);
    const firstWord = cmdMatch ? cmdMatch[1].toUpperCase() : 'SELECT';

    const isSelectLike = firstWord === 'SELECT' || firstWord === 'VALUES' || firstWord === 'PRAGMA';
    const withMainCmd = firstWord === 'WITH' ? getWithMainCommand(trimmed) : null;
    const isWithSelect = firstWord === 'WITH' && (withMainCmd === 'SELECT' || withMainCmd === 'VALUES');
    const effectiveCmd = firstWord === 'WITH' ? (withMainCmd || 'SELECT') : firstWord;
    const isDmlWrite = effectiveCmd === 'INSERT' || effectiveCmd === 'UPDATE' || effectiveCmd === 'DELETE';
    const hasReturning = isDmlWrite && tokenizeSql(rawSql).some((t) => t.type === 'code' && /\bRETURNING\b/i.test(t.text));

    const stmt = this.db.prepare(trimmed);

    if (isSelectLike || isWithSelect || hasReturning) {
      stmt.setReturnArrays(true);
      const rows = stmt.all(...boundParams);
      const colMetas = stmt.columns();
      const fields = this._inferFields(colMetas, rows, castHints, rawSql);

      let command = firstWord;
      if (firstWord === 'WITH') {
        command = withMainCmd || 'SELECT';
      }
      if (hasReturning) {
        if (firstWord === 'INSERT' || withMainCmd === 'INSERT') command = 'INSERT';
        else if (firstWord === 'UPDATE' || withMainCmd === 'UPDATE') command = 'UPDATE';
        else if (firstWord === 'DELETE' || withMainCmd === 'DELETE') command = 'DELETE';
        const ch = this.db.prepare('SELECT changes() AS c').get();
        return { command, rowCount: Number(ch.c), fields, rows };
      }
      return { command, rowCount: rows.length, fields, rows };
    }

    const res = stmt.run(...boundParams);
    let command = firstWord;
    if (firstWord === 'WITH') {
      command = withMainCmd || 'UPDATE';
    }
    return { command, rowCount: Number(res.changes || 0), fields: [], rows: [] };
  }
}

module.exports = {
  PgSqliteAdapter,
  AdapterSession,
  OID,
  splitSqlStatements,
  parsePgArrayLiteral,
};
