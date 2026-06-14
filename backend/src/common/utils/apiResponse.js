const success = (data, pagination = null) => ({
  success: true,
  ...(pagination && { pagination }),
  data,
  timestamp: new Date().toISOString(),
});

const error = (message, code = 'INTERNAL_ERROR', details = null) => ({
  success: false,
  error: { code, message, ...(details && { details }) },
  timestamp: new Date().toISOString(),
});

module.exports = { success, error };
