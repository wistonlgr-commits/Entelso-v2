const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = [
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\INVENTORY 2024.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\INVENTORY 2025.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\Equipment Calibration 2026.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory\\01. CAM Keys TPG and Optus\\keys Edinson - NSW\\Inv Keys.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Equipment Register.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\02. Levelling Kits\\KITS Adapters\\Adapter Kit 1 (ANDREA)\\AdaptersKit1.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\05. WalkTest Kits\\SCANNERs\\Entelso_proposed config_20220523.xlsx",
  "c:\\Users\\Leor\\Desktop\\Entelso\\Inventory2\\05. WalkTest Kits\\KITS\\Archived\\Archived\\Traking Equipos Walk Test NSW.xlsx"
];

const results = {};

files.forEach((filePath, idx) => {
  const fileName = path.basename(filePath);
  console.log(`\n==================================================`);
  console.log(`[File ${idx + 1}/${files.length}] ${fileName}`);
  console.log(`Path: ${filePath}`);
  console.log(`==================================================`);

  if (!fs.existsSync(filePath)) {
    console.log(`STATUS: File does not exist!`);
    results[fileName] = { error: "File not found", filePath };
    return;
  }

  try {
    const workbook = XLSX.readFile(filePath);
    console.log(`Sheet Names:`, workbook.SheetNames);
    
    const fileResult = {
      filePath,
      sheetNames: workbook.SheetNames,
      sheets: {}
    };

    workbook.SheetNames.forEach(sheetName => {
      console.log(`\n--- Sheet: "${sheetName}" ---`);
      const sheet = workbook.Sheets[sheetName];
      
      // Get raw 2D array representation
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      // Get object-based JSON representation
      const jsonObjects = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const headers = rawRows.length > 0 ? rawRows[0] : [];
      const first5RawRows = rawRows.slice(1, 6);
      const first5Objects = jsonObjects.slice(0, 5);

      console.log(`Headers (${headers.length}):`, JSON.stringify(headers));
      console.log(`First 5 Rows (JSON Objects):`);
      console.log(JSON.stringify(first5Objects, null, 2));

      fileResult.sheets[sheetName] = {
        headers,
        totalRawRows: rawRows.length,
        totalObjects: jsonObjects.length,
        first5RawRows,
        first5Objects
      };
    });

    results[fileName] = fileResult;
  } catch (err) {
    console.error(`Error reading file ${fileName}:`, err.message);
    results[fileName] = { error: err.message, filePath };
  }
});

fs.writeFileSync(path.join(__dirname, 'excel_inspection_output.json'), JSON.stringify(results, null, 2));
console.log('\nSaved full inspection results to excel_inspection_output.json');
