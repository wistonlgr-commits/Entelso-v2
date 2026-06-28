import re

with open("c:\\Users\\Leor\\Desktop\\Entelso\\dashboard\\i18n.js", "r", encoding="utf-8") as f:
    code = f.read()

en_keys = """
    // ── Bulk Import ──
    'import.titulo':       'Bulk Import Equipment',
    'import.desc':         'Upload an Excel (.xlsx) or CSV file to import multiple records at once. Please ensure your file matches the suggested format below.',
    'import.formato':      'Suggested Format (Headers)',
    'import.col_inv':      'Inventory No.',
    'import.req':          'Required',
    'import.col_desc':     'Equipment / Description',
    'import.col_serie':    'Serial No.',
    'import.opc':          'Optional',
    'import.col_zona':     'Zone',
    'import.col_team':     'Team',
    'import.col_estado':   'Status',
    'import.estado_opc':   'Optional (Default: disponible)',
    'import.seleccionar':  'Select File',
    'import.preview_title':'Preview',
    'import.btn_upload':   'Import Data',
    'import.err_empty':    'The file is empty or invalid.',
    'import.err_headers':  'Required columns are missing (Inventory No. and Description).',
    'import.mas_filas':    'more rows...',
    'import.listo':        'File scanned. ',
    'import.err_no_valid': 'No valid rows found with ID and Description.',
    'import.importando':   'Importing...',
"""

es_keys = """
    // ── Bulk Import ──
    'import.titulo':       'Importar Equipos Masivamente',
    'import.desc':         'Sube un archivo Excel (.xlsx) o CSV para importar múltiples registros a la vez. Asegúrate de que tu archivo coincida con el formato sugerido.',
    'import.formato':      'Formato Sugerido (Cabeceras)',
    'import.col_inv':      'Nº Inventario',
    'import.req':          'Requerido',
    'import.col_desc':     'Equipo / Descripción',
    'import.col_serie':    'Nº Serie',
    'import.opc':          'Opcional',
    'import.col_zona':     'Zona',
    'import.col_team':     'Equipo (Team)',
    'import.col_estado':   'Estado',
    'import.estado_opc':   'Opcional (Por defecto: disponible)',
    'import.seleccionar':  'Seleccionar Archivo',
    'import.preview_title':'Vista Previa',
    'import.btn_upload':   'Importar Datos',
    'import.err_empty':    'El archivo está vacío o no es válido.',
    'import.err_headers':  'Faltan columnas requeridas (Inventory No. y Description).',
    'import.mas_filas':    'filas más...',
    'import.listo':        'Archivo escaneado. ',
    'import.err_no_valid': 'No se encontraron filas válidas con ID y Descripción.',
    'import.importando':   'Importando...',
"""

code = code.replace("    // ── Sidebar ──", en_keys + "\n    // ── Sidebar ──", 1)

# Find the second occurrence of // ── Sidebar ── (which is in the 'es' section)
parts = code.split("    // ── Sidebar ──")
if len(parts) == 3:
    code = parts[0] + "    // ── Sidebar ──" + parts[1] + es_keys + "\n    // ── Sidebar ──" + parts[2]

with open("c:\\Users\\Leor\\Desktop\\Entelso\\dashboard\\i18n.js", "w", encoding="utf-8") as f:
    f.write(code)

print("Patched i18n successfully")
