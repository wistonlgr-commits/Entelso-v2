const fs = require('fs');
let c = fs.readFileSync('dashboard/script.js', 'utf8');

c = c.replace(/window\.OFFICIAL_CATEGORIES\s*=\s*\[[\s\S]*?\];/, `window.CATEGORY_ICONS = {
  'WalkTest Kits': 'fa-person-walking',
  'Testing Equipment': 'fa-wave-square',
  'Hand Tools': 'fa-toolbox',
  'Power Tools': 'fa-bolt',
  'Safety & PPE': 'fa-hard-hat',
  'CAM Keys': 'fa-key',
  'Consumables': 'fa-box-open'
};`);

c = c.replace(/window\.OFFICIAL_CATEGORIES\.filter\(c => !c\.hidden\)\.forEach\(cat => \{[\s\S]*?container\.appendChild\(btn\);\s*\}\);/, `systemCategories.forEach(cat => {
    const icon = window.CATEGORY_ICONS[cat.nombre] || 'fa-tag';
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.filter = cat.nombre;
    btn.innerHTML = \`<i class="fa-solid \${icon}" style="margin-right: 6px;"></i>\${cat.nombre}\`;
    container.appendChild(btn);
  });`);

c = c.replace(/\/\/ Render "More\.\.\." dropdown[\s\S]*?container\.appendChild\(dropdownWrap\);\s*\}/, '');

c = c.replace(/modalCategoria\.innerHTML = window\.OFFICIAL_CATEGORIES\.map\(c => \`<option value="\$\{c\.id\}">\$\{c\.label\}<\/option>\`\)\.join\(''\);/, `modalCategoria.innerHTML = systemCategories.map(c => \`<option value="\${c.nombre}">\${c.nombre}</option>\`).join('');`);
c = c.replace(/bulkCategorySelect\.innerHTML =([^;]+)window\.OFFICIAL_CATEGORIES\.map\(c => \`<option value="\$\{c\.id\}">\$\{c\.label\}<\/option>\`\)\.join\(''\);/, `bulkCategorySelect.innerHTML =$1systemCategories.map(c => \`<option value="\${c.nombre}">\${c.nombre}</option>\`).join('');`);

c = c.replace(/document\.addEventListener\('DOMContentLoaded', populateCategorySelects\);\r?\nif \(document\.readyState === 'complete' \|\| document\.readyState === 'interactive'\) \{\r?\n  populateCategorySelects\(\);\r?\n\}/, '');

c = c.replace(/renderizarCategoriasUI\(\);\r?\n    \}/, `renderizarCategoriasUI();\n      populateCategorySelects();\n    }`);

c = c.replace(/\$\{window\.OFFICIAL_CATEGORIES\.map\(c => \`<option value="\$\{c\.id\}" \$\{item\.categoria === c\.id \|\| item\.categoria_padre === c\.id \? 'selected' : ''\}>\$\{c\.label\}<\/option>\`\)\.join\(''\)\}/, `\${systemCategories.map(c => \`<option value="\${c.nombre}" \${item.categoria === c.nombre || item.categoria_padre === c.nombre ? 'selected' : ''}>\${c.nombre}</option>\`).join('')}`);

c = c.replace(/window\.OFFICIAL_CATEGORIES\.forEach\(c => \{\s*select\.innerHTML \+= \`<option value="\$\{c\.id\}">\$\{c\.label\}<\/option>\`;\s*\}\);/, `systemCategories.forEach(c => {
    select.innerHTML += \`<option value="\${c.nombre}">\${c.nombre}</option>\`;
  });`);

fs.writeFileSync('dashboard/script.js', c);
console.log("Done");
