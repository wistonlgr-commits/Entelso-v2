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
function resolveApiBase() {
  const override = (window.ENTELSO_API_BASE || localStorage.getItem('entelso_api_base') || '').trim();
  if (override) {
    return override.replace(/\/+$/, '').replace(/\/api$/i, '');
  }
  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:' || !hostname) {
    return 'http://localhost:3001';
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return (port === '' || port === '80' || port === '443') ? '' : 'http://localhost:3001';
  }
  return '';
}
const API_BASE = resolveApiBase();

window.CATEGORY_ICONS = {
  'WalkTest Kits': 'fa-person-walking',
  'Testing Equipment': 'fa-wave-square',
  'Hand Tools': 'fa-toolbox',
  'Power Tools': 'fa-bolt',
  'Safety & PPE': 'fa-hard-hat',
  'CAM Keys': 'fa-key',
  'Consumables': 'fa-box-open'
};

window.getAssetCategory = function(item) {
  if (!item) return 'Hand Tools';
  if (item.categoria_padre) return item.categoria_padre;
  if (item.categoria) return item.categoria;
  if (item.tipo) return item.tipo;
  return 'Hand Tools';
};

// Translate DB tipo values via i18n
window.translateTipo = function(tipo) {
  const key = (tipo || '').toLowerCase();
  const map = {
    herramienta: 'tipo.herramienta',
    consumible: 'tipo.consumible',
    kit: 'tipo.kit',
    equipo: 'tipo.equipo',
    instrumento: 'tipo.instrumento',
    vehiculo: 'tipo.vehiculo'
  };
  const i18nKey = map[key];
  if (i18nKey && window.i18n?.has?.(i18nKey)) return window.i18n.t(i18nKey);
  return tipo || '—';
};

function getCurrentRole() {
  return (session.getUser()?.rol || 'trabajador').toLowerCase();
}
const isAdminRole = () => getCurrentRole() === 'admin';
const canManageInventory = () => ['admin', 'almacen'].includes(getCurrentRole());
const canUpdateStatusOrAssign = () => ['admin', 'almacen', 'supervisor'].includes(getCurrentRole());

function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);)/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

// Pure zero-dependency ISO/IEC 18004 QR Code encoder (Versions 1-8, Byte mode, EC Level M)
function encodeIsoQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || '')));
  // [version, totalDataBytes, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data, alignCenters, versionInfo]
  const SPECS = [
    [1,  16, 10, 1, 16, 0,  0, [],            0],
    [2,  28, 16, 1, 28, 0,  0, [6, 18],       0],
    [3,  44, 26, 1, 44, 0,  0, [6, 22],       0],
    [4,  64, 18, 2, 32, 0,  0, [6, 26],       0],
    [5,  86, 24, 2, 43, 0,  0, [6, 30],       0],
    [6, 108, 16, 4, 27, 0,  0, [6, 34],       0],
    [7, 124, 18, 4, 31, 0,  0, [6, 22, 38],   0x07C94],
    [8, 154, 22, 2, 38, 2, 39, [6, 24, 42],   0x085BC],
  ];
  const spec = SPECS.find((s) => bytes.length + 2 <= s[1]) || SPECS[SPECS.length - 1];
  const [ver, totalData, ecLen, g1Count, g1Size, g2Count, g2Size, align, verBits] = spec;
  const maxBytes = totalData - 2;
  const dataBytes = bytes.slice(0, maxBytes);

  // Build bit stream: Byte mode (0100) + 8-bit length + payload + terminator + pad bytes
  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  pushBits(0b0100, 4);
  pushBits(dataBytes.length, 8);
  for (const b of dataBytes) pushBits(b, 8);
  for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  const pads = [0xEC, 0x11];
  for (let p = 0; codewords.length < totalData; p++) codewords.push(pads[p & 1]);

  // GF(256) arithmetic (primitive poly 0x11D)
  const gfExp = new Uint8Array(512);
  const gfLog = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
  const gfMul = (a, b) => (a && b ? gfExp[gfLog[a] + gfLog[b]] : 0);

  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const root = gfExp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }
  const rsEncode = (block) => {
    const rem = new Uint8Array(ecLen);
    for (const b of block) {
      const factor = b ^ rem[0];
      rem.copyWithin(0, 1);
      rem[ecLen - 1] = 0;
      if (factor) {
        for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return Array.from(rem);
  };

  // Split into RS blocks & interleave
  const blocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let i = 0; i < g1Count; i++) {
    const blk = codewords.slice(offset, offset + g1Size);
    offset += g1Size;
    blocks.push(blk);
    ecBlocks.push(rsEncode(blk));
  }
  for (let i = 0; i < g2Count; i++) {
    const blk = codewords.slice(offset, offset + g2Size);
    offset += g2Size;
    blocks.push(blk);
    ecBlocks.push(rsEncode(blk));
  }
  const finalBytes = [];
  const maxBlkLen = Math.max(g1Size, g2Size);
  for (let i = 0; i < maxBlkLen; i++) {
    for (const blk of blocks) if (i < blk.length) finalBytes.push(blk[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const ec of ecBlocks) finalBytes.push(ec[i]);
  }

  // Matrix construction
  const size = ver * 4 + 17;
  const mat = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
  const setFunc = (r, c, v) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      mat[r][c] = v ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };

  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const on = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r0 + dr, c0 + dc, on ? 1 : 0);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, (i & 1) === 0 ? 1 : 0);
    setFunc(i, 6, (i & 1) === 0 ? 1 : 0);
  }
  for (const ar of align) {
    for (const ac of align) {
      if ((ar < 8 && ac < 8) || (ar < 8 && ac >= size - 8) || (ar >= size - 8 && ac < 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const d = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(ar + dr, ac + dc, d !== 1 ? 1 : 0);
        }
      }
    }
  }
  // Reserve format info + dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { setFunc(8, i, 0); setFunc(i, 8, 0); }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, 0);
    setFunc(size - 1 - i, 8, 0);
  }
  setFunc(size - 8, 8, 1);

  if (verBits) {
    for (let i = 0; i < 18; i++) {
      const bit = (verBits >>> i) & 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      setFunc(r, c, bit);
      setFunc(c, r, bit);
    }
  }

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  const totalBits = finalBytes.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = (((size - 1 - (right > 6 ? right : right + 1)) >> 1) & 1) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? (size - 1 - vert) : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunc[r][c]) {
          const bit = bitIdx < totalBits ? ((finalBytes[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1) : 0;
          mat[r][c] = bit;
          bitIdx++;
        }
      }
    }
  }

  // Mask evaluation & selection (ISO/IEC 18004 masks 0..7)
  const maskFn = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const writeFormat = (m, maskId) => {
    const data5 = (0b00 << 3) | maskId; // EC Level M = 00
    let rem = data5 << 10;
    for (let i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    }
    const fmt = ((data5 << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) m[8][i] = (fmt >>> (14 - i)) & 1;
    m[8][7] = (fmt >>> 8) & 1;
    m[8][8] = (fmt >>> 7) & 1;
    m[7][8] = (fmt >>> 6) & 1;
    for (let i = 0; i <= 5; i++) m[5 - i][8] = (fmt >>> (5 - i)) & 1;
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = (fmt >>> i) & 1;
    for (let i = 0; i < 7; i++) m[size - 1 - i][8] = (fmt >>> (14 - i)) & 1;
  };
  const scoreMatrix = (m) => {
    let pen = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) pen += 3; else if (run > 5) pen += 1; }
        else run = 1;
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; if (run === 5) pen += 3; else if (run > 5) pen += 1; }
        else run = 1;
      }
    }
    let dark = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (m[r][c]) dark++;
        if (r + 1 < size && c + 1 < size) {
          const v = m[r][c];
          if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) pen += 3;
        }
      }
    }
    const pct = Math.abs((dark * 100) / (size * size) - 50);
    pen += Math.floor(pct / 5) * 10;
    return pen;
  };

  let bestMat = null;
  let bestScore = Infinity;
  for (let maskId = 0; maskId < 8; maskId++) {
    const cand = mat.map((row) => Uint8Array.from(row));
    const fn = maskFn[maskId];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunc[r][c] && fn(r, c)) cand[r][c] ^= 1;
      }
    }
    writeFormat(cand, maskId);
    const s = scoreMatrix(cand);
    if (s < bestScore) { bestScore = s; bestMat = cand; }
  }
  return bestMat;
}

function buildAssetQrDataUri(serialId, waNumber = '61439759528') {
  const cleanSerial = String(serialId || '').trim();
  const cleanWa = String(waNumber || '61439759528').replace(/[^\d]/g, '') || '61439759528';
  const qrPayload = `https://wa.me/${cleanWa}?text=${encodeURIComponent('INFO ' + cleanSerial)}`;

  if (localStorage.getItem('entelso_external_qr') === 'true') {
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}&margin=4`;
  }

  const matrix = encodeIsoQrMatrix(qrPayload);
  const size = matrix.length;
  const quiet = 4;
  const totalModules = size + quiet * 2;
  const cell = 4;
  const qrPx = totalModules * cell;
  const captionH = 20;
  const svgW = qrPx;
  const svgH = qrPx + captionH;

  let pathD = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        pathD += `M${(c + quiet) * cell},${(r + quiet) * cell}h${cell}v${cell}h-${cell}z`;
      }
    }
  }

  const labelText = escapeHTML(`INFO ${cleanSerial || 'ASSET'}`.slice(0, 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="160" height="176" shape-rendering="crispEdges">` +
    `<rect width="${svgW}" height="${svgH}" rx="6" fill="#ffffff"/>` +
    `<path fill="#111827" d="${pathD}"/>` +
    `<text x="${svgW / 2}" y="${qrPx + 13}" text-anchor="middle" font-family="monospace,sans-serif" font-size="11" font-weight="700" fill="#111827">${labelText}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}



/* ─────────────────────────────────────────
   GESTIÓN DE SESIÓN (JWT en sessionStorage)
───────────────────────────────────────── */
const session = {
  getToken:   ()        => sessionStorage.getItem('entelso_token') || localStorage.getItem('entelso_token'),
  getUser:    ()        => JSON.parse(sessionStorage.getItem('entelso_user') || localStorage.getItem('entelso_user') || 'null'),
  save:       (t, u)    => { 
    sessionStorage.setItem('entelso_token', t); sessionStorage.setItem('entelso_user', JSON.stringify(u)); 
    localStorage.setItem('entelso_token', t); localStorage.setItem('entelso_user', JSON.stringify(u)); 
  },
  clear:      ()        => { 
    sessionStorage.removeItem('entelso_token'); sessionStorage.removeItem('entelso_user'); 
    localStorage.removeItem('entelso_token'); localStorage.removeItem('entelso_user'); 
  },
  isLoggedIn: ()        => !!(sessionStorage.getItem('entelso_token') || localStorage.getItem('entelso_token')),
};

// Sincronizar sesiones entre pestañas (sessionStorage <-> localStorage)
if (sessionStorage.getItem('entelso_token')) {
  localStorage.setItem('entelso_token', sessionStorage.getItem('entelso_token'));
  if (sessionStorage.getItem('entelso_user')) localStorage.setItem('entelso_user', sessionStorage.getItem('entelso_user'));
} else if (localStorage.getItem('entelso_token')) {
  sessionStorage.setItem('entelso_token', localStorage.getItem('entelso_token'));
  if (localStorage.getItem('entelso_user')) sessionStorage.setItem('entelso_user', localStorage.getItem('entelso_user'));
}


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
   TOAST NOTIFICATIONS (Fallback)
───────────────────────────────────────── */
function showToast(message, type = 'success') {
  // Try to use a toast container if it exists
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.style.cssText = `padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;font-family:Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.3s;max-width:350px;`;
  toast.style.background = type === 'error' ? '#f85149' : type === 'warning' ? '#D4A017' : '#3fb950';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ─────────────────────────────────────────
   HELPER: RESPONSE PARSING & FETCH CON AUTH
───────────────────────────────────────── */
function extractErrorMessage(json, fallback = 'Request failed') {
  if (!json || typeof json !== 'object') return fallback;
  const code = json.error && typeof json.error === 'object' ? json.error.code : null;
  if (code && window.i18n?.has?.('err.' + code)) {
    return window.i18n.t('err.' + code);
  }
  if (typeof json.error === 'string' && json.error) return json.error;
  if (json.error && typeof json.error.message === 'string' && json.error.message) return json.error.message;
  if (typeof json.message === 'string' && json.message) return json.message;
  return fallback;
}

async function parseApiJson(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function handleSessionExpired() {
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
  session.clear();
  mostrarLogin();
  throw new Error('SESION_EXPIRADA');
}

async function apiFetch(path, options = {}) {
  const token = session.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const fetchOptions = { cache: 'no-store', ...options, headers };
  const res = await fetch(`${API_BASE}${path}`, fetchOptions);
  if (res.status === 401) {
    handleSessionExpired();
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

  // Subtle background auto-refresh every 120 seconds (skips if user is interacting or data unchanged)
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    if (document.hidden) return;
    const activeEl = document.activeElement;
    if (activeEl && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl.tagName)) return;
    if (document.querySelector('.modal-overlay.open, .drawer-overlay.open')) return;
    if (document.querySelectorAll('.row-checkbox:checked').length > 0) return;
    cargarActivos(true, false);
  }, 120000);
}

// Al cargar la página, aplicar tema guardado y verificar sesión
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('entelso_theme') || 'light';
  aplicarTema(savedTheme);
  document.getElementById('loginThemeBtn')?.addEventListener('click', () => {
    aplicarTema(isDark() ? 'light' : 'dark');
  });

  const token = session.getToken();
  if (token && tokenEsValido(token)) {
    actualizarInfoUsuario(session.getUser());
    if (typeof update2FAUI === 'function') update2FAUI(Boolean(session.getUser()?.is_2fa_enabled));
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    if (redirectUrl && ['manual.html', 'video_dashboard.html', 'video_whatsapp.html'].includes(redirectUrl)) {
      window.location.href = redirectUrl;
      return;
    }
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
  const totpGroup = document.getElementById('login2faGroup');
  const totpInput = document.getElementById('login2faCode');
  const totpCode  = totpInput ? totpInput.value.replace(/\s+/g, '') : '';
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
    const payload = totpCode ? { email, pin, totpCode } : { email, pin };
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await parseApiJson(res);

    if (!res.ok || data.success === false) {
      if (data?.error?.code === '2FA_REQUIRED' || data?.error?.details?.requires2FA) {
        if (totpGroup) totpGroup.style.display = 'block';
        if (totpInput) totpInput.focus();
        errorEl.textContent = t('login.2fa.required');
        errorEl.style.display = 'block';
        return;
      }
      // 401 o 403 del servidor
      errorEl.textContent   = extractErrorMessage(data, t('login.error.cred'));
      errorEl.style.display = 'block';
      return;
    }

    if (totpGroup) totpGroup.style.display = 'none';
    if (totpInput) totpInput.value = '';

    // Login exitoso — guardar token y usuario
    session.save(data.data.token, data.data.usuario);
    actualizarInfoUsuario(data.data.usuario);
    registrarAuditLog('login');
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');
    if (redirectUrl && ['manual.html', 'video_dashboard.html', 'video_whatsapp.html'].includes(redirectUrl)) {
      window.location.href = redirectUrl;
      return;
    }
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

function aplicarRBACUI() {
  const admin = isAdminRole();
  const invMgr = canManageInventory();
  const statusOrAssign = canUpdateStatusOrAssign();

  const toggleEl = (selector, visible) => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = visible ? '' : 'none';
    });
  };

  // Admin-only
  toggleEl('#menuUsuarios, #menuAudit, #bulkDeleteUsersBtn, button[onclick*="openBulkDelete(\'usuarios\')"], #openAddUserModal, #openManageTeamsBtn, button[onclick*="openManageTeams"], #btnNuevoEmpleadoTeams', admin);

  // Inventory management (admin | almacen)
  toggleEl('#openNewItemModal, #openNewItemModal2, #openImportModal, #openImportModal2, #openManageCategoriesModalBtn, #openManageZonasBtn, button[onclick*="openManageZonas"], #openAgendarModal, #drawerEditBtn, #drawerNotasSave, #bulkDeleteSelectedBtn, #bulkMoveCategoryBtn, #btnAddKitItem', invMgr);

  const notasTextarea = document.getElementById('drawerNotasTextarea');
  if (notasTextarea) notasTextarea.readOnly = !invMgr;

  // Status & reassignment (admin | almacen | supervisor)
  toggleEl('#drawerUsuarioSection, #bulkSetStatusBtn, #bulkSetZonaBtn, #bulkSetTeamBtn, #bulkSetUsuarioBtn, #selectAllCheckbox', statusOrAssign);

  if (!statusOrAssign) {
    toggleEl('#bulkActionsBtn', false);
  }
}

function updateSegSessionInfo() {
  const segEl = document.getElementById('segSessionInfo');
  if (!segEl) return;
  const ua = navigator.userAgent || '';
  const browserFallback = window.i18n?.t('seg.navegador_generico') || 'Browser';
  const deviceFallback = window.i18n?.t('seg.dispositivo_generico') || 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : browserFallback;
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : deviceFallback;
  const statusLabel = window.i18n?.t('seg.sesion_actual') || 'Current session · Active now';
  const statelessNote = window.i18n?.t('seg.stateless_nota') || 'Stateless JWT authentication active';
  segEl.textContent = `${os} · ${browser} — ${statusLabel} (${statelessNote})`;
}

let current2FAEnabled = false;
function update2FAUI(enabled) {
  current2FAEnabled = Boolean(enabled);
  const badge = document.getElementById('seg2faStatusBadge');
  const setupBtn = document.getElementById('btnSetup2FA');
  const disableBtn = document.getElementById('btnDisable2FA');
  if (badge) {
    badge.setAttribute('data-i18n', current2FAEnabled ? 'seg.2fa_activado' : 'seg.2fa_desactivado');
    badge.textContent = window.i18n?.t(current2FAEnabled ? 'seg.2fa_activado' : 'seg.2fa_desactivado') || (current2FAEnabled ? 'Enabled' : 'Disabled');
    badge.style.color = current2FAEnabled ? 'var(--accent-green)' : 'var(--accent-yellow)';
  }
  if (setupBtn) {
    setupBtn.style.display = current2FAEnabled ? 'none' : 'inline-flex';
    setupBtn.setAttribute('data-i18n', 'seg.2fa_btn');
    setupBtn.textContent = window.i18n?.t('seg.2fa_btn') || 'Setup 2FA';
  }
  if (disableBtn) {
    disableBtn.style.display = current2FAEnabled ? 'inline-flex' : 'none';
    disableBtn.style.marginTop = '0';
  }
  const u = session.getUser();
  if (u && u.is_2fa_enabled !== current2FAEnabled) {
    session.save(session.getToken(), { ...u, is_2fa_enabled: current2FAEnabled });
  }
}

async function cargarEstado2FA() {
  try {
    const res = await apiFetch('/api/auth/me');
    const json = await parseApiJson(res);
    if (res.ok && json.success !== false && json.data) {
      update2FAUI(Boolean(json.data.is_2fa_enabled));
    }
  } catch (e) {
    if (e.message !== 'SESION_EXPIRADA') console.warn('Could not load 2FA status:', e.message);
  }
}

/* ─────────────────────────────────────────
   ACTUALIZAR INFO USUARIO EN SIDEBAR
───────────────────────────────────────── */
function actualizarInfoUsuario(user) {
  if (!user) return;
  const nombre  = user.nombre || '—';
  const email   = user.email  || '—';
  const rol     = (user.rol || '—').toLowerCase();
  const initials = nombre.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
  const roleKey = `usuarios.role_${rol}`;
  const displayRole = window.i18n?.has?.(roleKey) ? window.i18n.t(roleKey) : (user.rol || '—');

  document.getElementById('userDisplayName').textContent   = nombre;
  document.getElementById('userDisplayRole').textContent   = displayRole;
  document.getElementById('userAvatar').textContent        = initials;
  document.getElementById('profileDropName').textContent   = nombre;
  document.getElementById('profileDropEmail').textContent  = email;
  document.getElementById('profileDropAvatar').textContent = initials;
  aplicarRBACUI();
  updateSegSessionInfo();
}

/* ─────────────────────────────────────────
   INICIALIZAR APP — Cargar datos del backend
───────────────────────────────────────── */
async function inicializarApp() {
  aplicarRBACUI();
  updateSegSessionInfo();

  await Promise.all([
    cargarActivos(),
    cargarUsuarios(),
    cargarAlertas(),
    cargarCategorias(),
    cargarUbicaciones(),
    loadTeams(),
    loadZonas(),
  ]);
  
  if (!window.appUIInitialized) {
    inicializarNavegacion();
    inicializarTema();
    inicializarPerfil();
    inicializarDrawer();
    inicializarModal();
    inicializarImportModal();
    inicializarFiltros();
    window.appUIInitialized = true;
  }
  aplicarRBACUI();
}

/* ─────────────────────────────────────────
/* ─────────────────────────────────────────
   HELPERS GLOBALES
───────────────────────────────────────── */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
function formatearFecha(isoString) {
  if (!isoString || isoString === '—') return '—';
  // Si la fecha ya viene formateada del backend, solo retornarla, pero por precaución:
  try {
    const str = String(isoString).trim();
    const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const anio = Number(dateOnlyMatch[1]);
      const mes = Number(dateOnlyMatch[2]);
      const dia = Number(dateOnlyMatch[3]);
      const d = new Date(anio, mes - 1, dia);
      if (!isNaN(d.getTime()) && d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia) {
        return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
      }
      return isoString;
    }
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  } catch(e) {
    return isoString;
  }
}
function statusPill(status) {
  const { t } = window.i18n;
  const safeStatus = String(status || 'desconocido').replace(/[^a-zA-Z0-9_-]/g, '');
  const key = `estado.${safeStatus}`;
  const label = window.i18n?.has?.(key) ? t(key) : String(status || 'desconocido').replace(/_/g, ' ');
  return `<span class="status-pill s-${escapeHTML(safeStatus)}"><span class="dot"></span>${escapeHTML(label)}</span>`;
}

function empStatusPill(estado) {
  const { t } = window.i18n;
  const map = {
    en_terreno:     { cls:'emp-terreno', key:'filter.terreno' },
    oficina:        { cls:'emp-oficina',  key:'filter.oficina' },
    sin_asignacion: { cls:'emp-sin',      key:'filter.sin_asig' },
  };
  const s = map[estado] || { cls:'emp-sin', key:'filter.sin_asig' };
  return `<span class="emp-status-pill ${s.cls}"><span class="dot"></span>${t(s.key)}</span>`;
}

function mostrarCargando(tbodyId, colspan = 11) {
  const tbody = typeof tbodyId === 'string' ? document.getElementById(tbodyId) : tbodyId;
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="table-empty"><span class="table-spinner"></span> ${escapeHTML(window.i18n.t('api.cargando'))}</td></tr>`;
}

function mostrarErrorTabla(tbodyId, msg = null, colspan = 11) {
  const tbody = typeof tbodyId === 'string' ? document.getElementById(tbodyId) : tbodyId;
  if (!tbody) return;
  let finalMsg = msg;
  let finalColspan = colspan;
  if (typeof msg === 'number') {
    finalColspan = msg;
    finalMsg = null;
  }
  const text = finalMsg || window.i18n.t('api.error');
  tbody.innerHTML = `<tr><td colspan="${finalColspan}" class="table-empty">${escapeHTML(text)}</td></tr>`;
}

/* ─────────────────────────────────────────
   CARGA DE ACTIVOS
───────────────────────────────────────── */
let inventoryData = [];

async function cargarActivos(silent = false, forceRender = true) {
  if (!silent && inventoryData.length === 0) {
    mostrarCargando('dashTableBody', 8);
    mostrarCargando('inventTableBody', 11);
  }
  try {
    const res = await apiFetch('/api/activos');
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n?.t('api.error') || 'Error loading assets'));
    }
    const rawList = json.data || [];
    const newSig = JSON.stringify(rawList.map(a => [
      a.id, a.numero_serie, a.nombre_item, a.cantidad, a.estado,
      a.ubicacion_id, a.usuario_id, a.nombre_usuario, a.team, a.usuario_team,
      a.categoria_padre, a.fecha_ultima_cali, a.fecha_prox_cali, a.fecha_ultimo_tag, a.fecha_prox_tag, a.notas
    ]));
    if (silent && !forceRender && window._lastActivosSig === newSig) {
      return; // Data has not changed — avoid resetting scroll/DOM
    }
    window._lastActivosSig = newSig;

    // Normalizar formato del backend al formato del dashboard
    inventoryData = rawList.map(a => ({
      db_id:       a.id,
      id:          a.numero_serie,
      equipo:      a.nombre_item,
      cantidad:    a.cantidad !== undefined ? a.cantidad : 1,
      marca:       a.marca || '—',
      tipo_item:   window.translateTipo(a.tipo),
      raw_tipo:    a.tipo,
      categoria:   window.getAssetCategory(a),
      categoria_padre: a.categoria_padre || '',
      zona:        a.nombre_ubicacion || '—',
      team:        a.team || a.usuario_team || '—',
      status:      a.estado,
      fecha:       a.fecha_registro || a.fecha_prox_tag || a.fecha_prox_cali || null,
      // Drawer fields
      serie:       a.numero_serie,
      original_serial: a.original_serial || '',
      parent_activo_id: a.parent_activo_id || null,
      ultima_calibracion: a.fecha_ultima_cali || null,
      calibracion: a.fecha_prox_cali || null,
      ultimo_tag:  a.fecha_ultimo_tag || null,
      tag:         a.fecha_prox_tag  || null,
      asignado:    a.nombre_usuario  || '—',
      ubicacion:   a.nombre_ubicacion || '—',
      usuario_id:  a.usuario_id      || null,
      ubicacion_id: a.ubicacion_id   || null,
      item_id:     a.item_id         || null,
      notas:       a.notas           || '',
      fotos:       a.fotos           || [],
      _raw:        a,
    }));
    window.currentDataActivos = rawList;
    renderizarActivos();
    actualizarKPIs();
    renderizarGraficos();
    renderizarZonas();
    syncEmpleadosActivos();
    renderizarAlertas([]);
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.error('Error al cargar activos desde el backend:', err.message);
      inventoryData = [];
      renderizarActivos();
      actualizarKPIs();
      renderizarGraficos();
      renderizarZonas();
    }
  }
}

/* ─────────────────────────────────────────
   CARGA DE USUARIOS / EMPLEADOS
───────────────────────────────────────── */
let employeesData = [];

