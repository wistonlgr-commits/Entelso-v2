const { z } = require('zod');

exports.createMovementSchema = z.object({
  item_id:              z.number().int().positive(),
  activo_id:            z.number().int().positive().nullable().optional(),
  usuario_id:           z.number().int().positive(),
  ubicacion_origen_id:  z.number().int().positive().nullable().optional(),
  ubicacion_destino_id: z.number().int().positive().nullable().optional(),
  cantidad:             z.number().int().positive().default(1),
  tipo_movimiento:      z.enum(['ingreso','despacho','traspaso','devolucion']),
});
