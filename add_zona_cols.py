with open('dashboard/i18n.js', 'r', encoding='utf-8') as f:
    text = f.read()

en_add = '''
      'col.nombre_ubicacion': 'Zone Name',
'''

es_add = '''
      'col.nombre_ubicacion': 'Nombre de la Zona',
'''

text = text.replace("'col.zona':         'Zone',", "'col.zona':         'Zone'," + en_add)
text = text.replace("'col.zona':         'Zona',", "'col.zona':         'Zona'," + es_add)

with open('dashboard/i18n.js', 'w', encoding='utf-8') as f:
    f.write(text)
