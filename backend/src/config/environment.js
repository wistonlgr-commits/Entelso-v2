require('dotenv').config();
const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  API_KEY: z.string().min(10, 'API_KEY debe tener al menos 10 caracteres'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET debe tener al menos 10 caracteres'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  parsed.error.errors.forEach(e => console.error(`   • ${e.path.join('.')}: ${e.message}`));
  process.exit(1);
}

module.exports = parsed.data;
