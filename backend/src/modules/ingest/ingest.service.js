const db     = require('../../config/database');
const logger = require('../../common/utils/logger');

// Estados que implican que el activo está EN MANOS de un usuario
const ESTADOS_EN_USO = new Set(['en_uso', 'en_funcionamiento']);

// Valida que el estado sea uno de los permitidos por el ENUM de la DB
const ESTADOS_VALIDOS = new Set([
  'disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente',
  'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido'
]);

// Deduce el tipo de movimiento comparando el estado previo y el nuevo destino
const deducirMovimiento = (prevUsuario, prevUbicacion, nuevoUsuario, nuevaUbicacion) => {
  if (!prevUsuario && !prevUbicacion) return 'ingreso';
  if (prevUbicacion && nuevoUsuario)  return 'despacho';
  if (prevUsuario  && nuevaUbicacion) return 'devolucion';
  return 'traspaso';
};

/**
 * Busca un registro por campo. Si no existe, lo crea y devuelve su id.
 * Evita duplicar lógica de "upsert" a mano.
 */
const buscarOCrear = async (client, tabla, campoFiltro, valor, camposInsert) => {
  const cols  = Object.keys(camposInsert).join(', ');
  const vals  = Object.values(camposInsert);
  const marks = vals.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO ${tabla} (${cols})
    VALUES (${marks})
    ON CONFLICT (${campoFiltro}) DO UPDATE SET ${campoFiltro} = EXCLUDED.${campoFiltro}
    RETURNING id
  `;
  const { rows } = await client.query(query, vals);
  return rows[0].id;
};

class IngestService {
  async processWhatsappReport({ whatsapp_number, parsed }) {
    const { numero_inventario, equipo, zona, team, status } = parsed;

    // Normalizar y validar el estado recibido del bot
    let rawStatus = status?.toLowerCase?.().trim() || '';
    
    // Mapear traducciones del LLM (inglés) a estados válidos (español)
    const statusMap = {
      'available': 'disponible',
      'in use': 'en_uso',
      'maintenance': 'en_mantenimiento',
      'under maintenance': 'en_mantenimiento',
      'damaged': 'danado',
      'broken': 'danado',
      'out of service': 'fuera_de_servicio',
      'calibration pending': 'calibracion_pendiente',
      'pending calibration': 'calibracion_pendiente',
      'calibrated': 'calibrado'
    };
    
    let normalizedStatus = statusMap[rawStatus] || rawStatus;
    
    const dbStatus = ESTADOS_VALIDOS.has(normalizedStatus)
      ? normalizedStatus
      : 'desconocido'; // fallback seguro si Gemini manda algo inesperado

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Usuario — si no existe, se auto-crea con su número de WhatsApp y su team
      let defaultZonaStr = null;
      let userId;
      const { rows: existUser } = await client.query("SELECT id, default_zona FROM usuarios WHERE telefono_whatsapp = $1 LIMIT 1", [whatsapp_number]);
      if (existUser.length > 0) {
        userId = existUser[0].id;
        defaultZonaStr = existUser[0].default_zona;
      } else {
        userId = await buscarOCrear(
          client, 'usuarios', 'telefono_whatsapp', whatsapp_number,
          { nombre: `Technician (${whatsapp_number})`, telefono_whatsapp: whatsapp_number, rol: 'trabajador', team: team || null }
        );
      }

      // 2. Item del catálogo
      const itemId = await buscarOCrear(
        client, 'items', 'nombre', equipo,
        { nombre: equipo.trim(), tipo: 'herramienta', stock_global_consumibles: 0 }
      );

      // 3. Ubicación (zona del WhatsApp)
      const zonaName = zona ? zona.trim() : (defaultZonaStr || 'General');
      const locId = await buscarOCrear(
        client, 'ubicaciones', 'nombre_ubicacion', zonaName,
        { nombre_ubicacion: zonaName, descripcion: `Auto-created via WhatsApp report (${zonaName})` }
      );

      // 4. Determinar asignación:
      //    Si el equipo está en uso activo → asignado AL USUARIO
      //    Cualquier otro estado (mantenimiento, disponible, etc.) → a la UBICACIÓN FÍSICA
      const nuevoUsuario   = ESTADOS_EN_USO.has(dbStatus) ? userId : null;
      const nuevaUbicacion = ESTADOS_EN_USO.has(dbStatus) ? null   : locId;

      // 5. Buscar activo por numero_serie
      const { rows: existing } = await client.query(
        'SELECT id, usuario_actual_id, ubicacion_actual_id FROM activos WHERE numero_serie = $1',
        [numero_inventario.trim()]
      );

      let assetId;
      let prevUsuario   = null;
      let prevUbicacion = null;

      if (existing.length === 0) {
          // Generar ID automatico (ej. EQ-00001)
          const pref = 'EQ';
          const { rows: idRows } = await client.query("SELECT numero_serie FROM activos WHERE numero_serie LIKE $1", [pref + '-%']);
          let maxNum = 0;
          for (const r of idRows) {
            const num = parseInt(r.numero_serie.substring(pref.length + 1), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
          const autoId = `${pref}-${String(maxNum + 1).padStart(5, '0')}`;

          const ins = await client.query(
            `INSERT INTO activos (item_id, numero_serie, original_serial, usuario_actual_id, ubicacion_actual_id, estado, team)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [itemId, autoId, numero_inventario.trim(), nuevoUsuario, nuevaUbicacion, dbStatus, team || null]
          );
          assetId = ins.rows[0].id;
          logger.info(`Activo creado: ${autoId} (Serial: ${numero_inventario})`);
        } else {
        assetId       = existing[0].id;
        prevUsuario   = existing[0].usuario_actual_id;
        prevUbicacion = existing[0].ubicacion_actual_id;
          await client.query(
            'UPDATE activos SET usuario_actual_id=$1, ubicacion_actual_id=$2, estado=$3, team=COALESCE($4, team) WHERE id=$5',
            [nuevoUsuario, nuevaUbicacion, dbStatus, team || null, assetId]
          );
        logger.info(`Activo actualizado: ${numero_inventario} → ${dbStatus}`);
      }

      // 6. Movimiento histórico
      const tipoMov = deducirMovimiento(prevUsuario, prevUbicacion, nuevoUsuario, nuevaUbicacion);
      const { rows: [mov] } = await client.query(
        `INSERT INTO movimientos
           (item_id, activo_id, usuario_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, tipo_movimiento)
         VALUES ($1,$2,$3,$4,$5,1,$6) RETURNING id`,
        [itemId, assetId, userId, prevUbicacion ?? null, nuevaUbicacion ?? null, tipoMov]
      );

      await client.query('COMMIT');
      return { report_id: mov.id, activo: numero_inventario, estado: dbStatus, tipo_movimiento: tipoMov };

    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error procesando reporte WhatsApp (ROLLBACK)', err);
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new IngestService();
