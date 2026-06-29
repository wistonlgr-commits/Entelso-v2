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
  if (!user) return;
  const nombre  = user.nombre || '—';
  const email   = user.email  || '—';
  const rol     = user.rol    || '—';
  const initials = nombre.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();

  document.getElementById('userDisplayName').textContent   = nombre;
  document.getElementById('userDisplayRole').textContent   = rol;
  document.getElementById('userAvatar').textContent        = initials;
  document.getElementById('profileDropName').textContent   = nombre;
  document.getElementById('profileDropEmail').textContent  = email;
  document.getElementById('profileDropAvatar').textContent = initials;
}

/* ─────────────────────────────────────────
   INICIALIZAR APP — Cargar datos del backend
───────────────────────────────────────── */
async function inicializarApp() {
  await Promise.all([
    cargarActivos(),
    cargarUsuarios(),
    cargarAlertas(),
    cargarCategorias(),
    cargarUbicaciones(),
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
}

/* ─────────────────────────────────────────
/* ─────────────────────────────────────────
   HELPERS GLOBALES
───────────────────────────────────────── */
function escapeHTML(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return str;
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
  const label = t(`estado.${status}`) || status.replace(/_/g, ' ');
  return `<span class="status-pill s-${status}"><span class="dot"></span>${label}</span>`;
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

function mostrarCargando(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" class="table-empty"><span class="table-spinner"></span> ${window.i18n.t('api.cargando')}</td></tr>`;
}

function mostrarErrorTabla(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" class="table-empty">${window.i18n.t('api.error')}</td></tr>`;
}

/* ─────────────────────────────────────────
   CARGA DE ACTIVOS
───────────────────────────────────────── */
let inventoryData = [];

async function cargarActivos(silent = false) {
  if (!silent) {
    mostrarCargando('dashTableBody');
    mostrarCargando('inventTableBody');
  }
  try {
    const res = await apiFetch('/api/activos');
    const json = await res.json();
    // Normalizar formato del backend al formato del dashboard
    inventoryData = (json.data || []).map(a => ({
      db_id:       a.id,
      id:          a.numero_serie,
      equipo:      a.nombre_item,
      tipo_item:   a.tipo || '—',
      zona:        a.nombre_ubicacion || '—',
      team:        a.usuario_team || a.team || '—',
      status:      a.estado,
      fecha:       a.fecha_prox_tag || a.fecha_prox_cali || null,
      // Drawer fields
      serie:       a.numero_serie,
      calibracion: a.fecha_prox_cali || null,
      tag:         a.fecha_prox_tag  || null,
      asignado:    a.nombre_usuario  || '—',
      ubicacion:   a.nombre_ubicacion || '—',
      usuario_id:  a.usuario_id      || null,
      ubicacion_id: a.ubicacion_id   || null,
      item_id:     a.item_id         || null,
      _raw:        a,
    }));
    renderizarActivos();
    actualizarKPIs();
    renderizarGraficos();
    renderizarZonas();
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

async function cargarUsuarios() {
  try {
    const res  = await apiFetch('/api/usuarios');
    const json = await res.json();
    employeesData = (json.data || []).map(u => ({
      id:            `USR-${u.id}`,
      db_id:         u.id,
      nombre:        u.nombre,
      initials:      u.nombre.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase(),
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
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      console.warn('No se pudieron cargar usuarios:', err.message);
      renderizarEmpleados([]);
    }
  }
}

function syncEmpleadosActivos() {
  if (!employeesData.length || !inventoryData.length) return;
  employeesData.forEach(emp => {
    // Buscar si el empleado tiene un activo asignado
    const activo = inventoryData.find(a => a.asignado && a.asignado.toLowerCase() === emp.nombre.toLowerCase());
    if (activo) {
      emp.equipo_id = activo.id;
      emp.equipo_nombre = activo.equipo;
      emp.sitio = activo.zona;
      emp.zona = activo.zona;
      emp.estado = 'en_terreno';
      emp.fecha_asig = activo.fecha;
    } else {
      emp.estado = emp.en_terreno ? 'en_terreno' : 'sin_asignacion';
    }
  });
  renderizarEmpleados(employeesData);
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
  
  mostrarCargando('auditTableBody');
  
  try {
    const res = await apiFetch('/api/audit');
    const json = await res.json();
    const logs = json.data || [];
    
    tbody.innerHTML = '';
    
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-3);">No hay registros de actividad.</td></tr>';
      return;
    }
    
    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size: 12px; color: var(--text-2);">${escapeHTML(log.fecha)}</td>
        <td style="font-weight: 500;">${escapeHTML(log.user)}</td>
        <td style="color: var(--text-1);">${escapeHTML(log.accion)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (err.message !== 'SESION_EXPIRADA') {
      mostrarErrorTabla('auditTableBody');
    }
  }
}

async function registrarAuditLog(accion) {
  try {
    await apiFetch('/api/audit', {
      method: 'POST',
      body: JSON.stringify({ accion })
    });
    // Opcional: recargar logs en background si la vista está abierta
    if (document.getElementById('view-auditoria') && document.getElementById('view-auditoria').classList.contains('active')) {
      cargarAuditLog();
    }
  } catch (err) {
    console.error('Error registrando auditoría:', err.message);
  }
}


/* ─────────────────────────────────────────
   RENDER: TABLA DE ACTIVOS
───────────────────────────────────────── */
function renderInventoryTable(tbody, data, groupByKey = null) {
  if (!tbody) return;
  const isDash = tbody.id === 'dashTableBody';
  const colspan = isDash ? 6 : 8;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="table-empty">${window.i18n.t('api.sin_datos')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  
  const renderRow = (item) => {
    if (isDash) {
      return `
        <td class="id-cell">${escapeHTML(item.id)}</td>
        <td>${escapeHTML(item.equipo)}</td>
        <td>${escapeHTML(item.zona)}</td>
        <td style="color:var(--text-2)">${escapeHTML(item.team)}</td>
        <td>${statusPill(item.status)}</td>
        <td class="col-right">${formatearFecha(item.fecha)}</td>
      `;
    } else {
      return `
        <td class="id-cell">${escapeHTML(item.id)}</td>
        <td>${escapeHTML(item.equipo)}</td>
        <td>${escapeHTML(item.zona)}</td>
        <td>${escapeHTML(item.asignado)}</td>
        <td style="color:var(--text-2)">${escapeHTML(item.team)}</td>
        <td>${statusPill(item.status)}</td>
        <td class="col-right">${formatearFecha(item.calibracion || item.fecha)}</td>
        <td class="col-right">
           <select class="form-input" style="font-size:12px; padding:2px 4px; width:120px;" onchange="window.actualizarEstadoHerramienta('${item.db_id}', this.value)" onclick="event.stopPropagation()">
              <option value="">${t('inv.actualizar')}</option>
              <option value="disponible">${t('estado.disponible')}</option>
              <option value="en_uso">${t('estado.en_uso')}</option>
              <option value="en_mantenimiento">${t('estado.en_mantenimiento')}</option>
              <option value="danado">${t('estado.danado')}</option>
           </select>
           <button class="icon-btn" onclick="event.stopPropagation(); window.eliminarActivo(${item.db_id})" title="Eliminar"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>
        </td>
      `;
    }
  };

  if (groupByKey) {
    const groups = {};
    data.forEach(item => {
      const key = item[groupByKey] || 'Sin Asignar';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    Object.keys(groups).sort().forEach(groupName => {
      // Group header
      const headerTr = document.createElement('tr');
      headerTr.innerHTML = `<td colspan="${colspan}" style="background: var(--bg-hover); font-weight: bold; color: var(--text-1); padding-top: 16px; padding-bottom: 8px;">${groupName} (${groups[groupName].length})</td>`;
      tbody.appendChild(headerTr);
      
      // Group items
      groups[groupName].forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.innerHTML = renderRow(item);
        tr.addEventListener('click', () => openDrawer(item));
        tbody.appendChild(tr);
      });
    });
  } else {
    data.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.innerHTML = renderRow(item);
      tr.addEventListener('click', () => openDrawer(item));
      tbody.appendChild(tr);
    });
  }
}

function renderizarActivos() {
  renderInventoryTable(document.getElementById('dashTableBody'),  inventoryData.slice(0, 20));
  renderInventoryTable(document.getElementById('inventTableBody'), inventoryData);
}

/* ─────────────────────────────────────────
   RENDER: TABLA DE MANTENIMIENTO
───────────────────────────────────────── */
let maintenanceData = [];

function renderMaintenanceTable(tbody, data) {
  if (!tbody) return;
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${window.i18n.t('api.sin_datos')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="id-cell">${escapeHTML(item.id)}</td>
      <td>${escapeHTML(item.equipo)}</td>
      <td>${escapeHTML(item.zona)}</td>
      <td><span class="motive-tag">${escapeHTML(item.motivo)}</span></td>
      <td>${statusPill(item.status)}</td>
      <td class="col-right">${formatearFecha(item.fecha)}</td>
      <td class="col-right"><button class="btn-ghost" style="font-size: 12px; padding: 4px 8px; color: var(--accent-green);" onclick="marcarMantenimientoAtendido('${item.id}')">Marcar Atendido</button></td>
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
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">${window.i18n.t('api.sin_datos')}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  data.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="emp-cell">
          <div>
            <div class="emp-name">${escapeHTML(emp.nombre)}</div>
            <div class="emp-id">${escapeHTML(emp.id)} — ${escapeHTML(emp.email)}</div>
          </div>
        </div>
      </td>
              <td>
        <select class="form-input" style="padding: 4px 20px 4px 8px; font-size: 13px; border: 1px solid var(--border); border-radius: 4px; width: 140px; appearance: auto;" onchange="updateWorkerTeam(${emp.db_id}, this.value)">
            <option value="" ${!emp.team || emp.team === '-' ? 'selected' : ''}>${window.i18n.t('teams.sin_team') || 'Sin Team'}</option>
          ${window.teamsList.map(t => `<option value="${t.nombre}" ${emp.team === t.nombre ? 'selected' : ''}>${t.nombre}</option>`).join('')}
        </select>
      </td>
      <td>
        ${emp.equipo_id
          ? `<span class="id-cell" style="margin-right:6px">${escapeHTML(emp.equipo_id)}</span>${escapeHTML(emp.equipo_nombre)}`
          : `<span style="color:var(--text-3)">${window.i18n.t('api.sin_datos')}</span>`}
      </td>
      <td>
        <div style="font-size:var(--font-size-sm)">${escapeHTML(emp.sitio)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--text-2)">${escapeHTML(emp.zona)}</div>
      </td>
      <td style="color:var(--text-2)">${emp.fecha_asig}</td>
      <td style="color:var(--text-2)">${emp.retorno}</td>
      <td>${empStatusPill(emp.estado)}</td>
      <td>
        <button class="icon-btn" title="Editar" onclick="window.editarEmpleado(${emp.db_id})"><i class="fa-solid fa-pen"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────
   RENDER: ZONAS GRID
───────────────────────────────────────── */
function renderizarZonas() {
  const grid = document.getElementById('zoneGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Agrupar activos por zona
  const zonaMap = {};
  inventoryData.forEach(a => {
    const z = a.zona || 'Sin Zona';
    if (!zonaMap[z]) zonaMap[z] = { total:0, disponibles:0 };
    zonaMap[z].total++;
    if (['disponible','calibrado','en_funcionamiento'].includes(a.status)) zonaMap[z].disponibles++;
  });

  Object.entries(zonaMap).forEach(([nombre, stats]) => {
    const pct = stats.total > 0 ? Math.round((stats.disponibles / stats.total) * 100) : 0;
    const card = document.createElement('div');
    card.className = 'zone-card';
    card.style.cursor = 'pointer'; // Make it look clickable
    card.innerHTML = `
      <div class="zone-card-name">${escapeHTML(nombre)}</div>
      <div class="zone-stat"><span>${window.i18n.t('kpi.total')}</span><strong>${stats.total}</strong></div>
      <div class="zone-stat"><span>${window.i18n.t('kpi.disponibles')}</span><strong style="color:var(--accent-green)">${stats.disponibles}</strong></div>
      <div class="zone-bar"><div class="zone-bar-fill" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--text-2);margin-top:4px;">${pct}% disponibilidad</div>
    `;
    
    // Al hacer clic, filtrar la tabla de inventario y redirigir
    card.addEventListener('click', () => {
      // Filtrar la tabla
      const filtered = inventoryData.filter(i => (i.zona || 'Sin Zona') === nombre);
      renderInventoryTable(document.getElementById('inventTableBody'), filtered);
      
      // Actualizar el valor del modal de filtro avanzado para mantener sincronía
      const advFilterZona = document.getElementById('advFilterZona');
      if (advFilterZona) {
        // Asegurarnos de que la opción exista, si no, crearla
        let optionExists = Array.from(advFilterZona.options).some(opt => opt.value === nombre);
        if (!optionExists) {
          const newOpt = new Option(nombre, nombre);
          advFilterZona.add(newOpt);
        }
        advFilterZona.value = nombre;
      }
      
      // Cambiar a la vista de inventario
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-inventario').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const menuInventario = document.getElementById('menuInventario');
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
function renderizarAlertas(data) {
  const tbody = document.getElementById('alertsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const alertasGeneradas = [];
  const today = new Date();

  inventoryData.forEach(a => {
    // 1. Alertas por estado (Dañado, Fuera de Servicio, etc)
    if (['calibracion_pendiente','fuera_de_servicio','danado','en_mantenimiento'].includes(a.status)) {
      alertasGeneradas.push({
        id: a.id,
        equipo: a.equipo,
        zona: a.zona,
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
            equipo: `${label} en ${diffDays} días`,
            zona: a.zona,
            status: a.status,
            fecha: dateStr,
            type: severityType,
            icon: iconName
          });
        } else if (diffDays <= 0) {
          alertasGeneradas.push({
            id: a.id,
            equipo: `${label} Vencida`,
            zona: a.zona,
            status: a.status,
            fecha: dateStr,
            type: 'danger',
            icon: 'fa-triangle-exclamation'
          });
        }
      }
    };

    checkDate(a.calibracion, 'Calibración');
    checkDate(a.tag, 'Tag');
  });

  const todasAlertas = [...alertasGeneradas, ...data];

  document.getElementById('badge-alertas').textContent = todasAlertas.length;

  if (todasAlertas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${window.i18n.t('api.sin_datos')}</td></tr>`;
    return;
  }

  todasAlertas.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="alert-icon-wrap ${a.type}" style="display:inline-flex;margin:0;">
          <i class="fa-solid ${a.icon}"></i>
        </div>
      </td>
      <td class="id-cell">${escapeHTML(a.id)}</td>
      <td>
        <strong>${escapeHTML(a.equipo)}</strong><br>
        <span style="font-size:11px;color:var(--text-2)">Zona: ${escapeHTML(a.zona)}</span>
      </td>
      <td>${statusPill(a.status)}</td>
      <td class="col-right">${formatearFecha(a.fecha)}</td>
      <td class="col-right">
        <button class="btn-ghost" onclick="window.openDrawerAsset('${a.id}')" style="padding:4px 8px;font-size:12px;">Resolver</button>
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
  const mantenim    = inventoryData.filter(a => ['en_mantenimiento','fuera_de_servicio','danado'].includes(a.status)).length;
  const pct         = total > 0 ? ((disponibles / total) * 100).toFixed(1) : '0.0';

  document.getElementById('kpi-total').textContent         = total.toLocaleString();
  document.getElementById('kpi-disponibles').textContent   = disponibles.toLocaleString();
  document.getElementById('kpi-calibracion').textContent   = calibPend;
  document.getElementById('kpi-mantenimiento').textContent = mantenim;
  document.getElementById('kpi-disponibilidad').textContent = `${pct}%`;

  // Badge de mantenimiento
  document.getElementById('badge-mantenimiento').textContent = mantenim + calibPend;

  // Actualizar datos de mantenimiento para su tabla
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
    grid: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    text: isDark() ? '#8b949e' : '#656d76',
  };
}

function renderizarGraficos() {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size   = 11;

  // Datos por zona
  const zonaMap = {};
  inventoryData.forEach(a => {
    const z = a.zona || 'Sin Zona';
    zonaMap[z] = (zonaMap[z] || 0) + 1;
  });
  const zonasLabels = Object.keys(zonaMap);
  const zonasValues = Object.values(zonaMap);

  // Chart de barras por zona
  const ctxZona = document.getElementById('zonaChart')?.getContext('2d');
  if (ctxZona) {
    if (zonaChart) zonaChart.destroy();
    zonaChart = new Chart(ctxZona, {
      type: 'bar',
      data: {
        labels: zonasLabels,
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
        plugins: { legend:{ display:false }, tooltip:{ backgroundColor:'#1c2128', padding:10, cornerRadius:6 }},
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
  const calibPend   = inventoryData.filter(a => a.status === 'calibracion_pendiente').length;
  const otros       = inventoryData.filter(a => ['fuera_de_servicio','danado','desconocido'].includes(a.status)).length;

  const { t } = window.i18n;
  const donutLabels = [t('estado.disponible'), t('estado.en_uso'), t('nav.mantenimiento'), t('kpi.calibracion'), t('kpi.otros') || 'Otros'];
  const donutColors = ['#3fb950','#58a6ff','#d29922','#7c6ff7','#8b949e'];
  const donutData   = [disponible, enUso, mantenim, calibPend, otros];

  const ctxStatus = document.getElementById('statusChart')?.getContext('2d');
  if (ctxStatus) {
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels:donutLabels, datasets:[{ data:donutData, backgroundColor:donutColors, borderWidth:0, hoverOffset:4 }]},
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'72%',
        plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#1c2128', padding:10, cornerRadius:6 }},
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
      item.innerHTML = `<span class="legend-dot" style="background:${donutColors[i]}"></span><span>${label}</span><span>${donutData[i]}</span>`;
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
  
  const logoSrc = theme === 'dark' ? 'LOGOTYPE-WHITE.png' : 'LOGOTYPE-BLUE.png';
  const sidebarLogo = document.getElementById('sidebarLogoImg');
  const loginLogo = document.getElementById('loginLogoImg');
  if (sidebarLogo) sidebarLogo.src = logoSrc;
  if (loginLogo) loginLogo.src = logoSrc;
  if (zonaChart || statusChart) {
    if (zonaChart) {
      zonaChart.options.scales.y.grid.color  = chartColors().grid;
      zonaChart.options.scales.y.ticks.color = chartColors().text;
      zonaChart.options.scales.x.ticks.color = chartColors().text;
      zonaChart.update();
    }
    if (statusChart) statusChart.update();
  }
}

/* ─────────────────────────────────────────
   IDIOMA ES / EN
───────────────────────────────────────── */
function actualizarBotonIdioma() {
  const lang    = window.i18n.getLang();
  const otroLang = lang === 'es' ? 'EN' : 'ES';
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = otroLang;
  const loginLangLabel = document.getElementById('loginLangLabel');
  if (loginLangLabel) loginLangLabel.textContent = otroLang;

}

function toggleLang() {
  const newLang = window.i18n.getLang() === 'es' ? 'en' : 'es';
  window.i18n.setLang(newLang);
  actualizarBotonIdioma();
}

// Función global para el botón de idioma en la pantalla de login
window.toggleLoginLang = toggleLang;

// Evento: cuando cambia el idioma, re-renderizar tablas y gráficos
document.addEventListener('langchange', () => {
  if (session.isLoggedIn() && inventoryData.length > 0) {
    renderizarActivos();
    actualizarKPIs();
    renderizarGraficos();
    renderizarZonas();
    renderizarEmpleados(employeesData);
    renderizarAlertas([]);
    if (typeof maintenanceData !== 'undefined') {
        renderMaintenanceTable(document.getElementById('maintTableBody'), maintenanceData);
    }
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
      const json = await res.json();
      if (json.success && json.data) {
        const u = json.data;
        document.getElementById('perfilNombre').value = u.nombre || '';
        document.getElementById('perfilTelefono').value = u.telefono_whatsapp || '';
        document.getElementById('perfilEmail').value = u.email || '';
        if (document.getElementById('perfilAvatarBig')) {
          document.getElementById('perfilAvatarBig').textContent = u.nombre ? u.nombre[0].toUpperCase() : 'U';
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
        const json = await res.json();
        if (json.success) {
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
          if (document.getElementById('userAvatar')) document.getElementById('userAvatar').textContent = initial;
          if (document.getElementById('profileDropAvatar')) document.getElementById('profileDropAvatar').textContent = initial;
          if (document.getElementById('perfilAvatarBig')) document.getElementById('perfilAvatarBig').textContent = initial;
          
        } else {
          const errorMsg = json.message || (json.error && json.error.message) || JSON.stringify(json.error) || 'Unknown';
          alert('Error: ' + errorMsg);
        }
      } catch (e) {
        alert('Error saving profile');
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
  });
  document.getElementById('menuNotif').addEventListener('click', () => { document.querySelector('[data-view="alertas"]').click(); dropdown.classList.remove('open'); });
  document.getElementById('menuTema').addEventListener('click', () => { document.getElementById('themeToggleBtn').click(); dropdown.classList.remove('open'); });
  document.getElementById('menuUsuarios').addEventListener('click', () => { 
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-usuarios').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    dropdown.classList.remove('open'); 
    cargarUsuariosAdministracion();
  });

  // User Management Logic
  async function cargarUsuariosAdministracion() {
    try {
      const res = await apiFetch('/api/usuarios');
      const json = await res.json();
      if (json.success && json.data) {
        const tbody = document.getElementById('usuariosTableBody');
        tbody.innerHTML = '';
        
        let activos = 0;
        let admins = 0;

        json.data.forEach(u => {
          if (u.estado === 'activo') activos++;
          if (u.rol === 'admin') admins++;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${u.id}</td>
            <td>${u.nombre}</td>
            <td>${u.email}</td>
            <td><span class="status-badge status-${u.rol}">${u.rol}</span></td>
            <td>
              <button class="icon-btn" title="Editar" onclick="window.editarEmpleado(${u.id})"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn" title="Eliminar" onclick="eliminarUsuario(${u.id})"><i class="fa-solid fa-trash" style="color:var(--accent-red)"></i></button>
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

  window.eliminarUsuario = async function(id) {
    if (!confirm(`¿Eliminar usuario ${id}?`)) return;
    try {
      const res = await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert(window.i18n.t('usuarios.eliminado') || "Usuario eliminado");
        cargarUsuariosAdministracion();
        cargarUsuarios();
      } else {
        alert(window.i18n.t('usuarios.err_eliminar') || "Error al eliminar");
      }
    } catch(e) { alert(window.i18n.t('seg.err_red') || "Error de red"); }
  };

  // Add User Modal
  document.getElementById('openAddUserModal')?.addEventListener('click', () => {
    document.getElementById('addUserModalOverlay').classList.add('open');
  });

  // Wire Teams "Nuevo Empleado" button to the same modal
  document.getElementById('btnNuevoEmpleadoTeams')?.addEventListener('click', () => {
    document.getElementById('addUserModalOverlay').classList.add('open');
  });

  document.getElementById('closeAddUserModal')?.addEventListener('click', () => {
    document.getElementById('addUserModalOverlay').classList.remove('open');
  });

  document.getElementById('confirmAddUserBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmAddUserBtn');
    const msgEl = document.getElementById('addUserModalMsg');
    
    const nombre   = document.getElementById('addUserName').value.trim();
    const email    = document.getElementById('addUserEmail').value.trim();
    const telefono = document.getElementById('addUserPhone').value.trim();
    const rol      = document.getElementById('addUserRole').value;
    const team     = document.getElementById('addUserTeam')?.value || '';
    const password = document.getElementById('addUserPassword').value;

    if (!nombre || !password) {
      msgEl.textContent = 'El nombre y la contraseña/PIN son obligatorios.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    if (password.length < 4) {
      msgEl.textContent = 'La contraseña/PIN debe tener al menos 4 caracteres.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';

    try {
      const payload = { nombre, email: email || undefined, telefono_whatsapp: telefono || undefined, rol, team: team || undefined, password };
      const res = await apiFetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        msgEl.textContent = '✓ Usuario creado exitosamente.';
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
          btn.textContent = 'Crear Usuario';
          cargarUsuariosAdministracion();
          cargarUsuarios();
        }, 1500);
      } else {
        throw new Error(data.message || 'Error al crear usuario');
      }
    } catch (err) {
      msgEl.textContent = err.message || 'Error de conexión al servidor.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Crear Usuario';
    }
  });
  const menuAudit = document.getElementById('menuAudit');
  if(menuAudit) {
    menuAudit.addEventListener('click', () => {
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
    alert(window.i18n.t('drawer.no_encontrado') || "No se encontró el equipo en el inventario.");
  }
};

async function openDrawer(item) {
  const overlay = document.getElementById('drawerOverlay');
  document.getElementById('drawerTitle').textContent = item.id;
  document.getElementById('drawerSubtitle').textContent = item.equipo;

  const qrImg = document.getElementById('drawerQRCode');
  if (qrImg) {
    // Número del bot (se puede modificar luego, por ahora usamos el número oficial)
    const waNumber = localStorage.getItem('entelso_wa_number') || '18298908685';
    // Generamos el link mágico Click-to-Chat de WhatsApp
    const qrPayload = `https://wa.me/${waNumber}?text=${encodeURIComponent('INFO ' + item.id)}`;
    
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}&margin=4`;
    qrImg.style.display = 'inline-block';
    qrImg.title = window.i18n.t('drawer.qr_title');
    const btnPrint = document.getElementById('btnPrintQR');
    if (btnPrint) btnPrint.style.display = 'inline-block';
    const btnDownload = document.getElementById('btnDownloadQR');
    if (btnDownload) btnDownload.style.display = 'inline-block';
  }

  const metaEl = document.getElementById('drawerMeta');
  metaEl.innerHTML = '';
  const metaFields = [
    { label: window.i18n.t('drawer.meta_serie'),   value: item.serie || item.id || '—' },
    { label: window.i18n.t('drawer.meta_tipo'),    value: item.tipo_item || '—' },
    { label: window.i18n.t('drawer.meta_zona'),    value: item.zona || '—' },
    { label: window.i18n.t('drawer.meta_estado'),  value: (item.status || '').replace(/_/g,' ') || '—' },
    { label: window.i18n.t('drawer.meta_cal'),     value: formatearFecha(item.calibracion) },
    { label: window.i18n.t('drawer.meta_tag'),     value: formatearFecha(item.tag) },
    { label: window.i18n.t('drawer.meta_asignado'),value: item.asignado || '—' },
    { label: window.i18n.t('drawer.meta_team'),    value: item.team || '—' },
  ];
  metaFields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'drawer-meta-item';
    div.innerHTML = `<span class="drawer-meta-label">${f.label}</span><span class="drawer-meta-value">${f.value}</span>`;
    metaEl.appendChild(div);
  });

  // Add edit button to drawer header
  const drawerEditBtn = document.getElementById('drawerEditBtn');
  if (drawerEditBtn) {
    drawerEditBtn.onclick = () => window.editarActivo(item);
  }

  // Timeline
  const timelineEl = document.getElementById('drawerTimeline');
  timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${window.i18n.t('drawer.cargando_hist')}</div></div>`;

  try {
    let url = '/api/movimientos';
    if (item.db_id) {
      url += `?activo_id=${item.db_id}`;
    } else {
      url += `?numero_serie=${item.id}`; // Fallback si el backend acepta numero_serie en el futuro
    }

    const res = await apiFetch(url);
    const json = await res.json();
    
    if (json.success && json.data && json.data.length > 0) {
      timelineEl.innerHTML = '';
      json.data.forEach(mov => {
        const dotColor = mov.tipo_movimiento === 'despacho' ? 'tl-blue' : (mov.tipo_movimiento === 'ingreso' ? 'tl-green' : 'tl-gray');
        let icon = 'fa-arrow-right';
        if (mov.tipo_movimiento === 'ingreso') icon = 'fa-arrow-left';
        if (mov.tipo_movimiento === 'cambio_estado') icon = 'fa-rotate';

        let actionText = mov.tipo_movimiento.replace('_', ' ').toUpperCase();
        let detailText = `Por: ${mov.nombre_usuario}`;
        
        if (mov.ubicacion_origen && mov.ubicacion_destino) {
          detailText += ` | De: ${mov.ubicacion_origen} ➔ A: ${mov.ubicacion_destino}`;
        } else if (mov.ubicacion_destino) {
          detailText += ` | A: ${mov.ubicacion_destino}`;
        }

        timelineEl.innerHTML += `
          <div class="timeline-item">
            <div class="timeline-dot ${dotColor}"><i class="fa-solid ${icon}"></i></div>
            <div class="timeline-body">
              <div class="timeline-event">${actionText} (Cant: ${mov.cantidad})</div>
              <div class="timeline-detail">${detailText}</div>
              <div class="timeline-date">${new Date(mov.fecha_movimiento).toLocaleString('es-VE')}</div>
            </div>
          </div>
        `;
      });
    } else {
      timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${window.i18n.t('drawer.sin_historial')}</div></div>`;
    }
  } catch (error) {
    console.error('Error fetching timeline:', error);
    timelineEl.innerHTML = `<div class="timeline-item"><div class="timeline-body">${window.i18n.t('drawer.err_historial')}</div></div>`;
  }

  overlay.classList.add('open');
}

// QR Download handler
document.getElementById('btnDownloadQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('drawerQRCode');
  const title = document.getElementById('drawerTitle')?.textContent || 'qr-code';
  if (!qrImg || !qrImg.src) return;
  const a = document.createElement('a');
  a.href = qrImg.src;
  a.download = `QR-${title}.png`;
  a.target = '_blank';
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
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>QR - ${title}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;}img{width:200px;height:200px;}h2{margin-bottom:4px;}p{color:#666;}</style></head><body><h2>${title}</h2><p>${subtitle}</p><img src="${qrImg.src}" /><script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`);
  w.document.close();
});

// Modal QR Download handler
document.getElementById('modalBtnDownloadQR')?.addEventListener('click', () => {
  const qrImg = document.getElementById('modalQRCode');
  const title = document.getElementById('modalNumSerie')?.value || 'qr-code';
  if (!qrImg || !qrImg.src) return;
  const a = document.createElement('a');
  a.href = qrImg.src;
  a.download = `QR-${title}.png`;
  a.target = '_blank';
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
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>QR - ${title}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;}img{width:200px;height:200px;}h2{margin-bottom:4px;}p{color:#666;}</style></head><body><h2>${title}</h2><p>${subtitle}</p><img src="${qrImg.src}" /><script>setTimeout(()=>{window.print();window.close();},500);<\/script></body></html>`);
  w.document.close();
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

  const openModal = () => {
    overlay.classList.add('open');
    fileInput.value = '';
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

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (rows.length < 2) {
        throw new Error('El archivo está vacío o no tiene encabezados.');
      }

      const headers = rows[0].map(h => String(h).toLowerCase().trim());
      // Validar columnas requeridas (Nº Inventario o Inventory No, y Equipo/Equipment)
      const invIndex = headers.findIndex(h => h.includes('inventario') || h.includes('inventory'));
      const eqIndex = headers.findIndex(h => h.includes('equipo') || h.includes('equipment') || h.includes('descripci'));
      const serieIndex = headers.findIndex(h => h.includes('serie') || h.includes('serial'));
      const zonaIndex = headers.findIndex(h => h.includes('zona') || h.includes('zone') || h.includes('sitio') || h.includes('site'));
      const teamIndex = headers.findIndex(h => h.includes('team'));
      const statusIndex = headers.findIndex(h => h.includes('estado') || h.includes('status'));

      if (invIndex === -1 || eqIndex === -1) {
        msgEl.textContent = window.i18n.t('import.err_req_fields') || 'Faltan columnas obligatorias.';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
        return;
      }

      // Validar cada fila
      const parsedData = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || (!row[invIndex] && !row[eqIndex])) continue; // saltar vacías

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
          estado: statusIndex !== -1 ? String(row[statusIndex] || '').trim().toLowerCase() : 'disponible'
        });
      }

      if (parsedData.length === 0) {
        throw new Error('No hay datos válidos para importar.');
      }

      // Pre-visualizar
      importFileData = parsedData;
      previewBody.innerHTML = '';
      parsedData.slice(0, 5).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="id-cell">${escapeHTML(item.numero_serie)}</span></td>
          <td>${escapeHTML(item.descripcion)}</td>
          <td>${escapeHTML(item.zona || '—')}</td>
        `;
        previewBody.appendChild(tr);
      });

      previewArea.style.display = 'block';
      submitBtn.disabled = false;
      msgEl.textContent = `${parsedData.length} equipos listos para importar.`;
      msgEl.className = 'modal-msg success';
      msgEl.style.display = 'block';

    } catch (err) {
      console.error(err);
      msgEl.textContent = window.i18n.t('import.err_parse') || 'Error al procesar el archivo.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!importFileData || importFileData.length === 0) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Importando...</span>';

    try {
      const res = await apiFetch('/api/activos/bulk', {
        method: 'POST',
        body: JSON.stringify({ activos: importFileData })
      });
      const data = await res.json();
      if (res.ok) {
        msgEl.textContent = `✓ ${window.i18n.t('import.success')} ${data.data.inserted} ${window.i18n.t('import.items')}`;
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        await cargarActivos();
        setTimeout(() => closeModal(), 2000);
      } else {
        msgEl.textContent = data.message || 'Error en la importación.';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="import.btn_upload">' + (window.i18n.t('import.btn_upload') || 'Importar') + '</span>';
      }
    } catch (err) {
      msgEl.textContent = window.i18n.t('drawer.err_red') || 'Error de conexión.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="import.btn_upload">' + (window.i18n.t('import.btn_upload') || 'Importar') + '</span>';
    }
  });
}


function inicializarModal() {
  const overlay = document.getElementById('modalOverlay');
  const openModal  = () => {
    overlay.classList.add('open');
    document.getElementById('modalMsg').style.display = 'none';
    document.getElementById('modalMsg').className = 'modal-msg';
  };
  const closeModal = () => {
    overlay.classList.remove('open');
    const qrContainer = document.getElementById('modalQRContainer');
    if (qrContainer) qrContainer.style.display = 'none';
  };

  document.getElementById('openNewItemModal').addEventListener('click', () => {
    document.getElementById('modalEstado').value = 'disponible';
    openModal();
  });
  document.getElementById('openNewItemModal2')?.addEventListener('click', () => {
    document.getElementById('modalEstado').value = 'disponible';
    openModal();
  });
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
        await apiFetch(`/api/activos/${activo.db_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'en_mantenimiento', fecha_prox_cali: fecha })
        });
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
        msgEl.textContent = window.i18n.t('maint.err_agendar');
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = window.i18n.t('maint.btn_agendar') || 'Agendar Mantenimiento';
      }
    } else {
      msgEl.textContent = window.i18n.t('maint.err_no_encontrado');
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = window.i18n.t('maint.btn_agendar') || 'Agendar Mantenimiento';
    }
  });
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('closeModal2').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  document.getElementById('submitNewItem').addEventListener('click', async () => {
    const numSerie  = document.getElementById('modalNumSerie').value.trim();
    const desc      = document.getElementById('modalDesc').value.trim();
    const itemIdVal = document.getElementById('modalItemId')?.value;   // populated dynamically
    const zonaVal   = document.getElementById('modalZona').value;
    const team      = document.getElementById('modalTeam').value;
    const estado    = document.getElementById('modalEstado').value;
    const msgEl     = document.getElementById('modalMsg');

    if (!numSerie || !desc) {
      msgEl.textContent  = window.i18n.t('modal.err_requerido');
      msgEl.className    = 'modal-msg error';
      msgEl.style.display = 'block';
      return;
    }

    // item_id: if we have a dedicated selector use it, else find by name match
    let itemId = itemIdVal ? Number(itemIdVal) : null;
    if (!itemId) {
      const cat = systemCategories.find(c => c.nombre.toLowerCase() === desc.toLowerCase());
      if (cat) itemId = cat.id;
    }

        // ubicacion: zonaVal is already the ID from the select option value
    const ubicacionId = zonaVal ? parseInt(zonaVal) : null;

    const btn = document.getElementById('submitNewItem');
    btn.disabled = true;
    btn.querySelector('span').textContent = window.i18n.t('modal.registrando');

    try {
      const payload = {
        numero_serie:        numSerie,
        item_id:             itemId,
        descripcion:         desc,
        ubicacion_actual_id: ubicacionId,
        estado,
        team: team || null,
      };
      const res = await apiFetch('/api/activos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        msgEl.textContent   = `✓ ${window.i18n.t('modal.registrado_ok').replace('{0}', numSerie)}`;
        msgEl.className     = 'modal-msg success';
        msgEl.style.display = 'block';
        await cargarActivos();
        const waNumber = localStorage.getItem('entelso_wa_number') || '18298908685';
        const qrPayload = `https://wa.me/${waNumber}?text=${encodeURIComponent('INFO ' + numSerie)}`;
        const qrImg = document.getElementById('modalQRCode');
        if (qrImg) {
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}&margin=4`;
          document.getElementById('modalQRContainer').style.display = 'block';
        }
        btn.disabled = false;
        btn.querySelector('span').textContent = window.i18n.t('modal.registrar');
        document.getElementById('modalNumSerie').value = '';
        document.getElementById('modalDesc').value     = '';
      } else {
        const data = await res.json();
        let errMsg = window.i18n.t('modal.err_registrar');
        if (data.error?.code) {
          const transKey = 'err.' + data.error.code;
          const translated = window.i18n.t(transKey);
          if (translated !== transKey) errMsg = translated;
          else errMsg = data.error.message || data.message || errMsg;
        } else if (data.error?.message || data.message) {
          errMsg = data.error?.message || data.message;
        }
        msgEl.textContent = errMsg;
        msgEl.className     = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch (err) {
      msgEl.textContent   = window.i18n.t('modal.err_conexion');
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
  document.getElementById('inventarioSearch')?.addEventListener('input', function () {
    const q        = this.value.toLowerCase();
    const filtered = inventoryData.filter(i =>
      i.id.toLowerCase().includes(q) || i.equipo.toLowerCase().includes(q) ||
      i.zona.toLowerCase().includes(q) || i.team.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q)
    );
    renderInventoryTable(document.getElementById('inventTableBody'), filtered);
  });

  // Búsqueda de empleados
  document.getElementById('employeeSearch')?.addEventListener('input', function () {
    const q        = this.value.toLowerCase();
    const filtered = employeesData.filter(e => {
      const nom = e.nombre ? e.nombre.toLowerCase() : '';
      const id  = e.id ? e.id.toLowerCase() : '';
      const tm  = e.team ? e.team.toLowerCase() : '';
      const eq  = e.equipo_nombre ? e.equipo_nombre.toLowerCase() : '';
      return nom.includes(q) || id.includes(q) || tm.includes(q) || eq.includes(q);
    });
    renderizarEmpleados(filtered);
  });

  // Filter chips de empleados
  document.querySelectorAll('[data-emp-filter]').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('[data-emp-filter]').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      const filter   = this.dataset.empFilter;
      const filtered = filter === 'all' ? employeesData : employeesData.filter(e => {
          if (filter === 'en_terreno') return e.estado === 'en_terreno' || e.estado === 'asignado';
          return e.estado === filter;
      });
      renderizarEmpleados(filtered);
    });
  });

  // Filter chips del dashboard
  document.querySelectorAll('.filter-chips .chip:not([data-emp-filter])').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.filter-chips .chip:not([data-emp-filter])').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      const { t }    = window.i18n;
      const label    = this.textContent.trim();
      let filtered   = inventoryData;
      if (label === t('dash.filter.disp'))    filtered = inventoryData.filter(i => ['disponible','calibrado','en_funcionamiento'].includes(i.status));
      else if (label === t('dash.filter.alertas')) filtered = inventoryData.filter(i => ['fuera_de_servicio','danado','calibracion_pendiente','en_mantenimiento'].includes(i.status));
      renderInventoryTable(document.getElementById('dashTableBody'), filtered);
    });
  });

  // Group tabs (inventario)
  document.querySelectorAll('.gtab').forEach(tab => {
    tab.addEventListener('click', function () {
      // Toggle active status
      const isActive = this.classList.contains('active');
      document.querySelectorAll('.gtab').forEach(t => t.classList.remove('active'));
      
      let groupByKey = null;
      if (!isActive) {
        this.classList.add('active');
        groupByKey = this.dataset.group;
      }
      
      renderInventoryTable(document.getElementById('inventTableBody'), inventoryData, groupByKey);
    });
  });

  // Tab group (charts)
  document.querySelectorAll('.tab-group .tab').forEach(tab => {
    tab.addEventListener('click', function () {
      this.closest('.tab-group').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
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
      const zona = document.getElementById('advFilterZona').value.toLowerCase();
      const team = document.getElementById('advFilterTeam').value.toLowerCase();
      const status = document.getElementById('advFilterStatus').value.toLowerCase();

      const filtered = inventoryData.filter(i => {
        const matchZona = zona ? i.zona.toLowerCase().includes(zona) : true;
        const matchTeam = team ? i.team.toLowerCase().includes(team) : true;
        const matchStatus = status ? i.status.toLowerCase() === status : true;
        return matchZona && matchTeam && matchStatus;
      });

      renderInventoryTable(document.getElementById('inventTableBody'), filtered);
      document.getElementById('filterModalOverlay').classList.remove('open');
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      document.getElementById('advFilterZona').value = '';
      document.getElementById('advFilterTeam').value = '';
      document.getElementById('advFilterStatus').value = '';
      renderInventoryTable(document.getElementById('inventTableBody'), inventoryData);
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
    equipo: equipo || 'Herramienta de Prueba',
    zona: zona,
    team: 'Testing',
    status: estado,
    fecha: new Date().toISOString(),
    marca: 'Demo',
    modelo: 'Demo-100',
    serie: 'TEST-' + Math.floor(Math.random() * 10000),
    calibracion: '',
    asignado: 'Automático (Bot)'
  };
  
  inventoryData.unshift(newItem); // Añadir al array local
  
  // Refrescar paneles
  renderizarActivos();
  actualizarKPIs();
  renderizarZonas();
  renderizarAlertas([]);
  
  // Mostrar notificación básica
  console.log(`✅ Nuevo equipo detectado vía WhatsApp: ${newItem.id} - ${newItem.equipo}`);
  
  const msg = `¡Simulación Exitosa!\n\nSe ha detectado un nuevo reporte:\nID: ${newId}\nEquipo: ${newItem.equipo}\nEstado: ${estado}\n\nLos paneles, KPIs y tablas se han actualizado automáticamente.`;
  alert(msg);

  return msg;
};

// Exponer la funcion global para el boton de mantenimiento
window.marcarMantenimientoAtendido = async function(id) {
  if (!confirm(`¿Estás seguro de marcar el equipo ${id} como atendido/disponible?`)) return;
  try {
    const act = inventoryData.find(a => a.id === id);
    if (!act) return;
    
    // Si tenemos backend, llamamos al endpoint
    if (act.db_id) {
      await apiFetch(`/api/activos/${act.db_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'disponible' })
      });
    }

    alert((window.i18n.t('maint.atendido_ok') || "Equipo {0} marcado como atendido con éxito.").replace('{0}', id));
    // Recargar vista desde backend real
    await cargarActivos();
    
  } catch (err) {
    console.error('Error al marcar atendido:', err);
    alert(window.i18n.t('maint.err_atendido') || 'Error al marcar el equipo como atendido.');
  }
};

/* -----------------------------------------
   PHASE 1: CATEGORY MANAGEMENT & EXCEL EXPORT
----------------------------------------- */
let systemCategories = [];

async function cargarCategorias() {
  try {
    const res = await apiFetch('/api/items');
    const json = await res.json();
    if (json.success && json.data) {
      systemCategories = json.data;
      renderizarCategoriasUI();
      renderizarFiltrosCategorias();
    }
  } catch (err) {
    console.error('Error cargando categorias', err);
  }
}

function renderizarCategoriasUI() {
  const ul = document.getElementById('categoriesListUI');
  if (!ul) return;
  ul.innerHTML = '';
  systemCategories.forEach(cat => {
    const li = document.createElement('li');
    li.style.padding = '8px 12px';
    li.style.borderBottom = '1px solid var(--border)';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.innerHTML = `<span>${cat.nombre}</span> <span style="color:var(--text-2); font-size:11px;">${cat.tipo}</span>`;
    ul.appendChild(li);
  });
}

function renderizarFiltrosCategorias() {
  const container = document.getElementById('inventoryCategoryChips');
  if (!container) return;
  container.innerHTML = `<button class="chip active" data-filter="all" data-i18n="dash.filter.todos">${window.i18n.t('dash.filter.todos')}</button>`;
  systemCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.filter = cat.nombre;
    btn.textContent = cat.nombre;
    container.appendChild(btn);
  });

  // Attach event listeners for chips
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filterVal = chip.dataset.filter;
      
      let filteredData = inventoryData;
      if (filterVal !== 'all') {
        window.currentFilteredData = inventoryData.filter(item => item.equipo === filterVal);
      } else {
        window.currentFilteredData = inventoryData;
      }
      renderInventoryTable(document.getElementById('inventTableBody'), window.currentFilteredData);
    });
  });
}

