const { z } = require('zod');

exports.createMantenimientoSchema = z.object({
  activo_id: z.coerce.number().int().positive(),
  fecha_envio: z.union([z.string(), z.date()]).nullable().optional(),
  fecha_estimada_retorno: z.union([z.string(), z.date()]).nullable().optional(),
  motivo: z.string().trim().min(1).max(255),
  notas: z.string().nullable().optional(),
  fotos: z.array(z.string()).max(10).optional().default([]),
  creado_por: z.number().int().positive().nullable().optional(),
});
