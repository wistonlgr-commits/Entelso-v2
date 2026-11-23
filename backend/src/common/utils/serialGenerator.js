const PREFIX_MAP = {
  'power tools': 'PT',
  'hand tools': 'HT',
  'consumables': 'CO',
  'walktest kits': 'WK',
  'testing equipment': 'TE',
  'safety & ppe': 'SA',
  'cam keys': 'CK',
};

let advisoryLockSupported = null;
let serialQueue = Promise.resolve();

async function supportsAdvisoryLock(db) {
  if (advisoryLockSupported !== null) return advisoryLockSupported;
  try {
    const { rows } = await db.query(
      "SELECT 1 FROM pg_proc WHERE proname = 'pg_advisory_xact_lock' LIMIT 1"
    );
    advisoryLockSupported = rows.length > 0;
  } catch (_) {
    advisoryLockSupported = false;
  }
  return advisoryLockSupported;
}

function withSerialMutex(fn) {
  const run = serialQueue.then(() => fn(), () => fn());
  serialQueue = run.catch(() => {});
  return run;
}

async function generateAutoId(categoria, client, lockAllowed = false) {
  const categoryStr = (categoria || '').toLowerCase().trim();
  const prefix = PREFIX_MAP[categoryStr] || 'EQ';

  if (lockAllowed && client) {
    const lockKey = (prefix.charCodeAt(0) << 16) | (prefix.charCodeAt(1) << 8) | 0x45;
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  }

  const queryTarget = client || require('../../config/database');
  const res = await queryTarget.query(
    'SELECT numero_serie FROM activos WHERE numero_serie LIKE $1',
    [prefix + '-%']
  );

  let seq = 1;
  if (res.rows.length > 0) {
    let maxNum = 0;
    for (const row of res.rows) {
      const suffix = row.numero_serie.substring(prefix.length + 1);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    seq = maxNum + 1;
  }
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

module.exports = {
  PREFIX_MAP,
  supportsAdvisoryLock,
  withSerialMutex,
  generateAutoId,
};
