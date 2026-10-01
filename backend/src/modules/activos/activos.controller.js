const svc = require('./activos.service');
const res = require('../../common/utils/apiResponse');
const ExcelJS = require('exceljs');
const axios = require('axios');
const heicConvert = require('heic-convert');
const { imageSize } = require('image-size');

function calculateImageAnchor(imageBuffer, baseCol, rowIndex) {
  let imgWidth = 4;
  let imgHeight = 3;
  try {
    const dims = imageSize(imageBuffer);
    if (dims && dims.width && dims.height) {
      if (dims.orientation === 6 || dims.orientation === 8) {
        imgWidth = dims.height;
        imgHeight = dims.width;
      } else {
        imgWidth = dims.width;
        imgHeight = dims.height;
      }
    }
  } catch (e) {}

  const imgAspect = imgWidth / imgHeight;
  const CELL_WIDTH_PX = 180; // col width 25 ≈ 180px
  const CELL_HEIGHT_PX = 133.33; // row height 100pt = 133.33px
  const MAX_W_PX = CELL_WIDTH_PX * 0.88;
  const MAX_H_PX = CELL_HEIGHT_PX * 0.88;
  const cellAspect = MAX_W_PX / MAX_H_PX;

  let finalW, finalH;
  if (imgAspect >= cellAspect) {
    finalW = MAX_W_PX;
    finalH = finalW / imgAspect;
  } else {
    finalH = MAX_H_PX;
    finalW = finalH * imgAspect;
  }

  const colSpan = Math.min(0.92, Math.max(0.2, finalW / CELL_WIDTH_PX));
  const rowSpan = Math.min(0.92, Math.max(0.2, finalH / CELL_HEIGHT_PX));

  const colOffset = Math.max(0.04, (1 - colSpan) / 2);
  const rowOffset = Math.max(0.04, (1 - rowSpan) / 2);

  return {
    tl: { col: baseCol + colOffset, row: (rowIndex - 1) + rowOffset },
    br: { col: baseCol + colOffset + colSpan, row: (rowIndex - 1) + rowOffset + rowSpan },
    editAs: 'oneCell'
  };
}

// Translate DB status values to English
const STATUS_EN = {
  'disponible': 'AVAILABLE',
  'en_uso': 'IN USE',
  'en_mantenimiento': 'UNDER MAINTENANCE',
  'calibracion_pendiente': 'PENDING CALIBRATION',
  'fuera_de_servicio': 'OUT OF SERVICE',
  'calibrado': 'CALIBRATED',
  'danado': 'DAMAGED',
  'en_funcionamiento': 'IN OPERATION',
  'desconocido': 'UNKNOWN'
};

const STATUS_COLORS = {
  'AVAILABLE': { fill: 'FFE8F5E9', text: 'FF2E7D32' },
  'IN USE': { fill: 'FFE3F2FD', text: 'FF1565C0' },
  'UNDER MAINTENANCE': { fill: 'FFFFF9C4', text: 'FFF57F17' },
  'DAMAGED': { fill: 'FFFFEBEE', text: 'FFC62828' },
  'OUT OF SERVICE': { fill: 'FFFFEBEE', text: 'FFC62828' },
  'PENDING CALIBRATION': { fill: 'FFFFF3E0', text: 'FFE65100' },
  'CALIBRATED': { fill: 'FFE8F5E9', text: 'FF2E7D32' },
  'IN OPERATION': { fill: 'FFE8F5E9', text: 'FF2E7D32' },
  'UNKNOWN': { fill: 'FFF5F5F5', text: 'FF757575' }
};

async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    let buf = Buffer.from(response.data);
    // Convert HEIC format on the fly if needed
    if (url.toLowerCase().endsWith('.heic') || (buf.length > 8 && buf.slice(4, 8).toString() === 'ftyp')) {
      try {
        buf = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.88 });
      } catch (convErr) {
        console.warn('HEIC conversion failed for url:', url, convErr.message);
      }
    }
    return buf;
  } catch (err) {
    return null;
  }
}

