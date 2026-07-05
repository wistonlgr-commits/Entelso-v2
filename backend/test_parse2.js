function parseDateStr(dateStr) {
  if (!dateStr) return null;
  let ds = String(dateStr).trim();
  if (!ds || ds === '-' || ds === '—' || ds.toLowerCase() === 'n/a') return null;

  const monthYearMatch = ds.match(/^([a-z]{3,9})-(\d{2})$/i);
  if (monthYearMatch) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12' };
    const m = months[monthYearMatch[1].toLowerCase()] || '01';
    ds = '20' + monthYearMatch[2] + '-' + m + '-01';
  }

  // Handle DD/MM/YYYY or D/M/YY
  const dmyMatch = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0');
    let month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    ds = year + '-' + month + '-' + day;
  }

  const d = new Date(ds);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

console.log('29/6/2026 ->', parseDateStr('29/6/2026'));
console.log('29/12/2026 ->', parseDateStr('29/12/2026'));