function populateUsuarioSelects() {
  const users = window.usuariosData || [];
  const opts = users.map(u => `<option value="${u.id}">${escapeHTML(u.nombre)}${u.team ? ' (' + escapeHTML(u.team) + ')' : ''}</option>`).join('');
  const optsPlain = users.map(u => `<option value="${u.id}">${escapeHTML(u.nombre)}</option>`).join('');

  const setSelectPreserve = (id, defaultHtml, optionsHtml) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = defaultHtml + optionsHtml;
    if (prev && Array.from(el.options).some(o => o.value === prev)) {
      el.value = prev;
    }
  };

  setSelectPreserve('modalUsuario', `<option value="" data-i18n="usuarios.sin_asignar">-- ${window.i18n?.t('usuarios.sin_asignar') || 'Unassigned'} --</option>`, opts);
  setSelectPreserve('bulkUsuarioSelect', `<option value="" data-i18n="usuarios.sin_asignar">-- ${window.i18n?.t('usuarios.sin_asignar') || 'Unassigned'} --</option>`, opts);
  setSelectPreserve('drawerUsuarioSelect', `<option value="" data-i18n="usuarios.sin_asignar">-- ${window.i18n?.t('usuarios.sin_asignar') || 'Unassigned'} --</option>`, opts);
  setSelectPreserve('editAssetUsuario', `<option value="">-- ${window.i18n?.t('usuarios.sin_asignar') || 'Unassigned'} --</option>`, opts);
  setSelectPreserve(
    'advFilterUsuario',
    `<option value="" data-i18n="filter.todos_usuarios">${window.i18n?.t('filter.todos_usuarios') || 'All People'}</option><option value="__unassigned__" data-i18n="usuarios.sin_asignar">-- ${window.i18n?.t('usuarios.sin_asignar') || 'Unassigned'} --</option>`,
    optsPlain
  );
}

async function cargarUsuarios() {
  if (!canUpdateStatusOrAssign()) {
    window.usuariosData = [];
    employeesData = [];
    populateUsuarioSelects();
    renderizarEmpleados([]);
    actualizarKPIsEmpleados();
    return;
  }

  try {
    const endpoint = isAdminRole() ? '/api/usuarios' : '/api/usuarios/asignables';
    const res  = await apiFetch(endpoint);
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n?.t('usuarios.err_cargar') || 'Error loading users'));
    }
    const rawUsers = (json.data || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    window.usuariosData = rawUsers;
    populateUsuarioSelects();

    employeesData = rawUsers.map(u => ({
      id:            `USR-${u.id}`,
      db_id:         u.id,
      nombre:        u.nombre || '—',
      initials:      (u.nombre || 'U').split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase(),
      color:         '7c6ff7',
      team:          u.team || '—',
      rol:           u.rol  || '—',
      email:         u.email || '—',
      telefono:      u.telefono_whatsapp || '—',
      equipo_id:     null,
      equipo_nombre: '—',
      sitio:         '—',
      zona:          '—',
      fecha_asig:    '—',
      retorno:       '—',
      en_terreno:    u.en_terreno === true,
      estado:        'sin_asignacion',
    }));
    syncEmpleadosActivos();
    if (inventoryData && inventoryData.length > 0) {
      window.aplicarFiltrosInventario();
    }
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.warn('No se pudieron cargar usuarios:', err.message);
      renderizarEmpleados([]);
    }
  }
}

window.aplicarFiltrosEmpleados = function() {
  if (!employeesData) return;
  const searchEl = document.getElementById('employeeSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const activeChip = document.querySelector('[data-emp-filter].active');
  const filter = activeChip ? activeChip.dataset.empFilter : 'all';

  let filtered = employeesData;
  if (filter && filter !== 'all') {
    filtered = filtered.filter(e => {
      if (filter === 'en_terreno') return e.estado === 'en_terreno' || e.estado === 'asignado';
      return e.estado === filter;
    });
  }
  if (q) {
    filtered = filtered.filter(e => {
      const nom = e.nombre ? e.nombre.toLowerCase() : '';
      const id  = e.id ? e.id.toLowerCase() : '';
      const tm  = e.team ? e.team.toLowerCase() : '';
      const eq  = e.equipo_nombre ? e.equipo_nombre.toLowerCase() : '';
      return nom.includes(q) || id.includes(q) || tm.includes(q) || eq.includes(q);
    });
  }
  renderizarEmpleados(filtered);
};

function syncEmpleadosActivos() {
  if (!employeesData || !employeesData.length) return;
  employeesData.forEach(emp => {
    const activosEmp = (inventoryData || []).filter(a =>
      (a.usuario_id && Number(a.usuario_id) === Number(emp.db_id)) ||
      (a.asignado && a.asignado.toLowerCase() === emp.nombre.toLowerCase())
    );
    if (activosEmp.length > 0) {
      const primero = activosEmp[0];
      emp.equipo_id = primero.id;
      emp.equipo_nombre = activosEmp.length > 1 ? `${primero.equipo} (+${activosEmp.length - 1})` : primero.equipo;
      emp.sitio = primero.zona;
      emp.zona = primero.zona;
      emp.estado = 'en_terreno';
      emp.fecha_asig = primero.fecha;
    } else {
      emp.equipo_id = null;
      emp.equipo_nombre = '—';
      emp.sitio = '—';
      emp.zona = '—';
      emp.fecha_asig = '—';
      emp.estado = emp.en_terreno ? 'en_terreno' : 'sin_asignacion';
    }
  });
  window.aplicarFiltrosEmpleados();
  actualizarKPIsEmpleados();
}

/* ─────────────────────────────────────────
   CARGA DE ALERTAS
───────────────────────────────────────── */
async function cargarAlertas() {
  renderizarAlertas([]);
}

async function cargarAuditLog() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;
  if (!isAdminRole()) {
    tbody.innerHTML = '';
    return;
  }
  
  mostrarCargando('auditTableBody', 3);
  
  try {
    const res = await apiFetch('/api/audit');
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n?.t('audit.err_cargar') || 'Error loading audit log'));
    }
    const logs = json.data || [];
    
    tbody.innerHTML = '';
    
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-3);">${escapeHTML(window.i18n.t('audit.no_records') || 'No activity records.')}</td></tr>`;
      return;
    }
    
    logs.forEach(log => {
      const tr = document.createElement('tr');
      // Traducir acciones conocidas
      let actionText = log.accion;
      if (actionText === 'Inició sesión en el sistema' || actionText === 'login') {
        actionText = window.i18n.t('audit.login') || actionText;
      }
      
      tr.innerHTML = `
        <td style="font-size: 12px; color: var(--text-2);">${escapeHTML(log.fecha)}</td>
        <td style="font-weight: 500;">${escapeHTML(log.user)}</td>
        <td style="color: var(--text-1);">${escapeHTML(actionText)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      mostrarErrorTabla('auditTableBody', null, 3);
    }
  }
}

async function registrarAuditLog(accion, meta = null) {
  try {
    const payload = { accion };
    if (meta) payload.meta = meta;
    const res = await apiFetch('/api/audit', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!res.ok && res.status === 403) return;
    if (isAdminRole() && document.getElementById('view-audit')?.classList.contains('active')) {
      cargarAuditLog();
    }
  } catch (err) {
    console.error('Error registering audit log:', err.message);
  }
}


/* ─────────────────────────────────────────
   RENDER: TABLA DE ACTIVOS
───────────────────────────────────────── */
window.expandedInventoryGroups = window.expandedInventoryGroups || new Set();
window.selectedAssetIds = window.selectedAssetIds || new Set();

function bindInventoryTableDelegation(tbody) {
  if (!tbody || tbody.dataset.delegated === '1') return;
  tbody.dataset.delegated = '1';

  tbody.addEventListener('click', (e) => {
    const groupCb = e.target.closest('.group-checkbox');
    if (groupCb) {
      e.stopPropagation();
      window.toggleGroupCheckbox(Number(groupCb.dataset.group), groupCb.checked);
      return;
    }
    const rowCb = e.target.closest('.row-checkbox');
    if (rowCb) {
      e.stopPropagation();
      window.updateBulkActionsState();
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const dbId = Number(actionBtn.dataset.dbId);
      if (actionBtn.dataset.action === 'view-asset') window.verDetallesActivo(dbId);
      else if (actionBtn.dataset.action === 'delete-asset') window.eliminarActivo(dbId);
      return;
    }
    if (e.target.closest('select')) {
      e.stopPropagation();
      return;
    }
    const tr = e.target.closest('tr[data-db-id]');
    if (tr) {
      const dbId = Number(tr.dataset.dbId);
      const item = inventoryData.find(i => Number(i.db_id) === dbId) || inventoryData.find(i => i.id === tr.dataset.id);
      if (item) openDrawer(item);
    }
  });

  tbody.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-action]');
    if (!sel) return;
    e.stopPropagation();
    const dbId = sel.dataset.dbId;
    if (sel.dataset.action === 'assign-user') {
      window.actualizarUsuarioHerramienta(dbId, sel.value);
    } else if (sel.dataset.action === 'change-status') {
      window.actualizarEstadoHerramienta(dbId, sel.value);
    }
  });
}

function renderInventoryTable(tbody, data, groupByKey = null, forceExpandAll = false) {
  if (!tbody) return;
  bindInventoryTableDelegation(tbody);

  const isDash = tbody.id === 'dashTableBody';
  const colspan = isDash ? 8 : 11;
  const allowAssignOrStatus = canUpdateStatusOrAssign();
  const allowDelete = canManageInventory();

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="table-empty">${escapeHTML(window.i18n.t('api.sin_datos'))}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';

  const usersList = window.usuariosData || [];
  const unassignedLabel = window.i18n?.t('usuarios.sin_asignar') || 'Unassigned';

  const renderRow = (item) => {
    const safeDbId = Number(item.db_id) || 0;
    const displayAssigned = (item.asignado && item.asignado !== '—') ? item.asignado : unassignedLabel;

    if (isDash) {
      return `
        <td><span class="id-cell" style="display:inline-block; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: 'Courier New', Courier, monospace; font-weight: 600; font-size: 13px; color: var(--text);" title="${escapeHTML(item.id)}">${escapeHTML(item.id)}</span></td>
        <td>${escapeHTML(item.equipo)}</td>
        <td>${escapeHTML(item.zona)}</td>
        <td style="text-align:center;">${escapeHTML(item.cantidad)}</td>
        <td style="color:var(--text-2)">${escapeHTML(item.team)}</td>
        <td style="font-weight:${item.usuario_id ? '600' : '400'}; color:${item.usuario_id ? 'var(--text-1)' : 'var(--text-3)'};">${escapeHTML(displayAssigned)}</td>
        <td>${statusPill(item.status)}</td>
        <td class="col-right">${escapeHTML(formatearFecha(item.fecha))}</td>
      `;
    } else {
      const isChecked = window.selectedAssetIds.has(String(item.db_id));
      const hasCurrentInList = item.usuario_id && usersList.some(u => Number(u.id) === Number(item.usuario_id));
      const userOpts = [
        `<option value="" ${!item.usuario_id ? 'selected' : ''}>-- ${escapeHTML(unassignedLabel)} --</option>`,
        ...(!hasCurrentInList && item.usuario_id && item.asignado && item.asignado !== '—'
          ? [`<option value="${escapeHTML(item.usuario_id)}" selected>${escapeHTML(item.asignado)}</option>`]
          : []),
        ...usersList.map(u => `<option value="${escapeHTML(u.id)}" ${Number(item.usuario_id) === Number(u.id) ? 'selected' : ''}>${escapeHTML(u.nombre)}</option>`)
      ].join('');

      const checkboxCell = !allowAssignOrStatus
        ? ''
        : (item.parent_activo_id
          ? `<i class="fa-solid fa-lock" style="color:var(--text-3); font-size:12px;" title="${escapeHTML(window.i18n?.t('modal.err_already_in_kit') || 'In Kit')}"></i>`
          : `<input type="checkbox" class="row-checkbox" value="${escapeHTML(safeDbId)}" ${isChecked ? 'checked' : ''}>`);

      const assignedCell = allowAssignOrStatus
        ? `<select class="form-input" data-action="assign-user" data-db-id="${escapeHTML(safeDbId)}" style="font-size:12px; padding:3px 6px; min-width:145px; max-width:190px; font-weight:${item.usuario_id ? '600' : '400'}; color:${item.usuario_id ? 'var(--text-1)' : 'var(--text-3)'};" title="${escapeHTML(item.asignado)}">${userOpts}</select>`
        : `<span style="font-weight:${item.usuario_id ? '600' : '400'}; color:${item.usuario_id ? 'var(--text-1)' : 'var(--text-3)'};">${escapeHTML(displayAssigned)}</span>`;

      const statusSelectHtml = allowAssignOrStatus
        ? `<select class="form-input" data-action="change-status" data-db-id="${escapeHTML(safeDbId)}" style="font-size:11px; padding:2px 4px; width:110px;">
                <option value="">${escapeHTML(window.i18n?.t('inv.actualizar') || '-- Set Status --')}</option>
                <option value="disponible">${escapeHTML(window.i18n?.t('estado.disponible') || 'Available')}</option>
                <option value="en_uso">${escapeHTML(window.i18n?.t('estado.en_uso') || 'In Use')}</option>
                <option value="en_mantenimiento">${escapeHTML(window.i18n?.t('estado.en_mantenimiento') || 'Under Maintenance')}</option>
                <option value="danado">${escapeHTML(window.i18n?.t('estado.danado') || 'Damaged')}</option>
             </select>`
        : '';

      const deleteBtnHtml = allowDelete
        ? `<button class="icon-btn" data-action="delete-asset" data-db-id="${escapeHTML(safeDbId)}" title="${escapeHTML(window.i18n?.t('bulk.btn_eliminar') || 'Delete')}" style="flex-shrink:0;"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>`
        : '';

      return `
        <td style="text-align:center;">${checkboxCell}</td>
        <td><span class="id-cell" style="display:inline-block; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: 'Courier New', Courier, monospace; font-weight: 600; font-size: 13px; color: var(--text);" title="${escapeHTML(item.id)}">${escapeHTML(item.id)}</span></td>
        <td>${escapeHTML(item.equipo)}</td>
        <td>${escapeHTML(item.zona)}</td>
        <td style="text-align:center;">${escapeHTML(item.cantidad)}</td>
        <td>${assignedCell}</td>
        <td style="color:var(--text-2)">${escapeHTML(item.team)}</td>
        <td>${statusPill(item.status)}</td>
        <td class="col-right">${escapeHTML(formatearFecha(item.ultima_calibracion))}</td>
        <td class="col-right">${escapeHTML(formatearFecha(item.calibracion || item.fecha))}</td>
        <td class="action-cell">
           <div style="display:flex; align-items:center; gap:4px; justify-content:flex-end;">
             ${statusSelectHtml}
             <button class="icon-btn" data-action="view-asset" data-db-id="${escapeHTML(safeDbId)}" title="${escapeHTML(window.i18n?.t('tabla.ver') || 'Details')}" style="flex-shrink:0;"><i class="fa-solid fa-eye" style="color:var(--accent-blue)"></i></button>
             ${deleteBtnHtml}
           </div>
        </td>
      `;
    }
  };

  if (groupByKey) {
    const groups = {};
    data.forEach(item => {
      let key;
      if (groupByKey === 'zona') {
        key = getNormalizedZone(item.zona);
      } else if (groupByKey === 'status') {
        const raw = item.status || '';
        const statusKey = 'estado.' + raw;
        key = (raw && window.i18n?.has?.(statusKey))
          ? window.i18n.t(statusKey)
          : (raw ? raw.replace(/_/g, ' ') : (window.i18n?.t('estado.desconocido') || 'Unknown'));
      } else if (groupByKey === 'asignado') {
        key = (item.asignado && item.asignado !== '—') ? item.asignado : (window.i18n.t('api.sin_asignar') || 'Unassigned');
      } else {
        key = (item[groupByKey] && item[groupByKey] !== '—') ? item[groupByKey] : (window.i18n.t('api.sin_asignar') || 'Unassigned');
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    Object.keys(groups).sort((a, b) => {
      const unass = (window.i18n?.t('api.sin_asignar') || 'Unassigned').toLowerCase();
      if (a.toLowerCase() === unass) return 1;
      if (b.toLowerCase() === unass) return -1;
      return a.localeCompare(b);
    }).forEach((groupName, gIdx) => {
      const groupStateKey = `${groupByKey}:${groupName}`;
      const isExpanded = forceExpandAll || window.expandedInventoryGroups.has(groupStateKey);
      const chevronClass = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';

      const headerTr = document.createElement('tr');
      headerTr.style.cursor = 'pointer';
      
      if (!isDash) {
        headerTr.innerHTML = `
          <td style="text-align:center; background: var(--bg-hover);">${allowAssignOrStatus ? `<input type="checkbox" class="group-checkbox" data-group="${gIdx}">` : ''}</td>
          <td colspan="${colspan - 1}" style="background: var(--bg-hover); font-weight: bold; color: var(--text-1); padding-top: 16px; padding-bottom: 8px; user-select: none;">
            <i class="fa-solid ${chevronClass} group-toggle-icon" style="margin-right: 8px; width: 14px; text-align: center;"></i>
            ${escapeHTML(groupName)} (${groups[groupName].length})
          </td>
        `;
      } else {
        headerTr.innerHTML = `
          <td colspan="${colspan}" style="background: var(--bg-hover); font-weight: bold; color: var(--text-1); padding-top: 16px; padding-bottom: 8px; user-select: none;">
            <i class="fa-solid ${chevronClass} group-toggle-icon" style="margin-right: 8px; width: 14px; text-align: center;"></i>
            ${escapeHTML(groupName)} (${groups[groupName].length})
          </td>
        `;
      }
      
      headerTr.onclick = () => {
        const icon = headerTr.querySelector('.group-toggle-icon');
        const rows = tbody.querySelectorAll(`.group-row-${gIdx}`);
        const isCollapsed = icon.classList.contains('fa-chevron-right');
        
        if (isCollapsed) {
          icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
          rows.forEach(r => r.style.display = '');
          window.expandedInventoryGroups.add(groupStateKey);
        } else {
          icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
          rows.forEach(r => r.style.display = 'none');
          window.expandedInventoryGroups.delete(groupStateKey);
        }
      };

      tbody.appendChild(headerTr);
      
      groups[groupName].forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.dataset.dbId = item.db_id;
        tr.classList.add(`group-row-${gIdx}`);
        tr.style.display = isExpanded ? '' : 'none';
        tr.innerHTML = renderRow(item);
        if (!isDash) {
          const cb = tr.querySelector('.row-checkbox');
          if (cb) cb.dataset.group = gIdx;
        }
        tbody.appendChild(tr);
      });
    });
  } else {
    data.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.dataset.dbId = item.db_id;
      tr.innerHTML = renderRow(item);
      tbody.appendChild(tr);
    });
  }
}

window.activeSmartFilters = new Set();

window.toggleGroupCheckbox = function(gIdx, checked) {
  document.querySelectorAll(`.row-checkbox[data-group="${gIdx}"]`).forEach(cb => {
    cb.checked = checked;
  });
  window.updateBulkActionsState();
};

// Smart filter functions
const smartFilterFns = {
  missing_photo: (item) => {
    const raw = item._raw;
    if (!raw || !raw.fotos) return true;
    let fotos = raw.fotos;
    if (typeof fotos === 'string') {
      try { fotos = JSON.parse(fotos); } catch(e) { return true; }
    }
    return !Array.isArray(fotos) || fotos.filter(f => f && typeof f === 'string' && f.trim().length > 0).length === 0;
  },
  not_updated: (item) => {
    const raw = item._raw;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (!raw || !raw.fecha_registro) return true;
    return new Date(raw.fecha_registro) < sevenDaysAgo;
  },
  expired_cal: (item) => {
    const now = new Date();
    const cal = item.calibracion ? new Date(item.calibracion) : null;
    const tag = item.tag ? new Date(item.tag) : null;
    return (cal && cal < now) || (tag && tag < now);
  }
};

window.aplicarFiltrosDashboard = function() {
  const activeChip = document.querySelector('#view-dashboard .filter-chips .chip.active');
  const i18nKey = activeChip ? activeChip.getAttribute('data-i18n') : 'dash.filter.todos';
  let filtered = inventoryData;
  if (i18nKey === 'dash.filter.disp') {
    filtered = inventoryData.filter(i => ['disponible', 'calibrado', 'en_funcionamiento'].includes(i.status));
  } else if (i18nKey === 'dash.filter.alertas') {
    filtered = inventoryData.filter(i => window.tieneAlerta(i));
  } else {
    filtered = inventoryData.slice(0, 20);
  }
  renderInventoryTable(document.getElementById('dashTableBody'), filtered);
};

window.aplicarFiltrosInventario = function() {
  let data = inventoryData;

  // 1. Search Query (includes assigned person name and notes)
  const searchInput = document.getElementById('inventarioSearch');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (q) {
    data = data.filter(i =>
      (i.id && String(i.id).toLowerCase().includes(q)) || 
      (i.equipo && i.equipo.toLowerCase().includes(q)) ||
      (i.zona && i.zona.toLowerCase().includes(q)) || 
      (i.team && i.team.toLowerCase().includes(q)) ||
      (i.asignado && i.asignado.toLowerCase().includes(q)) ||
      (i.status && i.status.toLowerCase().includes(q)) ||
      (i.serie && i.serie.toLowerCase().includes(q)) ||
      (i.marca && i.marca.toLowerCase().includes(q)) ||
      (i.original_serial && i.original_serial.toLowerCase().includes(q)) ||
      (i.categoria_padre && i.categoria_padre.toLowerCase().includes(q)) ||
      (i.notas && i.notas.toLowerCase().includes(q))
    );
  }

  // 2. Category Filter
  const activeCatChip = document.querySelector('#inventoryCategoryChips .chip.active[data-filter], #inventoryCategoryChips .more-menu-item.active[data-filter]');
  const filterCat = activeCatChip ? activeCatChip.dataset.filter : 'all';
  if (filterCat && filterCat !== 'all') {
    data = data.filter(item => 
      item.categoria_padre === filterCat || 
      window.getAssetCategory(item) === filterCat
    );
  }

  // 3. Smart Filters (AND logic)
  if (window.activeSmartFilters && window.activeSmartFilters.size > 0) {
    data = data.filter(item => {
      for (const filterKey of window.activeSmartFilters) {
        if (smartFilterFns[filterKey] && !smartFilterFns[filterKey](item)) return false;
      }
      return true;
    });
  }

  // 4. Advanced Filters (Zone, Team, Person, Status) if active
  const advZonaSelect = document.getElementById('advFilterZona');
  const advZonaVal = advZonaSelect?.value.trim() || '';
  const advZonaText = (advZonaVal && advZonaSelect?.selectedOptions?.[0]) ? advZonaSelect.selectedOptions[0].textContent.trim().toLowerCase() : advZonaVal.toLowerCase();
  const advTeam = document.getElementById('advFilterTeam')?.value.trim().toLowerCase() || '';
  const advUsuario = document.getElementById('advFilterUsuario')?.value.trim() || '';
  const advStatus = document.getElementById('advFilterStatus')?.value.trim().toLowerCase() || '';

  if (advZonaVal || advTeam || advUsuario || advStatus) {
    data = data.filter(i => {
      const matchZona = advZonaVal
        ? (advZonaVal === 'Unassigned'
            ? getNormalizedZone(i.zona) === 'Unassigned'
            : (String(i.ubicacion_id) === advZonaVal || (i.zona || '').toLowerCase().includes(advZonaText) || (i.zona || '').toLowerCase().includes(advZonaVal.toLowerCase())))
        : true;
      const matchTeam = advTeam ? (i.team || '').toLowerCase().includes(advTeam) : true;
      const matchUsuario = advUsuario
        ? (advUsuario === '__unassigned__' ? !i.usuario_id : String(i.usuario_id) === String(advUsuario))
        : true;
      const matchStatus = advStatus ? (i.status || '').toLowerCase() === advStatus : true;
      return matchZona && matchTeam && matchUsuario && matchStatus;
    });
  }

  // Store for export
  window.currentFilteredData = data;

  const hasAnyFilter = Boolean(
    q ||
    (filterCat && filterCat !== 'all') ||
    (window.activeSmartFilters && window.activeSmartFilters.size > 0) ||
    advZonaVal || advTeam || advUsuario || advStatus
  );

  // Update active filter count badge
  const countEl = document.getElementById('smartFilterCount');
  if (countEl) {
    if (hasAnyFilter) {
      const resLabel = window.i18n?.t(data.length === 1 ? 'filter.resultado_singular' : 'filter.resultado_plural') || (data.length === 1 ? 'result' : 'results');
      countEl.textContent = `${data.length} ${resLabel}`;
      countEl.style.display = 'inline';
    } else {
      countEl.style.display = 'none';
    }
  }

  // Check active grouping tab
  const activeGTab = document.querySelector('.gtab.active');
  const groupByKey = activeGTab ? activeGTab.dataset.group : null;

  // Automatically expand matching groups when a search or filter is active so results are never hidden!
  renderInventoryTable(document.getElementById('inventTableBody'), data, groupByKey, hasAnyFilter);
  window.aplicarFiltrosDashboard();
};

function renderizarActivos() {
  window.aplicarFiltrosInventario();
}

// Smart Filter Event Handlers — multi-select toggle
document.querySelectorAll('.smart-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.smart;

    if (filter === 'clear') {
      window.activeSmartFilters.clear();
      document.querySelectorAll('.smart-filter').forEach(b => b.classList.remove('active'));
      document.getElementById('clearSmartFilter').style.display = 'none';
    } else {
      // Toggle this filter
      if (window.activeSmartFilters.has(filter)) {
        window.activeSmartFilters.delete(filter);
        btn.classList.remove('active');
      } else {
        window.activeSmartFilters.add(filter);
        btn.classList.add('active');
      }
      // Show/hide clear button
      document.getElementById('clearSmartFilter').style.display =
        window.activeSmartFilters.size > 0 ? 'inline-flex' : 'none';
    }

    renderizarActivos();
  });
});

/* ─────────────────────────────────────────
   RENDER: TABLA DE MANTENIMIENTO
───────────────────────────────────────── */
let maintenanceData = [];

function renderMaintenanceTable(tbody, data) {
  if (!tbody) return;
  if (tbody.dataset.delegated !== '1') {
    tbody.dataset.delegated = '1';
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="resolve-maint"]');
      if (btn) window.marcarMantenimientoAtendido(btn.dataset.id);
    });
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${escapeHTML(window.i18n.t('api.sin_datos'))}</td></tr>`;
    return;
  }
  const allowResolve = canManageInventory();
  tbody.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    const actionBtn = allowResolve
      ? `<button class="btn-ghost" data-action="resolve-maint" data-id="${escapeHTML(item.id)}" style="font-size: 12px; padding: 4px 8px; color: var(--accent-green);">${escapeHTML(window.i18n.t('mantenimiento.marcar_atendido') || 'Mark as Resolved')}</button>`
      : '';
    tr.innerHTML = `
      <td><span class="id-cell" style="display:inline-block; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: 'Courier New', Courier, monospace; font-weight: 600; font-size: 13px; color: var(--text);" title="${escapeHTML(item.id)}">${escapeHTML(item.id)}</span></td>
      <td>${escapeHTML(item.equipo)}</td>
      <td>${escapeHTML(item.zona)}</td>
      <td><span class="motive-tag">${escapeHTML(item.motivo)}</span></td>
      <td>${statusPill(item.status)}</td>
      <td class="col-right">${escapeHTML(formatearFecha(item.fecha))}</td>
      <td class="col-right">${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────
   RENDER: TABLA DE EMPLEADOS
───────────────────────────────────────── */
function renderizarEmpleados(data) {
  const tbody = document.getElementById('employeeTableBody');
  if (!tbody) return;
  if (tbody.dataset.delegated !== '1') {
    tbody.dataset.delegated = '1';
    tbody.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-action="emp-team"]');
      if (sel) updateWorkerTeam(Number(sel.dataset.userId), sel.value);
    });
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="edit-emp"]');
      if (btn) window.editarEmpleado(Number(btn.dataset.userId));
    });
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">${escapeHTML(window.i18n.t('api.sin_datos'))}</td></tr>`;
    return;
  }
  const allowAdminEdit = isAdminRole();
  const noTeamLabel = window.i18n.t('teams.sin_team') || 'No Team';
  const editUserTitle = window.i18n.t('usuarios.edit_title') || 'Edit User';
  tbody.innerHTML = '';
  data.forEach(emp => {
    const tr = document.createElement('tr');
    const safeUserId = Number(emp.db_id) || 0;
    const teamCell = allowAdminEdit
      ? `<select class="form-input" data-action="emp-team" data-user-id="${escapeHTML(safeUserId)}" style="padding: 4px 20px 4px 8px; font-size: 13px; border: 1px solid var(--border); border-radius: 4px; width: 140px; appearance: auto;">
           <option value="" ${!emp.team || emp.team === '-' || emp.team === '—' ? 'selected' : ''}>${escapeHTML(noTeamLabel)}</option>
           ${(window.teamsList || []).map(t => `<option value="${escapeHTML(t.nombre)}" ${emp.team === t.nombre ? 'selected' : ''}>${escapeHTML(t.nombre)}</option>`).join('')}
         </select>`
      : `<span style="color:var(--text-2)">${escapeHTML(emp.team && emp.team !== '-' ? emp.team : noTeamLabel)}</span>`;
    const actionCell = allowAdminEdit
      ? `<button class="icon-btn" data-action="edit-emp" data-user-id="${escapeHTML(safeUserId)}" title="${escapeHTML(editUserTitle)}"><i class="fa-solid fa-pen"></i></button>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="emp-cell">
          <div>
            <div class="emp-name">${escapeHTML(emp.nombre)}</div>
            <div class="emp-id">${escapeHTML(emp.id)} — ${escapeHTML(emp.email)}</div>
          </div>
        </div>
      </td>
      <td>${teamCell}</td>
      <td>
        ${emp.equipo_id
          ? `<span class="id-cell" style="margin-right:6px">${escapeHTML(emp.equipo_id)}</span>${escapeHTML(emp.equipo_nombre)}`
          : `<span style="color:var(--text-3)">${escapeHTML(window.i18n.t('api.sin_datos'))}</span>`}
      </td>
      <td>
        <div style="font-size:var(--font-size-sm)">${escapeHTML(emp.sitio)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--text-2)">${escapeHTML(emp.zona)}</div>
      </td>
      <td style="color:var(--text-2)">${escapeHTML(formatearFecha(emp.fecha_asig))}</td>
      <td style="color:var(--text-2)">${escapeHTML(formatearFecha(emp.retorno))}</td>
      <td>${empStatusPill(emp.estado)}</td>
      <td class="col-right">${actionCell}</td>
    `;
    tbody.appendChild(tr);
  });
}

