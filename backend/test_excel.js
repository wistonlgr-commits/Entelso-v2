const fs = require('fs');
const XLSX = require('xlsx');

const fileBuffer = fs.readFileSync('C:/Users/Leor/Desktop/Entelso/Equipment Register.xlsx');
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];

const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
const headers = rows[0].map(h => String(h).toLowerCase().trim());
console.log('Headers found in Excel:', headers);

const invIndex = headers.findIndex(h => h.includes('inventario') || h.includes('inventory') || h.includes('asset id'));
const eqIndex = headers.findIndex(h => h.includes('equipo') || h.includes('equipment') || h.includes('descripci') || h.includes('description'));
const lastCalIndex = headers.findIndex(h => (h.includes('last') && (h.includes('inspect') || h.includes('calibr'))) || h.includes('ultima calibracion'));
const nextCalIndex = headers.findIndex(h => h.includes('next due') || h.includes('proxima calibracion') || (h.includes('next') && h.includes('calibr')));
const domIndex = headers.findIndex(h => h === 'dom' || h.includes('date of man'));
const expiryIndex = headers.findIndex(h => h.includes('expiry') || h.includes('expire'));

console.log({ invIndex, eqIndex, lastCalIndex, nextCalIndex, domIndex, expiryIndex });

for(let i=1; i<Math.min(5, rows.length); i++) {
    const row = rows[i];
    console.log('\nRow ' + i + ':');
    console.log('Last Cal (idx ' + lastCalIndex + '):', row[lastCalIndex]);
    console.log('Next Cal (idx ' + nextCalIndex + '):', row[nextCalIndex]);
    console.log('DOM      (idx ' + domIndex + '):', row[domIndex]);
    console.log('Expiry   (idx ' + expiryIndex + '):', row[expiryIndex]);
}
