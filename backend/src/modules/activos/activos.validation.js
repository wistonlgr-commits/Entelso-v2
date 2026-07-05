const { z } = require('zod');

const estadoEnum = z.enum([
  'disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente',
  'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido'
]);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const noConflicto = (data) => !(data.usuario_actual_id && data.ubicacion_actual_id);
const conflictMsg  = { message: 'Cannot assign both user and location at the same time.', path: ['usuario_actual_id'] };

exports.createAssetSchema = z.object({
  item_id: z.number().int().positive().optional().nullable(),
  descripcion: z.string().optional(),
  numero_serie: z.string().min(2).max(100),
  usuario_actual_id:   z.number().int().positive().nullable().optional(),
  ubicacion_actual_id: z.number().int().positive().nullable().optional(),
  team: z.string().nullable().optional(),
  fecha_ultima_cali: fecha, fecha_prox_cali: fecha,
  fecha_ultimo_tag:  fecha, fecha_prox_tag:  fecha,
  estado: estadoEnum.default('disponible'),
}).refine(noConflicto, conflictMsg);

exports.updateAssetSchema = z.object({
  usuario_actual_id:   z.number().int().positive().nullable().optional(),
  ubicacion_actual_id: z.number().int().positive().nullable().optional(),
  team: z.string().nullable().optional(),
  fecha_ultima_cali: fecha, fecha_prox_cali: fecha,
  fecha_ultimo_tag:  fecha, fecha_prox_tag:  fecha,
  estado: estadoEnum.optional(),
}).refine(noConflicto, conflictMsg);

exports.bulkCreateAssetSchema = z.object({
  activos: z.array(z.object({
    numero_serie: z.string().min(2).max(100),
    descripcion: z.string().min(2),
    serie: z.string().optional(),
    zona: z.string().optional(),
    team: z.string().optional(),
    estado: z.string().optional(),
    fecha_ultima_cali: z.string().nullable().optional(),
    fecha_prox_cali:   z.string().nullable().optional(),
    fecha_ultimo_tag:  z.string().nullable().optional(),
    fecha_prox_tag:    z.string().nullable().optional(),
  })).min(1).max(500)
});
