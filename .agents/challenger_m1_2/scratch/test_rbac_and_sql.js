const fs = require('fs');
const path = require('path');
const bcrypt = require(path.resolve(__dirname, '../../../backend/node_modules/bcrypt'));

// Import middleware
const authMiddlewarePath = path.resolve(__dirname, '../../../backend/src/common/middleware/auth.middleware.js');
const { requireRoles } = require(authMiddlewarePath);

console.log('================================================================');
console.log('CHALLENGER M1_2 EMPIRICAL TEST HARNESS');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`✓ PASS: ${message}`);
  } else {
    failCount++;
    console.error(`✗ FAIL: ${message}`);
  }
}

function mockReply() {
  let status = null;
  let body = null;
  return {
    status(s) { status = s; return this; },
    json(b) { body = b; return this; },
    getStatus: () => status,
    getBody: () => body
  };
}

// -------------------------------------------------------------
// 1. RBAC MIDDLEWARE MATRIX TESTS (4 ROLES)
// -------------------------------------------------------------
console.log('--- 1. Testing Auth/RBAC Middleware (`requireRoles`) ---');

const roles = ['admin', 'almacen', 'supervisor', 'trabajador'];

// Matrix test: Single role restrictions
roles.forEach(targetRole => {
  const mw = requireRoles(targetRole);
  roles.forEach(userRole => {
    let calledNext = false;
    const reply = mockReply();
    mw({ user: { rol: userRole } }, reply, () => { calledNext = true; });

    if (userRole === targetRole) {
      assert(calledNext && reply.getStatus() === null, `requireRoles('${targetRole}') allows user role '${userRole}'`);
    } else {
      assert(!calledNext && reply.getStatus() === 403 && reply.getBody()?.error?.code === 'FORBIDDEN', `requireRoles('${targetRole}') blocks user role '${userRole}' with 403 FORBIDDEN`);
    }
  });
});

// Multi-role tests (variadic & array)
const mwAdminAlmacenVar = requireRoles('admin', 'almacen');
const mwAdminAlmacenArr = requireRoles(['admin', 'almacen']);

['admin', 'almacen'].forEach(r => {
  let n1 = false, n2 = false;
  mwAdminAlmacenVar({ user: { rol: r } }, mockReply(), () => { n1 = true; });
  mwAdminAlmacenArr({ user: { rol: r } }, mockReply(), () => { n2 = true; });
  assert(n1, `requireRoles('admin', 'almacen') allows '${r}'`);
  assert(n2, `requireRoles(['admin', 'almacen']) allows '${r}'`);
});

['supervisor', 'trabajador'].forEach(r => {
  const rep1 = mockReply(), rep2 = mockReply();
  mwAdminAlmacenVar({ user: { rol: r } }, rep1, () => {});
  mwAdminAlmacenArr({ user: { rol: r } }, rep2, () => {});
  assert(rep1.getStatus() === 403, `requireRoles('admin', 'almacen') denies '${r}'`);
  assert(rep2.getStatus() === 403, `requireRoles(['admin', 'almacen']) denies '${r}'`);
});

// Edge cases
const mwSingle = requireRoles('admin');
const repNoUser = mockReply();
mwSingle({}, repNoUser, () => {});
assert(repNoUser.getStatus() === 403, 'requireRoles denies request with no req.user');

const repNullRole = mockReply();
mwSingle({ user: { rol: null } }, repNullRole, () => {});
assert(repNullRole.getStatus() === 403, 'requireRoles denies request with null user.rol');

const repUnknownRole = mockReply();
mwSingle({ user: { rol: 'unknown_role' } }, repUnknownRole, () => {});
assert(repUnknownRole.getStatus() === 403, 'requireRoles denies request with invalid role string');

// Response payload structure check
const repErr = mockReply();
mwSingle({ user: { rol: 'trabajador' } }, repErr, () => {});
const errBody = repErr.getBody();
assert(
  repErr.getStatus() === 403 &&
  errBody.success === false &&
  errBody.error?.code === 'FORBIDDEN' &&
  errBody.error?.message === 'Access denied. Required role not met.' &&
  typeof errBody.timestamp === 'string',
  'Response payload matches apiResponse.error spec'
);

// -------------------------------------------------------------
// 2. INIT.SQL SEED DATA & SYNTAX VALIDATION
// -------------------------------------------------------------
console.log('\n--- 2. Validating `init.sql` Seed Data & Syntax ---');

const sqlPath = path.resolve(__dirname, '../../../init.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

assert(sqlContent.includes('CREATE TABLE usuarios'), '`init.sql` contains CREATE TABLE usuarios');
assert(sqlContent.includes('CREATE TYPE estado_activo_enum'), '`init.sql` contains CREATE TYPE estado_activo_enum');

// Extract usuarios INSERT statement
const match = sqlContent.match(/INSERT INTO usuarios\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);/i);
assert(!!match, 'Found INSERT INTO usuarios statement');

if (match) {
  const rows = [...match[2].matchAll(/\(([^)]+)\)/g)];
  assert(rows.length >= 8, `Found ${rows.length} seed user rows in init.sql`);

  // Extract columns
  const cols = match[1].split(',').map(c => c.trim().toLowerCase());
  const roleIdx = cols.indexOf('rol');
  const emailIdx = cols.indexOf('email');
  const hashIdx = cols.indexOf('pin_hash');
  const nameIdx = cols.indexOf('nombre');

  const users = rows.map(r => {
    const vals = r[1].split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/).map(v => {
      v = v.trim();
      if (v === 'NULL' || v === 'null') return null;
      if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
      return v;
    });
    return {
      nombre: vals[nameIdx],
      email: vals[emailIdx],
      rol: vals[roleIdx],
      pin_hash: vals[hashIdx]
    };
  });

  const rolesFound = new Set(users.map(u => u.rol));
  roles.forEach(r => {
    assert(rolesFound.has(r), `Seed user with role '${r}' exists in init.sql`);
  });

  const almacenUser = users.find(u => u.rol === 'almacen');
  assert(almacenUser && almacenUser.email === 'almacen@entelso.com', 'Roberto Almacén (almacen@entelso.com) exists with role almacen');

  // EMPIRICAL TEST: Verify bcrypt pin_hash matching '1234'
  console.log('\n--- Testing bcrypt password hash verification for seed users ---');
  let validHashes = 0;
  users.forEach(u => {
    const isMatch1234 = bcrypt.compareSync('1234', u.pin_hash);
    const isMatch123456 = bcrypt.compareSync('123456', u.pin_hash);
    if (isMatch1234 || isMatch123456) validHashes++;
    else {
      console.error(`  [BROKEN HASH] User '${u.nombre}' (${u.email || 'No email'}) hash '${u.pin_hash}' fails bcrypt compare for '1234' and '123456'`);
    }
  });

  assert(validHashes === users.length, `All ${users.length} seed users have valid bcrypt pin_hash values matching '1234' or '123456' (Found ${validHashes}/${users.length} valid)`);
}

console.log('\n================================================================');
console.log(`TEST SUMMARY: Passed: ${passCount}, Failed: ${failCount}`);
console.log('================================================================');
