/* ════════════════════════════════════════════
   ENTELSO i18n — Sistema de idiomas ES / EN
   Uso:
     import { t, setLang, getLang } from './i18n.js'
     o simplemente llamar window.i18n.t('clave')
════════════════════════════════════════════ */

const TRANSLATIONS = {
  es: {
    // ── Sidebar ──
    'nav.dashboard':       'Dashboard',
    'nav.inventario':      'Todos los Equipos',
    'nav.zonas':           'Zonas',
    'nav.teams':           'Equipos (Teams)',
    'nav.mantenimiento':   'Mantenimiento',
    'nav.alertas':         'Alertas',
    'nav.inventario.sec':  'Inventario',
    'nav.operaciones.sec': 'Operaciones',
    'nav.buscar':          'Buscar...',

    // ── Header / Breadcrumb ──
    'header.filtrar':      'Filtrar',
    'header.exportar':     'Exportar',
    'header.nuevo':        'Nuevo Registro',
    'header.agendar':      'Agendar',

    // ── KPIs ──
    'kpi.total':           'Total Equipos',
    'kpi.disponibles':     'Disponibles',
    'kpi.calibracion':     'Calibración Pendiente',
    'kpi.mantenimiento':   'En Mantenimiento',
    'kpi.disponibilidad':  'Disponibilidad',
    'kpi.empleados':       'Total Empleados',
    'kpi.terreno':         'En Terreno',
    'kpi.con_equipo':      'Con Equipo Asignado',
    'kpi.sin_asig':        'Sin Asignación',
    'kpi.teams_activos':   'Equipos (Teams) Activos',

    // ── Dashboard view ──
    'dash.zona.title':     'Distribución por Zona',
    'dash.zona.mensual':   'Mensual',
    'dash.zona.trim':      'Trimestral',
    'dash.estado.title':   'Estado',
    'dash.recientes':      'Últimos Registros — Bot WhatsApp',
    'dash.filter.todos':   'Todos',
    'dash.filter.disp':    'Disponibles',
    'dash.filter.alertas': 'Alertas',

    // ── Tabla ──
    'col.id':              'ID',
    'col.equipo':          'Equipo / Dispositivo',
    'col.zona':            'Zona / Sitio',
    'col.team':            'Equipo (Team)',
    'col.estado':          'Estado',
    'col.registrado':      'Registrado',
    'col.fecha':           'Fecha',
    'col.motivo':          'Motivo',
    'col.vencimiento':     'Vencimiento',
    'col.empleado':        'Empleado',
    'col.equipo_asig':     'Equipo Asignado',
    'col.sitio':           'Sitio / Zona',
    'col.fecha_asig':      'Fecha Asignación',
    'col.retorno':         'Retorno Estimado',

    // ── Inventario ──
    'inv.buscar':          'Filtrar equipos...',
    'inv.nuevo':           'Nuevo',
    'inv.agrupar.estado':  'Agrupar por Estado',
    'inv.agrupar.zona':    'Agrupar por Zona',
    'inv.agrupar.team':    'Agrupar por Equipo (Team)',

    // ── Teams ──
    'teams.buscar':        'Buscar empleado, ID, team...',
    'teams.filtrar':       'Filtrar',
    'teams.nuevo_emp':     'Nuevo Empleado',
    'teams.todos_emp':     'Todos los Empleados',
    'filter.todos':        'Todos',
    'filter.terreno':      'En Terreno',
    'filter.oficina':      'Oficina',
    'filter.sin_asig':     'Sin Asignación',

    // ── Mantenimiento ──
    'maint.atencion':      'Equipos que requieren atención',

    // ── Modal registro ──
    'modal.titulo':        'Registrar Equipo',
    'modal.inv':           'No. Inventario',
    'modal.inv.ph':        'INV-XXXX',
    'modal.desc':          'Equipo / Descripción',
    'modal.desc.ph':       'ej. Fluke 87V Multimeter',
    'modal.zona':          'Zona',
    'modal.team':          'Team',
    'modal.estado':        'Estado',
    'modal.cancelar':      'Cancelar',
    'modal.registrar':     'Registrar Equipo',

    // ── Estados ──
    'estado.disponible':          'Disponible',
    'estado.en_uso':              'En Uso',
    'estado.en_mantenimiento':    'En Mantenimiento',
    'estado.calibracion_pendiente': 'Calibración Pendiente',
    'estado.fuera_de_servicio':   'Fuera de Servicio',
    'estado.calibrado':           'Calibrado',
    'estado.danado':              'Dañado',
    'estado.en_funcionamiento':   'En Funcionamiento',
    'estado.desconocido':         'Desconocido',

    // ── Login ──
    'login.titulo':        'Iniciar Sesión',
    'login.subtitulo':     'Sistema de Inventario',
    'login.email':         'Correo electrónico',
    'login.email.ph':      'admin@entelso.com',
    'login.pin':           'PIN de acceso',
    'login.pin.ph':        '• • • • • •',
    'login.btn':           'Ingresar',
    'login.cargando':      'Verificando...',
    'login.error.campos':  'Ingresa tu correo y PIN.',
    'login.error.cred':    'Credenciales incorrectas. Verifica tu correo y PIN.',
    'login.error.server':  'Error de conexión. Verifica que el servidor esté activo.',

    // ── Perfil ──
    'perfil.mi_perfil':    'Mi Perfil',
    'perfil.seguridad':    'Seguridad',
    'perfil.notif':        'Notificaciones',
    'perfil.tema':         'Preferencias de Tema',
    'perfil.usuarios':     'Gestión de Usuarios',
    'perfil.exportar':     'Exportar mis datos',
    'perfil.cerrar':       'Cerrar Sesión',

    // ── Command palette ──
    'cmd.buscar':          'Buscar o ejecutar comando...',
    'cmd.nav':             'Navegación',
    'cmd.acciones':        'Acciones',
    'cmd.tema':            'Cambiar tema',
    'cmd.idioma':          'Cambiar a Inglés',

    // ── Drawer ──
    'drawer.historial':    'Historial de Actividad',
    'drawer.subtitulo':    'Historial de Actividad',

    // ── API / estados vacíos ──
    'api.cargando':        'Cargando datos...',
    'api.error':           'Error al cargar datos. Revisa la conexión.',
    'api.sin_datos':       'No hay datos disponibles.',

    // ── Vistas Nuevas (Perfil, Seguridad, Audit) ──
    'perfil.audit':        'Registro de Actividad',
    'audit.titulo':        'Auditoría de Acciones (Audit Log)',
    'audit.fecha':         'Fecha y Hora',
    'audit.user':          'Usuario',
    'audit.accion':        'Acción Realizada',
    'perfil.cfg_titulo':   'Configuración de Perfil',
    'perfil.nombre':       'Nombre Completo',
    'perfil.email':        'Correo Electrónico',
    'perfil.tel':          'Teléfono (WhatsApp)',
    'perfil.guardar':      'Guardar Cambios',
    'seg.titulo':          'Seguridad y Contraseña',
    'seg.subtitulo':       'Gestiona tu contraseña y métodos de autenticación.',
    'seg.cambiar':         'Cambiar Contraseña',
    'seg.pass_actual':     'Contraseña Actual',
    'seg.pass_nueva':      'Nueva Contraseña',
    'seg.pass_conf':       'Confirmar Nueva Contraseña',
    'seg.btn_actualizar':  'Actualizar Contraseña',
    'seg.2fa':             'Autenticación en dos pasos (2FA)',
    'seg.2fa_estado':      'Estado: ',
    'seg.2fa_desactivado': 'Desactivado',
    'seg.2fa_desc':        'Añade una capa extra de seguridad usando una app de autenticación.',
    'seg.2fa_btn':         'Configurar 2FA',
  },

  en: {
    // ── Sidebar ──
    'nav.dashboard':       'Dashboard',
    'nav.inventario':      'All Equipment',
    'nav.zonas':           'Zones',
    'nav.teams':           'Teams',
    'nav.mantenimiento':   'Maintenance',
    'nav.alertas':         'Alerts',
    'nav.inventario.sec':  'Inventory',
    'nav.operaciones.sec': 'Operations',
    'nav.buscar':          'Search...',

    // ── Header / Breadcrumb ──
    'header.filtrar':      'Filter',
    'header.exportar':     'Export',
    'header.nuevo':        'New Record',
    'header.agendar':      'Schedule',

    // ── KPIs ──
    'kpi.total':           'Total Equipment',
    'kpi.disponibles':     'Available',
    'kpi.calibracion':     'Calibration Pending',
    'kpi.mantenimiento':   'Under Maintenance',
    'kpi.disponibilidad':  'Availability',
    'kpi.empleados':       'Total Employees',
    'kpi.terreno':         'In the Field',
    'kpi.con_equipo':      'With Assigned Equipment',
    'kpi.sin_asig':        'Unassigned',
    'kpi.teams_activos':   'Active Teams',

    // ── Dashboard view ──
    'dash.zona.title':     'Distribution by Zone',
    'dash.zona.mensual':   'Monthly',
    'dash.zona.trim':      'Quarterly',
    'dash.estado.title':   'Status',
    'dash.recientes':      'Recent Records — WhatsApp Bot',
    'dash.filter.todos':   'All',
    'dash.filter.disp':    'Available',
    'dash.filter.alertas': 'Alerts',

    // ── Tabla ──
    'col.id':              'ID',
    'col.equipo':          'Equipment',
    'col.zona':            'Zone',
    'col.team':            'Team',
    'col.estado':          'Status',
    'col.registrado':      'Registered',
    'col.fecha':           'Date',
    'col.motivo':          'Reason',
    'col.vencimiento':     'Due Date',
    'col.empleado':        'Employee',
    'col.equipo_asig':     'Assigned Equipment',
    'col.sitio':           'Site / Zone',
    'col.fecha_asig':      'Assignment Date',
    'col.retorno':         'Expected Return',

    // ── Inventario ──
    'inv.buscar':          'Filter equipment...',
    'inv.nuevo':           'New',
    'inv.agrupar.estado':  'Group by Status',
    'inv.agrupar.zona':    'Group by Zone',
    'inv.agrupar.team':    'Group by Team',

    // ── Teams ──
    'teams.buscar':        'Search employee, ID, team...',
    'teams.filtrar':       'Filter',
    'teams.nuevo_emp':     'New Employee',
    'teams.todos_emp':     'All Employees',
    'filter.todos':        'All',
    'filter.terreno':      'In the Field',
    'filter.oficina':      'Office',
    'filter.sin_asig':     'Unassigned',

    // ── Mantenimiento ──
    'maint.atencion':      'Equipment requiring attention',

    // ── Modal registro ──
    'modal.titulo':        'Register Equipment',
    'modal.inv':           'Inventory No.',
    'modal.inv.ph':        'INV-XXXX',
    'modal.desc':          'Equipment / Description',
    'modal.desc.ph':       'e.g. Fluke 87V Multimeter',
    'modal.zona':          'Zone',
    'modal.team':          'Team',
    'modal.estado':        'Status',
    'modal.cancelar':      'Cancel',
    'modal.registrar':     'Register Equipment',

    // ── Estados ──
    'estado.disponible':          'Available',
    'estado.en_uso':              'In Use',
    'estado.en_mantenimiento':    'Under Maintenance',
    'estado.calibracion_pendiente': 'Calibration Pending',
    'estado.fuera_de_servicio':   'Out of Service',
    'estado.calibrado':           'Calibrated',
    'estado.danado':              'Damaged',
    'estado.en_funcionamiento':   'In Operation',
    'estado.desconocido':         'Unknown',

    // ── Login ──
    'login.titulo':        'Sign In',
    'login.subtitulo':     'Inventory System',
    'login.email':         'Email address',
    'login.email.ph':      'admin@entelso.com',
    'login.pin':           'Access PIN',
    'login.pin.ph':        '• • • • • •',
    'login.btn':           'Sign In',
    'login.cargando':      'Verifying...',
    'login.error.campos':  'Please enter your email and PIN.',
    'login.error.cred':    'Invalid credentials. Check your email and PIN.',
    'login.error.server':  'Connection error. Make sure the server is running.',

    // ── Perfil ──
    'perfil.mi_perfil':    'My Profile',
    'perfil.seguridad':    'Security',
    'perfil.notif':        'Notifications',
    'perfil.tema':         'Theme Preferences',
    'perfil.usuarios':     'User Management',
    'perfil.exportar':     'Export my data',
    'perfil.cerrar':       'Sign Out',

    // ── Command palette ──
    'cmd.buscar':          'Search or run a command...',
    'cmd.nav':             'Navigation',
    'cmd.acciones':        'Actions',
    'cmd.tema':            'Toggle theme',
    'cmd.idioma':          'Switch to Spanish',

    // ── Drawer ──
    'drawer.historial':    'Activity History',
    'drawer.subtitulo':    'Activity History',

    // ── API / estados vacíos ──
    'api.cargando':        'Loading data...',
    'api.error':           'Error loading data. Check your connection.',
    'api.sin_datos':       'No data available.',

    // ── Vistas Nuevas (Perfil, Seguridad, Audit) ──
    'perfil.audit':        'Activity Log',
    'audit.titulo':        'Action Audit (Audit Log)',
    'audit.fecha':         'Date & Time',
    'audit.user':          'User',
    'audit.accion':        'Action Performed',
    'perfil.cfg_titulo':   'Profile Settings',
    'perfil.nombre':       'Full Name',
    'perfil.email':        'Email Address',
    'perfil.tel':          'Phone (WhatsApp)',
    'perfil.guardar':      'Save Changes',
    'seg.titulo':          'Security & Password',
    'seg.subtitulo':       'Manage your password and authentication methods.',
    'seg.cambiar':         'Change Password',
    'seg.pass_actual':     'Current Password',
    'seg.pass_nueva':      'New Password',
    'seg.pass_conf':       'Confirm New Password',
    'seg.btn_actualizar':  'Update Password',
    'seg.2fa':             'Two-Factor Authentication (2FA)',
    'seg.2fa_estado':      'Status: ',
    'seg.2fa_desactivado': 'Disabled',
    'seg.2fa_desc':        'Add an extra layer of security using an authenticator app.',
    'seg.2fa_btn':         'Setup 2FA',
  },
};

/* ── Motor i18n ─────────────────────────────────────── */
let _currentLang = localStorage.getItem('entelso_lang') || 'es';

/** Traduce una clave. Si no existe, devuelve la clave misma */
function t(key) {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['es']?.[key] ?? key;
}

/** Cambia el idioma activo y re-renderiza la UI */
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  _currentLang = lang;
  localStorage.setItem('entelso_lang', lang);
  applyTranslations();
  // Dispara un evento para que script.js re-renderice las tablas
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/** Obtiene el idioma actual */
function getLang() { return _currentLang; }

/**
 * Aplica traducciones a todos los elementos con data-i18n="clave"
 * y data-i18n-ph="clave" (para placeholders)
 */
function applyTranslations() {
  // Elementos normales: textContent
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    // Los <option> usan la propiedad .text para garantizar compatibilidad cross-browser
    if (el.tagName === 'OPTION') {
      el.text = t(key);
    } else {
      el.textContent = t(key);
    }
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    el.setAttribute('placeholder', t(key));
  });
}

// Exponer globalmente para que script.js pueda usar
window.i18n = { t, setLang, getLang, applyTranslations };
