const db = require('../../config/database');

function assertNumericId(id) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw Object.assign(new Error('ID de item inválido.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return num;
}

exports.getAll = async (tipo = null) => {
  const { rows } = await db.query(
    `SELECT id, nombre, tipo, stock_global_consumibles, categoria_padre, marca FROM items
     ${tipo ? 'WHERE tipo=$1' : ''} ORDER BY nombre ASC`,
    tipo ? [tipo] : []
  );
  return rows;
};

exports.getById = async (id) => {
  const numId = assertNumericId(id);
  const { rows } = await db.query(
    'SELECT id, nombre, tipo, stock_global_consumibles, categoria_padre, marca FROM items WHERE id=$1',
    [numId]
  );
  return rows[0] ?? null;
};

exports.create = async ({ nombre, tipo, stock_global_consumibles, categoria_padre = null, marca = null }) => {
  const { rows } = await db.query(
    'INSERT INTO items (nombre, tipo, stock_global_consumibles, categoria_padre, marca) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [nombre, tipo, tipo === 'consumible' ? (stock_global_consumibles ?? 0) : 0, categoria_padre ?? null, marca ?? null]
  );
  return rows[0];
};

exports.update = async (id, { nombre, tipo, categoria_padre, marca }) => {
  const numId = assertNumericId(id);
  const { rows } = await db.query(
    `UPDATE items
     SET nombre = COALESCE($1, nombre),
         tipo = COALESCE($2, tipo),
         categoria_padre = COALESCE($3, categoria_padre),
         marca = COALESCE($4, marca)
     WHERE id = $5 RETURNING *`,
    [nombre ?? null, tipo ?? null, categoria_padre ?? null, marca ?? null, numId]
  );
  return rows[0] ?? null;
};

exports.updateStock = async (id, cantidad, operacion) => {
  const numId = assertNumericId(id);
  const qty = Number(cantidad);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw Object.assign(new Error('La cantidad debe ser un entero positivo.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  if (!['sumar', 'restar'].includes(operacion)) {
    throw Object.assign(new Error("Operación inválida. Usa 'sumar' o 'restar'."), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const delta = operacion === 'restar' ? -qty : qty;

  const { rows } = await db.query(
    `UPDATE items
     SET stock_global_consumibles = stock_global_consumibles + $1
     WHERE id = $2
       AND tipo = 'consumible'
       AND stock_global_consumibles + $1 >= 0
     RETURNING *`,
    [delta, numId]
  );
  if (rows.length > 0) return rows[0];

  const existing = await exports.getById(numId);
  if (!existing) {
    throw Object.assign(new Error('Item no encontrado.'), {
      isOperational: true,
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  if (existing.tipo !== 'consumible') {
    throw Object.assign(new Error('Solo se puede actualizar stock de consumibles.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  throw Object.assign(
    new Error(`Stock insuficiente. Disponible: ${existing.stock_global_consumibles}`),
    { isOperational: true, statusCode: 400, code: 'INSUFFICIENT_STOCK' }
  );
};

exports.remove = async (id) => {
  const numId = assertNumericId(id);
  const check = await db.query('SELECT id FROM activos WHERE item_id = $1 LIMIT 1', [numId]);
  if (check.rows.length > 0) {
    throw Object.assign(new Error('No se puede eliminar porque hay equipos asignados a esta categoría.'), {
      isOperational: true,
      statusCode: 409,
      code: 'CATEGORY_IN_USE',
    });
  }
  await db.query('DELETE FROM items WHERE id = $1', [numId]);
};

exports.getCategorias = async () => {
  const { rows } = await db.query(`
    SELECT categoria_padre AS nombre,
           MIN(tipo::text) AS tipo,
           COUNT(*)::int AS total_modelos
    FROM items
    WHERE categoria_padre IS NOT NULL AND TRIM(categoria_padre) <> ''
    GROUP BY categoria_padre
    ORDER BY categoria_padre ASC
  `);
  return rows.map(r => ({
    id: r.nombre,
    nombre: r.nombre,
    tipo: r.tipo || 'herramienta',
    total_modelos: r.total_modelos,
  }));
};

exports.createCategoria = async ({ nombre, tipo = 'herramienta' }) => {
  const cleanName = String(nombre || '').trim();
  if (!cleanName) {
    throw Object.assign(new Error('El nombre de la categoría es obligatorio.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const { rows: existing } = await db.query(
    'SELECT 1 FROM items WHERE LOWER(categoria_padre) = LOWER($1) LIMIT 1',
    [cleanName]
  );
  if (existing.length > 0) {
    throw Object.assign(new Error('La categoría ya existe.'), {
      isOperational: true,
      statusCode: 409,
      code: 'DUPLICATE_KEY',
    });
  }

  const { rows: existingName } = await db.query(
    'SELECT id, categoria_padre FROM items WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
    [cleanName]
  );

  let insertName = cleanName;
  if (existingName.length > 0) {
    insertName = `${cleanName} [Categoría ${Date.now()}]`;
  }

  const { rows } = await db.query(
    `INSERT INTO items (nombre, tipo, categoria_padre, stock_global_consumibles)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (nombre) DO UPDATE SET
       categoria_padre = CASE
         WHEN items.categoria_padre IS NULL OR LOWER(items.categoria_padre) = LOWER(EXCLUDED.categoria_padre)
         THEN EXCLUDED.categoria_padre
         ELSE items.categoria_padre
       END,
       tipo = CASE
         WHEN items.categoria_padre IS NULL OR LOWER(items.categoria_padre) = LOWER(EXCLUDED.categoria_padre)
         THEN EXCLUDED.tipo
         ELSE items.tipo
       END
     RETURNING categoria_padre AS nombre, tipo`,
    [insertName, tipo, cleanName]
  );
  return {
    id: rows[0].nombre,
    nombre: rows[0].nombre,
    tipo: rows[0].tipo,
    total_modelos: 1,
  };
};

exports.renameCategoria = async (nombreParam, { nombre, tipo }) => {
  const oldName = String(nombreParam || '').trim();
  if (!oldName) {
    throw Object.assign(new Error('Nombre de categoría inválido.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const { rows: found } = await db.query(
    'SELECT id FROM items WHERE LOWER(categoria_padre) = LOWER($1) LIMIT 1',
    [oldName]
  );
  if (found.length === 0) {
    throw Object.assign(new Error('Categoría no encontrada.'), {
      isOperational: true,
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  const newName = nombre !== undefined ? String(nombre).trim() : null;
  if (newName && newName.toLowerCase() !== oldName.toLowerCase()) {
    const { rows: dup } = await db.query(
      'SELECT 1 FROM items WHERE LOWER(categoria_padre) = LOWER($1) LIMIT 1',
      [newName]
    );
    if (dup.length > 0) {
      throw Object.assign(new Error('Ya existe una categoría con ese nombre.'), {
        isOperational: true,
        statusCode: 409,
        code: 'DUPLICATE_KEY',
      });
    }
  }

  const { rows } = await db.query(
    `UPDATE items
     SET categoria_padre = COALESCE($1, categoria_padre),
         tipo = COALESCE($2, tipo)
     WHERE LOWER(categoria_padre) = LOWER($3)
     RETURNING categoria_padre AS nombre, tipo`,
    [newName, tipo ?? null, oldName]
  );

  if (newName && newName.toLowerCase() !== oldName.toLowerCase()) {
    const { rows: nameDup } = await db.query(
      'SELECT 1 FROM items WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
      [newName]
    );
    if (nameDup.length === 0) {
      await db.query(
        'UPDATE items SET nombre = $1 WHERE LOWER(nombre) = LOWER($2) AND LOWER(categoria_padre) = LOWER($1)',
        [newName, oldName]
      );
    }
  }

  const finalName = rows[0]?.nombre || newName || oldName;
  return {
    id: finalName,
    nombre: finalName,
    tipo: rows[0]?.tipo || tipo || 'herramienta',
    total_modelos: rows.length,
  };
};

exports.deleteCategoria = async (nombreParam) => {
  const oldName = String(nombreParam || '').trim();
  if (!oldName) {
    throw Object.assign(new Error('Nombre de categoría inválido.'), {
      isOperational: true,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const { rows: found } = await db.query(
    'SELECT id FROM items WHERE LOWER(categoria_padre) = LOWER($1) LIMIT 1',
    [oldName]
  );
  if (found.length === 0) {
    throw Object.assign(new Error('Categoría no encontrada.'), {
      isOperational: true,
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  const { rows: linked } = await db.query(
    `SELECT a.id
     FROM activos a
     JOIN items i ON a.item_id = i.id
     WHERE LOWER(i.categoria_padre) = LOWER($1)
     LIMIT 1`,
    [oldName]
  );
  if (linked.length > 0) {
    throw Object.assign(new Error('No se puede eliminar porque hay equipos asignados a esta categoría.'), {
      isOperational: true,
      statusCode: 409,
      code: 'CATEGORY_IN_USE',
    });
  }

  await db.query(
    `DELETE FROM items
     WHERE LOWER(categoria_padre) = LOWER($1)
       AND id NOT IN (SELECT item_id FROM activos)
       AND id NOT IN (SELECT item_id FROM movimientos)`,
    [oldName]
  );

  await db.query(
    `UPDATE items SET categoria_padre = NULL WHERE LOWER(categoria_padre) = LOWER($1)`,
    [oldName]
  );

  return { deleted: true, nombre: oldName };
};

