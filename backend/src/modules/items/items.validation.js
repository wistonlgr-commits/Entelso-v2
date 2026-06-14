const { z } = require('zod');

exports.createItemSchema = z.object({
  nombre: z.string().min(2).max(150),
  tipo:   z.enum(['herramienta','consumible']),
  stock_global_consumibles: z.number().int().nonnegative().optional(),
});

exports.updateStockSchema = z.object({
  cantidad:  z.number().int().positive(),
  operacion: z.enum(['sumar','restar']).default('sumar'),
});
