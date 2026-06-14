const db = require('../../config/database');

const BASE_SELECT = `
  SELECT activo_id, numero_serie, nombre_item, tipo_alerta, fecha_vencimiento, dias_restantes
  FROM   v_alertas_inventario
`;

exports.getAll = async ()           => (await db.query(`${BASE_SELECT} ORDER BY dias_restantes ASC`)).rows;
exports.getCalibracion = async ()   => (await db.query(`${BASE_SELECT} WHERE tipo_alerta IN ('Calibración Vencida', 'Calibración Próxima') ORDER BY dias_restantes ASC`)).rows;
exports.getTag = async ()           => (await db.query(`${BASE_SELECT} WHERE tipo_alerta IN ('Tag Vencido', 'Tag Próximo') ORDER BY dias_restantes ASC`)).rows;
