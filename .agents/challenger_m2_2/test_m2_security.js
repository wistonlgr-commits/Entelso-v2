const path = require('path');
const backendDir = path.join(__dirname, '..', '..', 'backend');

// Add backend node_modules to module search paths
module.paths.push(path.join(backendDir, 'node_modules'));

// Load dotenv from backend/.env or set fallback env vars for testing
require('dotenv').config({ path: path.join(backendDir, '.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.API_KEY = process.env.API_KEY || 'test_api_key_1234567890';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_1234567890';

const jwt = require('jsonwebtoken');
const { z } = require('zod');
const env = require(path.join(backendDir, 'src/config/environment'));

console.log('=== EMPIRICAL CHALLENGER M2 SECURITY TEST SUITE ===');

// Check module loading first to diagnose syntax/runtime errors in code
let app;
let rawModuleLoadError = null;

try {
  // Test raw requiring to detect Worker M2 code bugs
  require(path.join(backendDir, 'src/modules/activos/activos.validation'));
} catch (err) {
  rawModuleLoadError = err;
}

if (rawModuleLoadError) {
  console.error('\nCRITICAL EMPIRICAL FINDING: Raw module loading failed due to runtime code error!');
  console.error('Error Details:', rawModuleLoadError.message);
  console.error('File: backend/src/modules/activos/activos.validation.js:36');
  console.error('Cause: .passthrough() was called on ZodEffects returned by .refine(), which is invalid in Zod.');
} else {
  console.log('Raw module loading: OK');
}

// In-memory mock fix for validation module cache so we can stress-test all permission routes
const valPath = require.resolve(path.join(backendDir, 'src/modules/activos/activos.validation'));
const estadoEnum = z.enum([
  'disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente',
  'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido'
]);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const noConflicto = (data) => !(data.usuario_actual_id && data.ubicacion_actual_id);
const conflictMsg  = { message: 'Cannot assign both user and location at the same time.', path: ['usuario_actual_id'] };

require.cache[valPath] = {
  id: valPath,
  filename: valPath,
  loaded: true,
  exports: {
    createAssetSchema: z.object({
      item_id: z.number().int().positive().optional().nullable(),
      descripcion: z.string().optional(),
      numero_serie: z.string().min(2).max(100),
      usuario_actual_id:   z.number().int().positive().nullable().optional(),
      ubicacion_actual_id: z.number().int().positive().nullable().optional(),
      team: z.string().nullable().optional(),
      fecha_registro:    fecha,
      fecha_ultima_cali: fecha, fecha_prox_cali: fecha,
      fecha_ultimo_tag:  fecha, fecha_prox_tag:  fecha,
      estado: estadoEnum.default('disponible'),
      fotos: z.array(z.string()).optional(),
    }).refine(noConflicto, conflictMsg),
    updateAssetSchema: z.object({
      usuario_actual_id:   z.number().int().positive().nullable().optional(),
      ubicacion_actual_id: z.number().int().positive().nullable().optional(),
      team: z.string().nullable().optional(),
      fecha_ultima_cali: fecha, fecha_prox_cali: fecha,
      fecha_ultimo_tag:  fecha, fecha_prox_tag:  fecha,
      estado: estadoEnum.optional(),
      fotos: z.array(z.string()).optional(),
      notas: z.string().nullable().optional(),
      observaciones: z.string().nullable().optional(),
    }).passthrough().refine(noConflicto, conflictMsg),
    bulkCreateAssetSchema: z.object({
      activos: z.array(z.object({
        numero_serie: z.string().min(2).max(100),
        descripcion: z.string().min(2),
        serie: z.string().optional(),
        zona: z.string().optional(),
        team: z.string().optional(),
        estado: z.string().optional(),
        fecha_ultima_cali: z.string().nullable().optional(),
        fecha_prox_cali:   z.string().nullable().optional(),
        fecha_ultimo_tag:  z.string().nullable().optional(),
        fecha_prox_tag:    z.string().nullable().optional(),
      })).min(1).max(500)
    })
  }
};

// Stub service methods to isolate route security logic from DB
const usuariosSvc = require(path.join(backendDir, 'src/modules/usuarios/usuarios.service'));
const auditSvc    = require(path.join(backendDir, 'src/modules/audit/audit.service'));
const activosSvc  = require(path.join(backendDir, 'src/modules/activos/activos.service'));

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

app = require(path.join(backendDir, 'src/app'));

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
        console.log(`✅ [PASS] ${description} | ${method} ${path} (${role || 'no-auth'}) -> ${res.status}`);
      } else {
        failed++;
        console.error(`❌ [FAIL] ${description} | ${method} ${path} (${role || 'no-auth'}) -> Expected ${expectedStatus}, got ${res.status}. Body:`, json);
      }
    } catch (err) {
      failed++;
      console.error(`❌ [ERROR] ${description} | ${method} ${path} (${role}):`, err.message);
    }
  }

  console.log('\n--- EXECUTING PERMISSION ROUTE TESTS ACROSS ALL 4 ROLES ---\n');

  const userRoles = ['admin', 'almacen', 'supervisor', 'trabajador'];

  // 1. /api/usuarios (Only admin)
  for (const r of userRoles) {
    const expected = r === 'admin' ? 200 : 403;
    await testReq('GET /api/usuarios', '/api/usuarios', 'GET', r, null, expected);
    await testReq('GET /api/usuarios/:id', '/api/usuarios/1', 'GET', r, null, expected);
    await testReq('GET /api/usuarios/:id/activos', '/api/usuarios/1/activos', 'GET', r, null, expected);
    await testReq('POST /api/usuarios', '/api/usuarios', 'POST', r, {
      nombre: 'Nuevo User', email: 'nuevo@entelso.com', password: 'Password123!', rol: 'trabajador'
    }, r === 'admin' ? 201 : 403);
    await testReq('PUT /api/usuarios/:id', '/api/usuarios/1', 'PUT', r, { nombre: 'Edit User' }, r === 'admin' ? 200 : 403);
    await testReq('DELETE /api/usuarios/:id', '/api/usuarios/1', 'DELETE', r, null, r === 'admin' ? 200 : 403);
    await testReq('DELETE /api/usuarios/bulk/others', '/api/usuarios/bulk/others', 'DELETE', r, null, r === 'admin' ? 200 : 403);
  }

  // Explicit verification: almacen receives 403 on GET /api/usuarios
  await testReq('EXPLICIT VERIFICATION: almacen receives 403 on GET /api/usuarios', '/api/usuarios', 'GET', 'almacen', null, 403);

  // 2. /api/audit (GET admin only, POST any auth user)
  for (const r of userRoles) {
    await testReq('GET /api/audit', '/api/audit', 'GET', r, null, r === 'admin' ? 200 : 403);
    await testReq('POST /api/audit', '/api/audit', 'POST', r, { accion: 'TEST', modulo: 'SECURITY' }, 200);
  }

  // 3. /api/activos READ endpoints (all 4 roles allowed)
  for (const r of userRoles) {
    await testReq('GET /api/activos', '/api/activos', 'GET', r, null, 200);
    await testReq('GET /api/activos/serial/:serial', '/api/activos/serial/SN123', 'GET', r, null, 200);
    await testReq('GET /api/activos/:id', '/api/activos/1', 'GET', r, null, 200);
  }

  // 4. /api/activos CREATE & DELETE (admin, almacen)
  for (const r of userRoles) {
    const isAllowed = ['admin', 'almacen'].includes(r);
    const expCreate = isAllowed ? 201 : 403;
    const expDelete = isAllowed ? 200 : 403;

    await testReq('POST /api/activos', '/api/activos', 'POST', r, {
      numero_serie: 'SN999', descripcion: 'Nuevo Activo', estado: 'disponible'
    }, expCreate);

    await testReq('POST /api/activos/bulk', '/api/activos/bulk', 'POST', r, {
      activos: [{ numero_serie: 'SN100', descripcion: 'Bulk 1' }]
    }, expCreate);

    await testReq('DELETE /api/activos/:id', '/api/activos/1', 'DELETE', r, null, expDelete);
    await testReq('POST /api/activos/bulk/delete', '/api/activos/bulk/delete', 'POST', r, { ids: [1, 2] }, expDelete);
    await testReq('POST /api/activos/bulk-delete', '/api/activos/bulk-delete', 'POST', r, { ids: [1, 2] }, expDelete);
  }

  // Explicit verification: trabajador receives 403 on POST /api/activos
  await testReq('EXPLICIT VERIFICATION: trabajador receives 403 on POST /api/activos', '/api/activos', 'POST', 'trabajador', {
    numero_serie: 'SN999', descripcion: 'Nuevo Activo', estado: 'disponible'
  }, 403);

  // 5. /api/activos BULK DELETE ALL (admin only)
  for (const r of userRoles) {
    await testReq('DELETE /api/activos/bulk/all', '/api/activos/bulk/all', 'DELETE', r, null, r === 'admin' ? 200 : 403);
  }

  // 6. /api/activos BULK CATEGORY PATCH (admin, almacen)
  for (const r of userRoles) {
    const isAllowed = ['admin', 'almacen'].includes(r);
    await testReq('PATCH /api/activos/bulk/category', '/api/activos/bulk/category', 'PATCH', r, { ids: [1], item_id: 2 }, isAllowed ? 200 : 403);
  }

  // 7. /api/activos BULK PATCH status, zona, team (admin, almacen, supervisor)
  for (const r of userRoles) {
    const isAllowed = ['admin', 'almacen', 'supervisor'].includes(r);
    const expStatus = isAllowed ? 200 : 403;

    await testReq('PATCH /api/activos/bulk/status', '/api/activos/bulk/status', 'PATCH', r, { ids: [1], status: 'en_mantenimiento' }, expStatus);
    await testReq('PATCH /api/activos/bulk-status', '/api/activos/bulk-status', 'PATCH', r, { ids: [1], status: 'en_mantenimiento' }, expStatus);
    await testReq('PATCH /api/activos/bulk/zona', '/api/activos/bulk/zona', 'PATCH', r, { ids: [1], zona_id: 2 }, expStatus);
    await testReq('PATCH /api/activos/bulk-zona', '/api/activos/bulk-zona', 'PATCH', r, { ids: [1], zona_id: 2 }, expStatus);
    await testReq('PATCH /api/activos/bulk/team', '/api/activos/bulk/team', 'PATCH', r, { ids: [1], team_id: 3 }, expStatus);
    await testReq('PATCH /api/activos/bulk-team', '/api/activos/bulk-team', 'PATCH', r, { ids: [1], team_id: 3 }, expStatus);
  }

  // 8. /api/activos SINGLE PATCH /api/activos/:id
  await testReq('PATCH /api/activos/:id (trabajador)', '/api/activos/1', 'PATCH', 'trabajador', { estado: 'en_mantenimiento' }, 403);

  await testReq('PATCH /api/activos/:id (supervisor allowed status/notes)', '/api/activos/1', 'PATCH', 'supervisor', {
    estado: 'en_mantenimiento',
    observaciones: 'Falla en encendido'
  }, 200);

  await testReq(
    'PATCH /api/activos/:id (supervisor forbidden calibration date)',
    '/api/activos/1',
    'PATCH',
    'supervisor',
    { fecha_ultima_cali: '2026-08-01' },
    403,
    'FORBIDDEN',
    'Supervisors are restricted to status and reassignment updates only.'
  );

  await testReq('PATCH /api/activos/:id (admin allowed calibration date)', '/api/activos/1', 'PATCH', 'admin', { fecha_ultima_cali: '2026-08-01' }, 200);
  await testReq('PATCH /api/activos/:id (almacen allowed calibration date)', '/api/activos/1', 'PATCH', 'almacen', { fecha_ultima_cali: '2026-08-01' }, 200);

  console.log(`\n--- PERMISSION ROUTE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  server.close();
  if (rawModuleLoadError || failed > 0) {
    console.error('\nSUITE OVERALL RESULT: FAILED due to unhandled raw code error in backend/src/modules/activos/activos.validation.js!');
    process.exit(1);
  }
}

runTests();
