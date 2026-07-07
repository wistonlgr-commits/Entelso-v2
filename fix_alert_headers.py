import re
with open('dashboard/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('<th style="width: 100px;">ID</th>', '<th style="width: 100px;" data-i18n="col.id">ID</th>')
html = html.replace('<th style="width: 170px;">Status</th>', '<th style="width: 170px;" data-i18n="col.estado">Status</th>')

with open('dashboard/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
