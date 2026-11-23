'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startIsolatedEnv } = require('../harness/test_env');
const {
  PNG_1X1,
  httpJson,
  uploadMultipart,
  loginAdmin,
  createTestUser,
} = require('./_f9_f12_helpers');

describe('Tier 1 — F10: WhatsApp Bot Endpoints & Ingest', () => {
  let env;
  let adminToken;

  before(async () => {
    env = await startIsolatedEnv();
    const auth = await loginAdmin(env.apiUrl);
    adminToken = auth.token;
  });

  after(async () => {
    if (env) await env.close();
  });

  it('F10-T1-1: POST /api/whatsapp/consultar (formatted phone) and /consultar-kit (populated kit)', async () => {
    // Seeded Juan Pérez has '+584121234567'; formatted '412-123-4567' strips non-digits and matches '%4121234567'
    const consultRes = await httpJson(env.apiUrl, '/api/whatsapp/consultar', {
      method: 'POST',
      body: {
        telefono: '412-123-4567',
        numero_inventario: 'DW-20V-459-XT',
      },
    });
    assert.equal(consultRes.status, 200);
    assert.equal(consultRes.body.success, true);
    assert.equal(consultRes.body.data.inventario, 'DW-20V-459-XT');
    assert.equal(consultRes.body.data.asignado_a, 'Juan Pérez');

    // Create a parent kit + child asset and query /consultar-kit
    const parentRes = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Kit Fibra F10',
        categoria: 'Testing Equipment',
        numero_serie: 'KIT-F10-001',
        notas: 'Includes probe',
      },
    });
    assert.equal(parentRes.status, 201);
    const childRes = await httpJson(env.apiUrl, '/api/activos', {
      method: 'POST',
      token: adminToken,
      body: {
        descripcion: 'Child Probe F10',
        categoria: 'Testing Equipment',
        numero_serie: 'KIT-F10-CHILD-1',
      },
    });
    assert.equal(childRes.status, 201);

    const linkRes = await httpJson(env.apiUrl, `/api/activos/${childRes.body.data.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { parent_activo_id: parentRes.body.data.id },
    });
    assert.equal(linkRes.status, 200);

    const kitRes = await httpJson(env.apiUrl, '/api/whatsapp/consultar-kit', {
      method: 'POST',
      body: { numero_inventario: parentRes.body.data.numero_serie },
    });
    assert.equal(kitRes.status, 200);
    assert.equal(kitRes.body.data.notas, 'Includes probe');
    assert.equal(kitRes.body.data.contenido.length, 1);
    assert.equal(kitRes.body.data.contenido[0].numero_serie, childRes.body.data.numero_serie);
    assert.equal(childRes.body.data.original_serial, 'KIT-F10-CHILD-1');
  });

  it('F10-T1-2: POST /api/whatsapp/asignar without PIN sets en_uso, movimiento, and en_terreno for registered phone', async () => {
    const asignarRes = await httpJson(env.apiUrl, '/api/whatsapp/asignar', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'AE-KS-2024-001',
        zona: 'Field Site WA-1',
      },
    });
    assert.equal(asignarRes.status, 200);
    assert.equal(asignarRes.body.success, true);
    assert.equal(asignarRes.body.data.asignado_a, 'Juan Pérez');
    assert.equal(asignarRes.body.data.zona_actual, 'Field Site WA-1');

    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/AE-KS-2024-001', {
      token: adminToken,
    });
    assert.equal(assetRes.body.data.estado, 'en_uso');

    const movsRes = await httpJson(
      env.apiUrl,
      `/api/movimientos?numero_serie=AE-KS-2024-001&tipo_movimiento=despacho`,
      { token: adminToken }
    );
    assert.ok(movsRes.body.data.length >= 1);

    const usersRes = await httpJson(env.apiUrl, '/api/usuarios', { token: adminToken });
    const juan = usersRes.body.data.find((u) => u.telefono_whatsapp === '+584121234567');
    assert.equal(juan.en_terreno, true);
  });

  it('F10-T1-3: POST /api/whatsapp/mantenimiento without PIN creates En Proceso record and sets en_mantenimiento', async () => {
    const maintRes = await httpJson(env.apiUrl, '/api/whatsapp/mantenimiento', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'FLK-87V-9901',
        descripcion: 'Screen flickering in field',
      },
    });
    assert.equal(maintRes.status, 200);
    assert.equal(maintRes.body.success, true);
    assert.ok(maintRes.body.data.reporte_id);

    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/FLK-87V-9901', {
      token: adminToken,
    });
    assert.equal(assetRes.body.data.estado, 'en_mantenimiento');

    const listMaint = await httpJson(env.apiUrl, '/api/mantenimientos', { token: adminToken });
    assert.ok(
      listMaint.body.data.some(
        (m) => m.id === maintRes.body.data.reporte_id && m.estado === 'En Proceso'
      )
    );
  });

  it('F10-T1-4: POST /api/whatsapp/subir-foto works without PIN via BOTH JSON data URI and multipart/form-data', async () => {
    const dataUri = `data:image/png;base64,${PNG_1X1.toString('base64')}`;
    const jsonUpload = await httpJson(env.apiUrl, '/api/whatsapp/subir-foto', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'YOK-AQ7280-SA-01',
        base64_image: dataUri,
      },
    });
    assert.equal(jsonUpload.status, 200);
    assert.equal(jsonUpload.body.success, true);
    assert.ok(jsonUpload.body.data.url.startsWith(env.storageUrl));

    const form = new FormData();
    form.append('telefono', '+584121234567');
    form.append('numero_inventario', 'YOK-AQ7280-SA-01');
    form.append('foto', new Blob([PNG_1X1], { type: 'image/png' }), 'field-proof.png');

    const mpUpload = await uploadMultipart(env.apiUrl, '/api/whatsapp/subir-foto', form);
    assert.equal(mpUpload.status, 200);
    assert.equal(mpUpload.body.success, true);
    assert.ok(mpUpload.body.data.url.startsWith(env.storageUrl));

    const assetRes = await httpJson(env.apiUrl, '/api/activos/serial/YOK-AQ7280-SA-01', {
      token: adminToken,
    });
    assert.ok(Array.isArray(assetRes.body.data.fotos));
    assert.ok(assetRes.body.data.fotos.includes(jsonUpload.body.data.url));
    assert.ok(assetRes.body.data.fotos.includes(mpUpload.body.data.url));

    const mockReqRes = await httpJson(env.storageUrl, '/__mock__/requests');
    assert.equal(mockReqRes.status, 200);
    assert.ok(mockReqRes.body.objects.length >= 2);
  });

  it('F10-T1-5: POST /api/whatsapp/cambiar-estado and /devolver without PIN update state and return asset', async () => {
    const changeRes = await httpJson(env.apiUrl, '/api/whatsapp/cambiar-estado', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'DW-20V-459-XT',
        nuevo_estado: 'calibrado',
      },
    });
    assert.equal(changeRes.status, 200);
    assert.equal(changeRes.body.data.nuevo_estado, 'calibrado');

    const afterChange = await httpJson(env.apiUrl, '/api/activos/serial/DW-20V-459-XT', {
      token: adminToken,
    });
    assert.equal(afterChange.body.data.estado, 'calibrado');

    const returnRes = await httpJson(env.apiUrl, '/api/whatsapp/devolver', {
      method: 'POST',
      body: {
        telefono: '+584121234567',
        numero_inventario: 'DW-20V-459-XT',
      },
    });
    assert.equal(returnRes.status, 200);
    assert.equal(returnRes.body.success, true);

    const afterReturn = await httpJson(env.apiUrl, '/api/activos/serial/DW-20V-459-XT', {
      token: adminToken,
    });
    assert.equal(afterReturn.body.data.estado, 'disponible');
    assert.equal(afterReturn.body.data.usuario_actual_id, null);

    const movsRes = await httpJson(
      env.apiUrl,
      '/api/movimientos?numero_serie=DW-20V-459-XT&tipo_movimiento=devolucion',
      { token: adminToken }
    );
    assert.ok(movsRes.body.data.length >= 1);
  });

  it('F10-T1-6: POST /api/ingest/whatsapp creates/updates assets via x-api-key & x-ingest-secret and handles omitted zona', async () => {
    // 1. Unknown phone + unknown serial + x-api-key + omitted zona -> 'Unassigned'
    const newIngest = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-api-key': env.apiKey },
      body: {
        whatsapp_number: '+61412345999',
        parsed: {
          numero_inventario: 'ING-SERIAL-001',
          equipo: 'Ingest Test Meter',
          team: 'Networks',
          status: 'In Use',
        },
      },
    });
    assert.equal(newIngest.status, 201);
    assert.equal(newIngest.body.success, true);
    assert.equal(newIngest.body.data.estado, 'en_uso');
    assert.equal(newIngest.body.data.tipo_movimiento, 'ingreso');

    // Look up created asset by original_serial
    const allAssets = await httpJson(env.apiUrl, '/api/activos?search=ING-SERIAL-001', {
      token: adminToken,
    });
    const createdAsset = allAssets.body.data.find((a) => a.original_serial === 'ING-SERIAL-001');
    assert.ok(createdAsset, 'Ingest should create asset with original_serial');
    assert.equal(createdAsset.nombre_ubicacion, 'Unassigned');

    // 2. User with default_zona + x-ingest-secret + omitted zona updates existing asset via original_serial
    await createTestUser(env.apiUrl, adminToken, {
      nombre: 'Default Zone Tech',
      telefono_whatsapp: '+61488777666',
      rol: 'trabajador',
      default_zona: 'NSW',
      pin: '1234',
    });

    const updateIngest = await httpJson(env.apiUrl, '/api/ingest/whatsapp', {
      method: 'POST',
      headers: { 'x-ingest-secret': env.apiKey },
      body: {
        whatsapp_number: '+61488777666',
        parsed: {
          numero_inventario: 'ing-serial-001',
          equipo: 'Ingest Test Meter',
          status: 'Available',
        },
      },
    });
    assert.equal(updateIngest.status, 201);
    assert.equal(updateIngest.body.data.estado, 'disponible');
    assert.equal(updateIngest.body.data.tipo_movimiento, 'despacho');

    const updatedAsset = await httpJson(env.apiUrl, `/api/activos/${createdAsset.id}`, {
      token: adminToken,
    });
    assert.equal(updatedAsset.body.data.nombre_ubicacion, 'NSW');
  });
});
