'use strict';

const net = require('node:net');
const crypto = require('node:crypto');
const { OID, splitSqlStatements } = require('./pg_sqlite_adapter');

function readCString(buf, offset) {
  const idx = buf.indexOf(0, offset);
  if (idx === -1) {
    return { value: buf.toString('utf8', offset), nextOffset: buf.length };
  }
  return {
    value: buf.toString('utf8', offset, idx),
    nextOffset: idx + 1,
  };
}

function buildFrame(typeChar, payloadBuf) {
  const payload = payloadBuf || Buffer.alloc(0);
  const len = 4 + payload.length;
  const out = Buffer.allocUnsafe(1 + len);
  out[0] = typeChar.charCodeAt(0);
  out.writeInt32BE(len, 1);
  if (payload.length > 0) payload.copy(out, 5);
  return out;
}

function buildAuthOk() {
  const p = Buffer.allocUnsafe(4);
  p.writeInt32BE(0, 0);
  return buildFrame('R', p);
}

function buildParamStatus(name, value) {
  const n = Buffer.from(name + '\0', 'utf8');
  const v = Buffer.from(value + '\0', 'utf8');
  return buildFrame('S', Buffer.concat([n, v]));
}

function buildBackendKeyData(pid, secret) {
  const p = Buffer.allocUnsafe(8);
  p.writeInt32BE(pid, 0);
  p.writeInt32BE(secret, 4);
  return buildFrame('K', p);
}

function buildReadyForQuery(txState) {
  const code = (txState || 'I').charCodeAt(0);
  return buildFrame('Z', Buffer.from([code]));
}

function buildCommandComplete(tag) {
  return buildFrame('C', Buffer.from(tag + '\0', 'utf8'));
}

function buildErrorResponse(err) {
  const severity = (err && err.severity) || 'ERROR';
  const code = (err && err.code) || '42601';
  const message = (err && err.message) || String(err || 'Unknown error');
  const parts = [
    Buffer.from('S' + severity + '\0', 'utf8'),
    Buffer.from('V' + severity + '\0', 'utf8'),
    Buffer.from('C' + code + '\0', 'utf8'),
    Buffer.from('M' + message + '\0', 'utf8'),
  ];
  if (err && err.detail) {
    parts.push(Buffer.from('D' + String(err.detail) + '\0', 'utf8'));
  }
  parts.push(Buffer.from([0]));
  return buildFrame('E', Buffer.concat(parts));
}

function buildRowDescription(fields) {
  const chunks = [];
  const hdr = Buffer.allocUnsafe(2);
  hdr.writeInt16BE(fields.length, 0);
  chunks.push(hdr);

  for (const f of fields) {
    chunks.push(Buffer.from(String(f.name) + '\0', 'utf8'));
    const meta = Buffer.allocUnsafe(18);
    meta.writeUInt32BE(f.tableID || 0, 0);
    meta.writeInt16BE(f.columnID || 0, 4);
    meta.writeUInt32BE(f.dataTypeID || OID.TEXT, 6);
    meta.writeInt16BE(f.dataTypeSize ?? -1, 10);
    meta.writeInt32BE(f.dataTypeModifier ?? -1, 12);
    meta.writeInt16BE(0, 16); // text format code
    chunks.push(meta);
  }
  return buildFrame('T', Buffer.concat(chunks));
}

function formatCellText(val, oid) {
  if (val === null || val === undefined) return null;

  if (oid === OID.BOOL) {
    if (val === true || val === 1 || val === '1' || val === 't' || val === 'true') return 't';
    return 'f';
  }

  if (oid === OID.DATE) {
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const s = String(val);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  if (oid === OID.TIMESTAMP || oid === OID.TIMESTAMPTZ) {
    if (val instanceof Date) {
      return val.toISOString().replace('T', ' ').replace('Z', '+00');
    }
    return String(val).replace('T', ' ').replace(/Z$/, '+00');
  }

  if (oid === OID.JSONB || oid === OID.JSON) {
    return typeof val === 'string' ? val : JSON.stringify(val);
  }

  if (oid === OID.INT4 || oid === OID.INT8) {
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val));
    return String(val);
  }

  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    return '\\x' + Buffer.from(val).toString('hex');
  }

  return String(val);
}

function buildDataRow(row, fields) {
  const chunks = [];
  const hdr = Buffer.allocUnsafe(2);
  hdr.writeInt16BE(fields.length, 0);
  chunks.push(hdr);

  for (let i = 0; i < fields.length; i++) {
    const text = formatCellText(row[i], fields[i].dataTypeID);
    if (text === null) {
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeInt32BE(-1, 0);
      chunks.push(lenBuf);
    } else {
      const valBuf = Buffer.from(text, 'utf8');
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeInt32BE(valBuf.length, 0);
      chunks.push(lenBuf, valBuf);
    }
  }
  return buildFrame('D', Buffer.concat(chunks));
}

