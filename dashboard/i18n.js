/* ════════════════════════════════════════════
   ENTELSO i18n — Language System EN / ES
   Usage:
     import { t, setLang, getLang } from './i18n.js'
     or simply call window.i18n.t('key')
════════════════════════════════════════════ */

const TRANSLATIONS = {
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
    'col.asignado':        'Assigned to',
    'col.prox_cal':        'Next Calibration',
    'col.acciones':        'Actions',

    // ── Inventario ──
    'inv.buscar':          'Filter equipment...',
    'inv.nuevo':           'New',
    'inv.agrupar.estado':  'Group by Status',
    'inv.agrupar.zona':    'Group by Zone',
    'inv.agrupar.team':    'Group by Team',
    'inv.exportar':        'Export',
    'inv.categorias':      'Categories',
    'inv.actualizar':      '-- Update --',
    'inv.eliminar_todos':  'Delete All',
    'inv.filtro_avanzado': 'Advanced Filter',

    // ── Teams ──
    'teams.buscar':        'Search employee, ID, team...',
    'teams.filtrar':       'Filter',
    'teams.nuevo_emp':     'New Employee',
    'teams.todos_emp':     'All Employees',
    'teams.gestionar':     'Manage Teams',
    'filter.todos':        'All',
    'filter.terreno':      'In the Field',
    'filter.oficina':      'Office',
    'filter.sin_asig':     'Unassigned',

    // ── Mantenimiento ──
    'maint.atencion':      'Equipment requiring attention',
    'maint.agendar':       'Schedule Maintenance',
    'maint.equipo_label':  'Equipment (ID or Name) *',
    'maint.fecha_label':   'Maintenance Date *',
    'maint.observaciones': 'Observations',
    'maint.obs_ph':        'Details of the issue or calibration...',
    'maint.err_campos':    'Please fill in the equipment and date.',
    'maint.agendado_ok':   'Maintenance scheduled for',
    'maint.err_agendar':   'Error scheduling maintenance.',
    'maint.err_no_encontrado': 'Equipment not found in inventory. Check the ID or name.',
    'maint.registrando':   'Scheduling...',

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
    'modal.registrando':   'Registering...',

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
    'login.pin_toggle':    'Show/Hide PIN',

    // ── Perfil ──
    'perfil.mi_perfil':    'My Profile',
    'perfil.seguridad':    'Security',
    'perfil.notif':        'Notifications',
    'perfil.tema':         'Theme Preferences',
    'perfil.usuarios':     'User Management',
    'perfil.exportar':     'Export my data',
    'perfil.cerrar':       'Sign Out',
    'perfil.cfg_titulo':   'Profile Settings',
    'perfil.nombre':       'Full Name',
    'perfil.email':        'Email Address',
    'perfil.tel':          'Phone (WhatsApp)',
    'perfil.guardar':      'Save Changes',
    'perfil.guardando':    'Saving...',
    'perfil.guardado_ok':  'Saved successfully!',
    'perfil.cambiar_foto': 'Change Photo',
    'perfil.notif_pref':   'Notification Preferences',
    'perfil.pref_calibracion': 'Receive emails about calibration alerts',
    'perfil.pref_asignacion':  'Receive WhatsApp messages when assigning equipment',
    'perfil.pref_resumen':     'Weekly inventory summary',
    'perfil.nombre_ph':    'Your name',

    // ── Perfil / Audit ──
    'perfil.audit':        'Activity Log',
    'audit.titulo':        'Action Audit (Audit Log)',
    'audit.fecha':         'Date & Time',
    'audit.user':          'User',
    'audit.accion':        'Action Performed',

    // ── Command palette ──
    'cmd.buscar':          'Search or run a command...',
    'cmd.nav':             'Navigation',
    'cmd.acciones':        'Actions',
    'cmd.tema':            'Toggle theme',
    'cmd.idioma':          'Switch to Spanish',

    // ── Drawer ──
    'drawer.historial':    'Activity History',
    'drawer.subtitulo':    'Activity History',
    'drawer.editar':       'Edit Asset',
    'drawer.imprimir_qr':  'Print QR',
    'drawer.err_guardar':  'Error saving.',
    'drawer.err_red':      'Network error.',

    // ── API / empty states ──
    'api.cargando':        'Loading data...',
    'api.error':           'Error loading data. Check your connection.',
    'api.sin_datos':       'No data available.',

    // ── Alertas ──
    'alertas.titulo':       'Alerts Command Center',
    'alertas.gravedad':     'Severity',
    'alertas.equipo_zona':  'Equipment / Zone',
    'alertas.reportado':    'Reported',
    'alertas.accion':       'Action',

    // ── Seguridad ──
    'seg.titulo':          'Security & Password',
    'seg.subtitulo':       'Manage your password and authentication methods.',
    'seg.cambiar':         'Change Password',
    'seg.pass_actual':     'Current Password',
    'seg.pass_nueva':      'New Password',
    'seg.pass_conf':       'Confirm New Password',
    'seg.btn_actualizar':  'Update Password',
    'seg.actualizando':    'Updating...',
    'seg.2fa':             'Two-Factor Authentication (2FA)',
    'seg.2fa_label':       '2FA Authentication',
    'seg.2fa_estado':      'Status: ',
    'seg.2fa_desactivado': 'Disabled',
    'seg.2fa_desc':        'Add an extra layer of security using an authenticator app.',
    'seg.2fa_desc_full':   'Protect your account with a temporary code from your authenticator app (Google Authenticator).',
    'seg.2fa_btn':         'Setup 2FA',
    'seg.cargando_2fa':    'Loading...',
    'seg.sesiones':        'Active Sessions',
    'seg.dispositivos':    '1 Device',
    'seg.sesion_detalle':  'Active now',
    'seg.cerrar_sesiones': 'Close other sessions',

    // ── Usuarios ──
    'usuarios.anadir':       'Add User',
    'usuarios.activos':      'Active Users',
    'usuarios.admins':       'Administrators',
    'usuarios.anadir_nuevo': 'Add New User',
    'usuarios.nombre':       'Full Name *',
    'usuarios.email':        'Email Address',
    'usuarios.telefono':     'Phone (WhatsApp)',
    'usuarios.rol':          'Role',
    'usuarios.rol_trabajador': 'Worker',
    'usuarios.rol_supervisor': 'Supervisor',
    'usuarios.rol_almacen':    'Warehouse',
    'usuarios.rol_admin':      'Admin',
    'usuarios.sin_team':       'No Team',
    'usuarios.password_label': 'Temporary Password',
    'usuarios.password_min':   'Min 6 chars',
    'usuarios.password_ph':    'ex. 123456',
    'usuarios.crear':         'Create User',
    'usuarios.creando':       'Creating...',
    'usuarios.err_requerido': 'Name and password/PIN are required.',
    'usuarios.err_min':       'Password/PIN must be at least 4 characters.',
    'usuarios.creado_ok':     '✓ User created successfully.',
    'usuarios.err_conexion':  'Server connection error.',
    'usuarios.eliminar_otros': 'Delete All Users',
    'usuarios.col_id':        'ID',
    'usuarios.col_nombre':    'Name',
    'usuarios.col_email':     'Email',
    'usuarios.col_rol':       'Role',
    'usuarios.col_acciones':  'Actions',

    // ── Bulk & Teams Management ──
    'bulk.btn_delete_all': 'Delete All',
    'bulk.confirm_title': 'Confirm Deletion',
    'bulk.type_delete': 'Type DELETE to confirm:',
    'bulk.cancel': 'Cancel',
    'bulk.delete': 'Delete All',
    'bulk.warn_activos': 'WARNING: This will delete ALL equipment, movements, and maintenance records permanently. Are you sure?',
    'bulk.warn_usuarios': 'WARNING: This will delete ALL users except yourself and other admins. Are you sure?',
    'teams.manage': 'Manage Teams',
    'teams.modal_titulo': 'Manage Teams',
    'teams.nuevo_nombre': 'New team name...',
    'teams.btn_agregar': 'Add',

    // ── Filtro Avanzado ──
    'filter.titulo':        'Advanced Filters',
    'filter.zona':          'Physical Zone',
    'filter.todas_zonas':   'All Zones',
    'filter.team_asig':     'Team / Assignment',
    'filter.todos_teams':   'All Teams',
    'filter.estado':        'Status',
    'filter.cualquier':     'Any status',
    'filter.limpiar':       'Clear Filters',
    'filter.aplicar':       'Apply',

    // ── Bulk Delete ──
    'bulk.confirm_title':      'Confirm Deletion',
    'bulk.confirm_equip':      'This will permanently delete ALL equipment, maintenance records, and movement history. This action cannot be undone.',
    'bulk.confirm_users':      'This will permanently delete ALL users except your account. This action cannot be undone.',
    'bulk.type_delete':        'Type DELETE to confirm:',
    'bulk.cancel':             'Cancel',
    'bulk.delete':             'Delete All',
    'bulk.deleting':           'Deleting...',
    'bulk.deleted_ok':         'All records deleted successfully.',
    'bulk.deleted_users_ok':   'All other users deleted successfully.',

    // ── Manage Teams Modal ──
    'teams.modal_titulo':   'Manage Teams',
    'teams.nuevo_nombre':   'New team name...',
    'teams.btn_agregar':    'Add',
    'teams.sin_teams':      'No teams yet. Add one above.',

    // ── Tema ──
    'tema.cambiar':         'Toggle theme',
    'tema.idioma':          'Change language',
  },

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
    'col.asignado':        'Asignado a',
    'col.prox_cal':        'Próx. Calibración',
    'col.acciones':        'Acciones',

    // ── Inventario ──
    'inv.buscar':          'Filtrar equipos...',
    'inv.nuevo':           'Nuevo',
    'inv.agrupar.estado':  'Agrupar por Estado',
    'inv.agrupar.zona':    'Agrupar por Zona',
    'inv.agrupar.team':    'Agrupar por Equipo (Team)',
    'inv.exportar':        'Exportar',
    'inv.categorias':      'Categorías',
    'inv.actualizar':      '-- Actualizar --',
    'inv.eliminar_todos':  'Eliminar Todo',
    'inv.filtro_avanzado': 'Filtro Avanzado',

    // ── Teams ──
    'teams.buscar':        'Buscar empleado, ID, team...',
    'teams.filtrar':       'Filtrar',
    'teams.nuevo_emp':     'Nuevo Empleado',
    'teams.todos_emp':     'Todos los Empleados',
    'teams.gestionar':     'Gestionar Teams',
    'filter.todos':        'Todos',
    'filter.terreno':      'En Terreno',
    'filter.oficina':      'Oficina',
    'filter.sin_asig':     'Sin Asignación',

    // ── Mantenimiento ──
    'maint.atencion':      'Equipos que requieren atención',
    'maint.agendar':       'Agendar Mantenimiento',
    'maint.equipo_label':  'Equipo (ID o Nombre) *',
    'maint.fecha_label':   'Fecha de Mantenimiento *',
    'maint.observaciones': 'Observaciones',
    'maint.obs_ph':        'Detalles del problema o calibración...',
    'maint.err_campos':    'Por favor complete el equipo y la fecha.',
    'maint.agendado_ok':   'Mantenimiento agendado para',
    'maint.err_agendar':   'Error al agendar mantenimiento.',
    'maint.err_no_encontrado': 'Equipo no encontrado en el inventario. Verifique el ID o nombre.',
    'maint.registrando':   'Agendando...',

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
    'modal.registrando':   'Registrando...',

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
    'login.pin_toggle':    'Mostrar/Ocultar PIN',

    // ── Perfil ──
    'perfil.mi_perfil':    'Mi Perfil',
    'perfil.seguridad':    'Seguridad',
    'perfil.notif':        'Notificaciones',
    'perfil.tema':         'Preferencias de Tema',
    'perfil.usuarios':     'Gestión de Usuarios',
    'perfil.exportar':     'Exportar mis datos',
    'perfil.cerrar':       'Cerrar Sesión',
    'perfil.cfg_titulo':   'Configuración de Perfil',
    'perfil.nombre':       'Nombre Completo',
    'perfil.email':        'Correo Electrónico',
    'perfil.tel':          'Teléfono (WhatsApp)',
    'perfil.guardar':      'Guardar Cambios',
    'perfil.guardando':    'Guardando...',
    'perfil.guardado_ok':  '¡Guardado con éxito!',
    'perfil.cambiar_foto': 'Cambiar Foto',
    'perfil.notif_pref':   'Preferencias de Notificación',
    'perfil.pref_calibracion': 'Recibir correos sobre alertas de calibración',
    'perfil.pref_asignacion':  'Recibir mensajes de WhatsApp al asignar equipos',
    'perfil.pref_resumen':     'Resumen semanal de inventario',
    'perfil.nombre_ph':    'Tu nombre',

    // ── Perfil / Audit ──
    'perfil.audit':        'Registro de Actividad',
    'audit.titulo':        'Auditoría de Acciones (Audit Log)',
    'audit.fecha':         'Fecha y Hora',
    'audit.user':          'Usuario',
    'audit.accion':        'Acción Realizada',

    // ── Command palette ──
    'cmd.buscar':          'Buscar o ejecutar comando...',
    'cmd.nav':             'Navegación',
    'cmd.acciones':        'Acciones',
    'cmd.tema':            'Cambiar tema',
    'cmd.idioma':          'Cambiar a Inglés',

    // ── Drawer ──
    'drawer.historial':    'Historial de Actividad',
    'drawer.subtitulo':    'Historial de Actividad',
    'drawer.editar':       'Editar Activo',
    'drawer.imprimir_qr':  'Imprimir QR',
    'drawer.err_guardar':  'Error al guardar.',
    'drawer.err_red':      'Error de red.',

    // ── API / estados vacíos ──
    'api.cargando':        'Cargando datos...',
    'api.error':           'Error al cargar datos. Revisa la conexión.',
    'api.sin_datos':       'No hay datos disponibles.',

    // ── Alertas ──
    'alertas.titulo':       'Centro de Mando de Alertas',
    'alertas.gravedad':     'Gravedad',
    'alertas.equipo_zona':  'Equipo / Zona',
    'alertas.reportado':    'Reportado',
    'alertas.accion':       'Acción',

    // ── Seguridad ──
    'seg.titulo':          'Seguridad y Contraseña',
    'seg.subtitulo':       'Gestiona tu contraseña y métodos de autenticación.',
    'seg.cambiar':         'Cambiar Contraseña',
    'seg.pass_actual':     'Contraseña Actual',
    'seg.pass_nueva':      'Nueva Contraseña',
    'seg.pass_conf':       'Confirmar Nueva Contraseña',
    'seg.btn_actualizar':  'Actualizar Contraseña',
    'seg.actualizando':    'Actualizando...',
    'seg.2fa':             'Autenticación en dos pasos (2FA)',
    'seg.2fa_label':       'Autenticación 2FA',
    'seg.2fa_estado':      'Estado: ',
    'seg.2fa_desactivado': 'Desactivado',
    'seg.2fa_desc':        'Añade una capa extra de seguridad usando una app de autenticación.',
    'seg.2fa_desc_full':   'Protege tu cuenta con un código temporal desde tu app de autenticación (Google Authenticator).',
    'seg.2fa_btn':         'Configurar 2FA',
    'seg.cargando_2fa':    'Cargando...',
    'seg.sesiones':        'Sesiones Activas',
    'seg.dispositivos':    '1 Dispositivo',
    'seg.sesion_detalle':  'Activo ahora',
    'seg.cerrar_sesiones': 'Cerrar otras sesiones',

    // ── Usuarios ──
    'usuarios.anadir':       'Añadir Usuario',
    'usuarios.activos':      'Usuarios Activos',
    'usuarios.admins':       'Administradores',
    'usuarios.anadir_nuevo': 'Añadir Nuevo Usuario',
    'usuarios.nombre':       'Nombre Completo *',
    'usuarios.email':        'Correo Electrónico',
    'usuarios.telefono':     'Teléfono (WhatsApp)',
    'usuarios.rol':          'Rol',
    'usuarios.rol_trabajador': 'Trabajador',
    'usuarios.rol_supervisor': 'Supervisor',
    'usuarios.rol_almacen':    'Almacén',
    'usuarios.rol_admin':      'Administrador',
    'usuarios.sin_team':       'Sin Team',
    'usuarios.password_label': 'Contraseña Temporal',
    'usuarios.password_min':   'Mín 6 caracteres',
    'usuarios.password_ph':    'ej. 123456',
    'usuarios.crear':         'Crear Usuario',
    'usuarios.creando':       'Creando...',
    'usuarios.err_requerido': 'El nombre y la contraseña/PIN son obligatorios.',
    'usuarios.err_min':       'La contraseña/PIN debe tener al menos 4 caracteres.',
    'usuarios.creado_ok':     '✓ Usuario creado exitosamente.',
    'usuarios.err_conexion':  'Error de conexión al servidor.',
    'usuarios.eliminar_otros': 'Eliminar Todos los Usuarios',
    'usuarios.col_id':        'ID',
    'usuarios.col_nombre':    'Nombre',
    'usuarios.col_email':     'Email',
    'usuarios.col_rol':       'Rol',
    'usuarios.col_acciones':  'Acciones',

    // ── Bulk & Teams Management ──
    'bulk.btn_delete_all': 'Borrar Todo',
    'bulk.confirm_title': 'Confirmar Eliminación',
    'bulk.type_delete': 'Escriba DELETE para confirmar:',
    'bulk.cancel': 'Cancelar',
    'bulk.delete': 'Eliminar Todos',
    'bulk.warn_activos': 'ADVERTENCIA: Esto eliminará TODOS los equipos, movimientos y registros de mantenimiento de forma permanente. ¿Estás seguro?',
    'bulk.warn_usuarios': 'ADVERTENCIA: Esto eliminará a TODOS los usuarios excepto a ti mismo y a otros administradores. ¿Estás seguro?',
    'teams.manage': 'Gestionar Teams',
    'teams.modal_titulo': 'Gestionar Teams',
    'teams.nuevo_nombre': 'Nombre del nuevo team...',
    'teams.btn_agregar': 'Agregar',

    // ── Filtro Avanzado ──
    'filter.titulo':        'Filtros Avanzados',
    'filter.zona':          'Zona Física',
    'filter.todas_zonas':   'Todas las Zonas',
    'filter.team_asig':     'Team / Asignación',
    'filter.todos_teams':   'Todos los Teams',
    'filter.estado':        'Estado',
    'filter.cualquier':     'Cualquier estado',
    'filter.limpiar':       'Limpiar Filtros',
    'filter.aplicar':       'Aplicar',

    // ── Bulk Delete ──
    'bulk.confirm_title':      'Confirmar Eliminación',
    'bulk.confirm_equip':      'Esto eliminará permanentemente TODOS los equipos, registros de mantenimiento e historial de movimientos. Esta acción no se puede deshacer.',
    'bulk.confirm_users':      'Esto eliminará permanentemente TODOS los usuarios excepto tu cuenta. Esta acción no se puede deshacer.',
    'bulk.type_delete':        'Escribe ELIMINAR para confirmar:',
    'bulk.cancel':             'Cancelar',
    'bulk.delete':             'Eliminar Todo',
    'bulk.deleting':           'Eliminando...',
    'bulk.deleted_ok':         'Todos los registros eliminados exitosamente.',
    'bulk.deleted_users_ok':   'Todos los demás usuarios eliminados exitosamente.',

    // ── Manage Teams Modal ──
    'teams.modal_titulo':   'Gestionar Teams',
    'teams.nuevo_nombre':   'Nombre del nuevo team...',
    'teams.btn_agregar':    'Agregar',
    'teams.sin_teams':      'No hay teams aún. Agrega uno arriba.',

    // ── Tema ──
    'tema.cambiar':         'Cambiar tema',
    'tema.idioma':          'Cambiar idioma',
  },
};

/* ── i18n Engine ─────────────────────────────────────── */
let _currentLang = localStorage.getItem('entelso_lang') || 'en';

/** Translate a key. If not found, returns the key itself */
function t(key) {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key;
}

/** Change the active language and re-render the UI */
function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  _currentLang = lang;
  localStorage.setItem('entelso_lang', lang);
  applyTranslations();
  // Fire an event so script.js can re-render tables
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/** Get the current language */
function getLang() { return _currentLang; }

/**
 * Apply translations to all elements with data-i18n="key"
 * and data-i18n-ph="key" (for placeholders)
 * and data-i18n-title="key" (for title attributes)
 */
function applyTranslations() {
  // Normal elements: textContent
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    // <option> uses .text for cross-browser compatibility
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
  // Title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key));
  });
  // Update html lang attribute
  document.documentElement.lang = _currentLang;
}

// Expose globally so script.js can use
window.i18n = { t, setLang, getLang, applyTranslations };
