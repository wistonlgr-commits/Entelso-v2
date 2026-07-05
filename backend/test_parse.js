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

  const d = new Date(ds);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

console.log('1/7/26 ->', parseDateStr('1/7/26'));
console.log('1/12/26 ->', parseDateStr('1/12/26'));
console.log('Sep-20 ->', parseDateStr('Sep-20'));
console.log('Sep-30 ->', parseDateStr('Sep-30'));