// Attach export functionality
const confirmExportBtn = document.getElementById('confirmExportBtn');
if (confirmExportBtn) {
  confirmExportBtn.addEventListener('click', () => {
    exportarExcel();
  });
}

function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    alert(window.i18n.t('drawer.err_red') || "Librería de Excel no disponible.");
    return;
  }
  const dataToExport = window.currentFilteredData || inventoryData;
  const today = new Date().toLocaleDateString(window.i18n.getLang() === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Definir estilos ──

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12, name: 'Calibri' },
    fill: { fgColor: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    }
  };
  const cellBorder = {
    top: { style: 'thin', color: { rgb: 'CCCCCC' } },
    bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
    left: { style: 'thin', color: { rgb: 'CCCCCC' } },
    right: { style: 'thin', color: { rgb: 'CCCCCC' } }
  };
  const evenRowFill = { fgColor: { rgb: 'F2F6FA' } };
  const oddRowFill = { fgColor: { rgb: 'FFFFFF' } };
  const statusColors = {
    'disponible': { fgColor: { rgb: 'D4EDDA' } },
    'en_uso': { fgColor: { rgb: 'CCE5FF' } },
    'en_mantenimiento': { fgColor: { rgb: 'FFF3CD' } },
    'danado': { fgColor: { rgb: 'F8D7DA' } },
    'fuera_de_servicio': { fgColor: { rgb: 'F8D7DA' } },
    'calibracion_pendiente': { fgColor: { rgb: 'FFE8CC' } },
    'desconocido': { fgColor: { rgb: 'E2E3E5' } }
  };

  // ── Preparar filas de datos ──
  const isEn = window.i18n.getLang() === 'en';
  const headers = isEn 
    ? ['Inventory No.', 'Equipment', 'Serial No.', 'Zone / Site', 'Team', 'Status', 'Next Calibration', 'Assigned to']
    : ['Nº Inventario', 'Equipo', 'Nº Serie', 'Zona / Sitio', 'Team', 'Estado', 'Próx. Calibración', 'Asignado a'];
    
  const rows = dataToExport.map(item => [
    item.id || '—',
    item.equipo || '—',
    item.serie || '—',
    item.zona || '—',
    item.team || '—',
    (item.status || '—').replace(/_/g, ' ').toUpperCase(),
    item.calibracion ? item.calibracion.substring(0, 10) : '—',
    item.asignado || 'Sin asignar'
  ]);

  // ── Construir hoja con título de empresa ──
  const titleRow = [isEn ? 'ENTELSO — Inventory Report' : 'ENTELSO — Reporte de Inventario'];
  const dateRow = [isEn ? `Generated on: ${today}  |  Total assets: ${rows.length}` : `Fecha de generación: ${today}  |  Total activos: ${rows.length}`];
  const emptyRow = [''];
  const allRows = [titleRow, dateRow, emptyRow, headers, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // ── Merge celdas del título ──
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
  ];

  // ── Estilo del título ──
  if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 16, color: { rgb: '1E3A5F' }, name: 'Calibri' }, alignment: { horizontal: 'center' } };
  if (ws['A2']) ws['A2'].s = { font: { sz: 10, color: { rgb: '666666' }, name: 'Calibri' }, alignment: { horizontal: 'center' } };

  // ── Estilos de headers (fila 4, index 3) ──
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[cellRef]) ws[cellRef].s = headerStyle;
  }

  // ── Estilos de datos (fila 5 en adelante, index 4+) ──
  for (let r = 0; r < rows.length; r++) {
    const isEven = r % 2 === 0;
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: r + 4, c });
      if (!ws[cellRef]) continue;
      const baseStyle = {
        font: { sz: 10, name: 'Calibri' },
        fill: isEven ? evenRowFill : oddRowFill,
        border: cellBorder,
        alignment: { vertical: 'center' }
      };
      // Colorear columna de Estado
      if (c === 5) {
        const rawStatus = (rows[r][c] || '').toLowerCase().replace(/ /g, '_');
        if (statusColors[rawStatus]) {
          baseStyle.fill = statusColors[rawStatus];
          baseStyle.font = { ...baseStyle.font, bold: true };
        }
        baseStyle.alignment = { horizontal: 'center', vertical: 'center' };
      }
      ws[cellRef].s = baseStyle;
    }
  }

  // ── Auto-ancho de columnas ──
  ws['!cols'] = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(row => { if (row[i] && String(row[i]).length > maxLen) maxLen = String(row[i]).length; });
    return { wch: Math.min(maxLen + 4, 40) };
  });

  // ── Row heights ──
  ws['!rows'] = [{ hpt: 30 }, { hpt: 18 }, { hpt: 12 }, { hpt: 22 }, ...rows.map(() => ({ hpt: 20 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  const fileName = `Entelso_Inventario_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Attach open modal for categories
const openManageCategoriesBtn = document.getElementById('openManageCategoriesBtn');
const catDropdownContainer = document.getElementById('catDropdownContainer');
if (openManageCategoriesBtn && catDropdownContainer) {
  openManageCategoriesBtn.addEventListener('click', () => {
    catDropdownContainer.style.display = catDropdownContainer.style.display === 'none' ? 'block' : 'none';
  });
}

window.eliminarActivo = async function(db_id) {
    if(!confirm(`¿Seguro que desea eliminar el activo?`)) return;
    try {
        await apiFetch(`/api/activos/${db_id}`, { method: 'DELETE' });
        alert(window.i18n.t('drawer.eliminado') || "Eliminado");
        await cargarActivos();
    } catch(e) { alert(window.i18n.t('drawer.err_eliminar') || "Error eliminando"); }
};

window.actualizarEstadoHerramienta = async function(db_id, newState) {
    if(!newState || !db_id) return;
    try {
        await apiFetch(`/api/activos/${db_id}`, { 
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: newState })
        });
        alert(window.i18n.t('drawer.estado_ok') || "Estado actualizado");
        await cargarActivos();
    } catch(e) { alert(window.i18n.t('drawer.err_actualizar') || "Error actualizando"); }
};

const saveCategoryBtn = document.getElementById('saveCategoryBtn');
if (saveCategoryBtn) {
  saveCategoryBtn.addEventListener('click', async () => {
    const nombre = document.getElementById('catName').value.trim();
    const tipo = document.getElementById('catType').value;
    if (!nombre) return;
    try {
      const res = await apiFetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo, stock_global_consumibles: 0 })
      });
      const json = await res.json();
      if (json.success) {
        document.getElementById('catName').value = '';
        cargarCategorias(); // Reload list
      }
    } catch(err) {
      console.error(err);
    }
  });
}

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
  if (!userId) return;
  try {
    const res = await apiFetch(`/api/usuarios/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: newTeam || null })
    });
    if (!res.ok) {
      const d = await res.json();
      alert((window.i18n.t('drawer.err_actualizar_team') || 'Error actualizando team: {0}').replace('{0}', d.message || window.i18n.t('drawer.err_desconocido') || 'Error desconocido'));
    }
  } catch (err) {
    console.error('Error updateWorkerTeam', err);
  }
}

