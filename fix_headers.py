import re
with open('dashboard/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = re.sub(r'<th>ID</th>\s*<th>Nombre</th>\s*<th>Email</th>', '<th data-i18n="col.id">ID</th>\n                              <th data-i18n="col.nombre">Nombre</th>\n                              <th data-i18n="col.email">Email</th>', html)

with open('dashboard/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
