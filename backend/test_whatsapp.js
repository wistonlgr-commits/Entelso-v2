const API_URL = 'http://localhost:3000/api/whatsapp';

const testCases = [
  { name: 'Juan (Transmission)', tel: '+584121234567', pin: '1234', eq: 'AE-KS-2024-001', badPin: '0000' },
  { name: 'Maria (Energy)', tel: '+584127654321', pin: '1234', eq: 'FLK-87V-9901', badPin: '1111' },
  { name: 'Pedro (Calibration)', tel: '+584129876543', pin: '1234', eq: 'TEK-TBS1104-007', badPin: '1234' },
  { name: 'Ana (Networks)', tel: '+584120001111', pin: '1234', eq: 'YOK-AQ7280-SA-01', badPin: '9999' },
  { name: 'Supervisor NSW', tel: '+614001112222', pin: '1234', eq: 'DW-20V-459-XT', badPin: '8888' },
];

async function api(path, payload) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function runTests() {
  console.log('--- STARTING WHATSAPP AGENT SIMULATION TESTS ---');
  let passed = 0;
  let failed = 0;

  for (const user of testCases) {
    console.log(`\nTesting User: ${user.name} (${user.tel})`);

    // 1. Consultar (Success)
    console.log(' -> Consultar equipo...');
    const c1 = await api('/consultar', { telefono: user.tel, numero_inventario: user.eq });
    if (c1.success) { console.log('    [PASS] Consultar:', c1.data.equipo); passed++; }
    else { console.error('    [FAIL] Consultar:', c1); failed++; }

    // 2. Asignar (Fail with bad PIN)
    console.log(' -> Asignar con mal PIN...');
    const a1 = await api('/asignar', { telefono: user.tel, pin: user.badPin, numero_inventario: user.eq, zona: 'NSW' });
    if (!a1.success && a1.message.includes('PIN')) { console.log('    [PASS] Rechazado por PIN'); passed++; }
    else { console.error('    [FAIL] No rechazó:', a1); failed++; }

    // 3. Asignar (Success)
    console.log(' -> Asignar correcto...');
    const a2 = await api('/asignar', { telefono: user.tel, pin: user.pin, numero_inventario: user.eq, zona: 'NSW' });
    if (a2.success) { console.log('    [PASS] Asignado exitosamente'); passed++; }
    else { console.error('    [FAIL] Asignación falló:', a2); failed++; }

    // 4. Reportar Mantenimiento (Success)
    console.log(' -> Reportar mantenimiento...');
    const m1 = await api('/mantenimiento', { telefono: user.tel, pin: user.pin, numero_inventario: user.eq, descripcion: 'Pantalla rota probando n8n' });
    if (m1.success) { console.log('    [PASS] Reportado exitosamente'); passed++; }
    else { console.error('    [FAIL] Reporte falló:', m1); failed++; }

    // 5. Asignar (Fail because it is in maintenance)
    console.log(' -> Asignar equipo dañado...');
    const a3 = await api('/asignar', { telefono: user.tel, pin: user.pin, numero_inventario: user.eq, zona: 'NSW' });
    if (!a3.success && a3.message.includes('en_mantenimiento')) { console.log('    [PASS] Bloqueó asignar equipo dañado'); passed++; }
    else { console.error('    [FAIL] Dejó asignar equipo dañado:', a3); failed++; }
  }

  console.log(`\n--- TEST COMPLETE ---`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
}

runTests();