/* -----------------------------------------
   EDIT EMPLOYEE MODAL (Global)
----------------------------------------- */
window.editarEmpleado = async function(userId) {
  if (!userId) return;
  try {
    const res  = await apiFetch(`/api/usuarios/${userId}`);
    const json = await res.json();
    if (!json.success || !json.data) return alert(window.i18n.t('usuarios.err_cargar') || 'No se pudo cargar el usuario.');
    const u = json.data;

    // Build modal dynamically
    let modal = document.getElementById('editUserModal');
    if (!modal) {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-overlay open" id="editUserModal" style="z-index:9999">
          <div class="modal" style="max-width:440px">
            <div class="modal-header">
              <span>Editar Usuario</span>
              <button class="icon-btn" onclick="document.getElementById('editUserModal').remove()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
              <div class="modal-msg" id="editUserMsg" style="display:none"></div>
              <div class="form-group"><label>Nombre</label><input type="text" id="editUserNombre" class="form-input"></div>
              <div class="form-group"><label>Email</label><input type="email" id="editUserEmail" class="form-input"></div>
              <div class="form-group"><label>Team</label>
                <select id="editUserTeam" class="form-input"></select>
              </div>
              <div class="form-group"><label>Rol</label>
                <select id="editUserRol" class="form-input">
                  <option value="trabajador">Trabajador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="almacen">Almacén</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div class="form-group" style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="editUserTerreno">
                <label for="editUserTerreno" style="margin:0; font-size:13px; font-weight:normal;">Empleado en terreno (Manual)</label>
              </div>
              <div class="form-group"><label>Nuevo PIN / Contraseña (dejar vacío para no cambiar)</label><input type="password" id="editUserPin" class="form-input" placeholder="Mínimo 4 caracteres"></div>
            </div>
            <div class="modal-footer">
              <button class="btn-ghost" onclick="document.getElementById('editUserModal').remove()">Cancelar</button>
              <button class="btn-primary" id="confirmEditUserBtn">Guardar Cambios</button>
            </div>
          </div>
        </div>`;
      modal = div.firstElementChild;
      document.body.appendChild(modal);
    }

    // Populate
    document.getElementById('editUserNombre').value = u.nombre || '';
    document.getElementById('editUserEmail').value  = u.email  || '';
    document.getElementById('editUserTeam').value   = u.team   || '';
    document.getElementById('editUserRol').value    = u.rol    || 'trabajador';
    document.getElementById('editUserTerreno').checked = u.en_terreno === true;
    document.getElementById('editUserPin').value    = '';
    document.getElementById('editUserMsg').style.display = 'none';

    document.getElementById('confirmEditUserBtn').onclick = async () => {
      const payload = {
        nombre: document.getElementById('editUserNombre').value.trim(),
        email:  document.getElementById('editUserEmail').value.trim() || null,
        team:   document.getElementById('editUserTeam').value || null,
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
        const d = await r.json();
        if (r.ok && d.success) {
          document.getElementById('editUserModal').remove();
          cargarUsuariosAdministracion();
          cargarUsuarios();
        } else {
          const msgEl = document.getElementById('editUserMsg');
          msgEl.textContent = d.message || 'Error al guardar.';
          msgEl.className = 'modal-msg error';
          msgEl.style.display = 'block';
        }
      } catch (e) {
        const msgEl = document.getElementById('editUserMsg');
        msgEl.textContent = 'Error de red.';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    };
  } catch (e) {
    alert(window.i18n.t('usuarios.err_cargar') || 'Error cargando usuario.');
  }
};

/* -----------------------------------------
   EDIT ASSET MODAL (Global)
----------------------------------------- */
window.editarActivo = async function(item) {
  if (!item || !item.db_id) return alert(window.i18n.t('drawer.sin_id') || 'Sin ID de activo.');

  let modal = document.getElementById('editAssetModal');
  if (modal) modal.remove();

  // Build options for ubicaciones and usuarios
  const ubOpts = (window.ubicacionesData || []).map(u => `<option value="${u.id}" ${item.ubicacion_id == u.id ? 'selected' : ''}>${u.nombre_ubicacion}</option>`).join('');

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-overlay open" id="editAssetModal" style="z-index:9999">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span>Editar Activo: ${item.id}</span>
          <button class="icon-btn" onclick="document.getElementById('editAssetModal').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="modal-msg" id="editAssetMsg" style="display:none"></div>
          <div class="form-group"><label>Estado</label>
            <select id="editAssetEstado" class="form-input">
              <option value="disponible" ${item.status==='disponible' || !item.status ?'selected':''}>Disponible</option>
              <option value="en_uso" ${item.status==='en_uso'?'selected':''}>En Uso</option>
              <option value="en_mantenimiento" ${item.status==='en_mantenimiento'?'selected':''}>En Mantenimiento</option>
              <option value="calibracion_pendiente" ${item.status==='calibracion_pendiente'?'selected':''}>Calibración Pendiente</option>
              <option value="fuera_de_servicio" ${item.status==='fuera_de_servicio'?'selected':''}>Fuera de Servicio</option>
              <option value="danado" ${item.status==='danado'?'selected':''}>Dañado</option>
              <option value="calibrado" ${item.status==='calibrado'?'selected':''}>Calibrado</option>
            </select>
          </div>
          <div class="form-group"><label>Ubicación / Zona</label>
            <select id="editAssetUbicacion" class="form-input">
              <option value="">Sin Ubicación</option>
              ${ubOpts}
            </select>
          </div>
                    <div class="form-group"><label>Team</label>
            <select id="editAssetTeam" class="form-input">
              <option value="">Sin Team</option>
              ${window.teamsList.map(t => `<option value="${t.nombre}" ${item.team === t.nombre ? 'selected' : ''}>${t.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Fecha Últ. Calibración</label><input type="date" id="editAssetUltiCal" class="form-input" value="${item.calibracion?item.calibracion.substring(0,10):''}"></div>
            <div class="form-group"><label>Fecha Próx. Calibración</label><input type="date" id="editAssetProxCal" class="form-input" value="${item.calibracion?item.calibracion.substring(0,10):''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Fecha Últ. Tag</label><input type="date" id="editAssetUltiTag" class="form-input" value="${item.tag?item.tag.substring(0,10):''}"></div>
            <div class="form-group"><label>Fecha Próx. Tag</label><input type="date" id="editAssetProxTag" class="form-input" value="${item.tag?item.tag.substring(0,10):''}"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick="document.getElementById('editAssetModal').remove()">Cancelar</button>
          <button class="btn-primary" id="confirmEditAssetBtn">Guardar Cambios</button>
        </div>
      </div>
    </div>`;
  modal = div.firstElementChild;
  document.body.appendChild(modal);

  document.getElementById('confirmEditAssetBtn').onclick = async () => {
    const payload = {
      estado:              document.getElementById('editAssetEstado').value,
      team:                document.getElementById('editAssetTeam').value || null,
      ubicacion_actual_id: document.getElementById('editAssetUbicacion').value ? Number(document.getElementById('editAssetUbicacion').value) : null,
      fecha_ultima_cali:   document.getElementById('editAssetUltiCal').value || null,
      fecha_prox_cali:     document.getElementById('editAssetProxCal').value || null,
      fecha_ultimo_tag:    document.getElementById('editAssetUltiTag').value || null,
      fecha_prox_tag:      document.getElementById('editAssetProxTag').value || null,
    };
    // If assigning to a location, remove user assignment
    if (payload.ubicacion_actual_id) payload.usuario_actual_id = null;

    try {
      const r = await apiFetch(`/api/activos/${item.db_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (r.ok) {
        document.getElementById('editAssetModal').remove();
        document.getElementById('drawerOverlay').classList.remove('open');
        await cargarActivos();
      } else {
        const msgEl = document.getElementById('editAssetMsg');
        msgEl.textContent = d.message || 'Error al guardar.';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch (e) {
      const msgEl = document.getElementById('editAssetMsg');
      msgEl.textContent = 'Error de red.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
    }
  };
};

/* -----------------------------------------
   LOAD UBICACIONES for modal dropdowns
----------------------------------------- */
async function cargarUbicaciones() {
  try {
    const res  = await apiFetch('/api/ubicaciones');
    const json = await res.json();
    if (json.success && json.data) {
      window.ubicacionesData = json.data;
      // Populate zona select in main register modal
      const zonaSelect = document.getElementById('modalZona');
      if (zonaSelect) {
        zonaSelect.innerHTML = `<option value="" data-i18n="filter.todas_zonas">${window.i18n.t('filter.todas_zonas')}</option>`;
        json.data.forEach(ub => {
          zonaSelect.innerHTML += `<option value="${ub.id}">${ub.nombre_ubicacion}</option>`;
        });
      }
    }
  } catch (e) {
    console.warn('No se pudieron cargar ubicaciones:', e.message);
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

    if (!actual || !nueva || !conf) return alert(window.i18n.t('seg.err_campos'));
    if (nueva !== conf) return alert(window.i18n.t('seg.err_no_coinciden'));

    try {
      btnCambiarPass.disabled = true;
      btnCambiarPass.textContent = window.i18n.t('seg.actualizando');
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: actual, newPassword: nueva })
      });
      const json = await res.json();
      if (json.success) {
        alert(window.i18n.t('seg.pass_ok'));
        document.getElementById('segPassActual').value = '';
        document.getElementById('segPassNueva').value = '';
        document.getElementById('segPassConfirmar').value = '';
      } else {
        alert("Error: " + (json.message || (json.error && json.error.message) || "No se pudo actualizar"));
      }
    } catch (e) {
      alert(window.i18n.t('seg.err_red'));
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
      const json = await res.json();
      if (json.success && json.data) {
        // Show 2FA modal with QR code
        document.getElementById('twoFAQRImage').src = json.data.qrCode;
        document.getElementById('twoFATokenInput').value = '';
        document.getElementById('twoFAMsg').style.display = 'none';
        document.getElementById('twoFAModalOverlay').classList.add('open');
      } else {
        const errMsg = json.message || (json.error && json.error.message) || (window.i18n.t('seg.2fa_err') || 'Error setting up 2FA.');
        alert(errMsg);
      }
    } catch(e) {
      alert(window.i18n.t('seg.2fa_net_err') || 'Network error or missing backend dependencies.');
    } finally {
      btnSetup2FA.disabled = false;
      btnSetup2FA.textContent = window.i18n.t('seg.2fa_btn') || 'Setup 2FA';
    }
  });
}

