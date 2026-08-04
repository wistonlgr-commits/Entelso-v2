// Patch script for script.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dashboard', 'script.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Replace renderizarActivos function
const oldRenderFn = `function renderizarActivos() {
  let data = inventoryData;
  
  // Apply smart filter if active
  if (window.activeSmartFilter) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    switch (window.activeSmartFilter) {
      case 'missing_photo':
        data = data.filter(item => {
          const raw = item._raw;
          return !raw || !raw.fotos || !Array.isArray(raw.fotos) || raw.fotos.length === 0;
        });
        break;
      case 'not_updated':
        data = data.filter(item => {
          const raw = item._raw;
          if (!raw || !raw.fecha_registro) return true; // no date = not updated
          const regDate = new Date(raw.fecha_registro);
          return regDate < sevenDaysAgo;
        });
        break;
      case 'expired_cal':
        data = data.filter(item => {
          const cal = item.calibracion ? new Date(item.calibracion) : null;
          const tag = item.tag ? new Date(item.tag) : null;
          return (cal && cal < now) || (tag && tag < now);
        });
        break;
    }
  }
  
  renderInventoryTable(document.getElementById('dashTableBody'),  data.slice(0, 20));
  renderInventoryTable(document.getElementById('inventTableBody'), data);
}`;

const newRenderFn = `function renderizarActivos() {
  let data = inventoryData;

  // Apply ALL active smart filters (AND logic)
  if (window.activeSmartFilters.size > 0) {
    data = data.filter(item => {
      for (const filterKey of window.activeSmartFilters) {
        if (smartFilterFns[filterKey] && !smartFilterFns[filterKey](item)) return false;
      }
      return true;
    });
  }

  // Store for export
  window.currentFilteredData = data;

  // Update active filter count badge
  const countEl = document.getElementById('smartFilterCount');
  if (countEl) {
    if (window.activeSmartFilters.size > 0) {
      countEl.textContent = data.length + ' result' + (data.length !== 1 ? 's' : '');
      countEl.style.display = 'inline';
    } else {
      countEl.style.display = 'none';
    }
  }

  renderInventoryTable(document.getElementById('dashTableBody'),  data.slice(0, 20));
  renderInventoryTable(document.getElementById('inventTableBody'), data);
}`;

if (content.includes('window.activeSmartFilter')) {
  // Normalize line endings for matching
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const normalizedOld = oldRenderFn.replace(/\r\n/g, '\n');
  
  if (normalizedContent.includes(normalizedOld)) {
    content = content.replace(/\r\n/g, '\n').replace(normalizedOld, newRenderFn).replace(/\n/g, '\r\n');
    console.log('  ✓ Replaced renderizarActivos with multi-filter version');
  } else {
    console.log('  ⚠ Could not find exact renderizarActivos match, doing manual line replace...');
    // Fallback: replace line by line
    content = content.replace(/window\.activeSmartFilter\b(?!s)/g, 'window.activeSmartFilters');
  }
}

// 2. Replace filter click handlers
const oldHandlers = `// Smart Filter Event Handlers
document.querySelectorAll('.smart-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.smart;
    
    if (filter === 'clear') {
      window.activeSmartFilter = null;
      document.querySelectorAll('.smart-filter').forEach(b => b.classList.remove('active'));
      document.getElementById('clearSmartFilter').style.display = 'none';
    } else {
      // Toggle: if same filter is clicked again, clear it
      if (window.activeSmartFilter === filter) {
        window.activeSmartFilter = null;
        document.querySelectorAll('.smart-filter').forEach(b => b.classList.remove('active'));
        document.getElementById('clearSmartFilter').style.display = 'none';
      } else {
        window.activeSmartFilter = filter;
        document.querySelectorAll('.smart-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('clearSmartFilter').style.display = 'inline-flex';
      }
    }
    
    renderizarActivos();
  });
});`;

const newHandlers = `// Smart Filter Event Handlers — multi-select toggle
document.querySelectorAll('.smart-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.dataset.smart;

    if (filter === 'clear') {
      window.activeSmartFilters.clear();
      document.querySelectorAll('.smart-filter').forEach(b => b.classList.remove('active'));
      document.getElementById('clearSmartFilter').style.display = 'none';
    } else {
      // Toggle this filter
      if (window.activeSmartFilters.has(filter)) {
        window.activeSmartFilters.delete(filter);
        btn.classList.remove('active');
      } else {
        window.activeSmartFilters.add(filter);
        btn.classList.add('active');
      }
      // Show/hide clear button
      document.getElementById('clearSmartFilter').style.display =
        window.activeSmartFilters.size > 0 ? 'inline-flex' : 'none';
    }

    renderizarActivos();
  });
});`;

const normalizedContent2 = content.replace(/\r\n/g, '\n');
const normalizedOldH = oldHandlers.replace(/\r\n/g, '\n');

if (normalizedContent2.includes(normalizedOldH)) {
  content = normalizedContent2.replace(normalizedOldH, newHandlers).replace(/\n/g, '\r\n');
  console.log('  ✓ Replaced filter handlers with multi-select version');
} else {
  console.log('  ⚠ Could not find exact handler match');
}

fs.writeFileSync(file, content, 'utf8');
console.log('✅ Patch applied to script.js');