const VALID_ZONES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT', 'Warehouse', 'Shared WT Kit', 'Unassigned'];

function getNormalizedZone(zonaStr) {
  if (!zonaStr) return 'Unassigned';
  const trimmed = String(zonaStr).trim();
  if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed.toLowerCase() === 'sin zona' || trimmed.toLowerCase() === 'general' || trimmed.toLowerCase() === 'unassigned') return 'Unassigned';
  const matched = VALID_ZONES.find(z => z.toLowerCase() === trimmed.toLowerCase());
  return matched || trimmed;
}

/* ─────────────────────────────────────────
   RENDER: ZONAS GRID
───────────────────────────────────────── */
function renderizarZonas() {
  const grid = document.getElementById('zoneGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Agrupar activos por zona (VIC, NSW, QLD, SA, WA y lo demás a Unknown)
  const zonaMap = {};
  inventoryData.forEach(a => {
    const z = getNormalizedZone(a.zona);
    if (!zonaMap[z]) zonaMap[z] = { total:0, disponibles:0 };
    zonaMap[z].total++;
    if (['disponible','calibrado','en_funcionamiento'].includes(a.status)) zonaMap[z].disponibles++;
  });

  const sortedKeys = Object.keys(zonaMap).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  sortedKeys.forEach(nombre => {
    const stats = zonaMap[nombre];
    const pct = stats.total > 0 ? Math.round((stats.disponibles / stats.total) * 100) : 0;
    const card = document.createElement('div');
    card.className = 'zone-card';
    card.style.cursor = 'pointer'; // Make it look clickable
    const displayZoneName = nombre === 'Unassigned' ? (window.i18n?.t('usuarios.sin_asignar') || 'Unassigned') : nombre;
    card.innerHTML = `
      <div class="zone-card-name">${escapeHTML(displayZoneName)}</div>
      <div class="zone-stat"><span>${escapeHTML(window.i18n.t('kpi.total'))}</span><strong>${stats.total}</strong></div>
      <div class="zone-stat"><span>${escapeHTML(window.i18n.t('kpi.disponibles'))}</span><strong style="color:var(--accent-green)">${stats.disponibles}</strong></div>
      <div class="zone-bar"><div class="zone-bar-fill" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--text-2);margin-top:4px;">${pct}% ${escapeHTML(window.i18n.t('kpi.disponibilidad') || 'Availability')}</div>
    `;
    
    // Al hacer clic, filtrar la tabla de inventario y redirigir
    card.addEventListener('click', () => {
      const advFilterZona = document.getElementById('advFilterZona');
      if (advFilterZona) {
        let optionExists = Array.from(advFilterZona.options).some(opt => opt.value === nombre);
        if (!optionExists) {
          const newOpt = new Option(nombre, nombre);
          advFilterZona.add(newOpt);
        }
        advFilterZona.value = nombre;
      }
      window.aplicarFiltrosInventario();

      // Cambiar a la vista de inventario
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-inventario').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const menuInventario = document.querySelector('.nav-item[data-view="inventario"]');
      if (menuInventario) menuInventario.classList.add('active');
    });

    grid.appendChild(card);
  });

  // Si no hay zonas, mostrar mensaje
  if (Object.keys(zonaMap).length === 0) {
    grid.innerHTML = `<div class="table-empty">${window.i18n.t('api.sin_datos')}</div>`;
  }
}

/* ─────────────────────────────────────────
   RENDER: ALERTAS
───────────────────────────────────────── */

window.tieneAlerta = function(a) {
  if (['calibracion_pendiente','fuera_de_servicio','danado','en_mantenimiento'].includes(a.status)) return true;
  const today = new Date();
  let hasAlert = false;
  const checkDate = (dateStr) => {
    if (dateStr && dateStr !== '—') {
      const d = new Date(dateStr);
      const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) hasAlert = true;
    }
  };
  checkDate(a.calibracion);
  checkDate(a.tag);
  return hasAlert;
};

function renderizarAlertas(data) {
  const tbody = document.getElementById('alertsTableBody');
  if (!tbody) return;
  if (tbody.dataset.delegated !== '1') {
    tbody.dataset.delegated = '1';
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="open-drawer-asset"]');
      if (btn) window.openDrawerAsset(btn.dataset.id);
    });
  }
  tbody.innerHTML = '';

  const alertasGeneradas = [];
  const today = new Date();

  inventoryData.forEach(a => {
    // 1. Alertas por estado (Dañado, Fuera de Servicio, etc)
    if (['calibracion_pendiente','fuera_de_servicio','danado','en_mantenimiento'].includes(a.status)) {
      const statusText = (window.i18n.t('estado.' + a.status) || a.status.replace(/_/g, ' ')).toUpperCase();
      const descText = window.i18n.has('alertas.msg_status_desc')
        ? window.i18n.t('alertas.msg_status_desc').replace('{status}', statusText)
        : `The asset is marked as ${statusText}. Please repair it and change the status to Available in the panel.`;
      alertasGeneradas.push({
        id: a.id,
        equipo: window.i18n.has('alertas.msg_status')
          ? window.i18n.t('alertas.msg_status').replace('{status}', statusText)
          : `Attention required: ${statusText}`,
        zonaText: descText,
        zonaColor: 'var(--danger)',
        status: a.status,
        fecha: a.fecha,
        type: ['fuera_de_servicio','danado'].includes(a.status) ? 'danger' : 'warn',
        icon: ['fuera_de_servicio','danado'].includes(a.status) ? 'fa-circle-xmark' : 'fa-triangle-exclamation'
      });
    }

    // 2. Helper to check dates
    const checkDate = (dateStr, label) => {
      if (dateStr && dateStr !== '—') {
        const d = new Date(dateStr);
        const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
        const labelText = window.i18n.t(label) || label;

        if (diffDays <= 30 && diffDays > 0) {
          let severityType = 'success'; // Verde < 30
          let iconName = 'fa-check-circle';
          if (diffDays <= 7) {
            severityType = 'danger'; // Roja <= 7
            iconName = 'fa-skull-crossbones';
          } else if (diffDays <= 15) {
            severityType = 'warn'; // Amarilla <= 15
            iconName = 'fa-clock';
          }
          alertasGeneradas.push({
            id: a.id,
            equipo: window.i18n.has('alertas.en_dias')
              ? window.i18n.t('alertas.en_dias').replace('{label}', labelText).replace('{days}', diffDays)
              : `${labelText} due in ${diffDays} days`,
            zonaText: window.i18n.has('alertas.msg_dias')
              ? window.i18n.t('alertas.msg_dias').replace('{label}', labelText)
              : `The date is approaching. Schedule the ${labelText} and update the date in the asset panel.`,
            zonaColor: 'var(--warn-text, #b8860b)',
            status: a.status,
            fecha: dateStr,
            type: severityType,
            icon: iconName
          });
        } else if (diffDays <= 0) {
          alertasGeneradas.push({
            id: a.id,
            equipo: window.i18n.has('alertas.vencida')
              ? window.i18n.t('alertas.vencida').replace('{label}', labelText)
              : `${labelText} Expired`,
            zonaText: window.i18n.has('alertas.msg_vencida')
              ? window.i18n.t('alertas.msg_vencida').replace('{label}', labelText)
              : `The deadline has passed. Update the ${labelText} date in the asset panel to resolve.`,
            zonaColor: 'var(--danger)',
            status: a.status,
            fecha: dateStr,
            type: 'danger',
            icon: 'fa-triangle-exclamation'
          });
        }
      }
    };

    checkDate(a.calibracion, 'alertas.calibracion');
    checkDate(a.tag, 'alertas.tag');
  });

  const todasAlertas = [...alertasGeneradas, ...data];

  document.getElementById('badge-alertas').textContent = todasAlertas.length;

  if (todasAlertas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${escapeHTML(window.i18n.t('api.sin_datos'))}</td></tr>`;
    return;
  }

  todasAlertas.forEach(a => {
    const tr = document.createElement('tr');
    const safeType = String(a.type || 'info').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeIcon = String(a.icon || 'fa-triangle-exclamation').replace(/[^a-zA-Z0-9_-]/g, '');
    const descHtml = a.zonaText !== undefined
      ? `<span style="color:${escapeHTML(a.zonaColor || 'var(--text-2)')}">${escapeHTML(a.zonaText)}</span>`
      : escapeHTML(a.zona || '');

    tr.innerHTML = `
      <td>
        <div class="alert-icon-wrap ${escapeHTML(safeType)}" style="display:inline-flex;margin:0;">
          <i class="fa-solid ${escapeHTML(safeIcon)}"></i>
        </div>
      </td>
      <td><span class="id-cell" style="display:inline-block; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: 'Courier New', Courier, monospace; font-weight: 600; font-size: 13px; color: var(--text);" title="${escapeHTML(a.id)}">${escapeHTML(a.id)}</span></td>
      <td>
        <strong>${escapeHTML(a.equipo)}</strong><br>
        <span style="font-size:12px;color:var(--text-2); display:block; margin-top:2px;">${descHtml}</span>
      </td>
      <td>${statusPill(a.status)}</td>
      <td class="col-right">${escapeHTML(formatearFecha(a.fecha))}</td>
      <td class="col-right">
        <button class="btn-ghost" data-action="open-drawer-asset" data-id="${escapeHTML(a.id)}" style="padding:4px 8px;font-size:12px;border:1px solid var(--primary);color:var(--primary);">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHTML(window.i18n.t('alertas.resolver') || 'Open / Update')}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────
   KPIs
───────────────────────────────────────── */
function actualizarKPIs() {
  const total       = inventoryData.length;
  const disponibles = inventoryData.filter(a => ['disponible','calibrado','en_funcionamiento'].includes(a.status)).length;
  const calibPend   = inventoryData.filter(a => a.status === 'calibracion_pendiente').length;
  const mantenim    = inventoryData.filter(a => a.status === 'en_mantenimiento').length;
  const pct         = total > 0 ? ((disponibles / total) * 100).toFixed(1) : '0.0';

  document.getElementById('kpi-total').textContent         = total.toLocaleString();
  document.getElementById('kpi-disponibles').textContent   = disponibles.toLocaleString();
  document.getElementById('kpi-calibracion').textContent   = calibPend;
  document.getElementById('kpi-mantenimiento').textContent = mantenim;
  document.getElementById('kpi-disponibilidad').textContent = `${pct}%`;

  // Registered Today & This Week counters
  const now = new Date();
  const todayLocal = now.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday start
  startOfWeek.setHours(0, 0, 0, 0);

  const regToday = inventoryData.filter(a => {
    const d = a._raw?.fecha_registro;
    if (!d) return false;
    return new Date(d).toLocaleDateString('en-CA') === todayLocal;
  }).length;
  const regWeek = inventoryData.filter(a => {
    const d = a._raw?.fecha_registro;
    if (!d) return false;
    const dt = new Date(d);
    return dt >= startOfWeek && dt <= now;
  }).length;

  const safeKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  safeKpi('kpi-reg-today', regToday);
  safeKpi('kpi-reg-week', regWeek);

  // Actualizar datos de mantenimiento para su tabla (cola operativa de atención)
  maintenanceData = inventoryData.filter(a =>
    ['en_mantenimiento','fuera_de_servicio','danado','calibracion_pendiente'].includes(a.status)
  ).map(a => ({
    id:     a.id,
    equipo: a.equipo,
    zona:   a.zona,
    motivo: window.i18n.t(`estado.${a.status}`),
    status: a.status,
    fecha:  a.calibracion || a.fecha,
  }));
  document.getElementById('badge-mantenimiento').textContent = maintenanceData.length;
  renderMaintenanceTable(document.getElementById('maintTableBody'), maintenanceData);
}

function actualizarKPIsEmpleados() {
  const total    = employeesData.length;
  const terreno  = employeesData.filter(e => e.estado === 'en_terreno').length;
  const conEquip = employeesData.filter(e => e.equipo_id).length;
  const sinAsig  = employeesData.filter(e => e.estado === 'sin_asignacion').length;
  const teams    = [...new Set(employeesData.map(e => e.team).filter(t => t !== '—'))].length;

  const safe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  safe('kpi-emp-total',  total);
  safe('kpi-emp-terreno', terreno);
  safe('kpi-emp-asig',   conEquip);
  safe('kpi-emp-sinasig', sinAsig);
  safe('kpi-emp-teams',  teams);
}

/* ─────────────────────────────────────────
   GRÁFICOS
───────────────────────────────────────── */
let zonaChart, statusChart;

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
function chartColors() {
  return {
    grid: isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    text: isDark() ? '#8b949e' : '#656d76',
    tooltipBg: isDark() ? '#1c2128' : '#1f2328',
    tooltipText: '#ffffff',
  };
}

function renderizarGraficos() {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size   = 11;

  const activeRangeTab = document.querySelector('#zonaChartRangeTabs .tab.active');
  const range = activeRangeTab ? activeRangeTab.dataset.range : 'all';
  const nowMs = Date.now();
  const rangeDays = range === '30d' ? 30 : (range === '90d' ? 90 : 0);
  const zonaSource = rangeDays > 0
    ? inventoryData.filter(a => {
        const dStr = a._raw?.fecha_registro || a.fecha;
        if (!dStr) return false;
        const dt = new Date(dStr).getTime();
        return !isNaN(dt) && (nowMs - dt) <= rangeDays * 86400000;
      })
    : inventoryData;

  // Datos por zona (Agrupando a VIC, NSW, QLD, SA, WA y el resto en Unassigned)
  const zonaMap = { 'VIC': 0, 'NSW': 0, 'QLD': 0, 'SA': 0, 'WA': 0, 'Unassigned': 0 };
  zonaSource.forEach(a => {
    const z = getNormalizedZone(a.zona);
    zonaMap[z] = (zonaMap[z] || 0) + 1;
  });
  const zonasLabels = Object.keys(zonaMap).filter(k => zonaMap[k] > 0);
  const zonasDisplayLabels = zonasLabels.map(k => (k === 'Unassigned' ? (window.i18n?.t('usuarios.sin_asignar') || 'Unassigned') : k));
  const zonasValues = zonasLabels.map(k => zonaMap[k]);

  // Chart de barras por zona
  const ctxZona = document.getElementById('zonaChart')?.getContext('2d');
  if (ctxZona) {
    if (zonaChart) zonaChart.destroy();
    zonaChart = new Chart(ctxZona, {
      type: 'bar',
      data: {
        labels: zonasDisplayLabels,
        datasets: [{
          data: zonasValues,
          backgroundColor: 'rgba(124,111,247,0.7)',
          hoverBackgroundColor: '#7c6ff7',
          borderRadius: 3,
          barThickness: 20,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{ display:false }, tooltip:{ backgroundColor:chartColors().tooltipBg, titleColor:chartColors().tooltipText, bodyColor:chartColors().tooltipText, padding:10, cornerRadius:6 }},
        scales: {
          y: { beginAtZero:true, grid:{ color:chartColors().grid }, border:{ display:false }, ticks:{ color:chartColors().text, maxTicksLimit:5 }},
          x: { grid:{ display:false }, border:{ display:false }, ticks:{ color:chartColors().text, maxRotation: 45, minRotation: 45 }},
        },
      },
    });
  }

  // Chart donut de estados
  const disponible  = inventoryData.filter(a => ['disponible','calibrado','en_funcionamiento'].includes(a.status)).length;
  const enUso       = inventoryData.filter(a => a.status === 'en_uso').length;
  const mantenim    = inventoryData.filter(a => a.status === 'en_mantenimiento').length;
  const danado      = inventoryData.filter(a => a.status === 'danado').length;
  const fueraServ   = inventoryData.filter(a => a.status === 'fuera_de_servicio').length;
  const calibPend   = inventoryData.filter(a => a.status === 'calibracion_pendiente').length;
  const otros       = inventoryData.filter(a => !['disponible','calibrado','en_funcionamiento','en_uso','en_mantenimiento','danado','fuera_de_servicio','calibracion_pendiente'].includes(a.status)).length;

  const { t } = window.i18n;
  const slices = [
    { label: t('estado.disponible'),       color: '#3fb950', value: disponible },
    { label: t('estado.en_uso'),           color: '#58a6ff', value: enUso },
    { label: t('estado.en_mantenimiento'), color: '#d29922', value: mantenim },
    { label: t('estado.danado'),           color: '#f85149', value: danado },
    { label: t('kpi.calibracion'),         color: '#7c6ff7', value: calibPend },
  ];
  if (fueraServ > 0) {
    slices.push({ label: t('estado.fuera_de_servicio'), color: '#f0883e', value: fueraServ });
  }
  if (otros > 0) {
    slices.push({ label: t('kpi.otros') || 'Other', color: '#8b949e', value: otros });
  }
  const donutLabels = slices.map(s => s.label);
  const donutColors = slices.map(s => s.color);
  const donutData   = slices.map(s => s.value);

  const ctxStatus = document.getElementById('statusChart')?.getContext('2d');
  if (ctxStatus) {
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels:donutLabels, datasets:[{ data:donutData, backgroundColor:donutColors, borderWidth:0, hoverOffset:4 }]},
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'72%',
        plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:chartColors().tooltipBg, titleColor:chartColors().tooltipText, bodyColor:chartColors().tooltipText, padding:10, cornerRadius:6 }},
      },
    });
  }

  // Leyenda del donut
  const legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = '';
    donutLabels.forEach((label, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${escapeHTML(donutColors[i])}"></span><span>${escapeHTML(label)}</span><span>${escapeHTML(donutData[i])}</span>`;
      legend.appendChild(item);
    });
  }
}

/* ─────────────────────────────────────────
   NAVEGACIÓN
───────────────────────────────────────── */
function inicializarNavegacion() {
  function navigate(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target  = document.getElementById(`view-${viewName}`);
    if (target)   target.classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem)  navItem.classList.add('active');
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.view));
  });
}

/* ─────────────────────────────────────────
   TEMA
───────────────────────────────────────── */
function inicializarTema() {
  const savedTheme = localStorage.getItem('entelso_theme') || 'light';
  aplicarTema(savedTheme);

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    aplicarTema(isDark() ? 'light' : 'dark');
  });
}