function formatCommandTag(command, rowCount) {
  const cmd = String(command || 'OK').toUpperCase();
  const count = rowCount == null ? 0 : rowCount;
  if (cmd === 'SELECT') return `SELECT ${count}`;
  if (cmd === 'INSERT') return `INSERT 0 ${count}`;
  if (cmd === 'UPDATE') return `UPDATE ${count}`;
  if (cmd === 'DELETE') return `DELETE ${count}`;
  return cmd;
}

class PgConnectionSession {
  constructor(socket, adapter, pid) {
    this.socket = socket;
    this.adapter = adapter;
    this.pid = pid;
    this.secret = crypto.randomInt(1, 0x7fffffff);
    this.session = adapter.openSession();
    this.buffer = Buffer.alloc(0);
    this.startupDone = false;
    this.statements = new Map();
    this.portals = new Map();
    this.inPipelineError = false;
    this.closed = false;
    this._processing = false;
  }

  onData(chunk) {
    if (this.closed) return;
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    this._scheduleProcess();
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    this.session.close();
  }

  _writeFrames(frames) {
    if (!this.closed && !this.socket.destroyed && frames.length > 0) {
      this.socket.write(Buffer.concat(frames));
    }
  }

  _hasCompleteFrame() {
    if (!this.startupDone) {
      if (this.buffer.length < 8) return false;
      const len = this.buffer.readInt32BE(0);
      return len >= 8 && this.buffer.length >= len;
    }
    if (this.buffer.length < 5) return false;
    const msgLen = this.buffer.readInt32BE(1);
    return msgLen >= 4 && this.buffer.length >= 1 + msgLen;
  }

  _scheduleProcess() {
    if (this._processing || this.closed) return;
    this._processing = true;
    this._processBuffer()
      .catch((err) => {
        if (!this.closed) {
          try {
            this._writeFrames([buildErrorResponse(err)]);
          } catch {
            // ignore
          }
          this.socket.destroy();
          this.onClose();
        }
      })
      .finally(() => {
        this._processing = false;
        if (!this.closed && this._hasCompleteFrame()) {
          this._scheduleProcess();
        }
      });
  }

  async _processBuffer() {
    while (!this.closed) {
      if (!this.startupDone) {
        if (this.buffer.length < 8) return;
        const len = this.buffer.readInt32BE(0);
        if (len < 8 || this.buffer.length < len) return;

        const code = this.buffer.readInt32BE(4);
        this.buffer = this.buffer.subarray(len);

        // SSLRequest (80877103)
        if (len === 8 && code === 80877103) {
          this.socket.write(Buffer.from('N'));
          continue;
        }

        // CancelRequest (80877102)
        if (len === 16 && code === 80877102) {
          this.socket.end();
          this.onClose();
          return;
        }

        // StartupMessage (protocol 3.0 = 196608)
        if (code !== 196608) {
          this._writeFrames([buildErrorResponse({ code: '0A000', message: 'Unsupported protocol version' })]);
          this.socket.end();
          this.onClose();
          return;
        }

        this.startupDone = true;
        this._writeFrames([
          buildAuthOk(),
          buildParamStatus('server_version', '15.0'),
          buildParamStatus('client_encoding', 'UTF8'),
          buildParamStatus('standard_conforming_strings', 'on'),
          buildParamStatus('DateStyle', 'ISO, MDY'),
          buildParamStatus('TimeZone', 'UTC'),
          buildParamStatus('integer_datetimes', 'on'),
          buildBackendKeyData(this.pid, this.secret),
          buildReadyForQuery(this.session.txState),
        ]);
        continue;
      }

      // Standard message framing: 1 byte type + 4 byte length (including length field)
      if (this.buffer.length < 5) return;
      const msgType = String.fromCharCode(this.buffer[0]);
      const msgLen = this.buffer.readInt32BE(1);
      if (msgLen < 4 || this.buffer.length < 1 + msgLen) return;

      const payload = this.buffer.subarray(5, 1 + msgLen);
      this.buffer = this.buffer.subarray(1 + msgLen);

      await this._handleMessage(msgType, payload);
    }
  }

