/**
 * Fábrica de middleware de validación con Zod.
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error); // lo captura error.middleware
  req[source] = result.data; // datos limpios y transformados
  next();
};

module.exports = validate;
