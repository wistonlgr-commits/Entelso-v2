/* ════════════════════════════════════════════
   ENTELSO DASHBOARD — JavaScript v3
   Autenticación JWT · API REST · i18n ES/EN
   Navegación · Charts · Tema · Cmd Palette
════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────── */
// Detectar automáticamente el host del backend según desde dónde se abre el dashboard.
// Esto resuelve el problema de la IP dinámica del router (DHCP):
//   - Si se abre en el navegador de la propia PC → usa localhost
//   - Si se abre desde otra PC en la red → usa la misma IP que ya tiene en la barra de direcciones
const API_BASE = (!window.location.hostname || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : 'https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io';


/* ─────────────────────────────────────────
   GESTIÓN DE SESIÓN (JWT en sessionStorage)
───────────────────────────────────────── */
const session = {
  getToken:   ()        => sessionStorage.getItem('entelso_token'),
  getUser:    ()        => JSON.parse(sessionStorage.getItem('entelso_user') || 'null'),
  save:       (t, u)    => { sessionStorage.setItem('entelso_token', t); sessionStorage.setItem('entelso_user', JSON.stringify(u)); },
  clear:      ()        => { sessionStorage.removeItem('entelso_token'); sessionStorage.removeItem('entelso_user'); },
  isLoggedIn: ()        => !!sessionStorage.getItem('entelso_token'),
};

/**
 * Decodifica el JWT en el cliente y verifica que no haya vencido.
 * No valida la firma (eso lo hace el servidor) — solo previene
 * mostrar la app cuando el token ya expiró localmente.
 */
function tokenEsValido(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────
   HELPER: FETCH CON AUTH
───────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const token = session.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    // Token expirado o inválido → forzar re-login
    session.clear();
    mostrarLogin();
    throw new Error('SESION_EXPIRADA');
  }
  return res;
}

/* ─────────────────────────────────────────
   PANTALLA DE LOGIN
───────────────────────────────────────── */
const loginScreen = document.getElementById('loginScreen');
const appShell    = document.getElementById('appShell');

function mostrarLogin() {
  loginScreen.style.display = 'flex';
  appShell.style.display    = 'none';
}

let autoRefreshInterval = null;

function mostrarApp() {
  loginScreen.style.display = 'none';
  appShell.style.display    = 'flex';
  appShell.classList.remove('app-enter');
  requestAnimationFrame(() => appShell.classList.add('app-enter'));
  inicializarApp();

  // Auto-refresh every 60 seconds
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    cargarActivos(true);
  }, 60000);
}

// Al cargar la página, verificar si ya hay sesión Y si el token no ha expirado
window.addEventListener('DOMContentLoaded', () => {
  const token = session.getToken();
  if (token && tokenEsValido(token)) {
    actualizarInfoUsuario(session.getUser());
    mostrarApp();
  } else {
    // Token expirado o inexistente → limpiar y mostrar login
    session.clear();
    mostrarLogin();
  }

  // i18n: aplicar idioma guardado
  window.i18n.applyTranslations();
  actualizarBotonIdioma();
});

/* ─────────────────────────────────────────
   FORMULARIO DE LOGIN
───────────────────────────────────────── */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = document.getElementById('loginEmail').value.trim();
  const pin      = document.getElementById('loginPin').value.trim();
  const loginBtn = document.getElementById('loginBtn');
  const errorEl  = document.getElementById('loginError');
  const { t }    = window.i18n;

  errorEl.style.display = 'none';

  if (!email || !pin) {
    errorEl.textContent    = t('login.error.campos');
    errorEl.style.display  = 'block';
    return;
  }

  // Estado de carga
  loginBtn.disabled         = true;
  loginBtn.querySelector('span').textContent = t('login.cargando');

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, pin }),
    });

    const data = await res.json();

    if (!res.ok) {
      // 401 o 403 del servidor
      errorEl.textContent   = data.message || t('login.error.cred');
      errorEl.style.display = 'block';
      return;
    }

    // Login exitoso — guardar token y usuario
    session.save(data.data.token, data.data.usuario);
    actualizarInfoUsuario(data.data.usuario);
    registrarAuditLog('Inició sesión en el sistema');
    mostrarApp();

  } catch (err) {
    if (err.message === 'Failed to fetch') {
      errorEl.textContent   = t('login.error.server');
    } else {
      errorEl.textContent   = t('login.error.cred');
    }
    errorEl.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.querySelector('span').textContent = t('login.btn');
  }
});

// PIN: mostrar/ocultar
document.getElementById('pinToggle').addEventListener('click', () => {
  const pinInput = document.getElementById('loginPin');
  const icon     = document.getElementById('pinToggleIcon');
  const isHidden = pinInput.type === 'password';
  pinInput.type  = isHidden ? 'text' : 'password';
  icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

/* ─────────────────────────────────────────
   LOGOUT
───────────────────────────────────────── */
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  session.clear();
  mostrarLogin();
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPin').value   = '';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('profileDropdown').classList.remove('open');
});

/* ─────────────────────────────────────────
   ACTUALIZAR INFO USUARIO EN SIDEBAR
───────────────────────────────────────── */
function actualizarInfoUsuario(user) {
  if (!user) r