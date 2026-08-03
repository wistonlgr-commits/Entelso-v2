#!/usr/bin/env node
/**
 * import_inventory.js - Importación masiva del inventario Entelso a Supabase
 * 
 * Lee TODOS los archivos Excel de las carpetas Inventory, Inventory2 y Calibration,
 * normaliza los datos, elimina duplicados, y los sube directamente a Supabase PostgreSQL.
 *
 * Usa la misma lógica de bulkCreate() del backend (upsert por numero_serie).
 *
 * Usage:
 *   node import_inventory.js --dry-run    # Preview sin insertar (guarda import_preview.json)
 *   node import_inventory.js              # Importación real a Supabase
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// ==================== CONFIGURATION ====================
const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(__dirname, '..');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==================== HELPERS ====================

/** Convert Excel serial date number or string date to YYYY-MM-DD */
function parseDate(val) {
  if (!val || val === '' || val === '-' || val === '—') return null;

  // Excel numeric serial date
  if (typeof val === 'number' && val > 10000) {
    const d = new Date((val - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'n/a') return null;

  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    let y = dmy[3]; if (y.length === 2) y = '20' + y;
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // "Sept-20", "Jan-25" style
  const mym = s.match(/^([a-z]{3,9})-(\d{2})$/i);
  if (mym) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12' };
    const m = months[mym[1].toLowerCase()] || '01';
    return `20${mym[2]}-${m}-01`;
  }

  // Last resort: try Date constructor
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

/** Normalize status string to valid DB enum */
function normalizeStatus(raw) {
  if (!raw) return 'disponible';
  const s = raw.toLowerCase().trim();
  const map = {
    'good': 'disponible', 'available': 'disponible', 'disponible': 'disponible',
    'fair': 'disponible', 'in use': 'en_uso', 'en_uso': 'en_uso', 'en uso': 'en_uso',
    'maintenance': 'en_mantenimiento', 'en_mantenimiento': 'en_mantenimiento',
    'under maintenance': 'en_mantenimiento', 'sent to repair': 'en_mantenimiento',
    'damaged': 'danado', 'danado': 'danado', 'broken': 'danado', 'poor': 'danado',
    'out of service': 'fuera_de_servicio', 'fuera_de_servicio': 'fuera_de_servicio',
    'calibration pending': 'calibracion_pendiente', 'calibracion_pendiente': 'calibracion_pendiente',
    'calibrated': 'calibrado', 'calibrado': 'calibrado',
    'en_funcionamiento': 'en_funcionamiento', 'unknown': 'desconocido', 'desconocido': 'desconocido',
  };
  return map[s] || 'disponible';
}

/** Read an Excel file safely, returning null if file not found */
function readExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Archivo no encontrado: ${filePath}`);
    return null;
  }
  return XLSX.readFile(filePath, { type: 'binary', cellDates: false });
}

/** Normalize zone names to consistent format */
function normalizeZone(zone) {
  if (!zone) return null;
  const z = zone.trim();
  const map = {
    'melbourne': 'VIC', 'melbourne, vic': 'VIC', 'vic': 'VIC',
    'sydney': 'NSW', 'sydney, nsw': 'NSW', 'nsw': 'NSW',
    'brisbane': 'QLD', 'brisbane, qld': 'QLD', 'qld': 'QLD',
    'adelaide': 'SA', 'adelaide, sa': 'SA', 'sa': 'SA',
    'perth': 'WA', 'perth, wa': 'WA', 'wa': 'WA',
    'tas': 'TAS', 'tasmania': 'TAS',
    'nt': 'NT', 'northern territory': 'NT',
    'atc': 'ATC', 'act': 'ATC',
    'usa': 'USA',
  };
  return map[z.toLowerCase()] || z;
}

/** Clean and trim a serial number */
function cleanSerial(serial) {
  if (!serial) return null;
  return String(serial).trim().replace(/[\r\n]+/g, '');
}

// Auto-serial counter
let autoSerialCounters = {};
function generateSerial(prefix) {
  if (!autoSerialCounters[prefix]) autoSerialCounters[prefix] = 0;
  autoSerialCounters[prefix]++;
  return `${prefix}-${String(autoSerialCounters[prefix]).padStart(3, '0')}`;
}

// ==================== PART A: EQUIPMENT REGISTER ====================

function parseEquipmentRegister() {
  console.log('\n📋 Parsing: Equipment Register.xlsx');
  const wb = readExcel(path.join(ROOT, 'Equipment Register.xlsx'));
  if (!wb) return [];

  const sheet = wb.Sheets['Equipment Register'];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const assets = [];

  for (const row of rows) {
    const serial = cleanSerial(row['Serial Number']) || cleanSerial(row['Asset ID']);
    if (!serial) continue;

    const desc = (row['Description'] || '').trim().replace(/[\r\n]+/g, ' ');
    const brand = (row['Brand / Model'] || '').trim().replace(/[\r\n]+/g, ' ');
    const equipo = brand ? `${desc} - ${brand}` : desc;
    if (!equipo) continue;

    assets.push({
      numero_serie: serial,
      descripcion: equipo,
      zona: 'Almacén Central',
      team: null,
      estado: normalizeStatus(row['Condition']),
      fecha_ultima_cali: parseDate(row['Last Inspection/\r\nCalibration'] || row['Last Inspection/Calibration']),
      fecha_prox_cali: parseDate(row['Next Due']),
      fecha_ultimo_tag: parseDate(row['DOM']),
      fecha_prox_tag: parseDate(row['Expiry']),
      source: 'Equipment Register',
    });
  }

  console.log(`   ✅ ${assets.length} activos encontrados`);
  return assets;
}

// ==================== PART A: EQUIPMENT CALIBRATION 2026 ====================

function parseEquipmentCalibration() {
  console.log('\n📋 Parsing: Equipment Calibration 2026.xlsx');
  const wb = readExcel(path.join(ROOT, 'Inventory', 'Equipment Calibration 2026.xlsx'));
  if (!wb) return [];

  const assets = [];
  const sheetNames = ['Levelling', 'PIM Test', 'Sweep testers', 'Walk test Scanners'];

  for (const sheetName of sheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (const row of rows) {
      const equipo = (row['Equipment'] || '').trim().replace(/[\r\n]+/g, ' ');
      const sn = cleanSerial(row['SN']);

      // Skip header-like rows and rows without serial numbers
      if (!sn || !equipo) continue;
      if (equipo.toUpperCase().includes('NSW') && !sn) continue;
      if (equipo.toUpperCase().includes('VIC') && !sn) continue;
      if (/^(Levelling|PIM Testers|SWEEP TEST)\s+(NSW|VIC|QLD|SA|WA)$/i.test(equipo)) continue;

      const location = (row['Location'] || '').trim();
      const calDate = parseDate(row['Calibration date '] || row['Calibration date']);

      assets.push({
        numero_serie: sn,
        descripcion: equipo,
        zona: normalizeZone(location) || null,
        team: 'Calibration',
        estado: 'disponible',
        fecha_ultima_cali: calDate,
        fecha_prox_cali: null,
        fecha_ultimo_tag: null,
        fecha_prox_tag: null,
        source: `Equipment Calibration 2026 - ${sheetName}`,
      });
    }
  }

  console.log(`   ✅ ${assets.length} activos encontrados`);
  return assets;
}

// ==================== PART B: INVENTORY 2025 (PRIMARY) ====================

function parseInventorySheets() {
  console.log('\n📋 Parsing: INVENTORY 2025.xlsx (primary) + INVENTORY 2024.xlsx (complement)');

  const assets = [];
  const files = [
    { path: path.join(ROOT, 'Inventory', 'INVENTORY 2025.xlsx'), label: 'INV 2025', priority: 2 },
    { path: path.join(ROOT, 'Inventory', 'INVENTORY 2024.xlsx'), label: 'INV 2024', priority: 1 },
  ];

  for (const file of files) {
    const wb = readExcel(file.path);
    if (!wb) continue;

    // ─── SCANNERS ───
    const scannerSheet = wb.Sheets['SCANNERS'];
    if (scannerSheet) {
      const rawRows = XLSX.utils.sheet_to_json(scannerSheet, { header: 1, defval: '' });
      // Find header row (State, Serial, Calibration Date, ...)
      let headerIdx = -1;
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i].map(c => String(c).trim().toLowerCase());
        if (row.includes('state') && row.includes('serial')) { headerIdx = i; break; }
      }
      if (headerIdx >= 0) {
        const headers = rawRows[headerIdx].map(h => String(h).trim());
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          const state = String(row[0] || '').trim();
          const serial = cleanSerial(row[1]);
          if (!serial || !state) continue;

          assets.push({
            numero_serie: serial,
            descripcion: 'PCTEL IBFlex Scanner',
            zona: normalizeZone(state),
            team: 'Walk Test',
            estado: 'disponible',
            fecha_ultima_cali: parseDate(row[2]),
            fecha_prox_cali: null,
            fecha_ultimo_tag: null,
            fecha_prox_tag: null,
            source: `${file.label} - SCANNERS`,
            _priority: file.priority,
          });
        }
      }
    }

    // ─── WT Kit Laptop (Cross-tab: pivot rows × columns) ───
    const wtSheet = wb.Sheets['WT Kit Laptop'];
    if (wtSheet) {
      const rawRows = XLSX.utils.sheet_to_json(wtSheet, { header: 1, defval: '' });
      // Find the region header row: "", Brisbane QLD, Melbourne VIC, etc.
      let regionIdx = -1;
      const regions = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i].map(c => String(c).trim());
        if (row.some(c => c.includes('Brisbane') || c.includes('QLD')) && row.some(c => c.includes('Melbourne') || c.includes('VIC'))) {
          regionIdx = i;
          for (let j = 1; j < row.length; j++) regions.push(row[j]);
          break;
        }
      }

      if (regionIdx >= 0) {
        // Rows after region header contain: Equipment Type | value per region
        for (let i = regionIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i].map(c => String(c).trim());
          const itemType = row[0];
          if (!itemType) continue;

          // Only process rows that have serial-like data
          if (itemType.toUpperCase().includes('SERIAL') || itemType.toUpperCase().includes('LAPTOP')) {
            for (let j = 1; j < row.length && j - 1 < regions.length; j++) {
              const val = row[j];
              if (!val) continue;
              const region = regions[j - 1];
              const zone = normalizeZone(region);
              const equipType = itemType.replace(/\s*SERIAL\s*/i, '').trim() || 'WT Kit Equipment';

              // Serial rows contain the actual serial
              if (itemType.toUpperCase().includes('SERIAL')) {
                assets.push({
                  numero_serie: cleanSerial(val),
                  descripcion: `${equipType} (Walk Test Kit)`,
                  zona: zone,
                  team: 'Walk Test',
                  estado: 'disponible',
                  fecha_ultima_cali: null, fecha_prox_cali: null,
                  fecha_ultimo_tag: null, fecha_prox_tag: null,
                  source: `${file.label} - WT Kit`,
                  _priority: file.priority,
                });
              }
            }
          }
        }
      }
    }

    // ─── PHONES ───
    const phoneSheet = wb.Sheets['PHONES'];
    if (phoneSheet) {
      const rawRows = XLSX.utils.sheet_to_json(phoneSheet, { header: 1, defval: '' });
      for (const row of rawRows) {
        const model = String(row[2] || '').trim();
        const serial = cleanSerial(row[3]);
        const state = String(row[0] || '').trim();

        // Skip header rows and rows without serial
        if (!serial || model.toLowerCase() === 'model' || model.toLowerCase() === 'serial') continue;

        assets.push({
          numero_serie: serial,
          descripcion: model || 'Phone',
          zona: normalizeZone(state) || null,
          team: null,
          estado: 'disponible',
          fecha_ultima_cali: null, fecha_prox_cali: null,
          fecha_ultimo_tag: null, fecha_prox_tag: null,
          source: `${file.label} - PHONES`,
          _priority: file.priority,
        });
      }
    }

    // ─── KEYS ───
    const keySheet = wb.Sheets['KEYS'];
    if (keySheet) {
      const rows = XLSX.utils.sheet_to_json(keySheet, { defval: '' });
      for (const row of rows) {
        const location = String(row['Location'] || '').trim();
        const detail = String(row['Detail'] || '').trim();
        if (!location || !detail) continue;
        if (detail.toLowerCase().includes('last update')) continue;

        const vodLong = String(row['Vodafone Long LI-7914'] || '').trim();
        const vodShort = String(row['Vodafone Short LI-7914'] || '').trim();
        const keyHolder = String(row['Key Holder'] || '').trim();

        // Generate a unique serial from location + detail
        const keySerial = generateSerial(`ENT-KEY-${normalizeZone(location) || 'GEN'}`);

        assets.push({
          numero_serie: keySerial,
          descripcion: `CAM Key Set - ${detail}`,
          zona: normalizeZone(location),
          team: null,
          estado: 'disponible',
          fecha_ultima_cali: null, fecha_prox_cali: null,
          fecha_ultimo_tag: null, fecha_prox_tag: null,
          source: `${file.label} - KEYS`,
          _priority: file.priority,
          _extra: { vodLong, vodShort, keyHolder },
        });
      }
    }

    // ─── FIRE EXTINGUISHER ───
    const feSheet = wb.Sheets['FIRE EXTINGUISHER'];
    if (feSheet) {
      const rawRows = XLSX.utils.sheet_to_json(feSheet, { header: 1, defval: '' });
      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i].map(c => String(c).trim().toLowerCase());
        if (row.includes('fire extinguisher') && row.some(r => r.includes('inspect'))) {
          headerIdx = i; break;
        }
      }
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          const location = String(row[0] || '').trim();
          if (!location) continue;

          const size = String(row[3] || '').trim();
          const classification = String(row[4] || '').trim();
          const desc = `Fire Extinguisher ${size} ${classification}`.trim();

          assets.push({
            numero_serie: generateSerial(`ENT-FE-${normalizeZone(location) || 'GEN'}`),
            descripcion: desc || 'Fire Extinguisher',
            zona: normalizeZone(location),
            team: null,
            estado: 'disponible',
            fecha_ultima_cali: parseDate(row[1]),
            fecha_prox_cali: parseDate(row[2]),
            fecha_ultimo_tag: null, fecha_prox_tag: null,
            source: `${file.label} - FIRE EXTINGUISHER`,
            _priority: file.priority,
          });
        }
      }
    }

    // ─── SIMCARDS ───
    const simSheet = wb.Sheets['SIMCARDS'];
    if (simSheet) {
      const rawRows = XLSX.utils.sheet_to_json(simSheet, { header: 1, defval: '' });
      for (const row of rawRows) {
        const phone = String(row[3] || '').trim();
        const city = String(row[4] || '').trim();
        const name = String(row[5] || '').trim();
        const simType = String(row[7] || '').trim();

        // Skip empty or header rows
        if (!phone || phone.toLowerCase() === 'phone' || !phone.match(/\d{4}/)) continue;

        assets.push({
          numero_serie: `SIM-${phone.replace(/\s+/g, '')}`,
          descripcion: `SIM Card ${simType || 'Physical'} - ${phone}`,
          zona: normalizeZone(city),
          team: null,
          estado: 'disponible',
          fecha_ultima_cali: null, fecha_prox_cali: null,
          fecha_ultimo_tag: null, fecha_prox_tag: null,
          source: `${file.label} - SIMCARDS`,
          _priority: file.priority,
          _extra: { holder: name },
        });
      }
    }
  }

  // Deduplicate between 2024 and 2025 (keep 2025 = higher priority)
  const uniqueMap = new Map();
  for (const a of assets) {
    const key = a.numero_serie;
    if (!uniqueMap.has(key) || (a._priority || 0) > (uniqueMap.get(key)._priority || 0)) {
      uniqueMap.set(key, a);
    }
  }
  const deduped = Array.from(uniqueMap.values());

  console.log(`   ✅ ${deduped.length} activos encontrados (de ${assets.length} total, ${assets.length - deduped.length} duplicados entre 2024/2025)`);
  return deduped;
}

// ==================== PART B: ADAPTER KITS ====================

function parseAdapterKits() {
  console.log('\n📋 Parsing: Adapter Kits (5 files)');
  const assets = [];
  const kits = [
    { file: 'Adapter Kit 1 (ANDREA)/AdaptersKit1.xlsx', region: 'ANDREA', name: 'Adapter Kit 1' },
    { file: 'Adapters Kit 2 (VIC)/AdaptersKit2.xlsx', region: 'VIC', name: 'Adapter Kit 2' },
    { file: 'Adapters Kit3 (QLD)/AdaptersKit3.xlsx', region: 'QLD', name: 'Adapter Kit 3' },
    { file: 'Apadters Kit4 (NSW)/Adapters Kit4.xlsx', region: 'NSW', name: 'Adapter Kit 4' },
    { file: 'Adapters Kit5 (SA)/Adapters Kit5.xlsx', region: 'SA', name: 'Adapter Kit 5' },
  ];

  for (const kit of kits) {
    const wb = readExcel(path.join(ROOT, 'Inventory', '02. Levelling Kits', 'KITS Adapters', kit.file));
    if (!wb) continue;

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Adapter kits are simple item lists - import the full kit as one asset
    const itemList = rows
      .map(r => String(r[0] || '').trim())
      .filter(r => r && !r.toUpperCase().includes('LEVELLING') && !r.toUpperCase().includes('ADAPTERS KIT'));

    if (itemList.length > 0) {
      assets.push({
        numero_serie: generateSerial(`ENT-ADP-${kit.region}`),
        descripcion: `${kit.name} - Levelling/Troubleshooting Adapters (${itemList.length} pcs)`,
        zona: normalizeZone(kit.region) || 'Almacén Central',
        team: 'Levelling',
        estado: 'disponible',
        fecha_ultima_cali: null, fecha_prox_cali: null,
        fecha_ultimo_tag: null, fecha_prox_tag: null,
        source: 'Adapter Kits',
      });
    }
  }

  console.log(`   ✅ ${assets.length} kits encontrados`);
  return assets;
}

// ==================== PART B: WALK TEST TRACKING ====================

function parseWalkTestTracking() {
  console.log('\n📋 Parsing: Traking Equipos Walk Test (NSW y VIC)');
  const assets = [];
  const files = [
    { name: 'Traking Equipos Walk Test NSW.xlsx', state: 'NSW' },
    { name: 'Traking Equipos Walk Test VIC.xlsx', state: 'VIC' }
  ];

  for (const f of files) {
    const wb = readExcel(path.join(ROOT, 'Inventory', '05. WalkTest Kits', 'KITS', 'Archived', 'Archived', f.name));
    if (!wb) continue;

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Find header row (ITEM, BRAND, CANT, SERIAL, PLACA)
    let headerIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i].map(c => String(c).trim().toUpperCase());
      if (row.includes('ITEM') && row.includes('BRAND')) { headerIdx = i; break; }
    }

    if (headerIdx >= 0) {
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const item = String(row[0] || '').trim();
        const brand = String(row[1] || '').trim();
        const serial = cleanSerial(row[3]);
        const placa = cleanSerial(row[4]);

        if (!item) continue;
        // Skip observation/notes rows that aren't actual equipment
        if (item.length > 50) continue;
        if (/^(observation|nota|se envia|equipo con|comentario|\d{1,2}\/\d{1,2}\/)/i.test(item)) continue;
        if (!brand && !serial && !placa) continue;

        const numero_serie = serial || placa || generateSerial(`ENT-WT-${f.state}`);
        const desc = brand ? `${item} - ${brand}` : item;

        assets.push({
          numero_serie,
          descripcion: `${desc} (Walk Test Kit ${f.state})`,
          zona: f.state,
          team: 'Walk Test',
          estado: 'disponible',
          fecha_ultima_cali: null, fecha_prox_cali: null,
          fecha_ultimo_tag: null, fecha_prox_tag: null,
          source: `Walk Test Tracking ${f.state}`,
        });
      }
    }
  }

  console.log(`   ✅ ${assets.length} activos encontrados`);
  return assets;
}

// ==================== PART B: SCANNER CONFIGS ====================

function parseScannerConfigs() {
  console.log('\n📋 Parsing: Entelso_proposed config_20220523.xlsx');
  const wb = readExcel(path.join(ROOT, 'Inventory', '05. WalkTest Kits', 'SCANNERs', 'Entelso_proposed config_20220523.xlsx'));
  if (!wb) return [];

  const assets = [];

  // Sheet "Sheet1" has S/N, CAPABILITY, OWNER, COMMENTS
  const sheet1 = wb.Sheets['Sheet1'];
  if (sheet1) {
    const rows = XLSX.utils.sheet_to_json(sheet1, { defval: '' });
    for (const row of rows) {
      const sn = cleanSerial(row['S/N']);
      const capability = String(row['CAPABILITY '] || row['CAPABILITY'] || '').trim();
      const owner = String(row['OWNER'] || '').trim();
      const comments = String(row['COMMENTS'] || '').trim();

      if (!sn || sn.toLowerCase().includes('purchase')) continue;

      assets.push({
        numero_serie: sn,
        descripcion: `PCTEL IBFlex Scanner (${capability || 'N/A'})`,
        zona: null,
        team: 'Walk Test',
        estado: comments.toLowerCase().includes('repair') ? 'en_mantenimiento' : 'disponible',
        fecha_ultima_cali: null, fecha_prox_cali: null,
        fecha_ultimo_tag: null, fecha_prox_tag: null,
        source: 'Scanner Config',
        _extra: { owner, comments },
      });
    }
  }

  // Sheet "CALIBRATION" has calibration dates per scanner
  const calSheet = wb.Sheets['CALIBRATION'];
  if (calSheet) {
    const rawRows = XLSX.utils.sheet_to_json(calSheet, { header: 1, defval: '' });
    // Find header row (STATE, BRAND, SERIAL, CALIBRATION DATE, CALIBRATION DUE)
    let headerIdx = -1;
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i].map(c => String(c).trim().toUpperCase());
      if (row.includes('STATE') && row.includes('SERIAL')) { headerIdx = i; break; }
    }
    if (headerIdx >= 0) {
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const serial = cleanSerial(row[2]);
        if (!serial) continue;

        // Find and update existing asset or add new
        const existing = assets.find(a => a.numero_serie === serial);
        if (existing) {
          existing.fecha_ultima_cali = parseDate(row[3]) || existing.fecha_ultima_cali;
          existing.fecha_prox_cali = parseDate(row[4]) || existing.fecha_prox_cali;
          existing.zona = normalizeZone(String(row[0] || '').trim()) || existing.zona;
        }
      }
    }
  }

  console.log(`   ✅ ${assets.length} activos encontrados`);
  return assets;
}

// ==================== PART B: INV KEYS ====================

function parseInvKeys() {
  console.log('\n📋 Parsing: Inv Keys.xlsx');
  const wb = readExcel(path.join(ROOT, 'Inventory', '01. CAM Keys TPG and Optus', 'keys Edinson - NSW', 'Inv Keys.xlsx'));
  if (!wb) return [];

  const assets = [];
  const sheet = wb.Sheets['Hoja1'];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  for (const row of rows) {
    const fileNum = row['File'];
    const ref = String(row['Ref'] || '').trim();
    const id = String(row['Id'] || '').trim();

    if (!id) continue;

    assets.push({
      numero_serie: `ENT-KEY-EDI-${id.replace(/\s+/g, '')}`,
      descripcion: `CAM Key ${ref} - ${id}`,
      zona: 'NSW',
      team: null,
      estado: 'disponible',
      fecha_ultima_cali: null, fecha_prox_cali: null,
      fecha_ultimo_tag: null, fecha_prox_tag: null,
      source: 'Inv Keys NSW',
    });
  }

  console.log(`   ✅ ${assets.length} activos encontrados`);
  return assets;
}

// ==================== PART B: HANDY TOOLS (from folder structure) ====================

function parseHandyTools() {
  console.log('\n📋 Parsing: Handy Tools (from folder names with ENT- codes)');
  const assets = [];

  const states = ['QLD', 'VIC'];
  for (const state of states) {
    const toolsDir = path.join(ROOT, 'Inventory', '04. Handy Tools', state, '1. TOOLS');
    if (fs.existsSync(toolsDir)) {
      const entries = fs.readdirSync(toolsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('ENT-')) {
          const match = entry.name.match(/^(ENT-\d+)-(.+)$/);
          if (match) {
            assets.push({
              numero_serie: match[1],
              descripcion: match[2].trim(),
              zona: state,
              team: null,
              estado: 'disponible',
              fecha_ultima_cali: null, fecha_prox_cali: null,
              fecha_ultimo_tag: null, fecha_prox_tag: null,
              source: `Handy Tools ${state}`,
            });
          }
        }
      }
    }
  }

  console.log(`   ✅ ${assets.length} herramientas encontradas`);
  return assets;
}

// ==================== ENRICHMENT: CALIBRATION FOLDER ====================

function enrichWithCalibration(assets) {
  console.log('\n🔧 Enriqueciendo con datos de Calibración...');
  const calDir = path.join(ROOT, 'Calibration');
  if (!fs.existsSync(calDir)) return;

  // Map of serial → calibration info from folder names & PDF names
  const calData = {};

  const folders = fs.readdirSync(calDir, { withFileTypes: true });
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;

    // Extract serial from folder name (e.g., "PIM TESTER iPA 1800A TX2164000004")
    const serialMatch = folder.name.match(/(TX\d+|AN\d+)/i);
    if (!serialMatch) continue;
    const serial = serialMatch[1];

    const files = fs.readdirSync(path.join(calDir, folder.name));
    const pdfCerts = files.filter(f => f.toLowerCase().includes('calibration') && f.endsWith('.pdf'));

    if (pdfCerts.length > 0) {
      // Check if "2026" is in any certificate filename
      const has2026 = pdfCerts.some(f => f.includes('2026'));
      calData[serial] = { hasCertificate: true, year: has2026 ? '2026' : '2025' };
    }
  }

  // Enrich matching assets
  let enriched = 0;
  for (const asset of assets) {
    const info = calData[asset.numero_serie];
    if (info) {
      enriched++;
      // If the asset doesn't have calibration data, add it from the certificate
      if (!asset.fecha_ultima_cali && info.year) {
        asset.fecha_ultima_cali = `${info.year}-01-01`;
      }
    }
  }

  console.log(`   ✅ ${enriched} activos enriquecidos con certificados de calibración`);
}

// ==================== DEDUPLICATION ====================

function deduplicateAssets(assets) {
  console.log('\n🔍 Deduplicando activos por numero_serie...');
  const map = new Map();
  let dupes = 0;

  for (const asset of assets) {
    const key = asset.numero_serie.toLowerCase().trim();
    if (map.has(key)) {
      dupes++;
      const existing = map.get(key);
      // Merge: prefer non-null values from the newer source
      map.set(key, {
        ...existing,
        ...Object.fromEntries(
          Object.entries(asset).filter(([k, v]) => v != null && v !== '' && k !== '_priority' && k !== '_extra' && k !== 'source')
        ),
        source: `${existing.source} + ${asset.source}`,
      });
    } else {
      map.set(key, { ...asset });
    }
  }

  const result = Array.from(map.values()).map(a => {
    // Clean internal fields
    delete a._priority;
    delete a._extra;
    return a;
  });

  console.log(`   📊 ${assets.length} total → ${result.length} únicos (${dupes} duplicados mergeados)`);
  return result;
}

// ==================== DATABASE OPERATIONS ====================

async function importToDatabase(assets) {
  console.log(`\n🚀 Importando ${assets.length} activos a Supabase...`);
  const client = await pool.connect();

  try {
    // NO usamos transacción global: cada asset se inserta independientemente
    // para que un error individual no afecte a los demás.

    const itemCache = new Map();
    const ubicacionCache = new Map();
    let insertCount = 0;
    let errorCount = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      try {
        // 1. Resolve or create Item Category
        const descKey = asset.descripcion.toLowerCase().trim();
        let item_id;
        if (itemCache.has(descKey)) {
          item_id = itemCache.get(descKey);
        } else {
          const { rows } = await client.query('SELECT id FROM items WHERE LOWER(nombre) = LOWER($1)', [asset.descripcion.trim()]);
          if (rows.length > 0) {
            item_id = rows[0].id;
          } else {
            // Truncate to 148 chars to fit VARCHAR(150)
            const itemName = asset.descripcion.trim().substring(0, 148);
            const { rows: newRows } = await client.query('INSERT INTO items (nombre, tipo) VALUES ($1, $2) RETURNING id', [itemName, 'herramienta']);
            item_id = newRows[0].id;
          }
          itemCache.set(descKey, item_id);
        }

        // 2. Resolve or create Location
        let ubicacion_id = null;
        if (asset.zona) {
          const zoneKey = asset.zona.toLowerCase().trim();
          if (ubicacionCache.has(zoneKey)) {
            ubicacion_id = ubicacionCache.get(zoneKey);
          } else {
            const { rows } = await client.query('SELECT id FROM ubicaciones WHERE LOWER(nombre_ubicacion) = LOWER($1)', [asset.zona.trim()]);
            if (rows.length > 0) {
              ubicacion_id = rows[0].id;
            } else {
              const { rows: newRows } = await client.query('INSERT INTO ubicaciones (nombre_ubicacion) VALUES ($1) RETURNING id', [asset.zona.trim()]);
              ubicacion_id = newRows[0].id;
            }
            ubicacionCache.set(zoneKey, ubicacion_id);
          }
        }

        // 3. Normalize status
        const validStatuses = new Set(['disponible', 'en_uso', 'en_mantenimiento', 'calibracion_pendiente', 'fuera_de_servicio', 'calibrado', 'danado', 'en_funcionamiento', 'desconocido']);
        const estado = validStatuses.has(asset.estado) ? asset.estado : 'disponible';

        // 4. Upsert Asset
        await client.query(`
          INSERT INTO activos (item_id, numero_serie, ubicacion_actual_id, estado, team,
              fecha_ultima_cali, fecha_prox_cali, fecha_ultimo_tag, fecha_prox_tag)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (numero_serie) DO UPDATE SET
            item_id = EXCLUDED.item_id,
            ubicacion_actual_id = COALESCE(EXCLUDED.ubicacion_actual_id, activos.ubicacion_actual_id),
            estado = EXCLUDED.estado,
            team = COALESCE(EXCLUDED.team, activos.team),
            fecha_ultima_cali = COALESCE(EXCLUDED.fecha_ultima_cali, activos.fecha_ultima_cali),
            fecha_prox_cali   = COALESCE(EXCLUDED.fecha_prox_cali, activos.fecha_prox_cali),
            fecha_ultimo_tag  = COALESCE(EXCLUDED.fecha_ultimo_tag, activos.fecha_ultimo_tag),
            fecha_prox_tag    = COALESCE(EXCLUDED.fecha_prox_tag, activos.fecha_prox_tag)
        `, [
          item_id,
          asset.numero_serie.trim(),
          ubicacion_id,
          estado,
          asset.team || null,
          asset.fecha_ultima_cali || null,
          asset.fecha_prox_cali || null,
          asset.fecha_ultimo_tag || null,
          asset.fecha_prox_tag || null,
        ]);

        insertCount++;

        // Progress indicator every 25 items
        if ((i + 1) % 25 === 0) {
          process.stdout.write(`\r   Progreso: ${i + 1}/${assets.length} (${Math.round((i+1)/assets.length*100)}%)`);
        }
      } catch (err) {
        errorCount++;
        console.error(`\n   ❌ Error [${asset.numero_serie}]: ${err.message}`);
      }
    }

    console.log(`\n\n   ✅ Importación completada:`);
    console.log(`      Procesados: ${insertCount}`);
    console.log(`      Errores: ${errorCount}`);
    return { inserted: insertCount, errors: errorCount };

  } catch (error) {
    console.error('\n   💥 Error fatal:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== MAIN ====================

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📦 IMPORTACIÓN MASIVA DE INVENTARIO ENTELSO');
  console.log(`  Modo: ${DRY_RUN ? '🔍 DRY RUN (preview)' : '🚀 IMPORTACIÓN REAL'}`);
  console.log('═══════════════════════════════════════════════════════');

  // ===== PART A: Equipment with serials & calibration =====
  console.log('\n━━━━━━ PARTE A: Equipment Register + Calibración ━━━━━━');
  const partA = [
    ...parseEquipmentRegister(),
    ...parseEquipmentCalibration(),
  ];

  // ===== PART B: General Inventory =====
  console.log('\n━━━━━━ PARTE B: Inventario General ━━━━━━');
  const partB = [
    ...parseInventorySheets(),
    ...parseAdapterKits(),
    ...parseWalkTestTracking(),
    ...parseScannerConfigs(),
    ...parseInvKeys(),
    ...parseHandyTools(),
  ];

  // ===== MERGE & DEDUPLICATE =====
  const allAssets = deduplicateAssets([...partA, ...partB]);

  // ===== ENRICH WITH CALIBRATION CERTIFICATES =====
  enrichWithCalibration(allAssets);

  // ===== SUMMARY =====
  console.log('\n━━━━━━ RESUMEN ━━━━━━');
  const bySource = {};
  for (const a of allAssets) {
    const src = (a.source || 'Unknown').split(' + ')[0];
    bySource[src] = (bySource[src] || 0) + 1;
  }
  console.log('   Por fuente:');
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${src}: ${count}`);
  }
  console.log(`\n   📊 TOTAL DE ACTIVOS A IMPORTAR: ${allAssets.length}`);

  if (DRY_RUN) {
    const previewPath = path.join(__dirname, 'import_preview.json');
    fs.writeFileSync(previewPath, JSON.stringify(allAssets, null, 2));
    console.log(`\n   📝 Preview guardado en: ${previewPath}`);
    console.log('   Ejecuta sin --dry-run para importar a Supabase.\n');
    return;
  }

  // ===== IMPORT TO SUPABASE =====
  await importToDatabase(allAssets);

  // ===== VERIFICATION =====
  console.log('\n━━━━━━ VERIFICACIÓN ━━━━━━');
  const { rows: countRows } = await pool.query('SELECT COUNT(*) as total FROM activos');
  console.log(`   Total activos en BD: ${countRows[0].total}`);

  const { rows: dupeRows } = await pool.query('SELECT numero_serie, COUNT(*) c FROM activos GROUP BY numero_serie HAVING COUNT(*) > 1');
  console.log(`   Duplicados en BD: ${dupeRows.length}`);

  const { rows: itemRows } = await pool.query('SELECT COUNT(*) as total FROM items');
  console.log(`   Total categorías (items): ${itemRows[0].total}`);

  const { rows: ubiRows } = await pool.query('SELECT COUNT(*) as total FROM ubicaciones');
  console.log(`   Total ubicaciones: ${ubiRows[0].total}`);

  console.log('\n✅ ¡Importación masiva completada exitosamente!\n');
}

main()
  .catch(err => {
    console.error('\n💥 Error fatal:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
