const { z } = require('zod');
exports.createLocationSchema = z.object({
  nombre_ubicacion: z.string().min(2).max(100),
  descripcion:      z.string().optional(),
});
