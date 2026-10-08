const fs = require('fs');
let c = fs.readFileSync('dashboard/script.js', 'utf8');
const start = c.indexOf('// Group header');
const end = c.indexOf('tbody.appendChild(tr);\r\n      });') + 34; // watch out for \r\n vs \n
let target = c.substring(start, end);

// fallback if not found with \r\n
if (start === -1 || target.length < 100) {
    const end2 = c.indexOf('tbody.appendChild(tr);\n      });') + 33;
    target = c.substring(start, end2);
}

const replacement = `// Group header
      const headerTr = document.createElement('tr');
      headerTr.style.cursor = 'pointer';
      const isDash = tbody.id === 'dashTableBody';
      
      if (!isDash) {
        headerTr.innerHTML = \`
          <td style="text-align:center; background: var(--bg-hover);" onclick="event.stopPropagation();"><input type="checkbox" class="group-checkbox" data-group="\${gIdx}" onclick="window.toggleGroupCheckbox(\${gIdx}, this.checked)"></td>
          <td colspan="\${colspan - 1}" style="background: var(--bg-hover); font-weight: bold; color: var(--text-1); padding-top: 16px; padding-bottom: 8px; user-select: none;">
            <i class="fa-solid fa-chevron-right group-toggle-icon" style="margin-right: 8px; width: 14px; text-align: center;"></i>
            \${groupName} (\${groups[groupName].length})
          </td>
        \`;
      } else {
        headerTr.innerHTML = \`
          <td colspan="\${colspan}" style="background: var(--bg-hover); font-weight: bold; color: var(--text-1); padding-top: 16px; padding-bottom: 8px; user-select: none;">
            <i class="fa-solid fa-chevron-right group-toggle-icon" style="margin-right: 8px; width: 14px; text-align: center;"></i>
            \${groupName} (\${groups[groupName].length})
          </td>
        \`;
      }
      
      headerTr.onclick = () => {
        const icon = headerTr.querySelector('.group-toggle-icon');
        const rows = tbody.querySelectorAll(\`.group-row-\${gIdx}\`);
        const isCollapsed = icon.classList.contains('fa-chevron-right');
        
        if (isCollapsed) {
          icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
          rows.forEach(r => r.style.display = '');
        } else {
          icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
          rows.forEach(r => r.style.display = 'none');
        }
      };

      tbody.appendChild(headerTr);
      
      // Group items
      groups[groupName].forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.classList.add(\`group-row-\${gIdx}\`);
        tr.style.display = 'none'; // collapsed by default
        tr.innerHTML = renderRow(item);
        if (!isDash) {
          const cb = tr.querySelector('.row-checkbox');
          if (cb) cb.dataset.group = gIdx;
        }
        tr.addEventListener('click', () => openDrawer(item));
        tbody.appendChild(tr);
      });`;

c = c.replace(target, replacement);
fs.writeFileSync('dashboard/script.js', c);
console.log('done');
