const { z } = require('zod');

exports.createUserSchema = z.object({
  nombre:            z.string().min(2).max(100),
  telefono_whatsapp: z.string().min(7).max(20).optional(),
  email:             z.string().email('Email inválido.').optional(),
  rol:               z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional(),
  team:              z.string().max(80).optional(),
  // pin: acepta entre 4 y 60 caracteres (numérico corto para bot, o más largo para dashboard)
  pin:               z.string().min(4).max(60).optional(),
  password:          z.string().min(4).max(60).optional(),
});

exports.updateUserSchema = z.object({
  nombre:            z.string().min(2).max(100).optional(),
  telefono_whatsapp: z.string().min(7).max(20).nullable().optional(),
  email:             z.string().email().nullable().optional(),
  rol:               z.enum(['trabajador', 'admin', 'supervisor', 'almacen']).optional(),
  team:              z.string().max(80).nullable().optional(),
  activo:            z.boolean().optional(),
  en_terreno:        z.boolean().optional(),
  pin:               z.string().min(4).max(60).optional(),
  password:          z.string().min(4).max(60).optional(),
});
