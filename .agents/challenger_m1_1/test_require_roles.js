process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/entelso';
process.env.API_KEY = process.env.API_KEY || '1234567890123456';
process.env.JWT_SECRET = process.env.JWT_SECRET || '1234567890123456';

const assert = require('assert');
const { requireRoles, requireAdmin, requireAuth, requireApiKey } = require('../../backend/src/common/middleware/auth.middleware');

function createMockReqReply(reqObj = {}) {
  let statusCode = null;
  let jsonBody = null;
  let nextCalled = false;

  const req = reqObj;
  const reply = {
    status(code) {
      statusCode = code;
      return reply;
    },
    json(body) {
      jsonBody = body;
      return reply;
    }
  };
  const next = () => {
    nextCalled = true;
  };

  return { req, reply, next, getResult: () => ({ statusCode, jsonBody, nextCalled }) };
}

console.log("=== STARTING RBAC STRESS TESTS FOR requireRoles ===");

const testCases = [
  // 1. Standard Authorized Access
  {
    name: "Standard single role match (admin)",
    factory: ['admin'],
    user: { rol: 'admin' },
    expectedNext: true,
    expectedStatus: null
  },
  {
    name: "Standard multi role match (almacen)",
    factory: ['admin', 'almacen'],
    user: { rol: 'almacen' },
    expectedNext: true,
    expectedStatus: null
  },
  {
    name: "Array argument match",
    factory: [['admin', 'almacen']],
    user: { rol: 'almacen' },
    expectedNext: true,
    expectedStatus: null
  },
  {
    name: "Multiple array arguments match",
    factory: [['admin'], ['supervisor']],
    user: { rol: 'supervisor' },
    expectedNext: true,
    expectedStatus: null
  },

  // 2. Standard Unauthorized Rejection (403)
  {
    name: "Unauthorized role (trabajador for admin route)",
    factory: ['admin'],
    user: { rol: 'trabajador' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Unauthorized role (supervisor for almacen route)",
    factory: ['almacen'],
    user: { rol: 'supervisor' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Unauthorized role (almacen for admin route)",
    factory: ['admin'],
    user: { rol: 'almacen' },
    expectedNext: false,
    expectedStatus: 403
  },

  // 3. Missing or Null/Undefined req.user
  {
    name: "req.user is undefined",
    factory: ['admin'],
    user: undefined,
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user is null",
    factory: ['admin'],
    user: null,
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user is false",
    factory: ['admin'],
    user: false,
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user is true",
    factory: ['admin'],
    user: true,
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user is number 0",
    factory: ['admin'],
    user: 0,
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user is string 'admin'",
    factory: ['admin'],
    user: 'admin',
    expectedNext: false,
    expectedStatus: 403
  },

  // 4. Missing or Invalid req.user.rol
  {
    name: "req.user is empty object {} (missing rol)",
    factory: ['admin', 'almacen'],
    user: {},
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is null",
    factory: ['admin'],
    user: { rol: null },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is undefined explicitly",
    factory: ['admin'],
    user: { rol: undefined },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is number 123",
    factory: ['admin'],
    user: { rol: 123 },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is boolean true",
    factory: ['admin'],
    user: { rol: true },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is array ['admin']",
    factory: ['admin'],
    user: { rol: ['admin'] },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "req.user.rol is object { admin: true }",
    factory: ['admin'],
    user: { rol: { admin: true } },
    expectedNext: false,
    expectedStatus: 403
  },

  // 5. Invalid Role Strings & Boundary Case Inputs
  {
    name: "Uppercase role 'ADMIN'",
    factory: ['admin'],
    user: { rol: 'ADMIN' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Whitespace prefixed ' admin'",
    factory: ['admin'],
    user: { rol: ' admin' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Whitespace suffixed 'admin '",
    factory: ['admin'],
    user: { rol: 'admin ' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Newline suffixed 'admin\\n'",
    factory: ['admin'],
    user: { rol: 'admin\n' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Null byte suffixed 'admin\\0'",
    factory: ['admin'],
    user: { rol: 'admin\0' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "SQL injection payload 'admin\\' OR \\'1\\'=\\'1'",
    factory: ['admin'],
    user: { rol: "admin' OR '1'='1" },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Partial substring 'adm'",
    factory: ['admin'],
    user: { rol: 'adm' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Extended string 'administrator'",
    factory: ['admin'],
    user: { rol: 'administrator' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Unknown role 'superadmin'",
    factory: ['admin', 'almacen', 'supervisor', 'trabajador'],
    user: { rol: 'superadmin' },
    expectedNext: false,
    expectedStatus: 403
  },

  // 6. Prototype Properties & Object Attacks
  {
    name: "Prototype property 'toString'",
    factory: ['admin'],
    user: { rol: 'toString' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Prototype property '__proto__'",
    factory: ['admin'],
    user: { rol: '__proto__' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Prototype property 'constructor'",
    factory: ['admin'],
    user: { rol: 'constructor' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Object with custom toString method returning 'admin'",
    factory: ['admin'],
    user: { rol: { toString: () => 'admin' } },
    expectedNext: false,
    expectedStatus: 403
  },

  // 7. Factory Parameter Edge Cases (Misconfiguration / Undefined Args)
  {
    name: "Empty factory args requireRoles() with valid user",
    factory: [],
    user: { rol: 'admin' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Empty array in factory requireRoles([]) with valid user",
    factory: [[]],
    user: { rol: 'admin' },
    expectedNext: false,
    expectedStatus: 403
  },
  {
    name: "Undefined arg in factory requireRoles(undefined) with user without rol",
    factory: [undefined],
    user: {}, // req.user.rol is undefined
    expectedNext: false, // CRITICAL CHECKS: Does this bypass?
    expectedStatus: 403
  },
  {
    name: "Null arg in factory requireRoles(null) with user rol null",
    factory: [null],
    user: { rol: null },
    expectedNext: false, // CRITICAL CHECKS: Does this bypass?
    expectedStatus: 403
  },
  {
    name: "Undefined arg in factory requireRoles(undefined) with user rol 'admin'",
    factory: [undefined],
    user: { rol: 'admin' },
    expectedNext: false,
    expectedStatus: 403
  }
];

let passedCount = 0;
let failedCount = 0;
const results = [];

for (const tc of testCases) {
  try {
    const middleware = requireRoles(...tc.factory);
    const { req, reply, next, getResult } = createMockReqReply(tc.user !== undefined ? { user: tc.user } : {});
    
    // Call middleware
    middleware(req, reply, next);
    
    const res = getResult();
    const passNext = res.nextCalled === tc.expectedNext;
    const passStatus = tc.expectedStatus === null ? res.statusCode === null : res.statusCode === tc.expectedStatus;
    
    const passed = passNext && passStatus;
    
    if (passed) {
      passedCount++;
      results.push({ name: tc.name, status: 'PASS', details: res });
    } else {
      failedCount++;
      results.push({
        name: tc.name,
        status: 'FAIL',
        details: res,
        expected: { nextCalled: tc.expectedNext, statusCode: tc.expectedStatus }
      });
      console.error(`❌ TEST FAILED: ${tc.name}`);
      console.error(`   Expected: nextCalled=${tc.expectedNext}, status=${tc.expectedStatus}`);
      console.error(`   Actual:   nextCalled=${res.nextCalled}, status=${res.statusCode}`);
      console.error(`   Response Body:`, res.jsonBody);
    }
  } catch (err) {
    failedCount++;
    results.push({ name: tc.name, status: 'ERROR', error: err.message, stack: err.stack });
    console.error(`💥 EXCEPTION IN TEST: ${tc.name}`);
    console.error(err);
  }
}

console.log("\n=== TEST SUMMARY ===");
console.log(`Total tests: ${testCases.length}`);
console.log(`Passed: ${passedCount}`);
console.log(`Failed: ${failedCount}`);

if (failedCount > 0) {
  process.exitCode = 1;
}
