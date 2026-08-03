const jwt = require('jsonwebtoken');
const env = require('./src/config/environment');

// Import services to mock DB interactions during unit route tests
const usuariosSvc = require('./src/modules/usuarios/usuarios.service');
const auditSvc    = require('./src/modules/audit/audit.service');
const activosSvc  = require('./src/modules/activos/activos.service');

// Stub service methods to return mock data without hitting database
usuariosSvc.getAll          = async () => [];
usuariosSvc.getById         = async (id) => ({ id: Number(id), nombre: 'Test User' });
usuariosSvc.getAssets       = async (id) => [];
usuariosSvc.create          = async (data) => ({ id: 1, ...data });
usuariosSvc.update          = async (id, data) => ({ id: Number(id), ...data });
usuariosSvc.remove          = async (id) => ({ id: Number(id) });
usuariosSvc.removeAllOthers  = async () => 0;

auditSvc.getLogs   = async () => [];
auditSvc.createLog = async (data) => ({ id: 1, ...data });

activosSvc.getAll             = async () => [];
activosSvc.getById            = async (id) => ({ id: Number(id), numero_serie: 'SN123' });
activosSvc.getBySerial        = async (s) => ({ id: 1, numero_serie: s });
activosSvc.create             = async (data) => ({ id: 1, ...data });
activosSvc.update             = async (id, data) => ({ id: Number(id), ...data });
activosSvc.remove             = async (id) => ({ deleted: true });
activosSvc.removeAll          = async () => 10;
activosSvc.bulkCreate         = async (list) => list;
activosSvc.bulkRemoveSelected = async (ids) => ids.length;
activosSvc.bulkUpdateCategory = async (ids, catId) => ids.length;
activosSvc.bulkUpdateStatus   = async (ids, status) => ids.length;
activosSvc.bulkUpdateZona     = async (ids, zonaId) => ids.length;
activosSvc.bulkUpdateTeam     = async (ids, teamId) => ids.length;

const app = require('./src/app');

// Generate JWT tokens for each role
const tokens = {
  admin:      jwt.sign({ sub: 1, nombre: 'Admin User', email: 'admin@entelso.com', rol: 'admin' }, env.JWT_SECRET),
  almacen:    jwt.sign({ sub: 2, nombre: 'Almacen User', email: 'almacen@entelso.com', rol: 'almacen' }, env.JWT_SECRET),
  supervisor: jwt.sign({ sub: 3, nombre: 'Supervisor User', email: 'supervisor@entelso.com', rol: 'supervisor' }, env.JWT_SECRET),
  trabajador: jwt.sign({ sub: 4, nombre: 'Trabajador User', email: 'trabajador@entelso.com', rol: 'trabajador' }, env.JWT_SECRET),
};

