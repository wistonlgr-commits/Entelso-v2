const db = require('../../config/database');

exports.getAll = async () => {
    const { rows } = await db.query(`
        SELECT m.id, m.activo_id, a.numero_serie, i.nombre as nombre_item, 
               m.fecha_envio, m.fecha_estimada_retorno, m.motivo, m.notas, m.estado,
               ub.nombre_ubicacion as zona
        FROM mantenimientos m
        JOIN activos a ON m.activo_id = a.id
        JOIN items i ON a.item_id = i.id
        LEFT JOIN ubicaciones ub ON a.ubicacion_actual_id = ub.id
        ORDER BY m.id DESC
    `);
    return rows;
};

exports.create = async (data) => {
    const { activo_id, fecha_envio, fecha_estimada_retorno, motivo, notas, creado_por } = data;
    await db.query('BEGIN');
    try {
        const { rows } = await db.query(`
            INSERT INTO mantenimientos (activo_id, fecha_envio, fecha_estimada_retorno, motivo, notas, creado_por)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [activo_id, fecha_envio, fecha_estimada_retorno, motivo, notas, creado_por]);
        
        // Actualizar el estado del activo a 'en_mantenimiento'
        await db.query(`UPDATE activos SET estado = 'en_mantenimiento' WHERE id = $1`, [activo_id]);
        
        await db.query('COMMIT');
        return rows[0];
    } catch (err) {
        await db.query('ROLLBACK');
        throw err;
    }
};

exports.markAsAttended = async (id) => {
    const { rows } = await db.query(`
        UPDATE mantenimientos 
        SET estado = 'Atendido'
        WHERE id = $1
        RETURNING *
    `, [id]);
    
    if (rows[0]) {
        // Regresar a 'disponible' si es necesario, dependiendo del negocio.
        await db.query(`UPDATE activos SET estado = 'disponible' WHERE id = $1`, [rows[0].activo_id]);
    }
    return rows[0];
};