// 2FA Modal handlers
const twoFAOverlay = document.getElementById('twoFAModalOverlay');
if (twoFAOverlay) {
  document.getElementById('closeTwoFAModal')?.addEventListener('click', () => twoFAOverlay.classList.remove('open'));
  document.getElementById('cancelTwoFABtn')?.addEventListener('click', () => twoFAOverlay.classList.remove('open'));
  
  document.getElementById('verifyTwoFABtn')?.addEventListener('click', async () => {
    const token = document.getElementById('twoFATokenInput').value.trim();
    const msgEl = document.getElementById('twoFAMsg');
    if (!token || token.length !== 6) {
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
      const vJson = await vRes.json();
      if (vJson.success) {
        msgEl.textContent = window.i18n.t('seg.2fa_activated') || '✓ 2FA activated successfully!';
        msgEl.className = 'modal-msg success';
        msgEl.style.display = 'block';
        setTimeout(() => twoFAOverlay.classList.remove('open'), 2000);
      } else {
        msgEl.textContent = window.i18n.t('seg.2fa_invalid_token') || 'Invalid token. Please try again.';
        msgEl.className = 'modal-msg error';
        msgEl.style.display = 'block';
      }
    } catch(e) {
      msgEl.textContent = window.i18n.t('drawer.err_red') || 'Network error.';
      msgEl.className = 'modal-msg error';
      msgEl.style.display = 'block';
    }
  });
}


