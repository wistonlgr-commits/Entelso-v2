const success = (data, messageOrPagination = null) => {
  const isMessage = typeof messageOrPagination === 'string' && messageOrPagination.length > 0;
  const isPagination = messageOrPagination !== null && typeof messageOrPagination === 'object';
  return {
    success: true,
    ...(isMessage ? { message: messageOrPagination } : {}),
    ...(isPagination ? { pagination: messageOrPagination } : {}),
    data,
    timestamp: new Date().toISOString(),
  };
};

const error = (message, code = 'INTERNAL_ERROR', details = null) => ({
  success: false,
  error: { code, message, ...(details && { details }) },
  message,
  timestamp: new Date().toISOString(),
});

module.exports = { success, error };
