const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

console.log("=== FORENSIC INTEGRITY AUDIT — MILESTONE 1 ===");

const authPath = path.join(__dirname, '../../backend/src/common/middleware/auth.middleware.js');
const initSqlPath = path.join(__dirname, '../../init.sql');

// Phase 1: File Existence & Basic Structure
console.log("\n--- Checking File Existence ---");
console.log("auth.middleware.js exists:", fs.existsSync(authPath));
console.log("init.sql exists:", fs.existsSync(initSqlPath));

const authContent = fs.readFileSync(authPath, 'utf8');
const initSqlContent = fs.readFileSync(initSqlPath, 'utf8');

// Phase 2: requireRoles Middleware Verification
console.log("\n--- Auditing backend/src/common/middleware/auth.middleware.js ---");
const { requireRoles, requireAdmin, requireAuth, requireApiKey } = require(authPath);

// Check 1: Hardcoded test bypass detection in source code
const suspiciousBypassRegex = /x-test-bypass|override|master_key|skipAuth|bypassRole|process\.env\.NODE_ENV\s*===\s*['"]test['"]/i;
const hasBypass = suspiciousBypassRegex.test(authContent);
console.log("[CHECK 1] Hardcoded bypass regex search in auth.middleware.js:", hasBypass ? "FAIL (bypass detected)" : "PASS (no bypass found)");

// Check 2: requireRoles exported correctly
console.log("[CHECK 2] requireRoles is function:", typeof requireRoles === 'function');

// Check 3: Behavioral testing of requireRoles
let testsPassed = 0;
let testsTotal = 0;

function mockReqReplyNext(userObj) {
  let statusCode = null;
  let jsonBody = null;
  let nextCalled = false;

  const req = { user: userObj };
  const reply = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    }
  };
  const next = () => {
    nextCalled = true;
  };

  return { req, reply, next, getResult: () => ({ statusCode, jsonBody, nextCalled }) };
}

function runTestCase(name, middleware, userObj, expectedNext, expectedStatus = null) {
  testsTotal++;
  const { req, reply, next, getResult } = mockReqReplyNext(userObj);
  middleware(req, reply, next);
  const res = getResult();

  const passNext = res.nextCalled === expectedNext;
  const passStatus = expectedStatus === null || res.statusCode === expectedStatus;

  if (passNext && passStatus) {
    testsPassed++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    console.log(`  ❌ [FAIL] ${name} -> Expected next=${expectedNext}, status=${expectedStatus}; Got next=${res.nextCalled}, status=${res.statusCode}`);
  }
}

// Test cases for requireRoles
const adminAlmacenMW = requireRoles('admin', 'almacen');
runTestCase("User with 'admin' allowed by requireRoles('admin', 'almacen')", adminAlmacenMW, { rol: 'admin' }, true);
runTestCase("User with 'almacen' allowed by requireRoles('admin', 'almacen')", adminAlmacenMW, { rol: 'almacen' }, true);
runTestCase("User with 'trabajador' blocked by requireRoles('admin', 'almacen')", adminAlmacenMW, { rol: 'trabajador' }, false, 403);
runTestCase("User with 'supervisor' blocked by requireRoles('admin', 'almacen')", adminAlmacenMW, { rol: 'supervisor' }, false, 403);

const arrayMW = requireRoles(['admin', 'supervisor']);
runTestCase("User with 'supervisor' allowed by requireRoles(['admin', 'supervisor'])", arrayMW, { rol: 'supervisor' }, true);
runTestCase("User with 'almacen' blocked by requireRoles(['admin', 'supervisor'])", arrayMW, { rol: 'almacen' }, false, 403);

runTestCase("Missing req.user returns 403", adminAlmacenMW, undefined, false, 403);
runTestCase("Missing req.user.rol returns 403", adminAlmacenMW, {}, false, 403);
runTestCase("Non-string req.user.rol (number) returns 403", adminAlmacenMW, { rol: 123 }, false, 403);
runTestCase("Null req.user.rol returns 403", adminAlmacenMW, { rol: null }, false, 403);

// Factory edge case check: requireRoles(undefined) or requireRoles(null)
const emptyMW = requireRoles(undefined, null);
runTestCase("Empty/invalid factory args requireRoles(undefined, null) blocks admin", emptyMW, { rol: 'admin' }, false, 403);
runTestCase("Empty/invalid factory args requireRoles(undefined, null) blocks user without rol", emptyMW, {}, false, 403);

console.log(`Behavioral Test Results: ${testsPassed}/${testsTotal} passed.`);

// Phase 3: init.sql Schema & Seed Data Verification
console.log("\n--- Auditing init.sql ---");

// Check 1: CHECK constraint for roles in init.sql
const checkConstraintRegex = /CHECK\s*\(\s*rol\s+IN\s*\(\s*'admin'\s*,\s*'almacen'\s*,\s*'supervisor'\s*,\s*'trabajador'\s*\)\s*\)/i;
const hasCheckConstraint = checkConstraintRegex.test(initSqlContent);
console.log("[CHECK 1] CHECK constraint in init.sql for 4 roles:", hasCheckConstraint ? "PASS" : "FAIL");

// Check 2: 4 Roles presence in init.sql
const rolesInInitSql = ['admin', 'almacen', 'supervisor', 'trabajador'].every(role => initSqlContent.includes(`'${role}'`));
console.log("[CHECK 2] All 4 roles present in init.sql:", rolesInInitSql ? "PASS" : "FAIL");

// Check 3: Seed users verification in init.sql
const seedUsersRegex = /INSERT INTO usuarios [^;]+;/i;
const seedMatch = initSqlContent.match(seedUsersRegex);
console.log("[CHECK 3] Seed users INSERT statement found:", !!seedMatch);

// Check 4: Seed user PIN hash verification (PIN '1234' against bcrypt hash)
const bcryptHashRegex = /\$2b\$10\$[A-Za-z0-9./]{53}/g;
const hashesFound = initSqlContent.match(bcryptHashRegex) || [];
console.log(`[CHECK 4] Found ${hashesFound.length} bcrypt hashes in init.sql.`);

let hashesValid = hashesFound.length > 0;
for (const hash of hashesFound) {
  const match = bcrypt.compareSync('1234', hash);
  if (!match) {
    hashesValid = false;
    console.log(`  ❌ Hash failed comparison with PIN '1234': ${hash}`);
  }
}
console.log("[CHECK 4 Result] All seed hashes match PIN '1234':", hashesValid ? "PASS" : "FAIL");

// Summary Verdict Determination
console.log("\n--- SUMMARY VERDICT ---");
const allPass = !hasBypass && 
                (typeof requireRoles === 'function') && 
                (testsPassed === testsTotal) && 
                hasCheckConstraint && 
                rolesInInitSql && 
                hashesValid;

console.log("FINAL INTEGRITY VERDICT:", allPass ? "CLEAN" : "INTEGRITY VIOLATION");
