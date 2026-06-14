const { z } = require('zod');

const ingestWhatsappSchema = z.object({
  whatsapp_number:     z.string().min(8),
  external_message_id: z.string().optional(),
  raw_text:            z.string().optional(),
  received_at:         z.string().optional(),
  parsed: z.object({
    numero_inventario: z.string().min(2),
    equipo:            z.string().min(2),
    zona:              z.string().min(1),
    team:              z.string().optional(),
    status:            z.string().min(1),
  }),
});

module.exports = { ingestWhatsappSchema };