  async _handleMessage(type, payload) {
    if (type === 'X') {
      this.socket.end();
      this.onClose();
      return;
    }

    if (type === 'H') {
      // Flush: Node socket writes immediately
      return;
    }

    if (type === 'S') {
      this.inPipelineError = false;
      this._writeFrames([buildReadyForQuery(this.session.txState)]);
      return;
    }

    if (this.inPipelineError) {
      return;
    }

    switch (type) {
      case 'Q':
        await this._handleSimpleQuery(payload);
        break;
      case 'P':
        this._handleParse(payload);
        break;
      case 'B':
        this._handleBind(payload);
        break;
      case 'D':
        await this._handleDescribe(payload);
        break;
      case 'E':
        await this._handleExecute(payload);
        break;
      case 'C':
        this._handleClose(payload);
        break;
      default:
        this._writeFrames([
          buildErrorResponse({ code: '0A000', message: `Unsupported message type: ${type}` }),
        ]);
        this.inPipelineError = true;
        break;
    }
  }

  async _handleSimpleQuery(payload) {
    const { value: rawSql } = readCString(payload, 0);
    const statements = splitSqlStatements(rawSql);

    if (statements.length === 0) {
      this._writeFrames([
        buildFrame('I'),
        buildReadyForQuery(this.session.txState),
      ]);
      return;
    }

    const out = [];
    for (const stmtSql of statements) {
      if (this.closed) return;
      try {
        const res = await this.session.executeAsync(stmtSql, [], []);
        if (res.fields.length > 0) {
          out.push(buildRowDescription(res.fields));
          for (const row of res.rows) {
            out.push(buildDataRow(row, res.fields));
          }
        }
        out.push(buildCommandComplete(formatCommandTag(res.command, res.rowCount)));
      } catch (err) {
        out.push(buildErrorResponse(err));
        break;
      }
    }
    out.push(buildReadyForQuery(this.session.txState));
    this._writeFrames(out);
  }

  _handleParse(payload) {
    let off = 0;
    const s1 = readCString(payload, off);
    const stmtName = s1.value;
    off = s1.nextOffset;

    const s2 = readCString(payload, off);
    const sql = s2.value;
    off = s2.nextOffset;

    const paramCount = payload.readInt16BE(off);
    off += 2;
    const paramTypeOIDs = [];
    for (let i = 0; i < paramCount; i++) {
      paramTypeOIDs.push(payload.readUInt32BE(off));
      off += 4;
    }

    this.statements.set(stmtName, { sql, paramTypeOIDs });
    this._writeFrames([buildFrame('1')]);
  }

  _handleBind(payload) {
    let off = 0;
    const p1 = readCString(payload, off);
    const portalName = p1.value;
    off = p1.nextOffset;

    const p2 = readCString(payload, off);
    const stmtName = p2.value;
    off = p2.nextOffset;

    const stmt = this.statements.get(stmtName);
    if (!stmt) {
      this.inPipelineError = true;
      this._writeFrames([
        buildErrorResponse({ code: '26000', message: `prepared statement "${stmtName}" does not exist` }),
      ]);
      return;
    }

    const paramFmtCount = payload.readInt16BE(off);
    off += 2;
    const paramFmts = [];
    for (let i = 0; i < paramFmtCount; i++) {
      paramFmts.push(payload.readInt16BE(off));
      off += 2;
    }

    const paramCount = payload.readInt16BE(off);
    off += 2;
    const params = [];
    for (let i = 0; i < paramCount; i++) {
      const valLen = payload.readInt32BE(off);
      off += 4;
      if (valLen === -1) {
        params.push(null);
      } else {
        const fmt = paramFmtCount === 0 ? 0 : (paramFmtCount === 1 ? paramFmts[0] : (paramFmts[i] || 0));
        const slice = payload.subarray(off, off + valLen);
        off += valLen;
        params.push(fmt === 1 ? Buffer.from(slice) : slice.toString('utf8'));
      }
    }

    const resultFmtCount = payload.readInt16BE(off);
    off += 2;
    const resultFmts = [];
    for (let i = 0; i < resultFmtCount; i++) {
      resultFmts.push(payload.readInt16BE(off));
      off += 2;
    }

    this.portals.set(portalName, {
      stmtName,
      sql: stmt.sql,
      paramTypeOIDs: stmt.paramTypeOIDs,
      params,
      resultFmts,
      result: null,
      cursor: 0,
    });

    this._writeFrames([buildFrame('2')]);
  }