function aplicarTema(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('entelso_theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  const loginIcon = document.getElementById('loginThemeIcon');
  if (loginIcon) loginIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  
  const logoSrc = theme === 'dark' ? 'LOGOTYPE-WHITE.png' : 'LOGOTYPE-BLUE.png';
  const sidebarLogo = document.getElementById('sidebarLogoImg');
  const loginLogo = document.getElementById('loginLogoImg');
  if (sidebarLogo) sidebarLogo.src = logoSrc;
  if (loginLogo) loginLogo.src = logoSrc;
  if (zonaChart || statusChart) {
    const cc = chartColors();
    if (zonaChart) {
      zonaChart.options.scales.y.grid.color  = cc.grid;
      zonaChart.options.scales.y.ticks.color = cc.text;
      zonaChart.options.scales.x.ticks.color = cc.text;
      if (zonaChart.options.plugins?.tooltip) {
        zonaChart.options.plugins.tooltip.backgroundColor = cc.tooltipBg;
        zonaChart.options.plugins.tooltip.titleColor = cc.tooltipText;
        zonaChart.options.plugins.tooltip.bodyColor = cc.tooltipText;
      }
      zonaChart.update();
    }
    if (statusChart) {
      if (statusChart.options.plugins?.tooltip) {
        statusChart.options.plugins.tooltip.backgroundColor = cc.tooltipBg;
        statusChart.options.plugins.tooltip.titleColor = cc.tooltipText;
        statusChart.options.plugins.tooltip.bodyColor = cc.tooltipText;
      }
      statusChart.update();
    }
  }
}

/* ─────────────────────────────────────────
   IDIOMA ES / EN
───────────────────────────────────────── */
function actualizarBotonIdioma() {
  const lang = window.i18n.getLang();
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = lang.toUpperCase();
  const loginLangLabel = document.getElementById('loginLangLabel');
  if (loginLangLabel) loginLangLabel.textContent = lang.toUpperCase();
}

function toggleLang() {
  const newLang = window.i18n.getLang() === 'es' ? 'en' : 'es';
  window.i18n.setLang(newLang);
  actualizarBotonIdioma();
}

// Función global para el botón de idioma en la pantalla de login
window.toggleLoginLang = toggleLang;

// Evento: cuando cambia el idioma, re-renderizar tablas, selects y gráficos
document.addEventListener('langchange', () => {
  if (typeof syncFlatpickrLocale === 'function') syncFlatpickrLocale();
  if (!session.isLoggedIn()) return;
  actualizarInfoUsuario(session.getUser());
  updateSegSessionInfo();
  update2FAUI(current2FAEnabled);
  if (typeof populateUsuarioSelects === 'function') populateUsuarioSelects();
  if (typeof populateTeamSelects === 'function') populateTeamSelects();
  if (typeof populateZonaSelects === 'function') populateZonaSelects();
  if (typeof populateCategorySelects === 'function') populateCategorySelects();
  if (typeof renderizarFiltrosCategorias === 'function') renderizarFiltrosCategorias();
  if (typeof renderManageCatList === 'function') renderManageCatList();
  if (typeof renderManageTeams === 'function') renderManageTeams();
  if (typeof renderManageZonas === 'function') renderManageZonas();
  renderizarActivos();
  actualizarKPIs();
  renderizarGraficos();
  renderizarZonas();
  window.aplicarFiltrosEmpleados();
  renderizarAlertas([]);
  if (typeof maintenanceData !== 'undefined') {
    renderMaintenanceTable(document.getElementById('maintTableBody'), maintenanceData);
  }
  if (document.getElementById('view-usuarios')?.classList.contains('active') && typeof window.cargarUsuariosAdministracion === 'function') {
    window.cargarUsuariosAdministracion();
  }
  if (document.getElementById('view-audit')?.classList.contains('active') && typeof cargarAuditLog === 'function') {
    cargarAuditLog();
  }
  if (typeof window.updateBulkActionsState === 'function') {
    window.updateBulkActionsState();
  }
});

/* ─────────────────────────────────────────
   PERFIL DROPDOWN
───────────────────────────────────────── */
function inicializarPerfil() {
  const dropdown = document.getElementById('profileDropdown');
  document.getElementById('profileToggleBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-dropdown') && !e.target.closest('#profileToggleBtn')) {
      dropdown.classList.remove('open');
    }
  });

  document.getElementById('menuPerfil').addEventListener('click', () => { 
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-perfil').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    dropdown.classList.remove('open'); 
    cargarPerfil();
  });

  async function cargarPerfil() {
    try {
      const res = await apiFetch('/api/auth/me');
      const json = await parseApiJson(res);
      if (res.ok && json.success !== false && json.data) {
        const u = json.data;
        document.getElementById('perfilNombre').value = u.nombre || '';
        document.getElementById('perfilTelefono').value = u.telefono_whatsapp || '';
        document.getElementById('perfilEmail').value = u.email || '';
        if (typeof update2FAUI === 'function') update2FAUI(Boolean(u.is_2fa_enabled));
        
        const savedPic = safeUrl(localStorage.getItem('profile_pic'));
        const btnRemoveFoto = document.getElementById('btnRemoveFoto');
        if (btnRemoveFoto) btnRemoveFoto.style.display = savedPic ? 'inline-block' : 'none';
        if (savedPic) {
          const bgUpdate = `url('${savedPic.replace(/'/g, '%27')}')`;
          if (document.getElementById('perfilAvatarBig')) {
            document.getElementById('perfilAvatarBig').style.backgroundImage = bgUpdate;
            document.getElementById('perfilAvatarBig').textContent = '';
          }
          if (document.getElementById('userAvatar')) {
            document.getElementById('userAvatar').style.backgroundImage = bgUpdate;
            document.getElementById('userAvatar').style.backgroundSize = 'cover';
            document.getElementById('userAvatar').style.backgroundPosition = 'center';
            document.getElementById('userAvatar').textContent = '';
          }
          if (document.getElementById('profileDropAvatar')) {
            document.getElementById('profileDropAvatar').style.backgroundImage = bgUpdate;
            document.getElementById('profileDropAvatar').style.backgroundSize = 'cover';
            document.getElementById('profileDropAvatar').style.backgroundPosition = 'center';
            document.getElementById('profileDropAvatar').textContent = '';
          }
        } else if (document.getElementById('perfilAvatarBig')) {
          document.getElementById('perfilAvatarBig').textContent = u.nombre ? u.nombre[0].toUpperCase() : 'U';
          document.getElementById('perfilAvatarBig').style.backgroundImage = 'none';
        }

        const pref = u.preferencias || {};
        const chkCal = document.getElementById('prefCalibracion');
        const chkAsig = document.getElementById('prefAsignacion');
        const chkRes = document.getElementById('prefResumen');
        if (chkCal) chkCal.checked = pref.alertas_calibracion !== false;
        if (chkAsig) chkAsig.checked = pref.alertas_asignacion !== false;
        if (chkRes) chkRes.checked = pref.resumen_semanal === true;
      }
    } catch (e) {
      console.error('Error cargando perfil:', e);
    }
  }

  const btnCambiarFoto = document.getElementById('btnCambiarFoto');
  const btnRemoveFoto = document.getElementById('btnRemoveFoto');
  const fotoInput = document.getElementById('fotoInput');
  
  if (btnRemoveFoto) {
    btnRemoveFoto.addEventListener('click', () => {
      localStorage.removeItem('profile_pic');
      btnRemoveFoto.style.display = 'none';
      const u = session.getUser();
      const initial = u && u.nombre ? u.nombre.charAt(0).toUpperCase() : 'U';
      const els = [
        document.getElementById('perfilAvatarBig'),
        document.getElementById('userAvatar'),
        document.getElementById('profileDropAvatar')
      ];
      els.forEach(el => {
        if (el) {
          el.style.backgroundImage = 'none';
          el.textContent = initial;
        }
      });
    });
  }

  if (btnCambiarFoto && fotoInput) {
    btnCambiarFoto.addEventListener('click', () => {
      fotoInput.click();
    });
    fotoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const b64 = safeUrl(ev.target.result);
          if (!b64) return;
          localStorage.setItem('profile_pic', b64);
          const bgUpdate = `url('${b64.replace(/'/g, '%27')}')`;
          if (document.getElementById('perfilAvatarBig')) {
            document.getElementById('perfilAvatarBig').style.backgroundImage = bgUpdate;
            document.getElementById('perfilAvatarBig').textContent = '';
          }
          if (document.getElementById('userAvatar')) {
            document.getElementById('userAvatar').style.backgroundImage = bgUpdate;
            document.getElementById('userAvatar').style.backgroundSize = 'cover';
            document.getElementById('userAvatar').style.backgroundPosition = 'center';
            document.getElementById('userAvatar').textContent = '';
          }
          if (document.getElementById('profileDropAvatar')) {
            document.getElementById('profileDropAvatar').style.backgroundImage = bgUpdate;
            document.getElementById('profileDropAvatar').style.backgroundSize = 'cover';
            document.getElementById('profileDropAvatar').style.backgroundPosition = 'center';
            document.getElementById('profileDropAvatar').textContent = '';
          }
          if (btnRemoveFoto) btnRemoveFoto.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const btnGuardarPerfil = document.getElementById('btnGuardarPerfil');
  if (btnGuardarPerfil) {
    btnGuardarPerfil.addEventListener('click', async () => {
      try {
        btnGuardarPerfil.disabled = true;
        btnGuardarPerfil.textContent = t('perfil.guardando');
        const payload = {
          nombre: document.getElementById('perfilNombre').value,
          telefono_whatsapp: document.getElementById('perfilTelefono').value,
          email: document.getElementById('perfilEmail').value,
          preferencias: {
            alertas_calibracion: document.getElementById('prefCalibracion') ? document.getElementById('prefCalibracion').checked : true,
            alertas_asignacion: document.getElementById('prefAsignacion') ? document.getElementById('prefAsignacion').checked : true,
            resumen_semanal: document.getElementById('prefResumen') ? document.getElementById('prefResumen').checked : false,
          }
        };
        const res = await apiFetch('/api/auth/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await parseApiJson(res);
        if (res.ok && json.success !== false) {
          btnGuardarPerfil.textContent = t('perfil.guardado_ok');
          setTimeout(() => { btnGuardarPerfil.textContent = t('perfil.guardar'); }, 3000);
          
          // Actualizar session storage para que persista
          const userObj = session.getUser();
          if (userObj) {
            userObj.nombre = document.getElementById('perfilNombre').value;
            userObj.email = document.getElementById('perfilEmail').value;
            session.save(session.getToken(), userObj);
          }

          // Update sidebar and dropdown DOM elements instantly
          const updatedName = document.getElementById('perfilNombre').value;
          const updatedEmail = document.getElementById('perfilEmail').value;
          const initial = updatedName ? updatedName[0].toUpperCase() : 'U';
          
          if (document.getElementById('userDisplayName')) document.getElementById('userDisplayName').textContent = updatedName;
          if (document.getElementById('profileDropName')) document.getElementById('profileDropName').textContent = updatedName;
          if (document.getElementById('profileDropEmail')) document.getElementById('profileDropEmail').textContent = updatedEmail;
          
          const savedPic = localStorage.getItem('profile_pic');
          if (!savedPic) {
            if (document.getElementById('userAvatar')) document.getElementById('userAvatar').textContent = initial;
            if (document.getElementById('profileDropAvatar')) document.getElementById('profileDropAvatar').textContent = initial;
            if (document.getElementById('perfilAvatarBig')) document.getElementById('perfilAvatarBig').textContent = initial;
          }
          
        } else {
          const errorMsg = extractErrorMessage(json, window.i18n.t('perfil.err_guardar') || 'Error saving profile');
          window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + errorMsg);
        }
      } catch (e) {
        window.customAlert(window.i18n.t('perfil.err_guardar') || 'Error saving profile');
      } finally {
        btnGuardarPerfil.disabled = false;
        btnGuardarPerfil.textContent = t('perfil.guardar');
      }
    });
  }
  document.getElementById('menuSeguridad').addEventListener('click', () => { 
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-seguridad').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    dropdown.classList.remove('open');
    updateSegSessionInfo();
    cargarEstado2FA();
  });
  document.getElementById('segSignOutBtn')?.addEventListener('click', () => {
    document.getElementById('logoutBtn')?.click();
  });
  document.getElementById('menuNotif').addEventListener('click', () => { document.querySelector('[data-view="alertas"]').click(); dropdown.classList.remove('open'); });
  document.getElementById('menuTema').addEventListener('click', () => { document.getElementById('themeToggleBtn').click(); dropdown.classList.remove('open'); });
  document.getElementById('menuUsuarios').addEventListener('click', () => {
    if (!isAdminRole()) return;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-usuarios').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    dropdown.classList.remove('open'); 
    cargarUsuariosAdministracion();
  });

  // User Management Logic
  async function cargarUsuariosAdministracion() {
    if (!isAdminRole()) return;
    const tbody = document.getElementById('usuariosTableBody');
    if (tbody && tbody.dataset.delegated !== '1') {
      tbody.dataset.delegated = '1';
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const uid = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit-user') window.editarEmpleado(uid);
        else if (btn.dataset.action === 'delete-user') window.eliminarUsuario(uid);
      });
    }
    try {
      const res = await apiFetch('/api/usuarios');
      const json = await parseApiJson(res);
      if (!res.ok || json.success === false) {
        throw new Error(extractErrorMessage(json, window.i18n.t('usuarios.err_cargar') || 'Error loading users.'));
      }
      if (json.data && tbody) {
        tbody.innerHTML = '';
        
        let activos = 0;
        let admins = 0;
        const editUserTitle = window.i18n.t('usuarios.edit_title') || 'Edit User';
        const deleteTitle = window.i18n.t('bulk.btn_eliminar') || 'Delete';

        json.data.forEach(u => {
          if (Boolean(u.activo)) activos++;
          if (u.rol === 'admin') admins++;

          const safeId = Number(u.id) || 0;
          const safeRol = String(u.rol || '').replace(/[^a-zA-Z0-9_-]/g, '');
          const roleKey = 'usuarios.role_' + safeRol;
          const roleLabel = window.i18n.has(roleKey) ? window.i18n.t(roleKey) : (u.rol || '—');

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHTML(safeId)}</td>
            <td>${escapeHTML(u.nombre || '—')}</td>
            <td>${escapeHTML(u.email || '—')}</td>
            <td><span class="status-badge status-${escapeHTML(safeRol)}">${escapeHTML(roleLabel)}</span></td>
            <td>
              <button class="icon-btn" title="${escapeHTML(editUserTitle)}" data-action="edit-user" data-id="${escapeHTML(safeId)}"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn" title="${escapeHTML(deleteTitle)}" data-action="delete-user" data-id="${escapeHTML(safeId)}"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });

        document.getElementById('kpiUsuariosActivos').textContent = activos;
        document.getElementById('kpiUsuariosAdmin').textContent = admins;
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }
  window.cargarUsuariosAdministracion = cargarUsuariosAdministracion;

  window.eliminarUsuario = async function(id) {
    if (!isAdminRole()) return;
    if (!await window.customConfirm((window.i18n.t('usuarios.confirm_delete') || 'Delete user {0}?').replace('{0}', id))) return;
    try {
      const res = await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      const json = await parseApiJson(res);
      if (res.ok && json.success !== false) {
        window.customAlert(window.i18n.t('usuarios.eliminado') || "User deleted");
        cargarUsuariosAdministracion();
        cargarUsuarios();
      } else {
        window.customAlert(extractErrorMessage(json, window.i18n.t('usuarios.err_eliminar') || "Error deleting"));
      }
    } catch(e) { window.customAlert(window.i18n.t('seg.err_red') || "Network error"); }
  };

  // Add User Modal
  document.getElementById('openAddUserModal')?.addEventListener('click', () => {
    if (!isAdminRole()) return;
    document.getElementById('addUserModalOverlay').classList.add('open');
  });

  // Wire Teams "Nuevo Empleado" button to the same modal
  document.getElementById('btnNuevoEmpleadoTeams')?.addEventListener('click', () => {
    if (!isAdminRole()) return;
    document.getElementById('addUserModalOverlay').classList.add('open');
  });

  document.getElementById('closeAddUserModal')?.addEventListener('click', () => {
    document.getElementById('addUserModalOverlay').classList.remove('open');
  });

  document.getElementById('confirmAddUserBtn')?.addEventListener('click', async () => {
    if (!isAdminRole()) return;
    const btn = document.getElementById('confirmAddUserBtn');
    const msgEl = document.getElementById('addUserModalMsg');
    
    const nombre   = document.getElementById('addUserName').value.trim();
    const email    = document.getElementById('addUserEmail').value.trim();
    const telefono = document.getElementById('addUserPhone').value.trim();
    const rol      = document.getElementById('addUserRole').value;
    const team     = document.getElementById('addUserTeam')?.value || '';
    const default_zona = document.getElementById('addUserDefaultZona')?.value || '';
    const password = document.getElementById('addUserPassword').value;

    if (!nombre || !password) {
      msgEl.textContent = window.i18n.t('usuarios.err_requerido') || 'Name and password/PIN are required.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    if (password.length < 4) {
      msgEl.textContent = window.i18n.t('usuarios.err_min') || 'Password/PIN must be at least 4 characters.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHTML(window.i18n.t('btn.creando') || 'Creating...')}`;

    try {
      const payload = { nombre, email: email || undefined, telefono_whatsapp: telefono || undefined, rol, team: team || undefined, default_zona: default_zona || undefined, password };
      const res = await apiFetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await parseApiJson(res);
      
      if (res.ok && data.success !== false) {
        msgEl.textContent = window.i18n.t('usuarios.creado_ok') || '✓ User created successfully.';
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        
        setTimeout(() => {
          document.getElementById('addUserModalOverlay').classList.remove('open');
          ['addUserName','addUserEmail','addUserPhone','addUserPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
          });
          msgEl.style.display = 'none';
          btn.disabled = false;
          btn.textContent = window.i18n.t('usuarios.btn_crear') || 'Create User';
          cargarUsuariosAdministracion();
          cargarUsuarios();
        }, 1500);
      } else {
        throw new Error(extractErrorMessage(data, window.i18n.t('usuarios.err_registrar') || 'Error creating user.'));
      }
    } catch (err) {
      msgEl.textContent = err.message || window.i18n.t('usuarios.err_conexion') || 'Server connection error.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = window.i18n.t('usuarios.btn_crear') || 'Create User';
    }
  });
  const menuAudit = document.getElementById('menuAudit');
  if(menuAudit) {
    menuAudit.addEventListener('click', () => {
      if (!isAdminRole()) return;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-audit').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      dropdown.classList.remove('open');
      cargarAuditLog();
    });
  }
  const filterBtn = document.getElementById('filterTriggerBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      document.getElementById('filterModalOverlay').classList.add('open');
    });
  }
  // NOTE: logoutBtn already has its own listener above — do NOT attach another one here
  // (removing duplicate listener that caused session.logout is not a function error)

  // Botón de idioma en sidebar
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.addEventListener('click', toggleLang);
}

/* ─────────────────────────────────────────
   HISTORY DRAWER
───────────────────────────────────────── */
function inicializarDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('historyDrawer');
  
  document.getElementById('closeDrawer').addEventListener('click', () => {
    overlay.classList.remove('open');
    drawer.classList.remove('expanded'); // Reset on close
  });
  
  document.getElementById('expandDrawer').addEventListener('click', () => {
    drawer.classList.toggle('expanded');
  });

  overlay.addEventListener('click', e => { 
    if (e.target === overlay) {
      overlay.classList.remove('open');
      drawer.classList.remove('expanded');
    }
  });

  document.addEventListener('keydown', e => { 
    if (e.key === 'Escape') {
      overlay.classList.remove('open'); 
      drawer.classList.remove('expanded');
    }
  });
}

window.openDrawerAsset = function(id) {
  const asset = inventoryData.find(i => i.id === id);
  if (asset) {
    document.querySelector('.view.active')?.classList.remove('active');
    document.getElementById('view-inventario').classList.add('active');
    document.querySelectorAll('.nav-item.active').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-view="inventario"]')?.classList.add('active');
    openDrawer(asset);
  } else {
    window.customAlert(window.i18n.t('drawer.no_encontrado') || "Equipment not found in inventory.");
  }
};

