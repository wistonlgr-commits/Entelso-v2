const db = require('../../config/database');

const MOV_SELECT = `
  SELECT m.id, m.cantidad, m.tipo_movimiento, m.fecha_movimiento,
         i.nombre  AS nombre_item,   i.tipo AS tipo_item,
         a.numero_serie,
         u.nombre  AS nombre_usuario, u.telefono_whatsapp,
         uo.nombre_ubicacion AS ubicacion_origen,
         ud.nombre_ubicacion AS ubicacion_destino
  FROM   movimientos m
  JOIN   items      i  ON m.item_id            = i.id
  LEFT JOIN activos   a  ON m.activo_id           = a.id
  JOIN   usuarios   u  ON m.usuario_id          = u.id
  LEFT JOIN ubicaciones uo ON m.ubicacion_origen_id  = uo.id
  LEFT JOIN ubicaciones ud ON m.ubicacion_destino_id = ud.id
`;

exports.getAll = async (filters = {}) => {
  const { usuario_id, item_id, activo_id, tipo_movimiento, numero_serie } = filters;
  const conds = ['1=1']; const params = [];
  const add = (cond, val) => { params.push(val); conds.push(`${cond}$${params.length}`); };

  if (usuario_id)      add('m.usuario_id = ',      Number(usuario_id));
  if (item_id)         add('m.item_id = ',          Number(item_id));
  if (activo_id)       add('m.activo_id = ',        Number(activo_id));
  if (tipo_movimiento) add('m.tipo_movimiento = ',  tipo_movimiento);
  if (numero_serie)    add('a.numero_serie = ',     numero_serie);

  const { rows } = await db.query(
    `${MOV_SELECT} WHERE ${conds.join(' AND ')} ORDER BY m.fecha_movimiento DESC, m.id DESC`, params
  );
  return rows;
};

exports.create = async (data) => {
  const { item_id, activo_id, usuario_id,
          ubicacion_origen_id, ubicacion_destino_id,
          cantidad, tipo_movimiento } = data;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [item] } = await client.query('SELECT tipo, stock_global_consumibles FROM items WHERE id=$1', [item_id]);
    if (!item) throw Object.assign(new Error('Item no encontrado.'), { isOperational: true, statusCode: 404 });

    if (item.tipo === 'consumible') {
      if (activo_id) throw Object.assign(new Error('Los consumibles no tienen activo serializado.'), { isOperational: true });
      if (tipo_movimiento === 'despacho') {
        if (item.stock_global_consumibles < cantidad)
          throw Object.assign(new Error(`Stock insuficiente. Disponible: ${item.stock_global_consumibles}`), { isOperational: true });
        await client.query('UPDATE items SET stock_global_consumibles = stock_global_consumibles - $1 WHERE id=$2', [cantidad, item_id]);
      } else if (['ingreso','devolucion'].includes(tipo_movimiento)) {
        await client.query('UPDATE items SET stock_global_consumibles = stock_global_consumibles + $1 WHERE id=$2', [cantidad, item_id]);
      }
    } else {
      if (cantidad !== 1) throw Object.assign(new Error('Las herramientas solo pueden moverse en cantidad 1.'), { isOperational: true });
      if (!activo_id)     throw Object.assign(new Error('Las herramientas requieren activo_id.'), { isOperational: true });

      const nuevoUsuario   = tipo_movimiento === 'despacho' ? usuario_id  : null;
      const nuevaUbicacion = tipo_movimiento !== 'despacho' ? ubicacion_destino_id : null;
      const nuevoEstado    = tipo_movimiento === 'despacho' ? 'en_uso' : 'disponible';
      await client.query(
        'UPDATE activos SET usuario_actual_id=$1, ubicacion_actual_id=$2, estado=$3 WHERE id=$4',
        [nuevoUsuario, nuevaUbicacion, nuevoEstado, activo_id]
      );
    }

    const { rows: [mov] } = await client.query(
      `INSERT INTO movimientos
         (item_id, activo_id, usuario_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, tipo_movimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [item_id, activo_id ?? null, usuario_id,
       ubicacion_origen_id ?? null, ubicacion_destino_id ?? null,
       cantidad, tipo_movimiento]
    );

    await client.query('COMMIT');
    return mov;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
};
