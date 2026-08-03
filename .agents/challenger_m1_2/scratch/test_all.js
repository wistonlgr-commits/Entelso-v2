const fs = require('fs');
const path = require('path');
const bcrypt = require(path.resolve(__dirname, '../../../backend/node_modules/bcrypt'));

// Import middleware
const authMiddlewarePath = path.resolve(__dirname, '../../../backend/src/common/middleware/auth.middleware.js');
const authMiddleware = require(authMiddlewarePath);
const { requireRoles, requireAdmin, requireAuth, requireApiKey } = authMiddleware;

const results = {
  authTests: [],
  sqlTests: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function recordTest(category, name, passed, details = '') {
  results.summary.total++;
  if (passed) results.summary.passed++;
  else results.summary.failed++;
  results[category].push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${category}] ${name}${details ? ' - ' + details : ''}`);
}

// Helper mock response object
function createMockReply() {
  let statusCode = null;
  let jsonBody = null;
  const reply = {
    status(code) {
      statusCode = code;
      return reply;
    },
    json(body) {
      jsonBody = body;
      return reply;
    },
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody
  };
  return reply;
}

// -------------------------------------------------------------
// 1. AUTH / RBAC MIDDLEWARE TESTS
// -------------------------------------------------------------

console.log('--- RUNNING AUTH / RBAC MIDDLEWARE TESTS ---');

const rolesList = ['admin', 'almacen', 'supervisor', 'trabajador'];

// Test 1.1: Single role requirement for each role
rolesList.forEach(requiredRole => {
  const middleware = requireRoles(requiredRole);
  rolesList.forEach(userRole => {
    let nextCalled = false;
    const req = { user: { rol: userRole } };
    const reply = createMockReply();
    const next = () => { nextCalled = true; };

    middleware(req, reply, next);

    const expectedAllowed = (userRole === requiredRole);
    if (expectedAllowed) {
      const pass = nextCalled && reply.getStatusCode() === null;
      recordTest('authTests', `Single role requireRoles('${requiredRole}') with user '${userRole}'`, pass, pass ? 'Next called' : 'Failed to call next or sent response');
    } else {
      const pass = !nextCalled && reply.getStatusCode() === 403 && reply.getJsonBody()?.error?.code === 'FORBIDDEN';
      recordTest('authTests', `Single role requireRoles('${requiredRole}') with user '${userRole}'`, pass, pass ? '403 FORBIDDEN returned' : `Status: ${reply.getStatusCode()}, Body: ${JSON.stringify(reply.getJsonBody())}`);
    }
  });
});

// Test 1.2: Variadic role configurations
const variadicConfigs = [
  { config: ['admin', 'almacen'], allowed: ['admin', 'almacen'], denied: ['supervisor', 'trabajador'] },
  { config: ['admin', 'almacen', 'supervisor'], allowed: ['admin', 'almacen', 'supervisor'], denied: ['trabajador'] },
  { config: ['almacen', 'supervisor'], allowed: ['almacen', 'supervisor'], denied: ['admin', 'trabajador'] },
  { config: ['trabajador'], allowed: ['trabajador'], denied: ['admin', 'almacen', 'supervisor'] }
];

variadicConfigs.forEach(({ config, allowed, denied }) => {
  const middleware = requireRoles(...config);
  
  allowed.forEach(role => {
    let nextCalled = false;
    const req = { user: { rol: role } };
    const reply = createMockReply();
    middleware(req, reply, () => { nextCalled = true; });
    const pass = nextCalled && reply.getStatusCode() === null;
    recordTest('authTests', `Variadic requireRoles(${config.map(c=>`'${c}'`).join(', ')}) allows '${role}'`, pass);
  });

  denied.forEach(role => {
    let nextCalled = false;
    const req = { user: { rol: role } };
    const reply = createMockReply();
    middleware(req, reply, () => { nextCalled = true; });
    const pass = !nextCalled && reply.getStatusCode() === 403;
    recordTest('authTests', `Variadic requireRoles(${config.map(c=>`'${c}'`).join(', ')}) denies '${role}'`, pass);
  });
});

// Test 1.3: Array role configurations
const arrayConfigs = [
  { config: [['admin', 'almacen']], allowed: ['admin', 'almacen'], denied: ['supervisor', 'trabajador'] },
  { config: [['admin', 'almacen', 'supervisor', 'trabajador']], allowed: ['admin', 'almacen', 'supervisor', 'trabajador'], denied: [] },
  { config: [['supervisor', 'trabajador']], allowed: ['supervisor', 'trabajador'], denied: ['admin', 'almacen'] }
];

arrayConfigs.forEach(({ config, allowed, denied }) => {
  const middleware = requireRoles(...config);
  
  allowed.forEach(role => {
    let nextCalled = false;
    const req = { user: { rol: role } };
    const reply = createMockReply();
    middleware(req, reply, () => { nextCalled = true; });
    const pass = nextCalled && reply.getStatusCode() === null;
    recordTest('authTests', `Array requireRoles([${config[0].map(c=>`'${c}'`).join(', ')}]) allows '${role}'`, pass);
  });

  denied.forEach(role => {
    let nextCalled = false;
    const req = { user: { rol: role } };
    const reply = createMockReply();
    middleware(req, reply, () => { nextCalled = true; });
    const pass = !nextCalled && reply.getStatusCode() === 403;
    recordTest('authTests', `Array requireRoles([${config[0].map(c=>`'${c}'`).join(', ')}]) denies '${role}'`, pass);
  });
});

// Test 1.4: Mixed parameters (Array + strings)
{
  const middleware = requireRoles(['admin', 'almacen'], 'supervisor');
  ['admin', 'almacen', 'supervisor'].forEach(role => {
    let nextCalled = false;
    const reply = createMockReply();
    middleware({ user: { rol: role } }, reply, () => { nextCalled = true; });
    recordTest('authTests', `Mixed requireRoles(['admin', 'almacen'], 'supervisor') allows '${role}'`, nextCalled && reply.getStatusCode() === null);
  });
  let nextCalled = false;
  const reply = createMockReply();
  middleware({ user: { rol: 'trabajador' } }, reply, () => { nextCalled = true; });
  recordTest('authTests', `Mixed requireRoles(['admin', 'almacen'], 'supervisor') denies 'trabajador'`, !nextCalled && reply.getStatusCode() === 403);
}

// Test 1.5: Edge Cases (missing req.user, invalid role, null role, undefined role)
{
  const middleware = requireRoles('admin', 'almacen');
  
  // No user property
  let reply = createMockReply();
  let nextCalled = false;
  middleware({}, reply, () => { nextCalled = true; });
  recordTest('authTests', `Edge case: missing req.user returns 403`, !nextCalled && reply.getStatusCode() === 403);

  // req.user is null
  reply = createMockReply();
  nextCalled = false;
  middleware({ user: null }, reply, () => { nextCalled = true; });
  recordTest('authTests', `Edge case: req.user === null returns 403`, !nextCalled && reply.getStatusCode() === 403);

  // req.user.rol is null
  reply = createMockReply();
  nextCalled = false;
  middleware({ user: { rol: null } }, reply, () => { nextCalled = true; });
  recordTest('authTests', `Edge case: req.user.rol === null returns 403`, !nextCalled && reply.getStatusCode() === 403);

  // req.user.rol is invalid role 'unauthorized_role'
  reply = createMockReply();
  nextCalled = false;
  middleware({ user: { rol: 'unauthorized_role' } }, reply, () => { nextCalled = true; });
  recordTest('authTests', `Edge case: invalid user role returns 403`, !nextCalled && reply.getStatusCode() === 403);

  // empty requireRoles()
  const emptyMiddleware = requireRoles();
  reply = createMockReply();
  nextCalled = false;
  emptyMiddleware({ user: { rol: 'admin' } }, reply, () => { nextCalled = true; });
  recordTest('authTests', `Edge case: empty requireRoles() denies all`, !nextCalled && reply.getStatusCode() === 403);
}

// Test 1.6: Response Body Structure Verification
{
  const middleware = requireRoles('admin');
  const reply = createMockReply();
  middleware({ user: { rol: 'trabajador' } }, reply, () => {});
  const body = reply.getJsonBody();
  const validStructure = reply.getStatusCode() === 403 &&
    body.success === false &&
    body.error.code === 'FORBIDDEN' &&
    body.error.message === 'Access denied. Required role not met.' &&
    typeof body.timestamp === 'string';
  recordTest('authTests', `Response body structure matches spec`, validStructure, JSON.stringify(body));
}


// -------------------------------------------------------------
// 2. INIT.SQL SYNTAX & SEED DATA VALIDATION
// -------------------------------------------------------------

console.log('\n--- RUNNING INIT.SQL SYNTAX & SEED DATA VALIDATION ---');

const initSqlPath = path.resolve(__dirname, '../../../init.sql');
const initSql = fs.readFileSync(initSqlPath, 'utf8');

// Test 2.1: File exists and non-empty
recordTest('sqlTests', 'init.sql file read successfully', initSql.length > 0, `Length: ${initSql.length} bytes`);

// Test 2.2: Extract INSERT INTO usuarios statement
const userInsertMatch = initSql.match(/INSERT INTO usuarios\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);/i);
recordTest('sqlTests', 'usuarios INSERT statement exists in init.sql', !!userInsertMatch);

if (userInsertMatch) {
  const columns = userInsertMatch[1].split(',').map(c => c.trim().toLowerCase());
  const valuesBlob = userInsertMatch[2];

  // Parse values rows: e.g. ('Carlos Admin', '+584121000001', 'admin@entelso.com', 'admin', NULL, '$2b$10$...')
  const rowMatches = [...valuesBlob.matchAll(/\(([^)]+)\)/g)];
  
  recordTest('sqlTests', `Extracted ${rowMatches.length} seed user rows`, rowMatches.length >= 8, `Found ${rowMatches.length} rows`);

  const seedUsers = [];
  rowMatches.forEach((m, idx) => {
    // Basic CSV-like split handling single quotes and NULLs
    const rawValues = m[1].split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/).map(v => v.trim());
    const userObj = {};
    columns.forEach((col, cIdx) => {
      let val = rawValues[cIdx];
      if (val === 'NULL' || val === 'null') val = null;
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      userObj[col] = val;
    });
    seedUsers.push(userObj);
  });

  // Verify all 4 required roles are present in seed users
  const presentRoles = new Set(seedUsers.map(u => u.rol));
  rolesList.forEach(role => {
    const hasRole = presentRoles.has(role);
    const count = seedUsers.filter(u => u.rol === role).length;
    recordTest('sqlTests', `Seed users contain role '${role}'`, hasRole, `Count: ${count}`);
  });

  // Verify specific required users
  const adminUser = seedUsers.find(u => u.email === 'admin@entelso.com');
  recordTest('sqlTests', 'Seed user admin@entelso.com exists with role admin', adminUser && adminUser.rol === 'admin');

  const almacenUser = seedUsers.find(u => u.email === 'almacen@entelso.com');
  recordTest('sqlTests', 'Seed user almacen@entelso.com exists with role almacen', almacenUser && almacenUser.rol === 'almacen');

  // Check unique constraints on email & whatsapp
  const emails = seedUsers.map(u => u.email).filter(Boolean);
  const uniqueEmails = new Set(emails);
  recordTest('sqlTests', 'All non-null seed user emails are unique', emails.length === uniqueEmails.size, `Total: ${emails.length}, Unique: ${uniqueEmails.size}`);

  const whatsapps = seedUsers.map(u => u.telefono_whatsapp).filter(Boolean);
  const uniqueWhatsapps = new Set(whatsapps);
  recordTest('sqlTests', 'All non-null seed user phone numbers are unique', whatsapps.length === uniqueWhatsapps.size, `Total: ${whatsapps.length}, Unique: ${uniqueWhatsapps.size}`);

  // Test bcrypt pin_hash validity across seed users
  seedUsers.forEach(u => {
    if (u.pin_hash) {
      const match1234 = bcrypt.compareSync('1234', u.pin_hash);
      const match123456 = bcrypt.compareSync('123456', u.pin_hash);
      const isValid = match1234 || match123456;
      recordTest('sqlTests', `Bcrypt hash for user '${u.nombre}' is valid`, isValid, match1234 ? 'Matches 1234' : match123456 ? 'Matches 123456' : 'Invalid hash');
    }
  });
}

// Test 2.3: ENUM and Table check in SQL
const enumMatches = initSql.match(/CREATE TYPE (\w+) AS ENUM\s*\(([^)]+)\);/gi) || [];
recordTest('sqlTests', 'Found CREATE TYPE ENUM statements', enumMatches.length >= 3, `Count: ${enumMatches.length}`);

// Check estado_activo_enum contains all expected values
const estadoEnumMatch = initSql.match(/CREATE TYPE estado_activo_enum AS ENUM\s*\(([^)]+)\);/i);
if (estadoEnumMatch) {
  const values = estadoEnumMatch[1].replace(/'|\s/g, '').split(',');
  const expectedEstados = ['disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente', 'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido'];
  const allMatch = expectedEstados.every(e => values.includes(e));
  recordTest('sqlTests', 'estado_activo_enum contains all required values', allMatch, `Values: ${values.join(', ')}`);
}

// Save detailed results to JSON
const outputPath = path.resolve(__dirname, '../test_results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\nTest results written to ${outputPath}`);
console.log(`SUMMARY: Total: ${results.summary.total}, Passed: ${results.summary.passed}, Failed: ${results.summary.failed}`);
