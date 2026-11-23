# Entelso Inventory

Sistema de control de inventario para equipos, herramientas, kits y consumibles de Entelso. Incluye la API en Node.js (Express + PostgreSQL/Supabase) y el panel web en HTML, CSS y JavaScript plano, además de los endpoints que usa el bot de WhatsApp con n8n.

## Estructura

- `backend/`: API REST en Node.js (`src/server.js`, módulos de autenticación, activos, ítems, movimientos, mantenimientos, usuarios, ubicaciones, equipos de trabajo, alertas, auditoría, carga de imágenes y WhatsApp).
- `dashboard/`: panel web estático (`index.html`, `script.js`, `i18n.js`, `config.js`, `style.css`, manual y videos de ayuda, más `Dockerfile` y `nginx.conf`).
- `init.sql`: esquema completo de PostgreSQL con tablas, índices, vista de alertas y datos iniciales de prueba.
- `docker-compose.yml`: definición para levantar `backend` y `frontend` juntos en Docker.
- `.env.example`: plantilla con las variables que necesita el backend.
- `tests/`: pruebas locales aisladas (emulan PostgreSQL y almacenamiento en memoria para probar sin tocar producción).

## Requisitos

- Node.js 20 o superior (el backend se probó en Node 24).
- Acceso a una base de datos PostgreSQL (o Supabase) con el esquema cargado.
- Opcional: Docker, si prefieres correr los contenedores con `docker compose`.

## Configuración

1. Copia `.env.example` a `backend/.env`.
2. Completa las variables en `backend/.env`:
   - `PORT`: puerto del backend (`3001` en local; en producción puede ser el que asigne el servidor).
   - `NODE_ENV`: `development` o `production`.
   - `DATABASE_URL`: cadena de conexión a PostgreSQL / Supabase.
   - `API_KEY`: clave para el webhook de ingesta (`/api/ingest/whatsapp`).
   - `JWT_SECRET`: clave secreta para firmar sesiones (en producción conviene usar al menos 32 caracteres).
   - `CORS_ORIGIN`: orígenes permitidos separados por coma (o `*` en desarrollo).
   - `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`: credenciales del proyecto en Supabase para subir fotos al bucket `entelso-media`.

No subas `backend/.env` al repositorio.

## Arranque en local (sin Docker)

1. Instala las dependencias del backend:

```bash
cd backend
npm install
```

2. Arranca la API:

```bash
npm start
```

Para desarrollo con recarga automática:

```bash
npm run dev
```

Al iniciar, el servidor comprueba la conexión a la base de datos y ejecuta las migraciones pendientes de `backend/src/migrations/` sin borrar datos existentes. Puedes comprobar que respondió bien abriendo `http://localhost:3001/health`.

3. Sirve el panel web desde la carpeta `dashboard/` con cualquier servidor estático (por ejemplo, `npx serve dashboard` o Live Server). En `localhost` apunta por defecto a `http://localhost:3001`.

## Arranque con Docker

Con `backend/.env` configurado, desde la raíz de `entelso-inventory`:

```bash
docker compose up -d --build
```

- Panel web: `http://localhost` (Nginx sirve los archivos estáticos y redirige `/api/` y `/health` al contenedor del backend).
- API directa: `http://localhost:3001`.

## Notas para despliegue en Coolify / Contabo

- Si despliegas `backend/` y `dashboard/` como servicios separados en Coolify, el contenedor del dashboard acepta la variable de entorno `API_BASE_URL` para definir la URL pública del backend (si no se define, usa el valor configurado en `dashboard/config.js`).
- El healthcheck de `backend/Dockerfile` toma automáticamente el valor de `PORT` (si no se define, usa `3001`). Asegúrate de que el puerto expuesto en Coolify coincida con `PORT`.
- Express tiene habilitado `trust proxy` para leer correctamente la IP detrás de Traefik.

## Pruebas locales

Las pruebas corren de forma aislada en local sin Docker y sin conectarse a Supabase ni modificar `backend/.env`:

```bash
node tests/run_tests.js --tier=all
```