// Extract brand fallback from name if missing
function getBrand(item) {
  if (item.marca && item.marca !== '—' && item.marca !== '-') return item.marca;
  const n = (item.nombre_item || item.equipo || '').toLowerCase();
  if (n.includes('dewalt')) return 'DeWalt';
  if (n.includes('hilti') || n.includes('bx 3') || n.includes('b22')) return 'Hilti';
  if (n.includes('ryobi')) return 'Ryobi';
  if (n.includes('craftright')) return 'Craftright';
  if (n.includes('makita')) return 'Makita';
  if (n.includes('milwaukee')) return 'Milwaukee';
  if (n.includes('bosch')) return 'Bosch';
  if (n.includes('viavi')) return 'VIAVI';
  if (n.includes('kango')) return 'Kango';
  if (n.includes('sutton')) return 'Sutton Tools';
  if (n.includes('kaelus')) return 'Kaelus';
  if (n.includes('panduit')) return 'Panduit';
  if (n.includes('pctel')) return 'PCTEL';
  if (n.includes('consultix')) return 'Consultix';
  return '—';
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).substring(0, 10);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const yr = dt.getFullYear();
  return `${day}/${mon}/${yr}`;
}

exports.exportExcel = async (req, reply, next) => {
  try {
    // Disable socket timeout so large exports don't get killed
    req.setTimeout(0);
    reply.setTimeout(0);

    const isPost = req.method === 'POST';
    const params = isPost ? req.body : req.query;
    
    const filters = { ...params };
    const withPhotos = filters.withPhotos === 'true' || filters.withPhotos === true;
    delete filters.withPhotos;
    delete filters.with_photos;

    let data = await svc.getAll(filters);

    if (params.ids) {
      const allowedIds = Array.isArray(params.ids) ? params.ids.map(Number) : params.ids.split(',').map(Number);
      // Keep exact order of provided IDs if possible
      const idMap = new Map();
      data.forEach(item => idMap.set(item.id, item));
      const ordered = [];
      allowedIds.forEach(id => {
        if (idMap.has(id)) ordered.push(idMap.get(id));
      });
      data = ordered.length > 0 ? ordered : data.filter(item => allowedIds.includes(item.id));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Entelso';
    workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

    const sheet = workbook.addWorksheet('Inventory Report', {
      views: [{ showGridLines: true }],
      properties: { defaultRowHeight: 20 }
    });

    // ── Headers matching user template ──
    const headers = [
      'Inventory No.',
      'Equipment Name',
      'Category',
      'Zone / Site',
      'Status',
      'Team',
      'Assigned To',
      'Last Cal / Tag',
      'Next Cal / Tag'
    ];
    if (withPhotos) {
      headers.push('Photo 1', 'Photo 2');
    }
    const totalCols = headers.length;

    // ── ROW 1: Title banner ──
    const titleRow = sheet.addRow(['ENTELSO TELECOMMUNICATIONS — INVENTORY REPORT']);
    sheet.mergeCells(1, 1, 1, totalCols);
    titleRow.getCell(1).font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 36;

    // ── ROW 2: Subtitle & metadata ──
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const dateRow = sheet.addRow([`Report Generated: ${today}   |   Total Assets: ${data.length}`]);
    sheet.mergeCells(2, 1, 2, totalCols);
    dateRow.getCell(1).font = { size: 10.5, color: { argb: 'FF475569' }, name: 'Segoe UI', bold: true };
    dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dateRow.height = 22;

    // ── ROW 3: Empty spacer ──
    const spacer = sheet.addRow([]);
    sheet.getRow(3).height = 6;

    // ── ROW 4: Table Headers ──
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Corporate Blue
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        left: { style: 'thin', color: { argb: 'FF3B82F6' } },
        right: { style: 'thin', color: { argb: 'FF3B82F6' } }
      };
    });

    // ── Column widths ──
    const colWidths = [18, 38, 16, 14, 22, 16, 20, 16, 16];
    if (withPhotos) colWidths.push(25, 25);
    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    // ── Pre-download all images concurrently in chunks ──
    const imageCache = {};
    if (withPhotos) {
      const allUrls = new Set();
      data.forEach(item => {
        let fotos = [];
        if (typeof item.fotos === 'string') {
          try { fotos = JSON.parse(item.fotos); } catch(e) {}
        } else if (Array.isArray(item.fotos)) {
          fotos = item.fotos;
        }
        fotos.slice(0, 2).forEach(u => {
          if (u && typeof u === 'string') allUrls.add(u);
        });
      });
      const urlsArray = Array.from(allUrls);
      const chunkSize = 30;
      for (let i = 0; i < urlsArray.length; i += chunkSize) {
        const chunk = urlsArray.slice(i, i + chunkSize);
        const buffers = await Promise.all(chunk.map(u => downloadImage(u)));
        chunk.forEach((u, idx) => { imageCache[u] = buffers[idx]; });
      }
    }

    // ── Cell borders ──
    const cellBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };

    const PHOTO_ROW_HEIGHT = 100;
    const photoColBase = 9; // Col 10 is Photo 1 (0-based index 9)

    let rowIndex = 5; // data starts at row 5
    for (const item of data) {
      const rawStatus = (item.estado || 'unknown').toLowerCase();
      const statusEN = STATUS_EN[rawStatus] || rawStatus.toUpperCase().replace(/_/g, ' ');
      const statusColor = STATUS_COLORS[statusEN] || STATUS_COLORS['UNKNOWN'];

      let fotos = [];
      if (typeof item.fotos === 'string') {
        try { fotos = JSON.parse(item.fotos); } catch(e) {}
      } else if (Array.isArray(item.fotos)) {
        fotos = item.fotos;
      }
      const validPhotos = fotos.filter(u => u && typeof u === 'string').slice(0, 2);
      const hasPhotos = validPhotos.length > 0;

      const rowValues = [
        item.numero_serie || '—',
        item.nombre_item || '—',
        item.categoria_padre || 'Uncategorized',
        item.nombre_ubicacion || '—',
        statusEN,
        item.usuario_team || item.team || '—',
        item.nombre_usuario || 'Unassigned',
        formatDate(item.fecha_ultima_cali || item.fecha_ultimo_tag),
        formatDate(item.fecha_prox_cali || item.fecha_prox_tag)
      ];
      if (withPhotos) {
        rowValues.push('', ''); // Placeholders for Photo 1 and Photo 2
      }

      const excelRow = sheet.addRow(rowValues);
      excelRow.height = (withPhotos && hasPhotos) ? PHOTO_ROW_HEIGHT : 28;

      const isEven = (rowIndex - 5) % 2 === 0;
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = cellBorder;
        cell.font = { size: 10, name: 'Segoe UI', color: { argb: 'FF1E293B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        if (colNumber === 2) {
          // Equipment Name
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.font = { size: 10, name: 'Segoe UI', bold: true, color: { argb: 'FF0F172A' } };
        } else if (colNumber === 1) {
          // Serial No.
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { size: 10, name: 'Segoe UI', bold: true, color: { argb: 'FF1E3A5F' } };
        } else if (colNumber === 5) {
          // Status Badge
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor.fill } };
          cell.font = { size: 10, name: 'Segoe UI', bold: true, color: { argb: statusColor.text } };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
      });

      // ── Embed Photos with strict cell boundaries ──
      if (withPhotos && hasPhotos) {
        for (let pIdx = 0; pIdx < validPhotos.length; pIdx++) {
          const pUrl = validPhotos[pIdx];
          const imageBuffer = imageCache[pUrl];
          if (imageBuffer) {
            const ext = pUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
            const imageId = workbook.addImage({ buffer: imageBuffer, extension: ext });
            const anchor = calculateImageAnchor(imageBuffer, photoColBase + pIdx, rowIndex);
            sheet.addImage(imageId, anchor);
          }
        }
      }

      rowIndex++;
    }

    const filename = `Entelso_Inventory_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    reply.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(reply);
    reply.end();
  } catch (e) {
    next(e);
  }
};

exports.getAll = async (req, reply, next) => {
  try { reply.json(res.success(await svc.getAll(req.query))); } catch (e) { next(e); }
};
exports.getById = async (req, reply, next) => {
  try {
    const item = await svc.getById(req.params.id);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.getBySerial = async (req, reply, next) => {
  try {
    const item = await svc.getBySerial(req.params.serial);
    if (!item) return reply.status(404).json(res.error('Activo no encontrado.', 'NOT_FOUND'));
    reply.json(res.success(item));
  } catch (e) { next(e); }
};
exports.create = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.create(req.body))); } catch (e) { next(e); }
};
exports.update = async (req, reply, next) => {
  try { reply.json(res.success(await svc.update(req.params.id, req.body))); } catch (e) { next(e); }
};
exports.remove = async (req, reply, next) => {
  try {
    await svc.remove(req.params.id);
    reply.json(res.success({ deleted: true }, 'Activo eliminado.'));
  } catch (e) { next(e); }
};
exports.removeAll = async (req, reply, next) => {
  try {
    await svc.removeAll();
    reply.json(res.success({ deleted: true }, 'Todos los activos han sido eliminados.'));
  } catch (e) { next(e); }
};
exports.bulkDelete = async (req, reply, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).json(res.error('Se requiere un array de IDs no vacío', 'BAD_REQUEST'));
    }
    const count = await svc.bulkDelete(ids);
    reply.json(res.success({ deletedCount: count }, `${count} activos eliminados.`));
  } catch (e) { next(e); }
};
exports.bulkUpdateEstado = async (req, reply, next) => {
  try {
    const { ids, estado } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).json(res.error('Se requiere un array de IDs no vacío', 'BAD_REQUEST'));
    }
    const count = await svc.bulkUpdateEstado(ids, estado);
    reply.json(res.success({ updatedCount: count }, `Estado actualizado para ${count} activos.`));
  } catch (e) { next(e); }
};
exports.bulkUpdateZona = async (req, reply, next) => {
  try {
    const { ids, ubicacion_actual_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).json(res.error('Se requiere un array de IDs no vacío', 'BAD_REQUEST'));
    }
    const count = await svc.bulkUpdateZona(ids, ubicacion_actual_id);
    reply.json(res.success({ updatedCount: count }, `Zona actualizada para ${count} activos.`));
  } catch (e) { next(e); }
};
exports.bulkUpdateTeam = async (req, reply, next) => {
  try {
    const { ids, team } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).json(res.error('Se requiere un array de IDs no vacío', 'BAD_REQUEST'));
    }
    const count = await svc.bulkUpdateTeam(ids, team);
    reply.json(res.success({ updatedCount: count }, `Team actualizado para ${count} activos.`));
  } catch (e) { next(e); }
};
exports.bulkUpdateItem = async (req, reply, next) => {
  try {
    const { ids, item_id } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).json(res.error('Se requiere un array de IDs no vacío', 'BAD_REQUEST'));
    }
    const count = await svc.bulkUpdateItem(ids, item_id);
    reply.json(res.success({ updatedCount: count }, `Categoría actualizada para ${count} activos.`));
  } catch (e) { next(e); }
};

// ── Route-compatible aliases ──
exports.bulkRemoveSelected = exports.bulkDelete;
exports.bulkUpdateCategory = exports.bulkUpdateItem;
exports.bulkUpdateStatus   = exports.bulkUpdateEstado;

// ── Bulk create (delegates to service) ──
exports.bulkCreate = async (req, reply, next) => {
  try {
    const result = await svc.bulkCreate(req.body.activos || req.body);
    reply.json(res.success(result, 'Bulk create completed'));
  } catch (e) { next(e); }
};
