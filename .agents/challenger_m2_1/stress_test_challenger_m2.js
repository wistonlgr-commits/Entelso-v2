const path = require('path');

// Target backend directory
const backendDir = path.resolve(__dirname, '../../backend');
const jwt = require(path.join(backendDir, 'node_modules/jsonwebtoken'));
const env = require(path.join(backendDir, 'src/config/environment'));

// Mock services so HTTP route testing can run standalone without PostgreSQL
const usuariosSvc = require(path.join(backendDir, 'src/modules/usuarios/usuarios.service'));
const auditSvc    = require(path.join(backendDir, 'src/modules/audit/audit.service'));
const activosSvc  = require(path.join(backendDir, 'src/modules/activos/activos.service'));

usuariosSvc.getAll          = async () => [{ id: 1, nombre: 'Test User', email: 'test@entelso.com', rol: 'trabajador' }];
usuariosSvc.getById         = async (id) => ({ id: Number(id), nombre: 'Test User', rol: 'trabajador' });
usuariosSvc.getAssets       = async (id) => [];
usuariosSvc.create          = async (data) => ({ id: 2, ...data });
usuariosSvc.update          = async (id, data) => ({ id: Number(id), ...data });
usuariosSvc.remove          = async (id) => ({ id: Number(id) });
usuariosSvc.removeAllOthers  = async () => 0;

auditSvc.getLogs   = async () => [{ id: 1, usuario_id: 1, accion: 'LOGIN' }];
auditSvc.createLog = async (data) => ({ id: 1, ...data });

activosSvc.getAll             = async () => [{ id: 1, numero_serie: 'SN123', estado: 'disponible' }];
activosSvc.getById            = async (id) => ({ id: Number(id), numero_serie: 'SN123', marca: 'Fluke', modelo: '87V' });
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

const app = require(path.join(backendDir, 'src/app'));

// Generate test JWT tokens
const tokens = {
  admin:      jwt.sign({ sub: 1, nombre: 'Admin User', email: 'admin@entelso.com', rol: 'admin' }, env.JWT_SECRET),
  almacen:    jwt.sign({ sub: 2, nombre: 'Almacen User', email: 'almacen@entelso.com', rol: 'almacen' }, env.JWT_SECRET),
  supervisor: jwt.sign({ sub: 3, nombre: 'Supervisor User', email: 'supervisor@entelso.com', rol: 'supervisor' }, env.JWT_SECRET),
  trabajador: jwt.sign({ sub: 4, nombre: 'Trabajador User', email: 'trabajador@entelso.com', rol: 'trabajador' }, env.JWT_SECRET),
  unknown:    jwt.sign({ sub: 5, nombre: 'Unknown Role', email: 'guest@entelso.com', rol: 'invitado' }, env.JWT_SECRET),
  empty_role: jwt.sign({ sub: 6, nombre: 'No Role', email: 'norole@entelso.com' }, env.JWT_SECRET),
};