async function openDrawer(item) {
  const overlay = document.getElementById('drawerOverlay');
  document.getElementById('drawerTitle').textContent = item.id;
  document.getElementById('drawerSubtitle').textContent = item.equipo;

  const qrImg = document.getElementById('drawerQRCode');
  if (qrImg) {
    const waNumber = localStorage.getItem('entelso_wa_number') || '61439759528';
    qrImg.src = buildAssetQrDataUri(item.id, waNumber);
    qrImg.style.display = 'inline-block';
    qrImg.title = window.i18n.t('drawer.qr_title');
    const btnPrint = document.getElementById('btnPrintQR');
    if (btnPrint) btnPrint.style.display = 'inline-block';
    const btnDownload = document.getElementById('btnDownloadQR');
    if (btnDownload) btnDownload.style.display = 'inline-block';
  }

  const metaEl = document.getElementById('drawerMeta');
  metaEl.innerHTML = '';
  const hasTagDates = Boolean(item.ultimo_tag || item.tag);
  const metaFields = [
    { label: window.i18n.t('drawer.meta_serie'),   value: (item.serie || item.id || '—') + (item.original_serial ? ' / ' + item.original_serial : '') },
    { label: window.i18n.t('drawer.meta_tipo'),    value: item.tipo_item || '—' },
    { label: window.i18n.t('drawer.meta_zona'),    value: item.zona || '—' },
    { label: window.i18n.t('drawer.meta_estado'),  value: (window.i18n.has('estado.' + item.status) ? window.i18n.t('estado.' + item.status) : (item.status || '')).replace(/_/g,' ') || '—' },
    ...( hasTagDates ? [
      { label: window.i18n.t('drawer.meta_ulti_cal') || 'Last Calibration',  value: formatearFecha(item.ultima_calibracion) },
      { label: window.i18n.t('drawer.meta_cal') || 'Next Calibration',       value: formatearFecha(item.calibracion) },
      { label: window.i18n.t('drawer.meta_ulti_tag') || 'DOM / Last Tag',    value: formatearFecha(item.ultimo_tag) },
      { label: window.i18n.t('drawer.meta_tag') || 'Next Tag/Inspection',    value: formatearFecha(item.tag) },
    ] : [
      { label: window.i18n.t('drawer.meta_ulti_cal') || 'Last Test/tag',  value: formatearFecha(item.ultima_calibracion) },
      { label: window.i18n.t('drawer.meta_cal') || 'Next Test/tag',  value: formatearFecha(item.calibracion) }
    ]),
    { label: window.i18n.t('drawer.meta_asignado'),value: item.asignado || '—' },
    { label: window.i18n.t('drawer.meta_team'),    value: item.team || '—' },
    { label: window.i18n.t('drawer.meta_fecha_registro') || 'Registration Date', value: formatearFecha(item.fecha) }
  ];
  metaFields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'drawer-meta-item';
    div.innerHTML = `<span class="drawer-meta-label">${escapeHTML(f.label)}</span><span class="drawer-meta-value">${escapeHTML(f.value)}</span>`;
    metaEl.appendChild(div);
  });

  // Quick Person Assignment in Drawer
  const drawerUsuarioSelect = document.getElementById('drawerUsuarioSelect');
  const drawerUsuarioSave = document.getElementById('drawerUsuarioSave');
  const drawerUsuarioStatus = document.getElementById('drawerUsuarioStatus');
  if (drawerUsuarioSelect && drawerUsuarioSave) {
    if (typeof populateUsuarioSelects === 'function') populateUsuarioSelects();
    drawerUsuarioSelect.value = item.usuario_id ? String(item.usuario_id) : '';
    if (drawerUsuarioStatus) drawerUsuarioStatus.textContent = '';
    drawerUsuarioSave.onclick = async () => {
      if (!canUpdateStatusOrAssign()) return;
      const val = drawerUsuarioSelect.value;
      const newUserId = val ? Number(val) : null;
      drawerUsuarioSave.disabled = true;
      if (drawerUsuarioStatus) {
        drawerUsuarioStatus.textContent = window.i18n.t('estado_ui.guardando') || 'Saving...';
        drawerUsuarioStatus.style.color = 'var(--text-2)';
      }
      try {
        const r = await apiFetch(`/api/activos/${item.db_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ usuario_actual_id: newUserId })
        });
        const j = await parseApiJson(r);
        if (r.ok && j.success !== false) {
          const matchedUser = (window.usuariosData || []).find(u => Number(u.id) === Number(newUserId));
          item.usuario_id = newUserId;
          item.asignado = matchedUser ? matchedUser.nombre : '—';
          if (drawerUsuarioStatus) {
            drawerUsuarioStatus.textContent = window.i18n.t('estado_ui.guardado') || '✓ Saved';
            drawerUsuarioStatus.style.color = 'var(--accent-green)';
            setTimeout(() => { drawerUsuarioStatus.textContent = ''; }, 2000);
          }
          await cargarActivos(true, true);
          const refreshed = inventoryData.find(i => i.db_id === item.db_id);
          if (refreshed) openDrawer(refreshed);
        } else {
          if (drawerUsuarioStatus) {
            drawerUsuarioStatus.textContent = extractErrorMessage(j, window.i18n.t('estado_ui.error') || 'Error');
            drawerUsuarioStatus.style.color = 'var(--accent-red)';
          }
        }
      } catch (err) {
        if (err.message !== 'SESION_EXPIRADA' && drawerUsuarioStatus) {
          drawerUsuarioStatus.textContent = err.message || window.i18n.t('estado_ui.error') || 'Error';
          drawerUsuarioStatus.style.color = 'var(--accent-red)';
        }
      } finally {
        drawerUsuarioSave.disabled = false;
      }
    };
  }

  // Quantity logic
  const qtySection = document.getElementById('drawerQtySection');
  if (qtySection) {
    const isConsumable = (item.raw_tipo === 'consumible' || item.categoria_padre === 'Consumables' || item.categoria_padre === 'Safety & PPE');
    qtySection.style.display = (isConsumable && canManageInventory()) ? 'block' : 'none';
  }
  const qtyInput = document.getElementById('drawerQtyInput');
  const qtySave = document.getElementById('drawerQtySave');
  const qtyStatus = document.getElementById('drawerQtyStatus');
  if (qtyInput && qtySave && qtyStatus) {
    qtyInput.value = item.cantidad !== undefined ? item.cantidad : 1;
    qtyStatus.textContent = '';
    qtySave.onclick = async () => {
      if (!canManageInventory()) return;
      const newVal = parseInt(qtyInput.value, 10);
      if (isNaN(newVal) || newVal < 0) return;
      qtySave.disabled = true;
      qtyStatus.textContent = window.i18n.t('estado_ui.guardando') || 'Saving...';
      qtyStatus.style.color = 'var(--text-2)';
      try {
        const res = await window.apiFetch(`/api/activos/${item.db_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ cantidad: newVal })
        });
        const json = await parseApiJson(res);
        if (!res.ok || json.success === false) {
          throw new Error(extractErrorMessage(json, window.i18n.t('estado_ui.error') || 'Error'));
        }
        qtyStatus.textContent = window.i18n.t('estado_ui.guardado_corto') || 'Saved!';
        qtyStatus.style.color = 'var(--accent-green)';
        setTimeout(() => { qtyStatus.textContent = ''; }, 2000);
        window.cargarActivos();
      } catch (err) {
        if (err.message !== 'SESION_EXPIRADA') {
          qtyStatus.textContent = err.message || window.i18n.t('estado_ui.error') || 'Error';
          qtyStatus.style.color = 'var(--accent-red)';
        }
      } finally {
        qtySave.disabled = false;
      }
    };
  }

  // Add edit button to drawer header
  const drawerEditBtn = document.getElementById('drawerEditBtn');
  if (drawerEditBtn) {
    drawerEditBtn.onclick = () => window.editarActivo(item);
  }

  // Render Notes / Kit Contents
  const drawerNotasSection = document.getElementById('drawerNotasSection');
  if (drawerNotasSection) {
    const notasTextarea = document.getElementById('drawerNotasTextarea');
    const notasSaveBtn = document.getElementById('drawerNotasSave');
    const notasStatus = document.getElementById('drawerNotasStatus');
    if (notasTextarea) {
      notasTextarea.value = item.notas || '';
      notasTextarea.readOnly = !canManageInventory();
    }
    if (notasSaveBtn) {
      notasSaveBtn.onclick = async () => {
        if (!canManageInventory()) return;
        const newNotas = notasTextarea.value.trim();
        notasSaveBtn.disabled = true;
        notasSaveBtn.textContent = window.i18n.t('estado_ui.guardando') || 'Saving...';
        try {
          const res = await apiFetch(`/api/activos/${item.db_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ notas: newNotas })
          });
          const json = await parseApiJson(res);
          if (!res.ok || json.success === false) {
            throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_guardar') || 'Error saving'));
          }
          // Update local data
          const localItem = inventoryData.find(i => i.db_id === item.db_id);
          if (localItem) {
            localItem.notas = newNotas;
            if (localItem._raw) localItem._raw.notas = newNotas;
          }
          if (notasStatus) {
            notasStatus.textContent = window.i18n.t('estado_ui.guardado') || '✓ Saved';
            notasStatus.style.color = 'var(--success)';
            setTimeout(() => { notasStatus.textContent = ''; }, 2000);
          }
          registrarAuditLog(`Updated notes for ${item.id}`, { field: 'notas', before: item.notas || '', after: newNotas });
        } catch (err) {
          if (err.message !== 'SESION_EXPIRADA' && notasStatus) {
            notasStatus.textContent = err.message || window.i18n.t('drawer.err_guardar') || 'Error saving';
            notasStatus.style.color = 'var(--danger)';
          }
        } finally {
          notasSaveBtn.disabled = false;
          notasSaveBtn.textContent = window.i18n.t('drawer.guardar_notas') || 'Save Notes';
        }
      };
    }
  }

  // Render Photos if available
  const drawerFotosLabel = document.getElementById('drawerFotosLabel');
  const drawerFotosGallery = document.getElementById('drawerFotosGallery');
  if (drawerFotosLabel && drawerFotosGallery) {
    drawerFotosGallery.innerHTML = '';
    const validPhotos = (item._raw && Array.isArray(item._raw.fotos)) ? item._raw.fotos.map(safeUrl).filter(Boolean) : [];
    if (validPhotos.length > 0) {
      drawerFotosLabel.style.display = 'block';
      drawerFotosGallery.style.display = 'grid';
      validPhotos.forEach(fotoUrl => {
        const a = document.createElement('a');
        a.href = fotoUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'block';
        
        const img = document.createElement('img');
        img.src = fotoUrl;
        img.style.width = '100%';
        img.style.height = '80px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = 'var(--radius-md)';
        img.style.border = '1px solid var(--border)';
        img.style.cursor = 'pointer';
        
        a.appendChild(img);
        drawerFotosGallery.appendChild(a);
      });
    } else {
      drawerFotosLabel.style.display = 'none';
      drawerFotosGallery.style.display = 'none';
    }
  }

  // Timeline
  const timelineEl = document.getElementById('drawerTimeline');
  timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${escapeHTML(window.i18n.t('drawer.cargando_hist'))}</div></div>`;

  try {
    let url = '/api/movimientos';
    if (item.db_id) {
      url += `?activo_id=${encodeURIComponent(item.db_id)}`;
    } else {
      url += `?numero_serie=${encodeURIComponent(item.id)}`;
    }

    const res = await apiFetch(url);
    const json = await parseApiJson(res);
    
    if (res.ok && json.success !== false && json.data && json.data.length > 0) {
      timelineEl.innerHTML = '';
      const dateLocale = window.i18n.getLang() === 'es' ? 'es-ES' : 'en-AU';
      const byLbl = window.i18n.t('drawer.mov_por') || 'By';
      const fromLbl = window.i18n.t('drawer.mov_de') || 'From';
      const toLbl = window.i18n.t('drawer.mov_a') || 'To';
      const qtyLbl = window.i18n.t('drawer.mov_cant') || 'Qty';

      json.data.forEach(mov => {
        const dotColor = mov.tipo_movimiento === 'despacho' ? 'tl-blue' : (mov.tipo_movimiento === 'ingreso' ? 'tl-green' : 'tl-gray');
        let icon = 'fa-arrow-right';
        if (mov.tipo_movimiento === 'ingreso') icon = 'fa-arrow-left';
        if (mov.tipo_movimiento === 'cambio_estado') icon = 'fa-rotate';

        const movKey = 'mov.' + mov.tipo_movimiento;
        const actionText = window.i18n.has(movKey) ? window.i18n.t(movKey) : String(mov.tipo_movimiento || '').replace(/_/g, ' ').toUpperCase();
        let detailText = `${byLbl}: ${mov.nombre_usuario || '—'}`;
        
        if (mov.ubicacion_origen && mov.ubicacion_destino) {
          detailText += ` | ${fromLbl}: ${mov.ubicacion_origen} ➔ ${toLbl}: ${mov.ubicacion_destino}`;
        } else if (mov.ubicacion_destino) {
          detailText += ` | ${toLbl}: ${mov.ubicacion_destino}`;
        }

        timelineEl.innerHTML += `
          <div class="timeline-item">
            <div class="timeline-dot ${escapeHTML(dotColor)}"><i class="fa-solid ${escapeHTML(icon)}"></i></div>
            <div class="timeline-body">
              <div class="timeline-event">${escapeHTML(actionText)} (${escapeHTML(qtyLbl)}: ${escapeHTML(mov.cantidad)})</div>
              <div class="timeline-detail">${escapeHTML(detailText)}</div>
              <div class="timeline-date">${escapeHTML(new Date(mov.fecha_movimiento).toLocaleString(dateLocale))}</div>
            </div>
          </div>
        `;
      });
    } else {
      timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${escapeHTML(window.i18n.t('drawer.sin_historial'))}</div></div>`;
    }
  } catch (error) {
    console.error('Error fetching timeline:', error);
    timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${escapeHTML(window.i18n.t('drawer.err_historial'))}</div></div>`;
  }

  aplicarRBACUI();
  overlay.classList.add('open');
}

// QR Download handler
document.getElementById('btnDownloadQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('drawerQRCode');
  const title = document.getElementById('drawerTitle')?.textContent || 'qr-code';
  if (!qrImg || !qrImg.src) return;
  const isSvg = qrImg.src.startsWith('data:image/svg+xml');
  const a = document.createElement('a');
  a.href = qrImg.src;
  a.download = `QR-${title}.${isSvg ? 'svg' : 'png'}`;
  if (!qrImg.src.startsWith('data:')) a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// QR Print handler
document.getElementById('btnPrintQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('drawerQRCode');
  const title = document.getElementById('drawerTitle')?.textContent || 'Equipment';
  const subtitle = document.getElementById('drawerSubtitle')?.textContent || '';
  if (!qrImg || !qrImg.src) return;
  const html = `<html><head><title>QR - ${escapeHTML(title)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;}img{width:200px;height:200px;}h2{margin-bottom:4px;}p{color:#666;}</style></head><body><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p><img src="${escapeHTML(qrImg.src)}" /><script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
});

// Modal QR Download handler
document.getElementById('modalBtnDownloadQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('modalQRCode');
  const title = document.getElementById('modalNumSerie')?.value || 'qr-code';
  if (!qrImg || !qrImg.src) return;
  const isSvg = qrImg.src.startsWith('data:image/svg+xml');
  const a = document.createElement('a');
  a.href = qrImg.src;
  a.download = `QR-${title}.${isSvg ? 'svg' : 'png'}`;
  if (!qrImg.src.startsWith('data:')) a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// Modal QR Print handler
document.getElementById('modalBtnPrintQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('modalQRCode');
  const title = document.getElementById('modalNumSerie')?.value || 'Equipment';
  const subtitle = document.getElementById('modalDesc')?.value || '';
  if (!qrImg || !qrImg.src) return;
  const html = `<html><head><title>QR - ${escapeHTML(title)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;}img{width:200px;height:200px;}h2{margin-bottom:4px;}p{color:#666;}</style></head><body><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p><img src="${escapeHTML(qrImg.src)}" /><script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
});

/* ─────────────────────────────────────────
   COMMAND PALETTE
───────────────────────────────────────── */


/* ─────────────────────────────────────────
   MODAL — Registrar Equipo
───────────────────────────────────────── */

/* ─────────────────────────────────────────
   MODAL — Importación Masiva (Excel/CSV)
───────────────────────────────────────── */
let importFileData = null;

function inicializarImportModal() {
  const overlay = document.getElementById('importModalOverlay');
  const fileInput = document.getElementById('importFileInput');
  const previewArea = document.getElementById('importPreviewArea');
  const previewBody = document.getElementById('importPreviewBody');
  const submitBtn = document.getElementById('submitImportBtn');
  const msgEl = document.getElementById('importMsg');

  const dropzone = document.getElementById('importFileDropzone');
  const dropzoneText = document.getElementById('importDropzoneText');

  const resetDropzoneText = () => {
    if (dropzoneText) dropzoneText.textContent = window.i18n.t('import.dropzone_text') || 'Choose a file or drag & drop here';
  };

  const openModal = () => {
    overlay.classList.add('open');
    fileInput.value = '';
    resetDropzoneText();
    previewArea.style.display = 'none';
    msgEl.style.display = 'none';
    submitBtn.disabled = true;
    importFileData = null;
  };
  const closeModal = () => overlay.classList.remove('open');

  document.getElementById('openImportModal')?.addEventListener('click', openModal);
  document.getElementById('openImportModal2')?.addEventListener('click', openModal);
  document.getElementById('closeImportModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelImportModal')?.addEventListener('click', closeModal);

  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-purple)';
      dropzone.style.background = 'var(--bg-hover)';
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border)';
      dropzone.style.background = 'var(--bg-input)';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border)';
      dropzone.style.background = 'var(--bg-input)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (dropzoneText) {
      const strong = document.createElement('strong');
      strong.textContent = file.name;
      dropzoneText.replaceChildren(strong);
    }

    msgEl.style.display = 'none';
    previewArea.style.display = 'none';
    submitBtn.disabled = true;
    importFileData = null;

    if (typeof XLSX === 'undefined') {
      msgEl.textContent = window.i18n.t('modal.err_xlsx');
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to Array of Arrays
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      if (rows.length < 2) {
        throw new Error(window.i18n.t('import.err_empty') || 'The file is empty or invalid.');
      }

      const headers = rows[0].map(h => String(h).toLowerCase().trim());
      // Validar columnas requeridas (Nº Inventario o Inventory No, y Equipo/Equipment)
      const invIndex = headers.findIndex(h => h.includes('inventario') || h.includes('inventory') || h.includes('asset id'));
      const eqIndex = headers.findIndex(h => h.includes('equipo') || h.includes('equipment') || h.includes('descripci') || h.includes('description'));
      const serieIndex = headers.findIndex(h => h.includes('serie') || h.includes('serial'));
      const zonaIndex = headers.findIndex(h => h.includes('zona') || h.includes('zone') || h.includes('sitio') || h.includes('site'));
      const teamIndex = headers.findIndex(h => h.includes('team'));
      const statusIndex = headers.findIndex(h => h.includes('estado') || h.includes('status') || h.includes('condition'));
      // Date columns from Excel
      const lastCalIndex = headers.findIndex(h => (h.includes('last') && (h.includes('inspect') || h.includes('calibr'))) || h.includes('ultima calibracion'));
      const nextCalIndex = headers.findIndex(h => h.includes('next due') || h.includes('proxima calibracion') || (h.includes('next') && h.includes('calibr')));
      const domIndex = headers.findIndex(h => h === 'dom' || h.includes('date of man'));
      const expiryIndex = headers.findIndex(h => h.includes('expiry') || h.includes('expire'));

      if (invIndex === -1 || eqIndex === -1) {
        msgEl.textContent = window.i18n.t('import.err_req_fields') || 'Required columns are missing (Asset ID and Description).';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
        return;
      }

      // Parse each row
      const parsedData = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || (!row[invIndex] && !row[eqIndex])) continue;

        const numero_serie = String(row[invIndex] || '').trim();
        const descripcion = String(row[eqIndex] || '').trim();

        if (!numero_serie || !descripcion) {
          msgEl.textContent = `${window.i18n.t('import.err_row')} ${i+1} ${window.i18n.t('import.err_empty')}`;
          msgEl.className = 'modal-msg error';
          msgEl.style.display = 'block';
          return;
        }

        parsedData.push({
          numero_serie: numero_serie,
          descripcion: descripcion,
          serie: serieIndex !== -1 ? String(row[serieIndex] || '').trim() : '',
          zona: zonaIndex !== -1 ? String(row[zonaIndex] || '').trim() : '',
          team: teamIndex !== -1 ? String(row[teamIndex] || '').trim() : '',
          estado: statusIndex !== -1 ? String(row[statusIndex] || '').trim().toLowerCase() : 'disponible',
          fecha_ultima_cali: lastCalIndex !== -1 && row[lastCalIndex] ? String(row[lastCalIndex]).trim() : null,
          fecha_prox_cali:   nextCalIndex !== -1 && row[nextCalIndex] ? String(row[nextCalIndex]).trim() : null,
          fecha_ultimo_tag:  domIndex !== -1 && row[domIndex] ? String(row[domIndex]).trim() : null,
          fecha_prox_tag:    expiryIndex !== -1 && row[expiryIndex] ? String(row[expiryIndex]).trim() : null,
        });
      }

      if (parsedData.length === 0) {
        throw new Error(window.i18n.t('import.err_no_valid') || 'No valid rows found with ID and Description.');
      }

      // Pre-visualizar
      importFileData = parsedData;
      previewBody.innerHTML = '';
      parsedData.slice(0, 5).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="id-cell" style="display:inline-block; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: 'Courier New', Courier, monospace; font-weight: 600; font-size: 13px; color: var(--text);" title="${escapeHTML(item.numero_serie)}">${escapeHTML(item.numero_serie)}</span></td>
          <td>${escapeHTML(item.descripcion)}</td>
          <td>${escapeHTML(item.zona || '—')}</td>
        `;
        previewBody.appendChild(tr);
      });

      previewArea.style.display = 'block';
      submitBtn.disabled = false;
      msgEl.textContent = (window.i18n.t('import.items_listos') || '{0} items ready to import.').replace('{0}', parsedData.length);
      msgEl.className = 'modal-msg success';
      msgEl.style.display = 'block';

    } catch (err) {
      console.error(err);
      msgEl.textContent = err.message || window.i18n.t('import.err_parse') || 'Error parsing the file.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!canManageInventory()) return;
    if (!importFileData || importFileData.length === 0) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${escapeHTML(window.i18n.t('import.importando') || 'Importing...')}</span>`;

    try {
      const res = await apiFetch('/api/activos/bulk', {
        method: 'POST',
        body: JSON.stringify({ activos: importFileData })
      });
      const data = await parseApiJson(res);
      if (res.ok && data.success !== false) {
        const insertedCount = data.data?.inserted ?? importFileData.length;
        msgEl.textContent = `✓ ${window.i18n.t('import.success')} ${insertedCount} ${window.i18n.t('import.items')}`;
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        await cargarActivos();
        setTimeout(() => closeModal(), 2000);
      } else {
        msgEl.textContent = extractErrorMessage(data, window.i18n.t('import.err_importar') || 'Import error.');
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="import.btn_upload">' + escapeHTML(window.i18n.t('import.btn_upload') || 'Import Data') + '</span>';
      }
    } catch (err) {
      if (err.message !== 'SESION_EXPIRADA') {
        msgEl.textContent = err.message || window.i18n.t('drawer.err_red') || 'Network Error';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="import.btn_upload">' + escapeHTML(window.i18n.t('import.btn_upload') || 'Import Data') + '</span>';
    }
  });
}


function inicializarModal() {
  const overlay = document.getElementById('modalOverlay');
  const openModal  = () => {
    overlay.classList.add('open');
    const msgEl = document.getElementById('modalMsg');
    if (msgEl) {
      msgEl.style.display = 'none';
      msgEl.className = 'modal-msg';
      msgEl.textContent = '';
      delete msgEl._duplicateErr;
      if (msgEl.dataset) {
        delete msgEl.dataset.duplicateErr;
        delete msgEl.dataset.duplicateSerial;
      }
    }
  };
  const closeModal = () => {
    overlay.classList.remove('open');
    const qrContainer = document.getElementById('modalQRContainer');
    if (qrContainer) qrContainer.style.display = 'none';
  };

  document.getElementById('openNewItemModal').addEventListener('click', () => {
    document.getElementById('modalEstado').value = 'disponible';
    document.getElementById('modalFechaRegistro').value = new Date().toISOString().split('T')[0];
    if(document.getElementById('modalCantidad')) document.getElementById('modalCantidad').value = '1';
    openModal();
  });
  document.getElementById('openNewItemModal2')?.addEventListener('click', () => {
    document.getElementById('modalEstado').value = 'disponible';
    document.getElementById('modalFechaRegistro').value = new Date().toISOString().split('T')[0];
    if(document.getElementById('modalCantidad')) document.getElementById('modalCantidad').value = '1';
    openModal();
  });

  const modCat = document.getElementById('modalCategoria');
  if (modCat) {
    modCat.addEventListener('change', (e) => {
      const wrap = document.getElementById('modalCantidadWrapper');
      if (wrap) {
        if (e.target.value === 'Consumables' || e.target.value === 'Safety & PPE') {
          wrap.style.display = 'block';
        } else {
          wrap.style.display = 'none';
          const cantInput = document.getElementById('modalCantidad');
          if (cantInput) cantInput.value = '1';
        }
      }
    });
  }

  document.getElementById('openAgendarModal')?.addEventListener('click', () => {
    document.getElementById('maintenanceModalOverlay').classList.add('open');
  });

  // Maintenance Modal Logic
  document.getElementById('closeMaintenanceModal')?.addEventListener('click', () => {
    document.getElementById('maintenanceModalOverlay').classList.remove('open');
  });

  document.getElementById('confirmMaintenanceBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmMaintenanceBtn');
    const msgEl = document.getElementById('maintenanceModalMsg');
    const equipoVal = document.getElementById('maintEquipo').value.trim();
    const fecha = document.getElementById('maintFecha').value;
    const obs = document.getElementById('maintObs').value.trim();

    if (!equipoVal || !fecha) {
      msgEl.textContent = window.i18n.t('maint.err_campos');
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${window.i18n.t('maint.registrando')}`;

    // Find the asset by serial number or name
    const activo = inventoryData.find(a =>
      a.id.toLowerCase().includes(equipoVal.toLowerCase()) ||
      a.equipo.toLowerCase().includes(equipoVal.toLowerCase())
    );

    if (activo && activo.db_id) {
      try {
        const patchBody = { estado: 'en_mantenimiento', fecha_prox_cali: fecha };
        if (obs) {
          const entry = `[Maint ${fecha}] ${obs}`;
          patchBody.notas = activo.notas ? `${activo.notas}\n${entry}` : entry;
        }
        const res = await apiFetch(`/api/activos/${activo.db_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody)
        });
        const json = await parseApiJson(res);
        if (!res.ok || json.success === false) {
          throw new Error(extractErrorMessage(json, window.i18n.t('maint.err_agendar') || 'Error scheduling maintenance.'));
        }
        if (canManageInventory()) {
          const mRes = await apiFetch('/api/mantenimientos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              activo_id: activo.db_id,
              fecha_envio: new Date().toISOString().slice(0, 10),
              fecha_estimada_retorno: fecha,
              motivo: obs || 'Scheduled maintenance',
              notas: obs || null
            })
          });
          const mJson = await parseApiJson(mRes);
          if (!mRes.ok || mJson.success === false) {
            console.warn('POST /api/mantenimientos:', extractErrorMessage(mJson, 'Warning'));
          }
        }
        msgEl.textContent = `✓ ${window.i18n.t('maint.agendado_ok')} ${activo.id}.`;
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        await cargarActivos();
        setTimeout(() => {
          document.getElementById('maintenanceModalOverlay').classList.remove('open');
          document.getElementById('maintEquipo').value = '';
          document.getElementById('maintFecha').value = '';
          document.getElementById('maintObs').value = '';
          msgEl.style.display = 'none';
          btn.disabled = false;
          btn.textContent = window.i18n.t('maint.btn_agendar');
        }, 1500);
      } catch (e) {
        if (e.message !== 'SESION_EXPIRADA') {
          msgEl.textContent = e.message || window.i18n.t('maint.err_agendar');
          msgEl.className = 'modal-msg error';
          msgEl.style.display = 'block';
        }
        btn.disabled = false;
        btn.textContent = window.i18n.t('maint.btn_agendar') || 'Schedule Maintenance';
      }
    } else {
      msgEl.textContent = window.i18n.t('maint.err_no_encontrado');
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = window.i18n.t('maint.btn_agendar') || 'Schedule Maintenance';
    }
  });
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('closeModal2').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const fotoInput = document.getElementById('modalFotoInput');
  const fotoStatus = document.getElementById('modalFotoStatus');
  const fotoGallery = document.getElementById('modalFotosGallery');
  
  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      window.uploadedPhotos = window.uploadedPhotos || [];
      if (window.uploadedPhotos.length + files.length > 5) {
        window.customAlert(window.i18n.t('modal.err_max_fotos') || 'Maximum 5 photos allowed per asset.');
        fotoInput.value = '';
        return;
      }

      fotoStatus.textContent = window.i18n.t('modal.subiendo_foto') || 'Uploading...';
      const formData = new FormData();
      files.forEach(file => formData.append('fotos', file));

      try {
        const token = session.getToken();
        const uploadRes = await fetch(API_BASE + '/api/upload/batch', {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: formData
        });
        if (uploadRes.status === 401) handleSessionExpired();

        const data = await parseApiJson(uploadRes);
        if (uploadRes.ok && data.success !== false && data.data?.urls) {
          const totalCount = window.uploadedPhotos.length + data.data.urls.length;
          fotoStatus.textContent = (window.i18n.t('modal.fotos_contador') || '{0}/5 photos').replace('{0}', totalCount);
          
          data.data.urls.forEach(url => {
            const cleanUrl = safeUrl(url);
            if (!cleanUrl) return;
            window.uploadedPhotos.push(cleanUrl);
            const img = document.createElement('img');
            img.src = cleanUrl;
            img.style.width = '50px';
            img.style.height = '50px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            img.style.border = '1px solid var(--border)';
            fotoGallery.appendChild(img);
          });
        } else {
          fotoStatus.textContent = (window.i18n.t('api.error_prefix') || 'Error: ') + extractErrorMessage(data, window.i18n.t('modal.subir_foto_error') || 'Upload error');
        }
      } catch (err) {
        if (err.message !== 'SESION_EXPIRADA') {
          fotoStatus.textContent = window.i18n.t('drawer.err_red') || 'Network error.';
        }
      }
      fotoInput.value = ''; // reset
    });
  }

  const modalNumSerieInput = document.getElementById('modalNumSerie');
  if (modalNumSerieInput) {
    const clearDuplicateSerialMsg = (msgEl) => {
      if (!msgEl) return;
      msgEl.style.display = 'none';
      msgEl.textContent = '';
      msgEl.className = 'modal-msg';
      delete msgEl._duplicateErr;
      if (msgEl.dataset) {
        delete msgEl.dataset.duplicateErr;
        delete msgEl.dataset.duplicateSerial;
      }
    };
    modalNumSerieInput.addEventListener('input', () => {
      const msgEl = document.getElementById('modalMsg');
      if (msgEl && (msgEl._duplicateErr || msgEl.dataset?.duplicateErr === '1')) {
        clearDuplicateSerialMsg(msgEl);
      }
    });
    modalNumSerieInput.addEventListener('blur', async (e) => {
      const val = e.target.value.trim();
      const msgEl = document.getElementById('modalMsg');
      if (!val) {
        if (msgEl && (msgEl._duplicateErr || msgEl.dataset?.duplicateErr === '1')) {
          clearDuplicateSerialMsg(msgEl);
        }
        return;
      }
      try {
        const res = await apiFetch(`/api/activos/serial/${encodeURIComponent(val)}`);
        const json = await parseApiJson(res);
        // If it succeeds, the item already exists!
        if (res.ok && json && json.success && json.data) {
          if (msgEl) {
            msgEl.textContent = window.i18n.t('modal.err_duplicado') || `Warning! An equipment with serial ${val} already exists`;
            msgEl.className = 'modal-msg error';
            msgEl.style.display = 'block';
            msgEl._duplicateErr = true;
            if (msgEl.dataset) {
              msgEl.dataset.duplicateErr = '1';
              msgEl.dataset.duplicateSerial = val;
            }
          }
        } else {
          // If it fails (404 / !json?.data), clear any previous duplicate message.
          const dupMsg = window.i18n?.t?.('modal.err_duplicado');
          if (msgEl && (msgEl._duplicateErr || msgEl.dataset?.duplicateErr === '1' || msgEl.dataset?.duplicateSerial || (dupMsg && msgEl.textContent === dupMsg) || msgEl.textContent.includes(val))) {
            clearDuplicateSerialMsg(msgEl);
          }
        }
      } catch (err) {
        console.error('Error checking serial', err);
      }
    });
  }

  document.getElementById('submitNewItem').addEventListener('click', async () => {
    if (!canManageInventory()) return;
    const numSerie  = document.getElementById('modalNumSerie').value.trim();
    const desc      = document.getElementById('modalDesc').value.trim();
    const marcaVal  = document.getElementById('modalMarca')?.value?.trim() || '';
    const categoriaVal = document.getElementById('modalCategoria')?.value || 'Hand Tools';
    const zonaVal   = document.getElementById('modalZona').value;
    const team      = document.getElementById('modalTeam').value;
    const estado    = document.getElementById('modalEstado').value;
    const fRegistro = document.getElementById('modalFechaRegistro').value;
    const notasVal  = document.getElementById('modalNotas')?.value?.trim() || '';
    const msgEl     = document.getElementById('modalMsg');
    if (msgEl) delete msgEl._duplicateErr;
    if (msgEl?.dataset) {
      delete msgEl.dataset.duplicateErr;
      delete msgEl.dataset.duplicateSerial;
    }

    if (!numSerie || !desc) {
      msgEl.textContent  = window.i18n.t('modal.err_requerido');
      msgEl.className    = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    const matchedCat = systemCategories.find(c => c.nombre.toLowerCase() === desc.toLowerCase());
    const itemId = (matchedCat && Number.isInteger(Number(matchedCat.id))) ? Number(matchedCat.id) : null;

        // ubicacion & usuario
    const ubicacionId = zonaVal ? parseInt(zonaVal, 10) : null;
    const usuarioVal  = document.getElementById('modalUsuario')?.value;
    const usuarioId   = usuarioVal ? parseInt(usuarioVal, 10) : null;

    const btn = document.getElementById('submitNewItem');
    btn.disabled = true;
    btn.querySelector('span').textContent = window.i18n.t('modal.registrando');

    try {
      const payload = {
        numero_serie:        numSerie,
        original_serial:     document.getElementById('modalOriginalSerial')?.value?.trim() || undefined,
        item_id:             itemId,
        descripcion:         desc,
        marca:               marcaVal || undefined,
        categoria:           categoriaVal,
        tipo:                categoriaVal,
        ubicacion_actual_id: ubicacionId,
        usuario_actual_id:   usuarioId,
        estado,
        team: team || null,
        cantidad: document.getElementById('modalCantidad') ? parseInt(document.getElementById('modalCantidad').value, 10) : 1,
        fecha_registro: fRegistro || undefined,
        fotos: window.uploadedPhotos || [],
        notas: notasVal || undefined,
      };
      const res = await apiFetch('/api/activos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await parseApiJson(res);

      if (res.ok && data.success !== false) {
        msgEl.textContent   = `✓ ${window.i18n.t('modal.registrado_ok').replace('{0}', numSerie)}`;
        msgEl.className     = 'modal-msg success';
        msgEl.style.display = 'block';
        await cargarActivos();
        const waNumber = localStorage.getItem('entelso_wa_number') || '61439759528';
        const qrImg = document.getElementById('modalQRCode');
        if (qrImg) {
          qrImg.src = buildAssetQrDataUri(numSerie, waNumber);
          document.getElementById('modalQRContainer').style.display = 'block';
        }
        btn.disabled = false;
        btn.querySelector('span').textContent = window.i18n.t('modal.registrar');
        document.getElementById('modalNumSerie').value = '';
        document.getElementById('modalDesc').value     = '';
        if (document.getElementById('modalOriginalSerial')) document.getElementById('modalOriginalSerial').value = '';
        if (document.getElementById('modalMarca')) document.getElementById('modalMarca').value = '';
        const modalCatEl = document.getElementById('modalCategoria');
        if (modalCatEl) modalCatEl.value = modalCatEl.options[0]?.value || '';
        const qtyWrap = document.getElementById('modalCantidadWrapper');
        if (qtyWrap) qtyWrap.style.display = 'none';
        if (document.getElementById('modalCantidad')) document.getElementById('modalCantidad').value = '1';
        if (document.getElementById('modalZona')) document.getElementById('modalZona').value = '';
        if (document.getElementById('modalTeam')) document.getElementById('modalTeam').value = '';
        if (document.getElementById('modalUsuario')) document.getElementById('modalUsuario').value = '';
        if (document.getElementById('modalNotas')) document.getElementById('modalNotas').value = '';
        if (document.getElementById('modalFotoStatus')) document.getElementById('modalFotoStatus').textContent = '';
        window.uploadedPhotos = [];
        const gallery = document.getElementById('modalFotosGallery');
        if (gallery) gallery.innerHTML = '';
      } else {
        let errMsg = extractErrorMessage(data, window.i18n.t('modal.err_registrar'));
        if (data.error?.code) {
          const transKey = 'err.' + data.error.code;
          if (window.i18n.has(transKey)) errMsg = window.i18n.t(transKey);
        }
        msgEl.textContent = errMsg;
        msgEl.className     = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch (err) {
      console.error('Error registering equipment:', err);
      if (err.message === 'SESION_EXPIRADA') {
        msgEl.textContent = window.i18n.t('err.TOKEN_EXPIRED') || 'Session expired. Please log in again.';
      } else if (err instanceof SyntaxError) {
        msgEl.textContent = window.i18n.t('err.INTERNAL_SERVER_ERROR') || 'Internal server error.';
      } else {
        msgEl.textContent = window.i18n.t('modal.err_conexion') + (err.message ? ` (${err.message})` : '');
      }
      msgEl.className     = 'modal-msg error';
      msgEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = window.i18n.t('modal.registrar');
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    }
  });
}

/* ─────────────────────────────────────────
   FILTROS DE BÚSQUEDA
───────────────────────────────────────── */
function inicializarFiltros() {
  let inventarioSearchTimer = null;
  document.getElementById('inventarioSearch')?.addEventListener('input', function () {
    clearTimeout(inventarioSearchTimer);
    inventarioSearchTimer = setTimeout(() => window.aplicarFiltrosInventario(), 200);
  });

  // Búsqueda de empleados
  document.getElementById('employeeSearch')?.addEventListener('input', function () {
    window.aplicarFiltrosEmpleados();
  });

  // Filter chips de empleados
  document.querySelectorAll('[data-emp-filter]').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('[data-emp-filter]').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      window.aplicarFiltrosEmpleados();
    });
  });

  // Filter chips del dashboard
  document.querySelectorAll('#view-dashboard .filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#view-dashboard .filter-chips .chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      window.aplicarFiltrosDashboard();
    });
  });

  // Group tabs (inventario)
  document.querySelectorAll('.gtab').forEach(tab => {
    tab.addEventListener('click', function () {
      const isActive = this.classList.contains('active');
      document.querySelectorAll('.gtab').forEach(t => t.classList.remove('active'));
      
      if (!isActive) {
        this.classList.add('active');
      }
      
      window.aplicarFiltrosInventario();
    });
  });

  // Tab group (charts)
  document.querySelectorAll('.tab-group .tab').forEach(tab => {
    tab.addEventListener('click', function () {
      this.closest('.tab-group').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      renderizarGraficos();
    });
  });

  // Filtros Avanzados (Modal)
  const closeFilterModalBtn = document.getElementById('closeFilterModal');
  const applyFilterBtn = document.getElementById('applyFilterBtn');
  const clearFilterBtn = document.getElementById('clearFilterBtn');

  if (closeFilterModalBtn) {
    closeFilterModalBtn.addEventListener('click', () => document.getElementById('filterModalOverlay').classList.remove('open'));
  }

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', () => {
      window.aplicarFiltrosInventario();
      document.getElementById('filterModalOverlay').classList.remove('open');
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      document.getElementById('advFilterZona').value = '';
      document.getElementById('advFilterTeam').value = '';
      if (document.getElementById('advFilterUsuario')) document.getElementById('advFilterUsuario').value = '';
      document.getElementById('advFilterStatus').value = '';
      window.aplicarFiltrosInventario();
      document.getElementById('filterModalOverlay').classList.remove('open');
    });
  }
}



