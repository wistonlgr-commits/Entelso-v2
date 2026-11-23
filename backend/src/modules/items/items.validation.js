const { z } = require('zod');

const tipoEnum = z.enum(['herramienta', 'consumible', 'kit']);

exports.createItemSchema = z.object({
  nombre: z.string().min(2).max(150),
  tipo: tipoEnum,
  categoria_padre: z.string().trim().min(1).max(100).nullable().optional(),
  marca: z.string().trim().max(100).nullable().optional(),
  stock_global_consumibles: z.number().int().nonnegative().optional(),
});

exports.updateItemSchema = z.object({
  nombre: z.string().min(2).max(150).optional(),
  tipo: tipoEnum.optional(),
  categoria_padre: z.string().trim().min(1).max(100).nullable().optional(),
  marca: z.string().trim().max(100).nullable().optional(),
  stock_global_consumibles: z.number().int().nonnegative().optional(),
});

exports.createCategorySchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  tipo: tipoEnum.default('herramienta'),
});

exports.updateCategorySchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  tipo: tipoEnum.optional(),
}).refine(d => d.nombre !== undefined || d.tipo !== undefined, {
  message: 'Debe proporcionar nombre o tipo para actualizar.',
});

exports.updateStockSchema = z.object({
  cantidad:  z.number().int().positive(),
  operacion: z.enum(['sumar','restar']).default('sumar'),
});
