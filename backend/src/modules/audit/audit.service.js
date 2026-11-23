const db = require('../../config/database');
const logger = require('../../common/utils/logger');

const FORBIDDEN_KEY_RE = /^(password|oldpassword|newpassword|passwd|pin|pin_hash|secret|secret_2fa|token|jwt|totp|totpcode|otp|code|base64|base64_image|authorization|api_key|apikey|service_key|supabase_service_key)$/i;
const DATA_URI_BASE64_RE = /data:[^;\s]+;base64,[A-Za-z0-9+/=\r\n]+/gi;

const VALID_MODULES = new Set(['equipment', 'bulk', 'maintenance', 'whatsapp', 'users', 'config', 'security']);

function sanitizeString(val, maxLen = 400) {
  if (val === null || val === undefined) return '';
  let str = String(val).replace(DATA_URI_BASE64_RE, '[redacted-image]');
  // Guard against raw large base64 payloads without data: prefix
  if (str.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(str.trim())) {
    return '[redacted-payload]';
  }
  if (str.length > maxLen) {
    str = str.slice(0, maxLen - 1) + '…';
  }
  return str;
}

function sanitizeMeta(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 4) return null;

  if (typeof value === 'string') return sanitizeString(value, 300);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeMeta(item, depth + 1)).filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY_RE.test(k)) continue;
      if (v === undefined) continue;
      clean[k] = sanitizeMeta(v, depth + 1);
    }
    return clean;
  }

  return null;
}

function toIsoUtc(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  const str = String(raw).trim();
  if (!str) return null;
  // SQLite CURRENT_TIMESTAMP returns 'YYYY-MM-DD HH:MM:SS' in UTC without trailing Z
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(str)
    ? str.replace(' ', 'T') + 'Z'
    : str;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseMetaRow(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
  return null;
}

function buildModuleCondition(moduleName, params) {
  // Match structured meta.module in both PostgreSQL jsonb::text (spaces after colon)
  // and SQLite TEXT JSON (no spaces), plus legacy accion names without meta.
  params.push(`%"module"%"${moduleName}"%`);
  const metaParamIdx = params.length;

  const legacyClauses = {
    security: `LOWER(a.accion) LIKE 'auth.%' OR LOWER(a.accion) IN ('login', 'inició sesión en el sistema', 'inicio sesion en el sistema')`,
    equipment: `LOWER(a.accion) LIKE 'asset.%' OR LOWER(a.accion) LIKE 'equipment.%' OR LOWER(a.accion) LIKE 'updated notes%' OR LOWER(a.accion) LIKE 'added asset%' OR LOWER(a.accion) LIKE 'removed asset%'`,
    bulk: `LOWER(a.accion) LIKE 'bulk.%'`,
    maintenance: `LOWER(a.accion) LIKE 'maint.%'`,
    whatsapp: `LOWER(a.accion) LIKE 'wa.%'`,
    users: `LOWER(a.accion) LIKE 'user.%'`,
    config: `LOWER(a.accion) LIKE 'config.%'`,
  };

  const legacy = legacyClauses[moduleName];
  if (legacy) {
    return `(COALESCE(CAST(a.meta AS TEXT), '') ILIKE $${metaParamIdx} OR ${legacy})`;
  }
  return `COALESCE(CAST(a.meta AS TEXT), '') ILIKE $${metaParamIdx}`;
}

class AuditService {
  /**
   * Retrieve paginated & filtered audit logs.
   * Backward-compatible: getLogs(50) returns an array; getLogs({ limit, offset, ... }) returns { rows, pagination }.
   */
  async getLogs(limitOrOptions = 50) {
    const isLegacyCall = typeof limitOrOptions === 'number';
    const opts = isLegacyCall ? { limit: limitOrOptions, offset: 0 } : (limitOrOptions || {});

    const rawLimit = Number.parseInt(opts.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const rawOffset = Number.parseInt(opts.offset, 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const where = [];
    const params = [];

    if (opts.module && VALID_MODULES.has(String(opts.module).toLowerCase())) {
      where.push(buildModuleCondition(String(opts.module).toLowerCase(), params));
    }

    if (opts.usuario_id !== undefined && opts.usuario_id !== null && String(opts.usuario_id).trim() !== '') {
      const uid = Number.parseInt(opts.usuario_id, 10);
      if (Number.isFinite(uid) && uid > 0) {
        params.push(uid);
        where.push(`a.usuario_id = $${params.length}`);
      }
    }

    if (opts.q && String(opts.q).trim() !== '') {
      params.push(`%${String(opts.q).trim()}%`);
      const qIdx = params.length;
      where.push(`(a.accion ILIKE $${qIdx} OR COALESCE(a.detalles, '') ILIKE $${qIdx} OR COALESCE(u.nombre, '') ILIKE $${qIdx} OR COALESCE(CAST(a.meta AS TEXT), '') ILIKE $${qIdx})`);
    }

    if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(String(opts.from).trim())) {
      params.push(`${String(opts.from).trim()} 00:00:00`);
      where.push(`a.creado_en >= $${params.length}`);
    }

    if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(String(opts.to).trim())) {
      params.push(`${String(opts.to).trim()} 23:59:59`);
      where.push(`a.creado_en <= $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       ${whereSql}`,
      params
    );
    const total = Number.parseInt(countRes.rows[0]?.total, 10) || 0;

    const pageParams = [...params, limit, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const { rows } = await db.query(
      `SELECT a.id, a.usuario_id, a.accion, a.detalles, a.meta, CAST(a.creado_en AS TEXT) as fecha_raw, COALESCE(u.nombre, 'System') as user
       FROM audit_logs a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       ${whereSql}
       ORDER BY a.creado_en DESC, a.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      pageParams
    );

    const mapped = rows.map((r) => {
      const iso = toIsoUtc(r.fecha_raw ?? r.fecha);
      return {
        id: r.id,
        usuario_id: r.usuario_id ?? null,
        accion: r.accion || '',
        detalles: r.detalles || '',
        meta: parseMetaRow(r.meta),
        fecha: iso ? new Date(iso).toLocaleString() : '',
        fecha_iso: iso,
        user: r.user || 'System',
      };
    });

    if (isLegacyCall) return mapped;

    return {
      rows: mapped,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + mapped.length < total,
      },
    };
  }

  async createLog(userId, accion, detalles = '', meta = null) {
    const cleanAction = sanitizeString(accion || 'unknown', 255).trim() || 'unknown';
    const cleanDetails = sanitizeString(detalles || '', 500);
    const cleanMeta = meta ? sanitizeMeta(meta) : null;

    const { rows } = await db.query(
      `INSERT INTO audit_logs (usuario_id, accion, detalles, meta)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId ?? null, cleanAction, cleanDetails, cleanMeta ? JSON.stringify(cleanMeta) : null]
    );
    return rows[0];
  }

  /**
   * Non-blocking, fault-tolerant audit helper for controllers and services.
   * Never throws and never leaks sensitive fields.
   */
  async logSafe({ userId = null, accion, detalles = '', meta = null } = {}) {
    try {
      if (!accion) return null;
      return await this.createLog(userId, accion, detalles, meta);
    } catch (err) {
      try {
        logger.warn(`Audit log write skipped (${accion}): ${err?.message || String(err)}`);
      } catch (_) {}
      return null;
    }
  }
}

const instance = new AuditService();
instance.sanitizeMeta = sanitizeMeta;
instance.sanitizeString = sanitizeString;
module.exports = instance;
