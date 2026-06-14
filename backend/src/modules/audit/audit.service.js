const db = require('../../config/database');

class AuditService {
  async getLogs(limit = 50) {
    const { rows } = await db.query(
      `SELECT a.id, a.accion, a.detalles, a.creado_en as fecha, COALESCE(u.nombre, 'Usuario Desconocido') as user
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

  async createLog(userId, accion, detalles = '') {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (usuario_id, accion, detalles)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, accion, detalles]
    );
    return rows[0];
  }
}

module.exports = new AuditService();
