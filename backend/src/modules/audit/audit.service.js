const db = require('../../config/database');

class AuditService {
  async getLogs(limit = 50) {
    const { rows } = await db.query(
      `SELECT a.id, a.accion, a.detalles, a.meta, a.creado_en as fecha, COALESCE(u.nombre, 'Unknown User') as user
       FROM audit_logs a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       ORDER BY a.creado_en DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map(r => ({
      ...r,
      fecha: new Date(r.fecha).toLocaleString()
    }));
  }

  async createLog(userId, accion, detalles = '', meta = null) {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (usuario_id, accion, detalles, meta)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, accion, detalles, meta ? JSON.stringify(meta) : null]
    );
    return rows[0];
  }
}

module.exports = new AuditService();
