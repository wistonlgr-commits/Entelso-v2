const svc = require('./activos.service');
const res = require('../../common/utils/apiResponse');
const ExcelJS = require('exceljs');
const axios = require('axios');

// Translate DB status values to English
const STATUS_EN = {
  'disponible': 'AVAILABLE',
  'en_uso': 'IN USE',
  'en_mantenimiento': 'UNDER MAINTENANCE',
  'calibracion_pendiente': 'CALIBRATION PENDING',
  'fuera_de_servicio': 'OUT OF SERVICE',
  'calibrado': 'CALIBRATED',
  'danado': 'DAMAGED',
  'en_funcionamiento': 'IN OPERATION',
  'desconocido': 'UNKNOWN'
};

async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return response.data;
  } catch (err) {
    return null;
  }
}

exports.exportExcel = async (req, reply, next) => {
  try {
    const filters = { ...req.query };
    const withPhotos = filters.with_photos === 'true';
    delete filters.with_photos;

    const data = await svc.getAll(filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Entelso';
    const PHOTO_ROW_HEIGHT = 100;
    const PHOTO_WIDTH = 120;
    const PHOTO_HEIGHT = 90;

    const sheet = workbook.addWorksheet('Inventory');

    // ── Column count ──
    const baseColCount = 8;
    const totalCols = withPhotos ? baseColCount + 3 : baseColCount;

    // ── ROW 1: Title banner ──
    const titleRow = sheet.addRow(['ENTELSO — Inventory Report']);
    sheet.mergeCells(1, 1, 1, totalCols);
    titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF1E3A5F' }, name: 'Calibri' };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 35;

    // ── ROW 2: Date & count ──
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const dateRow = sheet.addRow([`Generated on: ${today}  |  Total assets: ${data.length}`]);
    sheet.mergeCells(2, 1, 2, totalCols);
    dateRow.getCell(1).font = { size: 10, color: { argb: 'FF666666' }, name: 'Calibri' };
    dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dateRow.height = 20;

    // ── ROW 3: Empty spacer ──
    sheet.addRow([]);
    sheet.getRow(3).height = 8;

    // ── ROW 4: Headers ──
    const headers = ['Inventory No.', 'Equipment', 'Category', 'Zone / Site', 'Status', 'Team', 'Assigned to', 'Next Calibration'];
    if (withPhotos) {
      headers.push('Photo 1', 'Photo 2', 'Photo 3');
    }
    const headerRow = sheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // ── Set column widths ──
    const colWidths = [16, 38, 20, 14, 20, 16, 20, 18];
    if (withPhotos) colWidths.push(20, 20, 20);
    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    // ── Data rows ──
    const cellBorder = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    // Pre-download all images concurrently in chunks
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
        fotos.slice(0, 3).forEach(u => allUrls.add(u));
      });
      const urlsArray = Array.from(allUrls);
      const chunkSize = 20;
      for (let i = 0; i < urlsArray.length; i += chunkSize) {
        const chunk = urlsArray.slice(i, i + chunkSize);
        const buffers = await Promise.all(chunk.map(u => downloadImage(u)));
        chunk.forEach((u, idx) => { imageCache[u] = buffers[idx]; });
      }
    }

    let rowIndex = 5; // data starts at row 5
    for (const item of data) {
      const rawStatus = (item.estado || 'unknown').toLowerCase();
      const statusEN = STATUS_EN[rawStatus] || rawStatus.toUpperCase().replace(/_/g, ' ');

      const excelRow = sheet.addRow([
        item.numero_serie || '—',
        item.nombre_item || '—',
        item.categoria_padre || 'Uncategorized',
        item.nombre_ubicacion || '—',
        statusEN,
        item.usuario_team || item.team || '—',
        item.nombre_usuario || 'Unassigned',
        item.fecha_prox_cali ? String(item.fecha_prox_cali).substring(0, 10) : '—'
      ]);

      const isEven = (rowIndex - 5) % 2 === 0;
      const fillColor = isEven ? 'FFF2F6FA' : 'FFFFFFFF';

      if (withPhotos) {
        excelRow.height = PHOTO_ROW_HEIGHT;
      } else {
        excelRow.height = 20;
      }

      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { size: 10, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        cell.border = cellBorder;
        cell.alignment = { vertical: 'middle', wrapText: true };

        // Status column bold
        if (colNumber === 5) {
          cell.font = { size: 10, name: 'Calibri', bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      // ── Photos ──
      if (withPhotos) {
        let fotos = [];
        if (typeof item.fotos === 'string') {
          try { fotos = JSON.parse(item.fotos); } catch(e) {}
        } else if (Array.isArray(item.fotos)) {
          fotos = item.fotos;
        }

        const fotosToProcess = fotos.slice(0, 3);
        for (let i = 0; i < fotosToProcess.length; i++) {
          const imageBuffer = imageCache[fotosToProcess[i]];
          if (imageBuffer) {
            const ext = fotosToProcess[i].toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
            const imageId = workbook.addImage({ buffer: imageBuffer, extension: ext });
            sheet.addImage(imageId, {
              tl: { col: baseColCount + i + 0.1, row: rowIndex - 1 + 0.05 },
              br: { col: baseColCount + i + 0.9, row: rowIndex - 0.05 },
              editAs: 'oneCell'
            });
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
    const result = await svc.removeAll();
    reply.json(res.success({ deleted: result }, 'Todos los activos eliminados.'));
  } catch (e) { next(e); }
};
exports.bulkCreate = async (req, reply, next) => {
  try { reply.status(201).json(res.success(await svc.bulkCreate(req.body.activos))); } catch (e) { next(e); }
};
exports.bulkRemoveSelected = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Se requiere un array de IDs.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkRemoveSelected(req.body.ids);
    reply.json(res.success({ deleted: result }, 'Activos seleccionados eliminados.'));
  } catch (e) { next(e); }
};
exports.bulkUpdateCategory = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids) || !req.body.item_id) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateCategory(req.body.ids, req.body.item_id);
    reply.json(res.success({ updated: result }, 'Categor├¡a actualizada para los equipos.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateStatus = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids) || !req.body.status) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateStatus(req.body.ids, req.body.status);
    reply.json(res.success({ updated: result }, 'Estado actualizado.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateZona = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateZona(req.body.ids, req.body.zona_id);
    reply.json(res.success({ updated: result }, 'Zona actualizada.'));
  } catch (e) { next(e); }
};

exports.bulkUpdateTeam = async (req, reply, next) => {
  try {
    if (!req.body.ids || !Array.isArray(req.body.ids)) {
      return reply.status(400).json(res.error('Faltan datos.', 'BAD_REQUEST'));
    }
    const result = await svc.bulkUpdateTeam(req.body.ids, req.body.team_id);
    reply.json(res.success({ updated: result }, 'Equipo actualizado.'));
  } catch (e) { next(e); }
};