// ══════════════════════════════════════
// DYNAMIC TEAMS & BULK OPERATIONS LOGIC
// ══════════════════════════════════════
window.teamsList = [];

async function loadTeams() {
    try {
        const res = await apiFetch('/api/teams');
        const json = await res.json();
        if (json.success) {
            window.teamsList = json.data;
            populateTeamSelects();
            renderManageTeams();
        }
    } catch (e) {
        console.error('Error loading teams', e);
    }
}

function populateTeamSelects() {
    const opts = window.teamsList.map(t => `<option value="${t.nombre}">${t.nombre}</option>`).join('');
    
    const au = document.getElementById('addUserTeam');
    if (au) au.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${window.i18n.t('usuarios.sin_team')}</option>` + opts;
    
    const eu = document.getElementById('editUserTeam');
    if (eu) eu.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${window.i18n.t('usuarios.sin_team')}</option>` + opts;
    
    const at = document.getElementById('advFilterTeam');
    if (at) at.innerHTML = `<option value="" data-i18n="filter.todos_teams">${window.i18n.t('filter.todos_teams')}</option>` + opts;
    
    const af = document.getElementById('filterTeam');
    if (af) af.innerHTML = `<option value="" data-i18n="filter.todos_teams">${window.i18n.t('filter.todos_teams')}</option>` + opts;
    
    const mt = document.getElementById('modalTeam');
    if (mt) mt.innerHTML = `<option value="" data-i18n="usuarios.sin_team">${window.i18n.t('usuarios.sin_team')}</option>` + opts;
}