async function runChallengerTests() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function testReq(testCase, path, method, roleOrToken, body, expectedStatus, expectedErrorCode) {
    const headers = { 'Content-Type': 'application/json' };
    
    if (roleOrToken) {
      if (tokens[roleOrToken]) {
        headers['Authorization'] = `Bearer ${tokens[roleOrToken]}`;
      } else {
        headers['Authorization'] = roleOrToken; // raw string like "Bearer bad_token" or "Basic xyz"
      }
    }

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const statusOk = res.status === expectedStatus;
      let json = null;
      try {
        json = await res.json();
      } catch (e) {}

      let codeOk = true;
      if (expectedErrorCode) {
        codeOk = json && json.error && json.error.code === expectedErrorCode;
      }

      if (statusOk && codeOk) {
        passed++;
        console.log(`✅ PASS: [${testCase}] ${method} ${path} -> ${res.status}`);
      } else {
        failed++;
        const errDetail = `Expected ${expectedStatus} (code: ${expectedErrorCode || 'N/A'}), got ${res.status} with body ${JSON.stringify(json)}`;
        failures.push({ testCase, method, path, roleOrToken, errDetail });
        console.error(`❌ FAIL: [${testCase}] ${method} ${path} -> ${errDetail}`);
      }
    } catch (err) {
      failed++;
      failures.push({ testCase, method, path, roleOrToken, errDetail: err.message });
      console.error(`❌ ERROR: [${testCase}] ${method} ${path}: ${err.message}`);
    }
  }

  console.log('====================================================');
  console.log(' EMPIRICAL CHALLENGER STRESS SUITE (M2 SECURITY)');
  console.log('====================================================\n');

  // --- SECTION 1: SUPERVISOR FIELD MANIPULATION ON PATCH /api/activos/:id ---
  console.log('--- TEST SECTION 1: SUPERVISOR FIELD MANIPULATION RESTRICTIONS ---');

  const supervisorForbiddenFields = [
    { numero_serie: 'HACKED-SN-001' },
    { marca: 'HackedBrand' },
    { modelo: 'HackedModel' },
    { fecha_ultima_cali: '2026-08-01' },
    { fecha_proxima_cali: '2027-08-01' },
    { nombre: 'Renamed Asset' },
    { descripcion: 'Altered Description' },
    { precio: 99999 },
    { proveedor: 'Malicious Vendor' },
    { estado: 'en_mantenimiento', numero_serie: 'SN-OVERWRITE' },
    { observaciones: 'Legit comment', fecha_ultima_cali: '2026-08-01' },
  ];

  for (const fieldPayload of supervisorForbiddenFields) {
    const keyName = Object.keys(fieldPayload).join('+');
    await testReq(
      `Supervisor forbidden patch field (${keyName})`,
      '/api/activos/1',
      'PATCH',
      'supervisor',
      fieldPayload,
      403,
      'FORBIDDEN'
    );
  }

  const supervisorAllowedFields = [
    { estado: 'en_mantenimiento' },
    { observaciones: 'Requiere calibración anual' },
    { notas: 'Nota interna' },
    { usuario_actual_id: 5 },
    { ubicacion_actual_id: 10 },
    { team: 'Equipo Alpha' },
    { estado: 'operativo', observaciones: 'Verificado', usuario_actual_id: 3, ubicacion_actual_id: 2, team: 'Team B', notas: 'Todo OK' }
  ];

  for (const fieldPayload of supervisorAllowedFields) {
    const keyName = Object.keys(fieldPayload).join('+');
    await testReq(
      `Supervisor allowed patch field (${keyName})`,
      '/api/activos/1',
      'PATCH',
      'supervisor',
      fieldPayload,
      200
    );
  }

  // Verify Admin & Almacen CAN update restricted fields like numero_serie or fecha_ultima_cali
  await testReq('Admin update restricted fields (numero_serie & fecha_ultima_cali)', '/api/activos/1', 'PATCH', 'admin', { numero_serie: 'SN-NEW-ADMIN', fecha_ultima_cali: '2026-08-01' }, 200);
  await testReq('Almacen update restricted fields (marca & modelo)', '/api/activos/1', 'PATCH', 'almacen', { marca: 'Tektronix', modelo: 'TBS1052B' }, 200);

  // --- SECTION 2: 4-ROLE RBAC ENFORCEMENT ON /api/usuarios ---
  console.log('\n--- TEST SECTION 2: 4-ROLE MATRIX ON /api/usuarios ---');
  const allRoles = ['admin', 'almacen', 'supervisor', 'trabajador', 'unknown', 'empty_role'];
  const usuariosEndpoints = [
    { method: 'GET', path: '/api/usuarios', body: null },
    { method: 'GET', path: '/api/usuarios/1', body: null },
    { method: 'GET', path: '/api/usuarios/1/activos', body: null },
    { method: 'POST', path: '/api/usuarios', body: { nombre: 'New User', email: 'new@entelso.com', password: 'Password123!', rol: 'trabajador' }, successStatus: 201 },
    { method: 'PUT', path: '/api/usuarios/1', body: { nombre: 'Updated Name' } },
    { method: 'DELETE', path: '/api/usuarios/1', body: null },
    { method: 'DELETE', path: '/api/usuarios/bulk/others', body: null },
  ];

  for (const ep of usuariosEndpoints) {
    for (const role of allRoles) {
      const isAllowed = role === 'admin';
      const expectedStat = isAllowed ? (ep.successStatus || 200) : 403;
      await testReq(`Usuarios ${ep.method} ${ep.path} [${role}]`, ep.path, ep.method, role, ep.body, expectedStat, isAllowed ? null : 'FORBIDDEN');
    }
  }

  // --- SECTION 3: 4-ROLE RBAC ENFORCEMENT ON /api/audit ---
  console.log('\n--- TEST SECTION 3: 4-ROLE MATRIX ON /api/audit ---');
  for (const role of allRoles) {
    const isGetAllowed = role === 'admin';
    await testReq(`Audit GET /api/audit [${role}]`, '/api/audit', 'GET', role, null, isGetAllowed ? 200 : 403, isGetAllowed ? null : 'FORBIDDEN');
    // POST /api/audit is allowed for any authenticated user
    const isPostAllowed = ['admin', 'almacen', 'supervisor', 'trabajador', 'unknown', 'empty_role'].includes(role);
    await testReq(`Audit POST /api/audit [${role}]`, '/api/audit', 'POST', role, { accion: 'STRESS_TEST', modulo: 'SECURITY' }, 200);
  }

  // --- SECTION 4: 4-ROLE RBAC ENFORCEMENT ON /api/activos ---
  console.log('\n--- TEST SECTION 4: 4-ROLE MATRIX ON /api/activos ---');
  // Read routes (allowed for all 4 standard roles)
  for (const role of ['admin', 'almacen', 'supervisor', 'trabajador']) {
    await testReq(`Activos GET /api/activos [${role}]`, '/api/activos', 'GET', role, null, 200);
    await testReq(`Activos GET /api/activos/1 [${role}]`, '/api/activos/1', 'GET', role, null, 200);
    await testReq(`Activos GET /api/activos/serial/SN123 [${role}]`, '/api/activos/serial/SN123', 'GET', role, null, 200);
  }

  // Write/Delete routes (admin, almacen)
  for (const role of allRoles) {
    const isWriteAllowed = ['admin', 'almacen'].includes(role);
    await testReq(`Activos POST /api/activos [${role}]`, '/api/activos', 'POST', role, { numero_serie: 'SN-TEST-1', descripcion: 'Test Asset' }, isWriteAllowed ? 201 : 403);
    await testReq(`Activos POST /api/activos/bulk [${role}]`, '/api/activos/bulk', 'POST', role, { activos: [{ numero_serie: 'SN-TEST-2' }] }, isWriteAllowed ? 201 : 403);
    await testReq(`Activos DELETE /api/activos/1 [${role}]`, '/api/activos/1', 'DELETE', role, null, isWriteAllowed ? 200 : 403);
    await testReq(`Activos POST /api/activos/bulk/delete [${role}]`, '/api/activos/bulk/delete', 'POST', role, { ids: [1, 2] }, isWriteAllowed ? 200 : 403);
  }

  // Bulk patch status, zona, team (admin, almacen, supervisor)
  for (const role of allRoles) {
    const isBulkAllowed = ['admin', 'almacen', 'supervisor'].includes(role);
    await testReq(`Activos PATCH /api/activos/bulk/status [${role}]`, '/api/activos/bulk/status', 'PATCH', role, { ids: [1], status: 'en_mantenimiento' }, isBulkAllowed ? 200 : 403);
    await testReq(`Activos PATCH /api/activos/bulk/zona [${role}]`, '/api/activos/bulk/zona', 'PATCH', role, { ids: [1], zona_id: 5 }, isBulkAllowed ? 200 : 403);
    await testReq(`Activos PATCH /api/activos/bulk/team [${role}]`, '/api/activos/bulk/team', 'PATCH', role, { ids: [1], team_id: 3 }, isBulkAllowed ? 200 : 403);
  }

  // --- SECTION 5: UNAUTHENTICATED AND MALFORMED TOKEN BOUNDARY TESTS ---
  console.log('\n--- TEST SECTION 5: AUTHENTICATION BOUNDARY TESTS ---');
  await testReq('No auth header on /api/usuarios', '/api/usuarios', 'GET', null, null, 401, 'UNAUTHORIZED');
  await testReq('No auth header on /api/audit', '/api/audit', 'GET', null, null, 401, 'UNAUTHORIZED');
  await testReq('No auth header on /api/activos', '/api/activos', 'GET', null, null, 401, 'UNAUTHORIZED');
  await testReq('Invalid Bearer token', '/api/activos', 'GET', 'Bearer invalid_token_123', null, 401, 'INVALID_TOKEN');
  await testReq('Malformed Auth header (Basic scheme)', '/api/activos', 'GET', 'Basic dXNlcjpwYXNz', null, 401, 'UNAUTHORIZED');

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  server.close();

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  }
}

runChallengerTests();