// =========================================================
// FUNCIÓN GLOBAL PARA SIMULACIÓN EN CONSOLA POR EL CLIENTE
// =========================================================
window.simularIngresoEquipo = function(equipo, estado = 'disponible', zona = 'VIC') {
  const newId = 'INV-' + (2800 + Math.floor(Math.random() * 1000));
  const newItem = {
    id: newId,
    equipo: equipo || 'Test Tool',
    zona: zona,
    team: 'Testing',
    status: estado,
    fecha: new Date().toISOString(),
    marca: 'Demo',
    modelo: 'Demo-100',
    serie: 'TEST-' + Math.floor(Math.random() * 10000),
    calibracion: '',
    asignado: window.i18n.t('simulacion.bot_auto') || 'Automatic (Bot)'
  };
  
  inventoryData.unshift(newItem); // Añadir al array local
  
  // Refrescar paneles
  renderizarActivos();
  actualizarKPIs();
  renderizarZonas();
  renderizarAlertas([]);
  
  // Mostrar notificación básica
  console.log(`✅ Nuevo equipo detectado vía WhatsApp: ${newItem.id} - ${newItem.equipo}`);
  
  const msgTemplate = window.i18n.t('simulacion.exito') || `Simulation Successful!\n\nNew report detected:\nID: {id}\nEquipment: {equipo}\nStatus: {estado}\n\nPanels, KPIs and tables have been updated automatically.`;
  const msg = msgTemplate.replace('{id}', newId).replace('{equipo}', newItem.equipo).replace('{estado}', window.i18n?.t('estado.' + estado) || estado);
  window.customAlert(msg);

  return msg;
};

// Exponer la funcion global para el boton de mantenimiento
window.marcarMantenimientoAtendido = async function(id) {
  if (!canManageInventory()) return;
  const confirmMsg = (window.i18n?.t('mantenimiento.confirm_atendido') || 'Are you sure you want to mark equipment {0} as resolved/available?').replace('{0}', id);
  if (!await window.customConfirm(confirmMsg)) return;
  try {
    const act = inventoryData.find(a => a.id === id);
    if (!act) return;
    
    // Si tenemos backend, llamamos al endpoint
    if (act.db_id) {
      const res = await apiFetch(`/api/activos/${act.db_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'disponible' })
      });
      const json = await parseApiJson(res);
      if (!res.ok || json.success === false) {
        throw new Error(extractErrorMessage(json, window.i18n.t('maint.err_atendido') || 'Error marking equipment as resolved.'));
      }
    }

    window.customAlert((window.i18n.t('maint.atendido_ok') || "Equipment {0} marked as resolved successfully.").replace('{0}', id));
    // Recargar vista desde backend real
    await cargarActivos();
    
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.error('Error al marcar atendido:', err);
      window.customAlert(err.message || window.i18n.t('maint.err_atendido') || 'Error marking equipment as resolved.');
    }
  }
};

/* -----------------------------------------
   PHASE 1: CATEGORY MANAGEMENT & EXCEL EXPORT
----------------------------------------- */
let systemCategories = [];

async function cargarCategorias() {
  try {
    const res = await apiFetch('/api/items/categorias');
    const json = await parseApiJson(res);
    if (res.ok && json.success !== false && Array.isArray(json.data)) {
      systemCategories = json.data;
      populateCategorySelects();
    }
  } catch (err) {
    console.error('Error cargando categorias', err);
  } finally {
    renderizarFiltrosCategorias();
  }
}

function populateCategorySelects() {
  const modalCategoria = document.getElementById('modalCategoria');
  const bulkCategorySelect = document.getElementById('bulkCategorySelect');
  
  if (modalCategoria) {
    const prev = modalCategoria.value;
    modalCategoria.innerHTML = systemCategories.map(c => `<option value="${escapeHTML(c.nombre)}">${escapeHTML(c.nombre)}</option>`).join('');
    if (prev && Array.from(modalCategoria.options).some(o => o.value === prev)) {
      modalCategoria.value = prev;
    }
  }
  if (bulkCategorySelect) {
    bulkCategorySelect.innerHTML = `<option value="" data-i18n="cat.seleccionar">${escapeHTML(window.i18n?.t('cat.seleccionar') || '-- Select Destination Category --')}</option>` + 
      systemCategories.map(c => `<option value="${escapeHTML(c.nombre)}">${escapeHTML(c.nombre)}</option>`).join('');
  }
}

function renderizarFiltrosCategorias() {
  const container = document.getElementById('inventoryCategoryChips');
  if (!container) return;
  const activeFilter = container.querySelector('.chip.active[data-filter]')?.dataset.filter || 'all';
  container.innerHTML = `<button class="chip ${activeFilter === 'all' ? 'active' : ''}" data-filter="all" data-i18n="dash.filter.todos">${escapeHTML(window.i18n.t('dash.filter.todos') || 'All')}</button>`;
  
  systemCategories.forEach(cat => {
    const icon = window.CATEGORY_ICONS[cat.nombre] || 'fa-tag';
    const btn = document.createElement('button');
    btn.className = 'chip' + (activeFilter === cat.nombre ? ' active' : '');
    btn.dataset.filter = cat.nombre;
    btn.innerHTML = `<i class="fa-solid ${escapeHTML(icon)}" style="margin-right: 6px;"></i>${escapeHTML(cat.nombre)}`;
    container.appendChild(btn);
  });

  // Attach event listeners
  container.querySelectorAll('.chip[data-filter], .more-menu-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.chip, .more-menu-item').forEach(c => {
         if(c.classList) c.classList.remove('active');
         if(c.style && c.classList.contains('more-menu-item')) c.style.color = 'var(--text-2)';
      });
      
      if (el.classList.contains('more-menu-item')) {
         el.style.color = 'var(--accent-blue)';
         el.closest('.custom-dropdown')?.querySelector('.chip')?.classList.add('active');
      }
      el.classList.add('active');

      window.aplicarFiltrosInventario();
    });
  });
}

// Attach export functionality

const confirmExportBtn = document.getElementById('confirmExportBtn');
if (confirmExportBtn) {
  confirmExportBtn.addEventListener('click', async () => {
    const originalHTML = confirmExportBtn.innerHTML;
    confirmExportBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHTML(window.i18n.t('inv.generando') || 'Generating...')}`;
    confirmExportBtn.disabled = true;

    const idsToExport = (window.currentFilteredData || inventoryData).map(item => item.db_id);

    try {
      const abortCtrl = new AbortController();
      const exportTimeout = setTimeout(() => abortCtrl.abort(), 5 * 60 * 1000); // 5 min
      const response = await fetch(API_BASE + '/api/activos/export-excel', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + session.getToken(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ withPhotos: true, ids: idsToExport }),
        signal: abortCtrl.signal
      });
      clearTimeout(exportTimeout);
      if (response.status === 401) handleSessionExpired();
      if (!response.ok) {
        const errJson = await parseApiJson(response);
        throw new Error(extractErrorMessage(errJson, `HTTP ${response.status}`));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Entelso_Inventory_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      if (err.message !== 'SESION_EXPIRADA') {
        console.error('Export error:', err);
        const detPrefix = window.i18n.t('api.detalles') || 'Details: ';
        window.customAlert((window.i18n.t('drawer.err_red') || 'Error') + '\n\n' + detPrefix + err.message);
      }
    } finally {
      confirmExportBtn.innerHTML = originalHTML;
      confirmExportBtn.disabled = false;
    }
  });
}

const openManageCategoriesBtn = document.getElementById('openManageCategoriesBtn');
const catDropdownContainer = document.getElementById('catDropdownContainer');
if (openManageCategoriesBtn && catDropdownContainer) {
  openManageCategoriesBtn.addEventListener('click', () => {
    catDropdownContainer.style.display = catDropdownContainer.style.display === 'none' ? 'block' : 'none';
  });
}

window.eliminarActivo = async function(db_id) {
    if (!canManageInventory()) return;
    if(!await window.customConfirm(window.i18n.t('drawer.confirm_delete') || 'Are you sure you want to delete this asset?')) return;
    try {
        const res = await apiFetch(`/api/activos/${db_id}`, { method: 'DELETE' });
        const json = await parseApiJson(res);
        if (!res.ok || json.success === false) {
            throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_eliminar') || "Error deleting"));
        }
        window.customAlert(window.i18n.t('drawer.eliminado') || "Deleted");
        await cargarActivos();
    } catch(e) {
        if (e.message !== 'SESION_EXPIRADA') {
            window.customAlert(e.message || window.i18n.t('drawer.err_eliminar') || "Error deleting");
        }
    }
};

window.actualizarEstadoHerramienta = async function(db_id, newState) {
    if(!newState || !db_id || !canUpdateStatusOrAssign()) return;
    try {
        const res = await apiFetch(`/api/activos/${db_id}`, { 
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: newState })
        });
        const d = await parseApiJson(res);
        if (res.ok && d.success !== false) {
            showToast(window.i18n.t('drawer.estado_ok') || "Status updated");
        } else {
            window.customAlert(extractErrorMessage(d, window.i18n.t('drawer.err_actualizar') || "Error updating"));
        }
        await cargarActivos(true, true);
    } catch(e) {
        if (e.message !== 'SESION_EXPIRADA') {
            window.customAlert(e.message || window.i18n.t('drawer.err_actualizar') || "Error updating");
        }
    }
};

window.actualizarUsuarioHerramienta = async function(db_id, newUserId) {
    if (!db_id || !canUpdateStatusOrAssign()) return;
    const usuario_actual_id = newUserId ? Number(newUserId) : null;
    try {
        const res = await apiFetch(`/api/activos/${db_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_actual_id })
        });
        const d = await parseApiJson(res);
        if (res.ok && d.success !== false) {
            showToast(window.i18n.t('drawer.usuario_ok') || "Assigned person updated");
        } else {
            window.customAlert(extractErrorMessage(d, window.i18n.t('drawer.err_actualizar') || "Error updating"));
        }
        await cargarActivos(true, true);
    } catch(e) {
        if (e.message !== 'SESION_EXPIRADA') {
            window.customAlert(e.message || window.i18n.t('drawer.err_actualizar') || "Error updating");
        }
    }
};

// Ensure cargarCategorias runs on start
window.addEventListener('DOMContentLoaded', () => {
  if (session.isLoggedIn()) {
    cargarCategorias();
  }
});


/* -----------------------------------------
   PHASE 2: QUICK TEAM ASSIGNMENT
----------------------------------------- */
async function updateWorkerTeam(userId, newTeam) {
  if (!userId || !isAdminRole()) return;
  try {
    const res = await apiFetch(`/api/usuarios/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: newTeam || null })
    });
    const d = await parseApiJson(res);
    if (!res.ok || d.success === false) {
      window.customAlert((window.i18n.t('drawer.err_actualizar_team') || 'Error updating team: {0}').replace('{0}', extractErrorMessage(d, window.i18n.t('drawer.err_desconocido') || 'Unknown error')));
    }
  } catch (err) {
    console.error('Error updateWorkerTeam', err);
  }
}

/* -----------------------------------------
   EDIT EMPLOYEE MODAL (Global)
----------------------------------------- */
window.editarEmpleado = async function(userId) {
  if (!userId || !isAdminRole()) return;
  try {
    const res  = await apiFetch(`/api/usuarios/${userId}`);
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false || !json.data) {
      return window.customAlert(extractErrorMessage(json, window.i18n.t('usuarios.err_cargar') || 'Error loading user.'));
    }
    const u = json.data;

    // Build modal dynamically
    let modal = document.getElementById('editUserModal');
    if (!modal) {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-overlay open" id="editUserModal" style="z-index:9999">
            <div class="modal" style="max-width:440px">
              <div class="modal-header">
                <span data-i18n="usuarios.edit_title">${escapeHTML(window.i18n.t('usuarios.edit_title') || 'Edit User')}</span>
                <button class="icon-btn" onclick="document.getElementById('editUserModal').remove()"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div class="modal-body">
                <div class="modal-msg" id="editUserMsg" style="display:none"></div>
                <div class="form-group"><label data-i18n="usuarios.edit_name">${escapeHTML(window.i18n.t('usuarios.edit_name') || 'Name')}</label><input type="text" id="editUserNombre" class="form-input"></div>
                <div class="form-group"><label data-i18n="usuarios.edit_email">${escapeHTML(window.i18n.t('usuarios.edit_email') || 'Email')}</label><input type="email" id="editUserEmail" class="form-input"></div>
                <div class="form-group"><label data-i18n="usuarios.phone">${escapeHTML(window.i18n.t('usuarios.phone') || 'Phone (WhatsApp)')}</label><input type="text" id="editUserPhone" class="form-input" data-i18n-ph="usuarios.phone_ph" placeholder="${escapeHTML(window.i18n.t('usuarios.phone_ph') || 'e.g. 61439759528 (no + sign)')}"></div>
                <div class="form-group"><label data-i18n="usuarios.edit_team">${escapeHTML(window.i18n.t('usuarios.edit_team') || 'Team')}</label>
                  <select id="editUserTeam" class="form-input"></select>
                </div>
                <div class="form-group"><label data-i18n="usuarios.default_zona">${escapeHTML(window.i18n.t('usuarios.default_zona') || 'Default Zone')}</label>
                  <select id="editUserDefaultZona" class="form-input"></select>
                </div>
                <div class="form-group"><label data-i18n="usuarios.edit_rol">${escapeHTML(window.i18n.t('usuarios.edit_rol') || 'Role')}</label>
                  <select id="editUserRol" class="form-input">
                    <option value="trabajador">${escapeHTML(window.i18n.t('usuarios.edit_rol_trabajador') || 'Worker')}</option>
                    <option value="supervisor">${escapeHTML(window.i18n.t('usuarios.edit_rol_supervisor') || 'Supervisor')}</option>
                    <option value="almacen">${escapeHTML(window.i18n.t('usuarios.edit_rol_almacen') || 'Warehouse')}</option>
                    <option value="admin">${escapeHTML(window.i18n.t('usuarios.edit_rol_admin') || 'Administrator')}</option>
                  </select>
                </div>
                <div class="form-group" style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" id="editUserTerreno">
                  <label for="editUserTerreno" style="margin:0; font-size:13px; font-weight:normal;" data-i18n="usuarios.edit_terreno">${escapeHTML(window.i18n.t('usuarios.edit_terreno') || 'Field Worker (Manual)')}</label>
                </div>
                <div class="form-group"><label data-i18n="usuarios.edit_pin">${escapeHTML(window.i18n.t('usuarios.edit_pin') || 'New PIN / Password (leave blank to keep current)')}</label><input type="password" id="editUserPin" class="form-input" placeholder="${escapeHTML(window.i18n.t('usuarios.edit_pin_ph') || 'Min 4 characters')}"></div>
              </div>
              <div class="modal-footer">
                <button class="btn-ghost" onclick="document.getElementById('editUserModal').remove()" data-i18n="modal.cancelar">${escapeHTML(window.i18n.t('modal.cancelar') || 'Cancel')}</button>
                <button class="btn-primary" id="btnSaveEditUser" data-i18n="modal.guardar">${escapeHTML(window.i18n.t('modal.guardar') || 'Save Changes')}</button>
              </div>
            </div>
          </div>
        `;
      modal = div.firstElementChild;
      document.body.appendChild(modal);
    }

    // Populate dropdowns first (modal is dynamic, selects are empty on first mount)
    if (typeof populateTeamSelects === 'function') populateTeamSelects();
    if (typeof populateZonaSelects === 'function') populateZonaSelects();

    // Populate
    document.getElementById('editUserNombre').value = u.nombre || '';
    document.getElementById('editUserEmail').value  = u.email  || '';
    document.getElementById('editUserPhone').value  = u.telefono_whatsapp  || '';
    document.getElementById('editUserTeam').value   = u.team   || '';
    document.getElementById('editUserDefaultZona').value = u.default_zona || '';
    document.getElementById('editUserRol').value    = u.rol    || 'trabajador';
    document.getElementById('editUserTerreno').checked = u.en_terreno === true;
    document.getElementById('editUserPin').value    = '';
    document.getElementById('editUserMsg').style.display = 'none';

    document.getElementById('btnSaveEditUser').onclick = async () => {
      const payload = {
        nombre: document.getElementById('editUserNombre').value.trim(),
        email:  document.getElementById('editUserEmail').value.trim() || null,
        telefono_whatsapp: document.getElementById('editUserPhone').value.trim() || null,
        team:   document.getElementById('editUserTeam').value || null,
        default_zona: document.getElementById('editUserDefaultZona').value || null,
        rol:    document.getElementById('editUserRol').value,
        en_terreno: document.getElementById('editUserTerreno').checked,
      };
      const pin = document.getElementById('editUserPin').value;
      if (pin) payload.pin = pin;

      try {
        const r = await apiFetch(`/api/usuarios/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await parseApiJson(r);
        if (r.ok && d.success !== false) {
          document.getElementById('editUserModal').remove();
          cargarUsuariosAdministracion();
          cargarUsuarios();
        } else {
          const msgEl = document.getElementById('editUserMsg');
          msgEl.textContent = extractErrorMessage(d, window.i18n.t('drawer.err_guardar') || 'Error saving.');
          msgEl.className = 'modal-msg error';
          msgEl.style.display = 'block';
        }
      } catch (e) {
        if (e.message !== 'SESION_EXPIRADA') {
          const msgEl = document.getElementById('editUserMsg');
          msgEl.textContent = e.message || window.i18n.t('drawer.err_red') || 'Network Error';
          msgEl.className = 'modal-msg error';
          msgEl.style.display = 'block';
        }
      }
    };
  } catch (e) {
    if (e.message !== 'SESION_EXPIRADA') {
      window.customAlert(e.message || window.i18n.t('usuarios.err_cargar') || 'Error loading user.');
    }
  }
};