  async _handleDescribe(payload) {
    const kind = String.fromCharCode(payload[0]);
    const { value: name } = readCString(payload, 1);

    if (kind === 'S') {
      const stmt = this.statements.get(name);
      if (!stmt) {
        this.inPipelineError = true;
        this._writeFrames([
          buildErrorResponse({ code: '26000', message: `prepared statement "${name}" does not exist` }),
        ]);
        return;
      }
      const p = Buffer.allocUnsafe(2 + stmt.paramTypeOIDs.length * 4);
      p.writeInt16BE(stmt.paramTypeOIDs.length, 0);
      for (let i = 0; i < stmt.paramTypeOIDs.length; i++) {
        p.writeUInt32BE(stmt.paramTypeOIDs[i], 2 + i * 4);
      }
      this._writeFrames([buildFrame('t', p), buildFrame('n')]);
      return;
    }

    const portal = this.portals.get(name);
    if (!portal) {
      this.inPipelineError = true;
      this._writeFrames([
        buildErrorResponse({ code: '34000', message: `portal "${name}" does not exist` }),
      ]);
      return;
    }

    const stmts = splitSqlStatements(portal.sql);
    if (stmts.length === 0) {
      portal.result = { command: 'EMPTY', rowCount: 0, fields: [], rows: [] };
      this._writeFrames([buildFrame('n')]);
      return;
    }

    if (!portal.result) {
      try {
        portal.result = await this.session.executeAsync(stmts[0], portal.params, portal.paramTypeOIDs);
      } catch (err) {
        this.inPipelineError = true;
        this._writeFrames([buildErrorResponse(err)]);
        return;
      }
    }

    if (portal.result.fields.length > 0) {
      this._writeFrames([buildRowDescription(portal.result.fields)]);
    } else {
      this._writeFrames([buildFrame('n')]);
    }
  }

  async _handleExecute(payload) {
    const p1 = readCString(payload, 0);
    const portalName = p1.value;
    const maxRows = payload.readUInt32BE(p1.nextOffset);

    const portal = this.portals.get(portalName);
    if (!portal) {
      this.inPipelineError = true;
      this._writeFrames([
        buildErrorResponse({ code: '34000', message: `portal "${portalName}" does not exist` }),
      ]);
      return;
    }

    const stmts = splitSqlStatements(portal.sql);
    if (stmts.length === 0) {
      this._writeFrames([buildFrame('I')]);
      return;
    }

    if (!portal.result) {
      try {
        portal.result = await this.session.executeAsync(stmts[0], portal.params, portal.paramTypeOIDs);
      } catch (err) {
        this.inPipelineError = true;
        this._writeFrames([buildErrorResponse(err)]);
        return;
      }
    }

    const res = portal.result;
    const out = [];
    const totalRows = res.rows.length;
    const end = maxRows === 0 ? totalRows : Math.min(totalRows, portal.cursor + maxRows);

    for (let i = portal.cursor; i < end; i++) {
      out.push(buildDataRow(res.rows[i], res.fields));
    }
    portal.cursor = end;

    if (maxRows > 0 && portal.cursor < totalRows) {
      out.push(buildFrame('s')); // PortalSuspended
    } else {
      out.push(buildCommandComplete(formatCommandTag(res.command, res.rowCount)));
    }

    this._writeFrames(out);
  }

  _handleClose(payload) {
    const kind = String.fromCharCode(payload[0]);
    const { value: name } = readCString(payload, 1);
    if (kind === 'S') this.statements.delete(name);
    else if (kind === 'P') this.portals.delete(name);
    this._writeFrames([buildFrame('3')]);
  }
}

function createPgWireServer(adapter, options = {}) {
  const host = options.host || '127.0.0.1';
  const requestedPort = options.port ?? 0;
  const activeSockets = new Set();
  let nextPid = 1000;
  let boundPort = null;

  const server = net.createServer((socket) => {
    activeSockets.add(socket);
    const conn = new PgConnectionSession(socket, adapter, ++nextPid);
    socket.on('data', (chunk) => conn.onData(chunk));
    socket.on('error', () => {
      conn.onClose();
    });
    socket.on('close', () => {
      activeSockets.delete(socket);
      conn.onClose();
    });
  });

  return {
    server,
    host,
    get port() {
      return boundPort;
    },
    get pgUrl() {
      return boundPort ? `postgres://test:test@${host}:${boundPort}/entelso_test` : null;
    },
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, host, () => {
          server.removeListener('error', reject);
          const addr = server.address();
          boundPort = addr.port;
          resolve({
            host,
            port: boundPort,
            pgUrl: `postgres://test:test@${host}:${boundPort}/entelso_test`,
          });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        for (const s of activeSockets) {
          try {
            s.destroy();
          } catch {
            // ignore
          }
        }
        activeSockets.clear();
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    },
  };
}

module.exports = {
  createPgWireServer,
  formatCellText,
  formatCommandTag,
};
