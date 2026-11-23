// Runtime API configuration for Entelso Dashboard.
// Local dev / local Docker Compose / isolated tests stay strictly local.
// In Coolify / Contabo standalone deployments, set the container env var API_BASE_URL
// to override this default without rebuilding the image.
(function () {
  var host = window.location && window.location.hostname;
  var proto = window.location && window.location.protocol;
  var isLocal = !host || host === 'localhost' || host === '127.0.0.1' || proto === 'file:';
  if (!isLocal && typeof window.ENTELSO_API_BASE === 'undefined') {
    window.ENTELSO_API_BASE = 'https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io';
  }
})();