// Ensure loadTeams is called on DOMContentLoaded (assuming script is deferred or at end)
document.addEventListener('DOMContentLoaded', () => {
    loadTeams();
    loadZonas();
});

// Manage Teams Modal
const teamsOverlay = document.getElementById('manageTeamsOverlay');
if (teamsOverlay) {
    document.getElementById('closeManageTeamsModal').onclick = () => teamsOverlay.classList.remove('open');
    teamsOverlay.onclick = e => { if (e.target === teamsOverlay) teamsOverlay.classList.remove('open'); };
    
    document.getElementById('addTeamBtn').onclick = async () => {
        const input = document.getElementById('newTeamInput');
        const nombre = input.value.trim();
        if (!nombre) return;
        try {
            const res = await apiFetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre })
            });
            const json = await res.json();
            if (json.success) {
                input.value = '';
                await loadTeams();
    loadZonas();
            } else {
                alert(json.message);
            }
        } catch (e) {
            console.error(e);
        }
    };
}

function renderManageTeams() {
    const container = document.getElementById('teamsListContainer');
    if (!container) return;
    if (window.teamsList.length === 0) {
        container.innerHTML = '<p style="color:var(--text-2);font-size:13px;text-align:center;">No teams found</p>';
        return;
    }
    container.innerHTML = window.teamsList.map(t => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); font-size:14px;">
            <span>${t.nombre}</span>
            <button class="icon-btn" onclick="deleteTeam(${t.id})" style="color:var(--accent-red)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');
}