/* -----------------------------------------
   EDIT ASSET MODAL (Global)
----------------------------------------- */
window.editarActivo = async function(item) {
  if (!canManageInventory()) return;
  if (!item || !item.db_id) return window.customAlert(window.i18n.t('drawer.sin_id') || 'No Asset ID found.');
  try {

  let modal = document.getElementById('editAssetModal');
  if (modal) modal.remove();

  // Build options for ubicaciones and usuarios
  const ubOpts = (window.ubicacionesData || []).map(u => `<option value="${escapeHTML(u.id)}" ${item.ubicacion_id == u.id ? 'selected' : ''}>${escapeHTML(u.nombre_ubicacion)}</option>`).join('');
  const initialPhotos = (item.fotos || []).map(safeUrl).filter(Boolean);

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-overlay open" id="editAssetModal" style="z-index:9999">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span>${escapeHTML(window.i18n.t('drawer.editar') || 'Edit Asset')}: ${escapeHTML(item.id)}</span>
          <button class="icon-btn" onclick="document.getElementById('editAssetModal').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="modal-msg" id="editAssetMsg" style="display:none"></div>
          <div class="form-row">
            <div class="form-group"><label>${escapeHTML(window.i18n.t('modal.inv') || 'Inventory No.')}</label>
              <input type="text" id="editAssetSerial" class="form-input" value="${escapeHTML(item.id)}">
            </div>
            <div class="form-group"><label>${escapeHTML(window.i18n.t('modal.original_serial') || 'Original / Manufacturer Serial')}</label>
              <input type="text" id="editAssetOriginalSerial" class="form-input" value="${escapeHTML(item.original_serial || '')}">
            </div>
          </div>
          <div class="form-group"><label>${escapeHTML(window.i18n.t('col.estado') || 'Status')}</label>
            <select id="editAssetEstado" class="form-input">
              <option value="disponible" ${item.status==='disponible' || !item.status ?'selected':''}>${escapeHTML(window.i18n.t('estado.disponible') || 'Available')}</option>
              <option value="en_uso" ${item.status==='en_uso'?'selected':''}>${escapeHTML(window.i18n.t('estado.en_uso') || 'In Use')}</option>
              <option value="en_mantenimiento" ${item.status==='en_mantenimiento'?'selected':''}>${escapeHTML(window.i18n.t('estado.en_mantenimiento') || 'Under Maintenance')}</option>
              <option value="calibracion_pendiente" ${item.status==='calibracion_pendiente'?'selected':''}>${escapeHTML(window.i18n.t('estado.calibracion_pendiente') || 'Calibration Pending')}</option>
              <option value="fuera_de_servicio" ${item.status==='fuera_de_servicio'?'selected':''}>${escapeHTML(window.i18n.t('estado.fuera_de_servicio') || 'Out of Service')}</option>
              <option value="danado" ${item.status==='danado'?'selected':''}>${escapeHTML(window.i18n.t('estado.danado') || 'Damaged')}</option>
              <option value="calibrado" ${item.status==='calibrado'?'selected':''}>${escapeHTML(window.i18n.t('estado.calibrado') || 'Calibrated')}</option>
            </select>
          </div>
          <div class="form-group"><label>${escapeHTML(window.i18n.t('col.zona') || 'Zone')}</label>
            <select id="editAssetUbicacion" class="form-input">
              <option value="">${escapeHTML(window.i18n.t('modal.seleccionar_zona') || '-- Select Zone --')}</option>
              ${ubOpts}
            </select>
          </div>
          <div class="form-group"><label>${escapeHTML(window.i18n.t('col.team') || 'Team')}</label>
            <select id="editAssetTeam" class="form-input">
              <option value="">${escapeHTML(window.i18n.t('usuarios.sin_team') || 'No Team')}</option>
              ${(window.teamsList || []).map(t => `<option value="${escapeHTML(t.nombre)}" ${item.team === t.nombre ? 'selected' : ''}>${escapeHTML(t.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${escapeHTML(window.i18n.t('modal.desc') || 'Equipment / Description')}</label>
              <input type="text" id="editAssetDesc" class="form-input" value="${escapeHTML(item.equipo || '')}">
            </div>
            <div class="form-group"><label>${escapeHTML(window.i18n.t('drawer.meta_marca') || 'Brand')}</label>
              <input type="text" id="editAssetMarca" class="form-input" value="${escapeHTML(item.marca === '—' ? '' : (item.marca || ''))}">
            </div>
          </div>
          <div class="form-group"><label>${escapeHTML(window.i18n.t('modal.cat') || 'Category')}</label>
            <select id="editAssetCategoria" class="form-input">
              ${systemCategories.map(c => `<option value="${escapeHTML(c.nombre)}" ${item.categoria === c.nombre || item.categoria_padre === c.nombre ? 'selected' : ''}>${escapeHTML(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${escapeHTML(window.i18n.t('col.ulti_cal') || 'Last Test / Tag')}</label><input type="text" data-type="date" id="editAssetUltiCal" class="form-input" value="${escapeHTML(item.ultima_calibracion?String(item.ultima_calibracion).substring(0,10):'')}"></div>
            <div class="form-group"><label>${escapeHTML(window.i18n.t('col.prox_cal') || 'Next Test / Tag')}</label><input type="text" data-type="date" id="editAssetProxCal" class="form-input" value="${escapeHTML(item.calibracion?String(item.calibracion).substring(0,10):'')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>${escapeHTML(window.i18n.t('drawer.meta_ulti_tag') || 'DOM / Last Tag')}</label><input type="text" data-type="date" id="editAssetUltiTag" class="form-input" value="${escapeHTML(item.ultimo_tag?String(item.ultimo_tag).substring(0,10):'')}"></div>
            <div class="form-group"><label>${escapeHTML(window.i18n.t('drawer.meta_tag') || 'Next Tag / Inspection')}</label><input type="text" data-type="date" id="editAssetProxTag" class="form-input" value="${escapeHTML(item.tag?String(item.tag).substring(0,10):'')}"></div>
          </div>
          <div class="form-group"><label>${escapeHTML(window.i18n.t('modal.asignado') || 'Assigned to (Person)')}</label>
            <select id="editAssetUsuario" class="form-input">
              <option value="">-- ${escapeHTML(window.i18n.t('usuarios.sin_asignar') || 'Unassigned')} --</option>
              ${(window.usuariosData || []).map(u => `<option value="${escapeHTML(u.id)}" ${Number(item.usuario_id) === Number(u.id) ? 'selected' : ''}>${escapeHTML(u.nombre)}${u.team ? ' (' + escapeHTML(u.team) + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <div style="margin-bottom: 12px; width: 150px; display: ${(item.raw_tipo === 'consumible' || item.categoria_padre === 'Consumables' || item.categoria_padre === 'Safety & PPE') ? 'block' : 'none'};">
              <label>${escapeHTML(window.i18n.t('modal.cantidad') || 'Quantity')}</label>
              <input type="number" id="editAssetCantidad" class="form-input" min="0" value="${escapeHTML(item.cantidad !== undefined ? item.cantidad : 1)}">
            </div>
            <label>${escapeHTML(window.i18n.t('modal.notas') || 'Notes / Kit Contents')}</label>
            <textarea id="editAssetNotas" class="form-input" rows="3" style="resize: vertical; font-size: 13px;">${escapeHTML(item.notas || '')}</textarea>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <label>${escapeHTML(window.i18n.t('modal.fotos') || 'Photos')}</label>
            <div id="editAssetFotosGallery" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; min-height: 50px;">
                ${initialPhotos.map(foto => `<img src="${escapeHTML(foto)}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">`).join('')}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="file" id="editAssetFotoInput" accept="image/*" multiple style="display: none;">
                <button type="button" class="btn-ghost" onclick="document.getElementById('editAssetFotoInput').click()" style="font-size: 13px; padding: 6px 12px;">
                    <i class="fa-solid fa-camera"></i> <span>${escapeHTML(window.i18n.t('modal.subir_foto') || 'Upload Photo')}</span>
                </button>
                <span id="editAssetFotoStatus" style="font-size: 12px; color: var(--text-2);"></span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick="document.getElementById('editAssetModal').remove()">${escapeHTML(window.i18n.t('modal.cancelar') || 'Cancel')}</button>
          <button class="btn-primary" id="confirmEditAssetBtn">${escapeHTML(window.i18n.t('modal.guardar') || 'Save Changes')}</button>
        </div>
      </div>
    </div>`;
  modal = div.firstElementChild;
  document.body.appendChild(modal);


  let currentFotos = (item._raw && Array.isArray(item._raw.fotos)) ? item._raw.fotos.map(safeUrl).filter(Boolean) : [];

  const fotoInput = document.getElementById('editAssetFotoInput');
  const fotoStatus = document.getElementById('editAssetFotoStatus');
  const fotoGallery = document.getElementById('editAssetFotosGallery');

  const renderFotos = () => {
    if (!fotoGallery) return;
    if (currentFotos.length === 0) {
      fotoGallery.innerHTML = '';
      return;
    }
    fotoGallery.innerHTML = currentFotos.map((url, idx) => `
      <div style="position:relative; display:inline-block; margin-right:8px; margin-bottom:8px;">
        <img src="${escapeHTML(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--border);">
        <button type="button" data-action="remove-edit-photo" data-idx="${idx}" style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;line-height:20px;padding:0;text-align:center;">&times;</button>
      </div>
    `).join('');
  };

  if (fotoGallery && fotoGallery.dataset.delegated !== '1') {
    fotoGallery.dataset.delegated = '1';
    fotoGallery.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remove-edit-photo"]');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (!Number.isNaN(idx)) {
        currentFotos.splice(idx, 1);
        renderFotos();
      }
    });
  }

  // Render existing photos
  renderFotos();

  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      if (currentFotos.length + files.length > 5) {
        window.customAlert(window.i18n.t('modal.err_max_fotos') || 'Maximum 5 photos allowed per asset.');
        fotoInput.value = '';
        return;
      }

      const btn = fotoInput.nextElementSibling;
      btn.disabled = true;
      const originalText = btn.querySelector('span').textContent;
      btn.querySelector('span').textContent = window.i18n.t('modal.subiendo_foto') || 'Uploading...';
      fotoStatus.textContent = '';

      const formData = new FormData();
      files.forEach(file => formData.append('fotos', file));
      
      try {
        const uploadRes = await fetch(API_BASE + '/api/upload/batch', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + session.getToken() },
          body: formData
        });
        if (uploadRes.status === 401) handleSessionExpired();
        const uploadJson = await parseApiJson(uploadRes);
        if (uploadRes.ok && uploadJson.success !== false && uploadJson.data?.urls) {
          uploadJson.data.urls.forEach(url => {
            const cleanUrl = safeUrl(url);
            if (cleanUrl) currentFotos.push(cleanUrl);
          });
          renderFotos();
          fotoStatus.textContent = '';
        } else {
          fotoStatus.textContent = extractErrorMessage(uploadJson, window.i18n.t('modal.subir_foto_error') || 'Error uploading photo');
        }
      } catch (err) {
        if (err.message !== 'SESION_EXPIRADA') {
          fotoStatus.textContent = window.i18n.t('seg.err_red') || 'Network error';
        }
      }

      btn.disabled = false;
      btn.querySelector('span').textContent = originalText;
      fotoInput.value = ''; // reset
    });
  }

  document.getElementById('confirmEditAssetBtn').onclick = async () => {
    const payload = {
      numero_serie:        document.getElementById('editAssetSerial').value.trim(),
      original_serial:     document.getElementById('editAssetOriginalSerial')?.value?.trim() || undefined,
      estado:              document.getElementById('editAssetEstado').value,
      team:                document.getElementById('editAssetTeam').value || null,
      ubicacion_actual_id: document.getElementById('editAssetUbicacion').value ? Number(document.getElementById('editAssetUbicacion').value) : null,
      fecha_ultima_cali:   document.getElementById('editAssetUltiCal').value || null,
      fecha_prox_cali:     document.getElementById('editAssetProxCal').value || null,
      fecha_ultimo_tag:    document.getElementById('editAssetUltiTag').value || null,
      fecha_prox_tag:      document.getElementById('editAssetProxTag').value || null,
      descripcion:         document.getElementById('editAssetDesc').value.trim() || null,
      marca:               document.getElementById('editAssetMarca').value.trim() || null,
      categoria:           document.getElementById('editAssetCategoria').value || null,
      usuario_actual_id:   document.getElementById('editAssetUsuario').value ? Number(document.getElementById('editAssetUsuario').value) : null,
      cantidad:            document.getElementById('editAssetCantidad') ? parseInt(document.getElementById('editAssetCantidad').value, 10) : 1,
      notas:               document.getElementById('editAssetNotas').value.trim() || null,
      fotos:               currentFotos
    };
    // Both ubicacion_actual_id (Zone) and usuario_actual_id (Assigned Person) can be saved together

    try {
      const r = await apiFetch(`/api/activos/${item.db_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await parseApiJson(r);
      if (r.ok && d.success !== false) {
        document.getElementById('editAssetModal').remove();
        document.getElementById('drawerOverlay').classList.remove('open');
        await cargarActivos();
      } else {
        const msgEl = document.getElementById('editAssetMsg');
        msgEl.textContent = extractErrorMessage(d, window.i18n.t('drawer.err_guardar') || 'Error saving.');
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch (e) {
      if (e.message !== 'SESION_EXPIRADA') {
        const msgEl = document.getElementById('editAssetMsg');
        msgEl.textContent = e.message || window.i18n.t('drawer.err_red') || 'Network Error';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    }
  };
  } catch(modalErr) {
    console.error('Edit modal error:', modalErr);
    window.customAlert((window.i18n.t('modal.err_abrir_editar') || 'Error opening edit modal: {0}').replace('{0}', modalErr.message));
  }
};

/* -----------------------------------------
   LOAD UBICACIONES for modal dropdowns
----------------------------------------- */
async function cargarUbicaciones() {
  try {
    const res  = await apiFetch('/api/ubicaciones');
    const json = await parseApiJson(res);
    if (res.ok && json.success !== false && Array.isArray(json.data)) {
      window.ubicacionesData = json.data;
      window.zonasList = json.data;
      populateZonaSelects();
    }
  } catch (e) {
    console.warn('Could not load locations:', e.message);
  }
}

/* ─────────────────────────────────────────
   PHASE 4: SECURITY INTEGRATIONS (Change Pass & 2FA)
───────────────────────────────────────── */
const btnCambiarPass = document.getElementById('btnCambiarPass');
if (btnCambiarPass) {
  btnCambiarPass.addEventListener('click', async () => {
    const actual = document.getElementById('segPassActual').value;
    const nueva = document.getElementById('segPassNueva').value;
    const conf = document.getElementById('segPassConfirmar').value;

    if (!actual || !nueva || !conf) return window.customAlert(window.i18n.t('seg.err_campos'));
    if (nueva !== conf) return window.customAlert(window.i18n.t('seg.err_no_coinciden'));

    try {
      btnCambiarPass.disabled = true;
      btnCambiarPass.textContent = window.i18n.t('seg.actualizando');
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: actual, newPassword: nueva })
      });
      const json = await parseApiJson(res);
      if (res.ok && json.success !== false) {
        window.customAlert(window.i18n.t('seg.pass_ok'));
        document.getElementById('segPassActual').value = '';
        document.getElementById('segPassNueva').value = '';
        document.getElementById('segPassConfirmar').value = '';
      } else {
        window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating'));
      }
    } catch (e) {
      if (e.message !== 'SESION_EXPIRADA') window.customAlert(e.message || window.i18n.t('seg.err_red'));
    } finally {
      btnCambiarPass.disabled = false;
      btnCambiarPass.textContent = window.i18n.t('seg.btn_actualizar');
    }
  });
}

const btnSetup2FA = document.getElementById('btnSetup2FA');
if (btnSetup2FA) {
  btnSetup2FA.addEventListener('click', async () => {
    try {
      btnSetup2FA.disabled = true;
      btnSetup2FA.textContent = window.i18n.t('seg.2fa_loading') || 'Loading...';
      const res = await apiFetch('/api/auth/setup-2fa', { method: 'POST' });
      const json = await parseApiJson(res);
      if (res.ok && json.success !== false && json.data) {
        // Show 2FA modal with QR code + manual setup key
        const qrSrc = safeUrl(json.data.qrCode);
        document.getElementById('twoFAQRImage').src = qrSrc;
        const secretWrap = document.getElementById('twoFASecretWrap');
        const secretCodeEl = document.getElementById('twoFASecretCode');
        if (secretWrap && secretCodeEl && json.data.secret) {
          secretCodeEl.textContent = json.data.secret;
          secretWrap.style.display = 'block';
        }
        document.getElementById('twoFATokenInput').value = '';
        document.getElementById('twoFAMsg').style.display = 'none';
        document.getElementById('twoFAModalOverlay').classList.add('open');
        document.getElementById('twoFATokenInput')?.focus();
      } else {
        window.customAlert(extractErrorMessage(json, window.i18n.t('seg.2fa_err') || 'Error setting up 2FA.'));
      }
    } catch(e) {
      if (e.message !== 'SESION_EXPIRADA') {
        window.customAlert(e.message || window.i18n.t('seg.2fa_net_err') || 'Network error or missing backend dependencies.');
      }
    } finally {
      btnSetup2FA.disabled = false;
      update2FAUI(current2FAEnabled);
    }
  });
}

// 2FA Modal handlers
const twoFAOverlay = document.getElementById('twoFAModalOverlay');
if (twoFAOverlay) {
  document.getElementById('closeTwoFAModal')?.addEventListener('click', () => twoFAOverlay.classList.remove('open'));
  document.getElementById('cancelTwoFABtn')?.addEventListener('click', () => twoFAOverlay.classList.remove('open'));

  document.getElementById('copyTwoFASecretBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('twoFASecretCode')?.textContent?.trim();
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      showToast(window.i18n.t('seg.2fa_copied') || 'Key copied');
    } catch (_) {}
  });

  const submitVerify2FA = async () => {
    const token = (document.getElementById('twoFATokenInput').value || '').replace(/\s+/g, '');
    const msgEl = document.getElementById('twoFAMsg');
    if (!/^\d{6}$/.test(token)) {
      msgEl.textContent = window.i18n.t('seg.2fa_invalid_code') || 'Please enter a valid 6-digit code.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }
    try {
      const vRes = await apiFetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const vJson = await parseApiJson(vRes);
      if (vRes.ok && vJson.success !== false) {
        update2FAUI(true);
        msgEl.textContent = window.i18n.t('seg.2fa_activated') || '✓ 2FA activated successfully!';
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        setTimeout(() => twoFAOverlay.classList.remove('open'), 1500);
      } else {
        msgEl.textContent = extractErrorMessage(vJson, window.i18n.t('seg.2fa_invalid_token') || 'Invalid token. Please try again.');
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch(e) {
      if (e.message !== 'SESION_EXPIRADA') {
        msgEl.textContent = e.message || window.i18n.t('drawer.err_red') || 'Network Error';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    }
  };

  document.getElementById('verifyTwoFABtn')?.addEventListener('click', submitVerify2FA);
  document.getElementById('twoFATokenInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitVerify2FA(); }
  });
}

// Disable 2FA Modal handlers
const btnDisable2FA = document.getElementById('btnDisable2FA');
const disableTwoFAOverlay = document.getElementById('disableTwoFAModalOverlay');
if (btnDisable2FA && disableTwoFAOverlay) {
  btnDisable2FA.addEventListener('click', () => {
    const inp = document.getElementById('disableTwoFATokenInput');
    const msg = document.getElementById('disableTwoFAMsg');
    if (inp) inp.value = '';
    if (msg) msg.style.display = 'none';
    disableTwoFAOverlay.classList.add('open');
    inp?.focus();
  });
  document.getElementById('closeDisableTwoFAModal')?.addEventListener('click', () => disableTwoFAOverlay.classList.remove('open'));
  document.getElementById('cancelDisableTwoFABtn')?.addEventListener('click', () => disableTwoFAOverlay.classList.remove('open'));

  const submitDisable2FA = async () => {
    const token = (document.getElementById('disableTwoFATokenInput').value || '').replace(/\s+/g, '');
    const msgEl = document.getElementById('disableTwoFAMsg');
    if (!/^\d{6}$/.test(token)) {
      msgEl.textContent = window.i18n.t('seg.2fa_invalid_code') || 'Please enter a valid 6-digit code.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }
    try {
      const dRes = await apiFetch('/api/auth/disable-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const dJson = await parseApiJson(dRes);
      if (dRes.ok && dJson.success !== false) {
        update2FAUI(false);
        disableTwoFAOverlay.classList.remove('open');
        showToast(window.i18n.t('seg.2fa_disabled_ok') || '2FA disabled successfully.');
      } else {
        msgEl.textContent = extractErrorMessage(dJson, window.i18n.t('seg.2fa_invalid_token') || 'Invalid token. Please try again.');
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch (e) {
      if (e.message !== 'SESION_EXPIRADA') {
        msgEl.textContent = e.message || window.i18n.t('drawer.err_red') || 'Network Error';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    }
  };

  document.getElementById('confirmDisableTwoFABtn')?.addEventListener('click', submitDisable2FA);
  document.getElementById('disableTwoFATokenInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitDisable2FA(); }
  });
}


// ══════════════════════════════════════
// DYNAMIC TEAMS & BULK OPERATIONS LOGIC
// ══════════════════════════════════════
window.teamsList = [];

async function loadTeams() {
    try {
        const res = await apiFetch('/api/teams');
        const json = await parseApiJson(res);
        if (res.ok && json.success !== false && Array.isArray(json.data)) {
            window.teamsList = json.data;
            populateTeamSelects();
            renderManageTeams();
        }
    } catch (e) {
        console.error('Error loading teams', e);
    }
}

function populateTeamSelects() {
    const opts = (window.teamsList || []).map(t => `<option value="${escapeHTML(t.nombre)}">${escapeHTML(t.nombre)}</option>`).join('');
    
    const au = document.getElementById('addUserTeam');
    if (au) au.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${escapeHTML(window.i18n.t('usuarios.sin_team'))}</option>` + opts;
    
    const eu = document.getElementById('editUserTeam');
    if (eu) eu.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${escapeHTML(window.i18n.t('usuarios.sin_team'))}</option>` + opts;
    
    const at = document.getElementById('advFilterTeam');
    if (at) at.innerHTML = `<option value="" data-i18n="filter.todos_teams">${escapeHTML(window.i18n.t('filter.todos_teams'))}</option>` + opts;
    
    const mt = document.getElementById('modalTeam');
    if (mt) mt.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${escapeHTML(window.i18n.t('usuarios.sin_team'))}</option>` + opts;

    const bt = document.getElementById('bulkTeamSelect');
    if (bt) bt.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${escapeHTML(window.i18n.t('usuarios.sin_team'))}</option>` + opts;
}

// Ensure loadTeams is called on DOMContentLoaded or immediately if already loaded
function initTeamsAndZonas() {
    if (!session.isLoggedIn()) return;
    loadTeams();
    loadZonas();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeamsAndZonas);
} else {
    initTeamsAndZonas();
}

// Manage Teams Modal
const teamsOverlay = document.getElementById('manageTeamsOverlay');
if (teamsOverlay) {
    document.getElementById('closeManageTeamsModal').onclick = () => teamsOverlay.classList.remove('open');
    teamsOverlay.onclick = e => { if (e.target === teamsOverlay) teamsOverlay.classList.remove('open'); };
    
    document.getElementById('addTeamBtn').onclick = async () => {
        if (!isAdminRole()) return;
        const input = document.getElementById('newTeamInput');
        const nombre = input.value.trim();
        if (!nombre) return;
        try {
            const res = await apiFetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre })
            });
            const json = await parseApiJson(res);
            if (res.ok && json.success !== false) {
                input.value = '';
                await loadTeams();
                if (typeof showToast === 'function') {
                    showToast(window.i18n.t('teams.toast_creado') || 'Team created successfully.');
                }
            } else {
                window.customAlert(extractErrorMessage(json, window.i18n.t('drawer.err_guardar') || 'Error saving.'));
            }
        } catch (e) {
            if (e.message !== 'SESION_EXPIRADA') console.error(e);
        }
    };
}

function renderManageTeams() {
    const container = document.getElementById('teamsListContainer');
    if (!container) return;
    if (container.dataset.delegated !== '1') {
        container.dataset.delegated = '1';
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="delete-team"]');
            if (btn) window.deleteTeam(Number(btn.dataset.id));
        });
    }
    if (!window.teamsList || window.teamsList.length === 0) {
        container.innerHTML = `<p style="color:var(--text-2);font-size:13px;text-align:center;">${escapeHTML(window.i18n.t('teams.no_teams') || 'No teams found.')}</p>`;
        return;
    }
    container.innerHTML = window.teamsList.map(t => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); font-size:14px;">
            <span>${escapeHTML(t.nombre)}</span>
            <button class="icon-btn" data-action="delete-team" data-id="${escapeHTML(t.id)}" style="color:var(--accent-red)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

window.deleteTeam = async function(id) {
    if (!isAdminRole()) return;
    if (!await window.customConfirm(window.i18n.t('teams.confirm_delete') || 'Delete this team?')) return;
    try {
        const res = await apiFetch('/api/teams/' + id, { method: 'DELETE' });
        const json = await parseApiJson(res);
        if (res.ok && json.success !== false) {
            await loadTeams();
            loadZonas();
        } else {
            window.customAlert(extractErrorMessage(json, window.i18n.t('drawer.err_eliminar') || 'Error deleting.'));
        }
    } catch (e) {
        if (e.message !== 'SESION_EXPIRADA') console.error(e);
    }
};

window.openManageTeams = function() {
    if (!isAdminRole()) return;
    renderManageTeams();
    document.getElementById('manageTeamsOverlay').classList.add('open');
};

// Insert the "Manage Teams" button in the Teams Header
document.addEventListener('DOMContentLoaded', () => {
    // Add "Manage Teams" and "Bulk Delete" buttons via mutation or direct injection since they need to be placed
    const teamsHeader = document.querySelector('[data-view="teams"]');
    // We will just add the button next to "Añadir Usuario" in the users view maybe?
    // User requested "El boton de borrarlo todo, que sea para los equipos, en usuarios si lo agregas que los elimine a todos pero no al que tiene su sesion activa".
});

// Bulk Delete Logic
let currentBulkMode = null; // 'activos' or 'usuarios'

window.openBulkDelete = function(mode) {
    if (!isAdminRole()) return;
    currentBulkMode = mode;
    
    let msg = '';
    if (mode === 'activos') {
        msg = window.i18n.t('bulk.warn_activos') || 'WARNING: This will delete ALL equipment, movements, and maintenance records permanently. Are you sure?';
    } else {
        msg = window.i18n.t('bulk.warn_usuarios') || 'WARNING: This will delete ALL users except yourself and other admins. Are you sure?';
    }
    document.getElementById('bulkDeleteMsg').textContent = msg;
    
    document.getElementById('bulkDeleteOverlay').classList.add('open');
};

if (document.getElementById('bulkDeleteConfirmBtn')) {

    document.getElementById('closeBulkDeleteModal').onclick = () => document.getElementById('bulkDeleteOverlay').classList.remove('open');
    document.getElementById('bulkDeleteCancelBtn').onclick = () => document.getElementById('bulkDeleteOverlay').classList.remove('open');
    
    document.getElementById('bulkDeleteConfirmBtn').onclick = async () => {
        if (!isAdminRole()) return;
        const btn = document.getElementById('bulkDeleteConfirmBtn');
        btn.disabled = true;
        btn.textContent = window.i18n.t('bulk.deleting') || 'Deleting...';
        
        try {
            const endpoint = currentBulkMode === 'activos' ? '/api/activos/bulk/all' : '/api/usuarios/bulk/others';
            const res = await apiFetch(endpoint, { method: 'DELETE' });
            const json = await parseApiJson(res);
            
            if (res.ok && json.success !== false) {
                const okMsg = json.message || window.i18n.t(currentBulkMode === 'activos' ? 'bulk.deleted_ok' : 'bulk.deleted_users_ok') || 'Operation completed.';
                window.customAlert(okMsg);
                document.getElementById('bulkDeleteOverlay').classList.remove('open');
                if (currentBulkMode === 'activos') {
                    if(typeof cargarActivos === 'function') await cargarActivos(true);
                } else {
                    if(typeof cargarUsuarios === 'function') await cargarUsuarios();
                    if (document.getElementById('view-usuarios')?.classList.contains('active')) {
                      document.getElementById('menuUsuarios')?.click();
                    }
                }
            } else {
                window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + extractErrorMessage(json, window.i18n.t('bulk.err_delete') || 'Error during bulk delete'));
            }
        } catch (e) {
            if (e.message !== 'SESION_EXPIRADA') {
                console.error(e);
                window.customAlert(e.message || window.i18n.t('bulk.err_delete') || 'Error during bulk delete');
            }
        } finally {
            btn.disabled = false;
            btn.textContent = window.i18n.t('bulk.delete') || 'Delete All';
        }
    };
}

// ── Zonas (Ubicaciones) CRUD ──

window.zonasList = [];

async function loadZonas() {
    try {
        const res = await apiFetch('/api/ubicaciones');
        const json = await parseApiJson(res);
        if (res.ok && json.success !== false && Array.isArray(json.data)) {
            window.zonasList = json.data;
            window.ubicacionesData = json.data;
            populateZonaSelects();
            renderManageZonas();
        }
    } catch (e) {
        console.error('Error loading zones', e);
    }
}

function populateZonaSelects() {
    const opts = (window.zonasList || []).map(z => `<option value="${escapeHTML(z.id)}">${escapeHTML(z.nombre_ubicacion)}</option>`).join('');
    const optsByName = (window.zonasList || []).map(z => `<option value="${escapeHTML(z.nombre_ubicacion)}">${escapeHTML(z.nombre_ubicacion)}</option>`).join('');
    
    const mz = document.getElementById('modalZona');
    if (mz) mz.innerHTML = `<option value="" data-i18n="modal.seleccionar_zona">${escapeHTML(window.i18n.t('modal.seleccionar_zona'))}</option>` + opts;
    
    const az = document.getElementById('advFilterZona');
    if (az) az.innerHTML = `<option value="" data-i18n="filter.todas_zonas">${escapeHTML(window.i18n.t('filter.todas_zonas'))}</option>` + opts;

    const bz = document.getElementById('bulkZonaSelect');
    if (bz) bz.innerHTML = `<option value="" data-i18n="usuarios.sin_zona">${escapeHTML(window.i18n.t('usuarios.sin_zona') || 'No Zone')}</option>` + opts;

    const addZ = document.getElementById('addUserDefaultZona');
    if (addZ) addZ.innerHTML = `<option value="" data-i18n="usuarios.sin_zona">${escapeHTML(window.i18n.t('usuarios.sin_zona') || 'No Zone')}</option>` + optsByName;

    const editZ = document.getElementById('editUserDefaultZona');
    if (editZ) editZ.innerHTML = `<option value="" data-i18n="usuarios.sin_zona">${escapeHTML(window.i18n.t('usuarios.sin_zona') || 'No Zone')}</option>` + optsByName;
}

window.openManageZonas = function() {
    if (!canManageInventory()) return;
    document.getElementById('manageZonasOverlay').classList.add('open');
    renderManageZonas();
};

if (document.getElementById('closeManageZonasModal')) {
    document.getElementById('closeManageZonasModal').onclick = () => document.getElementById('manageZonasOverlay').classList.remove('open');
}

function renderManageZonas() {
    const tbody = document.getElementById('manageZonasList');
    if (!tbody) return;
    if (tbody.dataset.delegated !== '1') {
        tbody.dataset.delegated = '1';
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="delete-zona"]');
            if (btn) window.deleteZona(Number(btn.dataset.id));
        });
    }
    tbody.innerHTML = '';
    (window.zonasList || []).forEach(z => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHTML(z.nombre_ubicacion)}</td>
            <td><button class="icon-btn" data-action="delete-zona" data-id="${escapeHTML(z.id)}" style="color:var(--accent-red)"><i class="fa-solid fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

if (document.getElementById('btnCreateZona')) {
    document.getElementById('btnCreateZona').addEventListener('click', async () => {
        if (!canManageInventory()) return;
        const input = document.getElementById('newZonaName');
        const val = input.value.trim();
        if (!val) return;
        
        try {
            const res = await apiFetch('/api/ubicaciones', {
                method: 'POST',
                body: JSON.stringify({ nombre_ubicacion: val })
            });
            const json = await parseApiJson(res);
            if (res.ok && json.success !== false) {
                input.value = '';
                await loadZonas();
                showToast(window.i18n.t('zonas.toast_creada') || 'Zone created successfully');
            } else {
                showToast(extractErrorMessage(json, window.i18n.t('estado_ui.error') || 'Error'), 'error');
            }
        } catch (e) {
            if (e.message !== 'SESION_EXPIRADA') showToast(e.message || window.i18n.t('estado_ui.error') || 'Error', 'error');
        }
    });
}

window.deleteZona = async function(id) {
    if (!canManageInventory()) return;
    if (!await window.customConfirm(window.i18n.t('zonas.confirm_delete') || 'Are you sure you want to delete this zone?')) return;
    try {
        const res = await apiFetch(`/api/ubicaciones/${id}`, { method: 'DELETE' });
        const json = await parseApiJson(res);
        if (res.ok && json.success !== false) {
            await loadZonas();
            showToast(window.i18n.t('zonas.toast_eliminada') || 'Zone deleted successfully');
        } else {
            showToast(extractErrorMessage(json, window.i18n.t('zonas.err_eliminar') || 'Error deleting zone'), 'error');
        }
    } catch (e) {
        if (e.message !== 'SESION_EXPIRADA') showToast(e.message || window.i18n.t('zonas.err_eliminar') || 'Error deleting zone', 'error');
    }
};

// ==========================================
// BULK IMPORT LOGIC
// ==========================================
(function() {
})();

// ==========================================
// BULK ACTIONS & CATEGORY MANAGEMENT
// ==========================================
window.updateBulkActionsState = function() {
  const allBoxes = document.querySelectorAll('.row-checkbox');
  allBoxes.forEach(cb => {
    if (cb.checked) window.selectedAssetIds.add(String(cb.value));
    else window.selectedAssetIds.delete(String(cb.value));
  });
  const checked = document.querySelectorAll('.row-checkbox:checked');
  const btn = document.getElementById('bulkActionsBtn');
  const countEl = document.getElementById('bulkActionsCount');
  const exportQRBtn = document.getElementById('exportQRLabelsBtn');
  if(checked.length > 0) {
    if (btn) btn.style.display = canUpdateStatusOrAssign() ? 'inline-flex' : 'none';
    if(exportQRBtn) exportQRBtn.style.display = 'inline-flex';
    if (countEl) countEl.textContent = checked.length;
  } else {
    if (btn) btn.style.display = 'none';
    if(exportQRBtn) exportQRBtn.style.display = 'none';
    document.getElementById('bulkActionsMenu').style.display = 'none';
  }
};

document.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => {
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked);
  window.updateBulkActionsState();
});

document.getElementById('exportQRLabelsBtn')?.addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => parseInt(cb.value, 10));
  if(!checked.length) return;
  const itemsToExport = inventoryData.filter(item => checked.includes(item.db_id));
  if(!itemsToExport.length) return;
  const pageTitle = window.i18n.t('inv.exportar_qr') || 'QR Labels';
  
  let html = `<html><head><title>${escapeHTML(pageTitle)}</title>
    <style>
      body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; background: white; color: black; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
      .label { border: 1px dashed #ccc; padding: 15px; text-align: center; page-break-inside: avoid; }
      .label img { width: 120px; height: 120px; margin-bottom: 10px; }
      .label-id { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
      .label-name { font-size: 12px; color: #555; text-transform: uppercase; }
      @media print {
        @page { margin: 1cm; }
        body { padding: 0; }
        .grid { grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .label { border: 1px dashed #000; }
      }
    </style></head><body>
    <div class="grid">`;
    
  const waNumber = localStorage.getItem('entelso_wa_number') || '61439759528';
  itemsToExport.forEach(item => {
    const serialId = item.serie || item.id || '';
    const qrSrc = buildAssetQrDataUri(serialId, waNumber);
    
    html += `
      <div class="label">
        <img src="${escapeHTML(qrSrc)}" />
        <div class="label-id">${escapeHTML(serialId)}</div>
        <div class="label-name">${escapeHTML(item.equipo || item.nombre || '')}</div>
      </div>
    `;
  });
  
  html += `</div>
    <script>
      setTimeout(() => { window.print(); }, 500);
    </script>
  </body></html>`;
  
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
});

document.getElementById('bulkActionsBtn')?.addEventListener('click', () => {
  if (!canUpdateStatusOrAssign()) return;
  const menu = document.getElementById('bulkActionsMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('bulkDeleteSelectedBtn')?.addEventListener('click', async () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canManageInventory()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if(!checked.length) return;
  if(!await window.customConfirm(window.i18n.t('drawer.confirm_delete') || 'Are you sure you want to delete this asset?')) return;
  const ids = Array.from(checked).map(cb => cb.value);
  try {
    const res = await apiFetch('/api/activos/bulk/delete', { method: 'POST', body: JSON.stringify({ ids }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_eliminar') || 'Error deleting assets.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_delete') || 'Assets deleted successfully.');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Move Category
let selectedIdsForMove = [];
document.getElementById('bulkMoveCategoryBtn')?.addEventListener('click', () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canManageInventory()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if(!checked.length) return;
  selectedIdsForMove = Array.from(checked).map(cb => cb.value);
  const select = document.getElementById('bulkCategorySelect');
  select.innerHTML = '<option value="">-- ' + escapeHTML(window.i18n.t('cat.seleccionar') || 'Select Destination Category') + ' --</option>';
  systemCategories.forEach(c => {
    select.innerHTML += `<option value="${escapeHTML(c.nombre)}">${escapeHTML(c.nombre)}</option>`;
  });
  document.getElementById('bulkCategoryModal').classList.add('open');
});

document.getElementById('closeBulkCategoryModal')?.addEventListener('click', () => document.getElementById('bulkCategoryModal').classList.remove('open'));
document.getElementById('cancelBulkCategoryBtn')?.addEventListener('click', () => document.getElementById('bulkCategoryModal').classList.remove('open'));
document.getElementById('confirmBulkCategoryBtn')?.addEventListener('click', async () => {
  if (!canManageInventory()) return;
  const item_id = document.getElementById('bulkCategorySelect').value;
  if(!item_id) return;
  try {
    const res = await apiFetch('/api/activos/bulk/category', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForMove, item_id }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating categories.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_cat') || 'Categories updated successfully.');
    document.getElementById('bulkCategoryModal').classList.remove('open');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Bulk Status
let selectedIdsForStatus = [];
document.getElementById('bulkSetStatusBtn')?.addEventListener('click', () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canUpdateStatusOrAssign()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if(!checked.length) return;
  selectedIdsForStatus = Array.from(checked).map(cb => cb.value);
  document.getElementById('bulkStatusModal').classList.add('open');
});

document.getElementById('closeBulkStatusModal')?.addEventListener('click', () => document.getElementById('bulkStatusModal').classList.remove('open'));
document.getElementById('cancelBulkStatusBtn')?.addEventListener('click', () => document.getElementById('bulkStatusModal').classList.remove('open'));
document.getElementById('confirmBulkStatusBtn')?.addEventListener('click', async () => {
  if (!canUpdateStatusOrAssign()) return;
  const status = document.getElementById('bulkStatusSelect').value;
  if(!status) return;
  try {
    const res = await apiFetch('/api/activos/bulk/status', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForStatus, status }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating statuses.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_estado') || 'Statuses updated successfully.');
    document.getElementById('bulkStatusModal').classList.remove('open');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Bulk Zone
let selectedIdsForZona = [];
document.getElementById('bulkSetZonaBtn')?.addEventListener('click', () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canUpdateStatusOrAssign()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if(!checked.length) return;
  selectedIdsForZona = Array.from(checked).map(cb => cb.value);
  const select = document.getElementById('bulkZonaSelect');
  select.innerHTML = '<option value="">-- ' + escapeHTML(window.i18n?.t('usuarios.sin_zona') || 'No Zone') + ' --</option>';
  if (window.zonasList) {
    window.zonasList.forEach(z => {
      select.innerHTML += `<option value="${escapeHTML(z.id)}">${escapeHTML(z.nombre_ubicacion)}</option>`;
    });
  }
  document.getElementById('bulkZonaModal').classList.add('open');
});

document.getElementById('closeBulkZonaModal')?.addEventListener('click', () => document.getElementById('bulkZonaModal').classList.remove('open'));
document.getElementById('cancelBulkZonaBtn')?.addEventListener('click', () => document.getElementById('bulkZonaModal').classList.remove('open'));
document.getElementById('confirmBulkZonaBtn')?.addEventListener('click', async () => {
  if (!canUpdateStatusOrAssign()) return;
  const zona_id = document.getElementById('bulkZonaSelect').value || null;
  try {
    const res = await apiFetch('/api/activos/bulk/zona', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForZona, zona_id }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating zones.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_zona') || 'Zones updated successfully.');
    document.getElementById('bulkZonaModal').classList.remove('open');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Bulk Team
let selectedIdsForTeam = [];
document.getElementById('bulkSetTeamBtn')?.addEventListener('click', () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canUpdateStatusOrAssign()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if(!checked.length) return;
  selectedIdsForTeam = Array.from(checked).map(cb => cb.value);
  const select = document.getElementById('bulkTeamSelect');
  select.innerHTML = '<option value="">-- ' + escapeHTML(window.i18n?.t('usuarios.sin_team') || 'No Team') + ' --</option>';
  if (window.teamsList) {
    window.teamsList.forEach(t => {
      select.innerHTML += `<option value="${escapeHTML(t.nombre)}">${escapeHTML(t.nombre)}</option>`;
    });
  }
  document.getElementById('bulkTeamModal').classList.add('open');
});

document.getElementById('closeBulkTeamModal')?.addEventListener('click', () => document.getElementById('bulkTeamModal').classList.remove('open'));
document.getElementById('cancelBulkTeamBtn')?.addEventListener('click', () => document.getElementById('bulkTeamModal').classList.remove('open'));
document.getElementById('confirmBulkTeamBtn')?.addEventListener('click', async () => {
  if (!canUpdateStatusOrAssign()) return;
  const team_id = document.getElementById('bulkTeamSelect').value || null;
  try {
    const res = await apiFetch('/api/activos/bulk/team', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForTeam, team_id }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating teams.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_team') || 'Teams updated successfully.');
    document.getElementById('bulkTeamModal').classList.remove('open');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Bulk Assign Person (Usuario)
let selectedIdsForUsuario = [];
document.getElementById('bulkSetUsuarioBtn')?.addEventListener('click', () => {
  document.getElementById('bulkActionsMenu').style.display = 'none';
  if (!canUpdateStatusOrAssign()) return;
  const checked = document.querySelectorAll('.row-checkbox:checked');
  if (!checked.length) return;
  selectedIdsForUsuario = Array.from(checked).map(cb => cb.value);
  const select = document.getElementById('bulkUsuarioSelect');
  if (select) {
    select.innerHTML = '<option value="">-- ' + escapeHTML(window.i18n?.t('usuarios.sin_asignar') || 'Unassigned') + ' --</option>';
    (window.usuariosData || []).forEach(u => {
      select.innerHTML += `<option value="${escapeHTML(u.id)}">${escapeHTML(u.nombre)}${u.team ? ' (' + escapeHTML(u.team) + ')' : ''}</option>`;
    });
  }
  document.getElementById('bulkUsuarioModal').classList.add('open');
});

document.getElementById('closeBulkUsuarioModal')?.addEventListener('click', () => document.getElementById('bulkUsuarioModal').classList.remove('open'));
document.getElementById('cancelBulkUsuarioBtn')?.addEventListener('click', () => document.getElementById('bulkUsuarioModal').classList.remove('open'));
document.getElementById('confirmBulkUsuarioBtn')?.addEventListener('click', async () => {
  if (!canUpdateStatusOrAssign()) return;
  const val = document.getElementById('bulkUsuarioSelect')?.value;
  const usuario_id = val ? Number(val) : null;
  try {
    const res = await apiFetch('/api/activos/bulk/usuario', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForUsuario, usuario_id }) });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating assigned person.'));
    }
    window.customAlert(window.i18n.t('bulk.ok_usuario') || 'Assigned person updated successfully.');
    document.getElementById('bulkUsuarioModal').classList.remove('open');
    window.selectedAssetIds.clear();
    await cargarActivos(true, true);
    document.getElementById('selectAllCheckbox').checked = false;
    window.updateBulkActionsState();
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

// Category Management (via /api/items/categorias + data-* event delegation)
const renderManageCatList = () => {
  const ul = document.getElementById('manageCategoriesList');
  if (!ul) return;

  if (ul.dataset.delegated !== '1') {
    ul.dataset.delegated = '1';
    ul.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = Number(btn.dataset.idx);
      const catName = btn.dataset.catName;
      if (action === 'toggle') window.toggleCatEdit(idx);
      else if (action === 'save') window.saveCatEdit(idx, catName);
      else if (action === 'delete') window.deleteCategory(catName);
    });
  }

  ul.innerHTML = '';
  if (!systemCategories || systemCategories.length === 0) {
    ul.innerHTML = `<li style="padding:16px; text-align:center; color:var(--text-2); font-size:13px;">${escapeHTML(window.i18n.t('cat.sin_categorias') || 'No categories found.')}</li>`;
    return;
  }

  const toolLabel = window.i18n.t('tipo.herramienta') || 'Tool';
  const consLabel = window.i18n.t('tipo.consumible') || 'Consumable';
  const kitLabel = window.i18n.t('tipo.kit') || 'Kit';

  systemCategories.forEach((c, idx) => {
    let icon = 'fa-tag';
    if (c.tipo === 'consumible') icon = 'fa-box';
    if (c.tipo === 'kit') icon = 'fa-toolbox';

    const safeName = escapeHTML(c.nombre || '');
    const li = document.createElement('li');
    li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border);';
    li.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; flex: 1;">
        <i class="fa-solid ${escapeHTML(icon)}" style="font-size:18px; color:var(--accent-blue);"></i>
        <div id="cat-view-${idx}" style="display:block; flex:1;">
          <strong style="color:var(--text-1); font-size:14px;">${safeName}</strong>
          <div style="font-size:12px; color:var(--text-2); text-transform: capitalize;">${escapeHTML(window.translateTipo(c.tipo))}</div>
        </div>
        <div id="cat-edit-${idx}" style="display:none; flex:1; gap: 8px;">
          <input type="text" id="cat-name-${idx}" class="form-input" value="${safeName}" style="width: 50%;">
          <select id="cat-type-${idx}" class="form-input select" style="width: 40%;">
            <option value="herramienta" ${c.tipo === 'herramienta' ? 'selected' : ''}>${escapeHTML(toolLabel)}</option>
            <option value="consumible" ${c.tipo === 'consumible' ? 'selected' : ''}>${escapeHTML(consLabel)}</option>
            <option value="kit" ${c.tipo === 'kit' ? 'selected' : ''}>${escapeHTML(kitLabel)}</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap: 8px; align-items:center;">
        <button class="icon-btn" id="cat-btn-edit-${idx}" data-action="toggle" data-idx="${idx}" style="color:var(--text-2);"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn" id="cat-btn-save-${idx}" data-action="save" data-idx="${idx}" data-cat-name="${safeName}" style="display:none; color:var(--accent-blue);"><i class="fa-solid fa-check"></i></button>
        <button class="icon-btn" data-action="delete" data-idx="${idx}" data-cat-name="${safeName}" style="color:var(--accent-red);"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    ul.appendChild(li);
  });
};

window.toggleCatEdit = (idx) => {
  const editEl = document.getElementById(`cat-edit-${idx}`);
  const viewEl = document.getElementById(`cat-view-${idx}`);
  const editBtn = document.getElementById(`cat-btn-edit-${idx}`);
  const saveBtn = document.getElementById(`cat-btn-save-${idx}`);
  if (!editEl || !viewEl || !editBtn || !saveBtn) return;
  const isEditing = editEl.style.display === 'flex';
  viewEl.style.display = isEditing ? 'block' : 'none';
  editEl.style.display = isEditing ? 'none' : 'flex';
  editBtn.style.display = isEditing ? 'block' : 'none';
  saveBtn.style.display = isEditing ? 'none' : 'block';
};

window.saveCatEdit = async (idx, oldName) => {
  if (!canManageInventory()) return;
  const newName = document.getElementById(`cat-name-${idx}`)?.value.trim();
  const newType = document.getElementById(`cat-type-${idx}`)?.value;
  if (!newName || !oldName) return;
  try {
    const res = await apiFetch(`/api/items/categorias/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: newName, tipo: newType })
    });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_actualizar') || 'Error updating category.'));
    }
    await cargarCategorias();
    renderManageCatList();
    await cargarActivos(true, true);
    showToast(window.i18n.t('cat.actualizada_ok') || 'Category updated successfully.');
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
};

document.getElementById('openManageCategoriesModalBtn')?.addEventListener('click', () => {
  if (!canManageInventory()) return;
  renderManageCatList();
  document.getElementById('manageCategoriesModal').classList.add('open');
});

document.getElementById('closeManageCategoriesModal')?.addEventListener('click', () => {
  document.getElementById('manageCategoriesModal').classList.remove('open');
});

document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
  if (!canManageInventory()) return;
  const name = document.getElementById('newCategoryName').value.trim();
  const tipo = document.getElementById('newCategoryType')?.value || 'herramienta';
  if (!name) return;
  try {
    const res = await apiFetch('/api/items/categorias', {
      method: 'POST',
      body: JSON.stringify({ nombre: name, tipo })
    });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_guardar') || 'Error creating category.'));
    }
    document.getElementById('newCategoryName').value = '';
    await cargarCategorias();
    renderManageCatList();
    showToast(window.i18n.t('cat.creada_ok') || 'Category created successfully.');
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
});

