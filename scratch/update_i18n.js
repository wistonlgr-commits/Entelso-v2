const fs = require('fs');
let content = fs.readFileSync('dashboard/i18n.js', 'utf8');

content = content.replace(/'col\.estado': 'Status',/g, "'col.cantidad': 'Qty',\n    'col.estado': 'Status',");
content = content.replace(/'estado\.desconocido': 'Unknown',/g, "'estado.desconocido': 'Unknown',\n    'estado.sin_stock': 'Out of Stock',");
content = content.replace(/'modal\.fecha_registro':'Registration Date \(Optional\)',/g, "'modal.fecha_registro':'Registration Date',\n    'modal.cantidad': 'Quantity',");
content = content.replace(/'drawer\.meta_cal': 'Next Calibration',/g, "'drawer.meta_cantidad': 'Quantity',\n    'drawer.meta_fecha_registro': 'Registration Date',\n    'drawer.meta_cal': 'Next Calibration',");

content = content.replace(/'col\.estado': 'Estado',/g, "'col.cantidad': 'Cant.',\n    'col.estado': 'Estado',");
content = content.replace(/'estado\.desconocido': 'Desconocido',/g, "'estado.desconocido': 'Desconocido',\n    'estado.sin_stock': 'Sin Stock',");
content = content.replace(/'modal\.fecha_registro':'Fecha de Registro \(Opcional\)',/g, "'modal.fecha_registro':'Fecha de Registro',\n    'modal.cantidad': 'Cantidad',");
content = content.replace(/'drawer\.meta_cal': 'Próxima Calibración',/g, "'drawer.meta_cantidad': 'Cantidad',\n    'drawer.meta_fecha_registro': 'Fecha de Registro',\n    'drawer.meta_cal': 'Próxima Calibración',");

fs.writeFileSync('dashboard/i18n.js', content, 'utf8');