window.deleteTeam = async function(id) {
    if (!confirm('Delete this team?')) return;
    try {
        const res = await apiFetch('/api/teams/' + id, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
            await loadTeams();
    loadZonas();
        } else {
            alert(json.message);
        }
    } catch (e) {
        console.error(e);
    }
};

window.openManageTeams = function() {
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
        const btn = document.getElementById('bulkDeleteConfirmBtn');
        btn.disabled = true;
        btn.textContent = 'Deleting...';
        
        try {
            const endpoint = currentBulkMode === 'activos' ? '/api/activos/bulk/all' : '/api/usuarios/bulk/others';
            const res = await apiFetch(endpoint, { method: 'DELETE' });
            const json = await res.json();
            
            if (json.success) {
                alert('Success: ' + json.message);
                document.getElementById('bulkDeleteOverlay').classList.remove('open');
                if (currentBulkMode === 'activos') {
                    if(window.loadInventory) await window.loadInventory();
                } else {
                    if(window.loadUsuarios) await window.loadUsuarios();
                }
            } else {
                alert('Error: ' + json.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error during bulk delete');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Delete All';
        }
    };
}

// ── Zonas (Ubicaciones) CRUD ──

window.zonasList = [];

async function loadZonas() {
    try {
        const res = await apiFetch('/api/ubicaciones');
        const json = await res.json();
        if (json.success) {
            window.zonasList = json.data;
            populateZonaSelects();
            renderManageZonas();
        }
    } catch (e) {
        console.error('Error loading zones', e);
    }
}

function populateZonaSelects() {
    const opts = window.zonasList.map(z => `<option value="${z.id}">${z.nombre_ubicacion}</option>`).join('');
    
    const mz = document.getElementById('modalZona');
    if (mz) mz.innerHTML = `<option value="" data-i18n="filter.todas_zonas">${window.i18n.t('filter.todas_zonas')}</option>` + opts;
    
    const az = document.getElementById('advFilterZona');
    if (az) az.innerHTML = `<option value="" data-i18n="filter.todas_zonas">${window.i18n.t('filter.todas_zonas')}</option>` + opts;
    
    const fz = document.getElementById('filterZona');
    if (fz) fz.innerHTML = `<option value="" data-i18n="filter.todas_zonas">${window.i18n.t('filter.todas_zonas')}</option>` + opts;
}

window.openManageZonas = function() {
    document.getElementById('manageZonasOverlay').classList.add('open');
    renderManageZonas();
};

if (document.getElementById('closeManageZonasModal')) {
    document.getElementById('closeManageZonasModal').onclick = () => document.getElementById('manageZonasOverlay').classList.remove('open');
}

function renderManageZonas() {
    const tbody = document.getElementById('manageZonasList');
    if (!tbody) return;
    tbody.innerHTML = '';
    window.zonasList.forEach(z => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHTML(z.nombre_ubicacion)}</td>
            <td><button class="icon-btn" onclick="window.deleteZona(${z.id})" style="color:var(--accent-red)"><i class="fa-solid fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

if (document.getElementById('btnCreateZona')) {
    document.getElementById('btnCreateZona').addEventListener('click', async () => {
        const input = document.getElementById('newZonaName');
        const val = input.value.trim();
        if (!val) return;
        
        try {
            const res = await apiFetch('/api/ubicaciones', {
                method: 'POST',
                body: JSON.stringify({ nombre_ubicacion: val })
            });
            const json = await res.json();
            if (json.success) {
                input.value = '';
                await loadZonas();
                showToast(window.i18n.t('zonas.toast_creada') || 'Zone created');
            } else {
                showToast(json.message, 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    });
}

window.deleteZona = async function(id) {
    if (!confirm(window.i18n.t('zonas.confirm_delete') || 'Are you sure you want to delete this zone?')) return;
    try {
        const res = await apiFetch(`/api/ubicaciones/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.success) {
            await loadZonas();
            showToast(window.i18n.t('zonas.toast_eliminada') || 'Zone deleted');
        } else {
            showToast(json.message, 'error');
        }
    } catch (e) {
        showToast('Error deleting zone', 'error');
    }
};

// ==========================================
// BULK IMPORT LOGIC
// ==========================================
(function() {
})();