window.deleteCategory = async function(catName) {
  if (!canManageInventory() || !catName) return;
  if (!await window.customConfirm(window.i18n.t('cat.confirm_delete') || 'Delete category?')) return;
  try {
    const res = await apiFetch(`/api/items/categorias/${encodeURIComponent(catName)}`, { method: 'DELETE' });
    const json = await parseApiJson(res);
    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json, window.i18n.t('drawer.err_eliminar') || 'Error deleting category.'));
    }
    await cargarCategorias();
    renderManageCatList();
    await cargarActivos(true, true);
    showToast(window.i18n.t('cat.eliminada_ok') || 'Category deleted successfully.');
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') window.customAlert((window.i18n.t('api.error_prefix') || 'Error: ') + err.message);
  }
};

window.customAlert = function(msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customAlertOverlay');
    const msgEl = document.getElementById('customAlertMsg');
    const okBtn = document.getElementById('customAlertOkBtn');
    const closeBtn = document.getElementById('customAlertCloseTop');
    
    if(!overlay || !msgEl || !okBtn || !closeBtn) {
      alert(msg);
      resolve();
      return;
    }
    
    msgEl.textContent = msg == null ? '' : String(msg);
    overlay.classList.add('open');
    
    const cleanup = () => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      closeBtn.removeEventListener('click', onOk);
    };
    
    const onOk = () => {
      cleanup();
      resolve();
    };
    
    okBtn.addEventListener('click', onOk);
    closeBtn.addEventListener('click', onOk);
  });
};

window.customConfirm = function(msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customConfirmOverlay');
    const msgEl = document.getElementById('customConfirmMsg');
    const okBtn = document.getElementById('customConfirmOkBtn');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');
    const closeBtn = document.getElementById('customConfirmCloseTop');
    
    if(!overlay || !msgEl || !okBtn || !cancelBtn || !closeBtn) {
      resolve(confirm(msg));
      return;
    }
    
    msgEl.textContent = msg == null ? '' : String(msg);
    overlay.classList.add('open');
    
    const cleanup = () => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
    };
    
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
};


window.verDetallesActivo = function(id) {
  const activo = window.currentDataActivos.find(a => a.id === parseInt(id, 10));
  if (!activo) return;

  document.getElementById('detId').textContent = activo.numero_serie || '--';
  document.getElementById('detEstado').innerHTML = statusPill(activo.estado);
  document.getElementById('detEquipo').textContent = activo.nombre_item || activo.descripcion || '--';
  if (document.getElementById('detCategoria')) document.getElementById('detCategoria').textContent = activo.categoria_padre || window.translateTipo(window.getAssetCategory(activo)) || '--';
  document.getElementById('detZona').textContent = activo.nombre_ubicacion || window.i18n.t('api.sin_asignar');
  document.getElementById('detTeam').textContent = activo.team || '--';
  document.getElementById('detAsignado').textContent = activo.nombre_usuario || window.i18n.t('api.sin_asignar');

  const gallery = document.getElementById('detFotosGallery');
  const noFotos = document.getElementById('detNoFotos');
  gallery.innerHTML = '';
  
  const validPhotos = (activo.fotos && Array.isArray(activo.fotos)) ? activo.fotos.map(safeUrl).filter(Boolean) : [];
  if (validPhotos.length > 0) {
    noFotos.style.display = 'none';
    validPhotos.forEach(fotoUrl => {
      const a = document.createElement('a');
      a.href = fotoUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'block';
      
      const img = document.createElement('img');
      img.src = fotoUrl;
      img.style.width = '100%';
      img.style.height = '100px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = 'var(--radius-md)';
      img.style.border = '1px solid var(--border)';
      img.style.cursor = 'pointer';
      
      a.appendChild(img);
      gallery.appendChild(a);
    });
  } else {
    noFotos.style.display = 'block';
  }

  // Kit Logic
  const kitSection = document.getElementById('detKitSection');
  const catName = (activo.tipo || '').toLowerCase();
  const catPadre = (activo.categoria_padre || '').toLowerCase();
  const isKit = catName.includes('kit') || catPadre.includes('kit');
  
  if (isKit) {
    kitSection.style.display = 'block';
    window.renderKitContents(activo.id);
    const addKitBtn = document.getElementById('btnAddKitItem');
    if (addKitBtn) {
      addKitBtn.style.display = canManageInventory() ? '' : 'none';
      addKitBtn.onclick = () => window.promptAddKitItem(activo.id);
    }
  } else {
    kitSection.style.display = 'none';
  }

  document.getElementById('assetDetailsModalOverlay').classList.add('open');
};

window.renderKitContents = function(kitId) {
  const container = document.getElementById('detKitItems');
  if (!container) return;
  if (container.dataset.delegated !== '1') {
    container.dataset.delegated = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remove-kit-item"]');
      if (btn) window.removeKitItem(Number(btn.dataset.childId), Number(btn.dataset.kitId));
    });
  }
  container.innerHTML = `<div style="color: var(--text-2); font-size: 13px;">${escapeHTML(window.i18n.t('api.cargando') || 'Loading...')}</div>`;
  
  const children = window.currentDataActivos.filter(a => a.parent_activo_id === kitId);
  
  if (children.length === 0) {
    container.innerHTML = `<div style="color: var(--text-2); font-size: 13px; font-style: italic;" data-i18n="modal.empty_kit">${escapeHTML(window.i18n.t('modal.empty_kit') || 'This kit is empty.')}</div>`;
    return;
  }
  
  const allowRemove = canManageInventory();
  const removeTitle = window.i18n.t('modal.quitar_del_kit') || 'Remove from Kit';
  container.innerHTML = '';
  children.forEach(child => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.padding = '8px';
    div.style.background = 'var(--surface-hover)';
    div.style.borderRadius = 'var(--radius-sm)';
    div.style.fontSize = '13px';
    
    const removeBtnHtml = allowRemove
      ? `<button class="btn-icon" style="color: var(--status-error);" data-action="remove-kit-item" data-child-id="${escapeHTML(child.id)}" data-kit-id="${escapeHTML(kitId)}" title="${escapeHTML(removeTitle)}"><i class="fa-solid fa-trash"></i></button>`
      : '';
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <i class="fa-solid fa-microchip" style="color:var(--text-3);"></i>
        <div>
          <div style="font-weight: 500; color: var(--text-1);">${escapeHTML(child.numero_serie)}</div>
          <div style="font-size: 11px; color: var(--text-2);">${escapeHTML(child.nombre_item || child.descripcion || '--')}</div>
        </div>
      </div>
      ${removeBtnHtml}
    `;
    container.appendChild(div);
  });
};

window.promptAddKitItem = async function(kitId) {
  if (!canManageInventory()) return;
  const serial = prompt(window.i18n.t('modal.prompt_kit_serial') || 'Enter the serial number of the asset to add to this kit:');
  if (!serial) return;
  
  const child = window.currentDataActivos.find(a => a.numero_serie.toLowerCase() === serial.trim().toLowerCase());
  if (!child) {
    window.customAlert(window.i18n.t('modal.err_not_found') || 'Asset not found with that serial number.');
    return;
  }
  if (child.id === kitId) {
    window.customAlert(window.i18n.t('modal.err_kit_mismo') || 'Cannot add a kit to itself.');
    return;
  }
  if (child.parent_activo_id) {
    window.customAlert(window.i18n.t('modal.err_already_in_kit') || 'Asset is already in a kit.');
    return;
  }
  
  try {
    const res = await apiFetch('/api/activos/' + child.id, {
      method: 'PATCH',
      body: JSON.stringify({ parent_activo_id: kitId })
    });
    const json = await parseApiJson(res);
    if (res.ok && json.success !== false) {
      registrarAuditLog(`Added asset ${child.id} to kit ${kitId}`);
      await cargarActivos(true); // force reload
      window.renderKitContents(kitId);
    } else {
      window.customAlert(extractErrorMessage(json, window.i18n.t('modal.err_agregar_kit') || 'Error adding asset to kit.'));
    }
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.error(err);
      window.customAlert(err.message || window.i18n.t('modal.err_agregar_kit') || 'Error adding asset to kit.');
    }
  }
};

window.removeKitItem = async function(childId, kitId) {
  if (!canManageInventory()) return;
  if (!await window.customConfirm(window.i18n.t('modal.confirm_remove_kit') || 'Remove this asset from the kit?')) return;
  
  try {
    const res = await apiFetch('/api/activos/' + childId, {
      method: 'PATCH',
      body: JSON.stringify({ parent_activo_id: null }) // null removes the asset from the kit
    });
    const json = await parseApiJson(res);
    if (res.ok && json.success !== false) {
      registrarAuditLog(`Removed asset ${childId} from kit ${kitId}`);
      await cargarActivos(true);
      window.renderKitContents(kitId);
    } else {
      window.customAlert(extractErrorMessage(json, window.i18n.t('modal.err_quitar_kit') || 'Error removing asset from kit.'));
    }
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.error(err);
      window.customAlert(err.message || window.i18n.t('modal.err_quitar_kit') || 'Error removing asset from kit.');
    }
  }
};

// Init Flatpickr globally with active i18n locale (EN/ES)
function getActiveDateLocale() {
  const lang = window.i18n?.getLang?.() === 'es' ? 'es' : 'en';
  if (typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns[lang]) {
    return lang;
  }
  return 'default';
}
const initFlatpickr = (node) => {
  if (typeof flatpickr === 'undefined' || !node?.querySelectorAll) return;
  const loc = getActiveDateLocale();
  node.querySelectorAll('[data-type="date"]').forEach(el => {
    if (!el._flatpickr) {
      flatpickr(el, { dateFormat: 'Y-m-d', locale: loc });
    }
  });
};
function syncFlatpickrLocale() {
  if (typeof flatpickr === 'undefined') return;
  const loc = getActiveDateLocale();
  document.querySelectorAll('[data-type="date"]').forEach(el => {
    if (el._flatpickr) {
      const currentVal = el.value;
      el._flatpickr.destroy();
      flatpickr(el, { dateFormat: 'Y-m-d', locale: loc, defaultDate: currentVal || undefined });
    }
  });
}
const observer = new MutationObserver((mutations) => { mutations.forEach(m => { m.addedNodes.forEach(node => { initFlatpickr(node); }); }); });
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => initFlatpickr(document));