async function runTests() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  async function testReq(description, path, method, role, body, expectedStatus, expectedErrorCode, expectedErrorMessage) {
    const headers = { 'Content-Type': 'application/json' };
    if (role && tokens[role]) {
      headers['Authorization'] = `Bearer ${tokens[role]}`;
    }

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const statusOk = res.status === expectedStatus;
      let json = null;
      try {
        json = await res.json();
      } catch (e) {}

      let codeOk = true;
      let msgOk = true;

      if (expectedErrorCode) {
        codeOk = json && json.error && json.error.code === expectedErrorCode;
      }
      if (expectedErrorMessage) {
        msgOk = json && json.error && json.error.message === expectedErrorMessage;
      }

      if (statusOk && codeOk && msgOk) {
        passed++;
        console.log(`✅ [PASS] ${method} ${path} (${role || 'no-auth'}) -> ${res.status}`);
      } else {
        failed++;
        console.error(`❌ [FAIL] ${method} ${path} (${role || 'no-auth'}) -> Expected ${expectedStatus}, got ${res.status}. Body:`, json);
      }
    } catch (err) {
      failed++;
      console.error(`❌ [ERROR] ${method} ${path} (${role}):`, err.message);
    }
  }

  console.log('--- STARTING M2 SECURITY ROUTE TESTS ---\n');

  // 1. USUARIOS ENDPOINTS (admin only)
  const userRoles = ['admin', 'almacen', 'supervisor', 'trabajador'];
  for (const r of userRoles) {
    const expected = r === 'admin' ? 200 : 403;
    await testReq(`GET /api/usuarios`, '/api/usuarios', 'GET', r, null, expected);
    await testReq(`GET /api/usuarios/1`, '/api/usuarios/1', 'GET', r, null, expected);
    await testReq(`GET /api/usuarios/1/activos`, '/api/usuarios/1/activos', 'GET', r, null, expected);
    await testReq(`POST /api/usuarios`, '/api/usuarios', 'POST', r, {
      nombre: 'Nuevo User', email: 'nuevo@entelso.com', password: 'Password123!', rol: 'trabajador'
    }, r === 'admin' ? 201 : 403);
    await testReq(`PUT /api/usuarios/1`, '/api/usuarios/1', 'PUT', r, { nombre: 'Edit User' }, r === 'admin' ? 200 : 403);
    await testReq(`DELETE /api/usuarios/1`, '/api/usuarios/1', 'DELETE', r, null, r === 'admin' ? 200 : 403);
  }

  // 2. AUDIT ENDPOINTS
  for (const r of userRoles) {
    // GET /api/audit -> admin only
    await testReq(`GET /api/audit`, '/api/audit', 'GET', r, null, r === 'admin' ? 200 : 403);
    // POST /api/audit -> any authenticated user
    await testReq(`POST /api/audit`, '/api/audit', 'POST', r, { accion: 'TEST', modulo: 'SECURITY' }, 200);
  }

  // 3. ACTIVOS READ ENDPOINTS (all 4 roles allowed)
  for (const r of userRoles) {
    await testReq(`GET /api/activos`, '/api/activos', 'GET', r, null, 200);
    await testReq(`GET /api/activos/serial/SN123`, '/api/activos/serial/SN123', 'GET', r, null, 200);
    await testReq(`GET /api/activos/1`, '/api/activos/1', 'GET', r, null, 200);
  }

  // 4. ACTIVOS CREATE & DELETE (admin, almacen)
  for (const r of userRoles) {
    const isAllowed = ['admin', 'almacen'].includes(r);
    const expCreate = isAllowed ? 201 : 403;
    const expDelete = isAllowed ? 200 : 403;

    await testReq(`POST /api/activos`, '/api/activos', 'POST', r, {
      numero_serie: 'SN999', descripcion: 'Nuevo Activo', estado: 'disponible'
    }, expCreate);

    await testReq(`POST /api/activos/bulk`, '/api/activos/bulk', 'POST', r, {
      activos: [{ numero_serie: 'SN100', descripcion: 'Bulk 1' }]
    }, expCreate);

    await testReq(`DELETE /api/activos/1`, '/api/activos/1', 'DELETE', r, null, expDelete);
    await testReq(`POST /api/activos/bulk/delete`, '/api/activos/bulk/delete', 'POST', r, { ids: [1, 2] }, expDelete);
    await testReq(`POST /api/activos/bulk-delete`, '/api/activos/bulk-delete', 'POST', r, { ids: [1, 2] }, expDelete);
  }

  // 5. ACTIVOS BULK PATCH (admin, almacen, supervisor)
  for (const r of userRoles) {
    const isAllowed = ['admin', 'almacen', 'supervisor'].includes(r);
    const expStatus = isAllowed ? 200 : 403;

    await testReq(`PATCH /api/activos/bulk/status`, '/api/activos/bulk/status', 'PATCH', r, { ids: [1], status: 'en_mantenimiento' }, expStatus);
    await testReq(`PATCH /api/activos/bulk-status`, '/api/activos/bulk-status', 'PATCH', r, { ids: [1], status: 'en_mantenimiento' }, expStatus);
    await testReq(`PATCH /api/activos/bulk/zona`, '/api/activos/bulk/zona', 'PATCH', r, { ids: [1], zona_id: 2 }, expStatus);
    await testReq(`PATCH /api/activos/bulk-zona`, '/api/activos/bulk-zona', 'PATCH', r, { ids: [1], zona_id: 2 }, expStatus);
    await testReq(`PATCH /api/activos/bulk/team`, '/api/activos/bulk/team', 'PATCH', r, { ids: [1], team_id: 3 }, expStatus);
    await testReq(`PATCH /api/activos/bulk-team`, '/api/activos/bulk-team', 'PATCH', r, { ids: [1], team_id: 3 }, expStatus);
  }

  // 6. ACTIVOS SINGLE PATCH /api/activos/:id
  // Trabajador -> 403 Forbidden
  await testReq(`PATCH /api/activos/1 (trabajador)`, '/api/activos/1', 'PATCH', 'trabajador', { estado: 'en_mantenimiento' }, 403);

  // Supervisor with allowed status/reassignment fields -> 200 OK
  await testReq(`PATCH /api/activos/1 (supervisor allowed)`, '/api/activos/1', 'PATCH', 'supervisor', {
    estado: 'en_mantenimiento',
    observaciones: 'Falla en encendido'
  }, 200);

  // Supervisor with forbidden field (fecha_ultima_cali) -> 403 Forbidden with exact error message
  await testReq(
    `PATCH /api/activos/1 (supervisor forbidden field)`,
    '/api/activos/1',
    'PATCH',
    'supervisor',
    { fecha_ultima_cali: '2026-08-01' },
    403,
    'FORBIDDEN',
    'Supervisors are restricted to status and reassignment updates only.'
  );

  // Admin & Almacen with calibration date -> 200 OK
  await testReq(`PATCH /api/activos/1 (admin calibration date)`, '/api/activos/1', 'PATCH', 'admin', { fecha_ultima_cali: '2026-08-01' }, 200);
  await testReq(`PATCH /api/activos/1 (almacen calibration date)`, '/api/activos/1', 'PATCH', 'almacen', { fecha_ultima_cali: '2026-08-01' }, 200);

  console.log(`\n--- SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  server.close();
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
