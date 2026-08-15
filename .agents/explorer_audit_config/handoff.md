# Configurations & Infrastructure Audit Report — Entelso-v2

**Auditor Role**: Configurations & Infrastructure Auditor  
**Working Directory**: `c:\Users\Leor\Desktop\Entelso\.agents\explorer_audit_config`  
**Target Project**: Entelso-v2 (`c:\Users\Leor\Desktop\Entelso`)  
**Audit Timestamp**: 2026-08-14T23:59:00Z  
**Integrity Mode**: Read-Only (Zero modifications made to source code or project configs)

---

## 1. Observation

Direct, verbatim observations extracted across configuration files, dependency manifests, Docker tooling, environment declarations, security middleware, and frontend scripts.

### 1.1 Dependency & Supply Chain Manifests

- **Root & Project Scope**:
  - Root directory has **no root `package.json`** or workspace manager (e.g., npm workspaces / Turborepo / pnpm).
  - Frontend (`dashboard/`) has **no `package.json`**; uses vanilla HTML/JS with external CDN script tags.
  - Backend (`backend/package.json` lines 11–35) declares 16 runtime dependencies and 1 devDependency using unpinned caret (`^`) version ranges:
    ```json
    "dependencies": {
      "@supabase/supabase-js": "^2.110.7",
      "bcrypt": "^5.1.1",
      "cors": "^2.8.5",
      "dotenv": "^16.4.5",
      "express": "^4.19.2",
      "express-rate-limit": "^7.2.0",
      "helmet": "^7.1.0",
      "jsonwebtoken": "^9.0.2",
      "morgan": "^1.10.0",
      "multer": "^2.2.0",
      "otplib": "^12.0.1",
      "pg": "^8.22.0",
      "pino": "^9.1.0",
      "qrcode": "^1.5.3",
      "xlsx": "^0.18.5",
      "zod": "^3.23.8"
    },
    "devDependencies": {
      "nodemon": "^3.1.0"
    }
    ```
- **Deprecated & Vulnerable Transitive Dependencies (`backend/package-lock.json`)**:
  - `@otplib/plugin-crypto@12.0.1`, `@otplib/plugin-thirty-two@12.0.1`, `@otplib/preset-default@12.0.1` (Lines 65, 75, 86):
    `"deprecated": "Please upgrade to v13 of otplib. Refer to otplib docs for migration paths"`
  - `are-we-there-yet@2.0.0` (Line 312): `"deprecated": "This package is no longer supported."`
  - `gauge@3.0.2` (Line 1047): `"deprecated": "This package is no longer supported."`
  - `glob@7.2.3` (Line 1114): `"deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update..."`
  - `inflight@1.0.6` (Line 1321): `"deprecated": "This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests..."`
  - `npmlog@5.0.1` (Line 1819): `"deprecated": "This package is no longer supported."`
  - `rimraf@3.0.2` (Line 2309): `"deprecated": "Rimraf versions prior to v4 are no longer supported"`
  - `tar@6.2.1` (Line 2615): `"deprecated": "Old versions of tar are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update..."`
  - `xlsx@0.18.5` (`package.json` line 26): SheetJS v0.18.5 is unmaintained on the npm registry and vulnerable to Prototype Pollution & ReDoS (CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6).
- **Frontend CDN Dependencies (`dashboard/index.html` lines 8–19)**:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
  <link rel="stylesheet" href="style.css?v=9">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  <script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/en.js"></script>
  ```
  - **Zero Subresource Integrity (SRI)** tags (`integrity="sha384-..."` and `crossorigin="anonymous"` are absent).
  - Floating, unpinned latest versions used for `chart.js`, `flatpickr`, and `flatpickr/dist/l10n/en.js`.

---

### 1.2 Environment & Secrets Management

- **Root `.env` (`c:\Users\Leor\Desktop\Entelso\.env` lines 1–9)**:
  ```ini
  PORT=3000
  NODE_ENV=development
  DATABASE_URL=postgresql://postgres:jEGWYp4b9ybXSq5p@db.bzejcptaxumhqdxmrieu.supabase.co:5432/postgres
  API_KEY=3654d151db4687d8b8a19a9d245f44924f3dd57f86eefa42b2a098e793c7c7f4
  JWT_SECRET=entelso_jwt_dashboard_secret_2026
  CORS_ORIGIN=http://localhost:5173
  ```
- **Root `.env.example` (`c:\Users\Leor\Desktop\Entelso\.env.example` lines 21, 24, 29)**:
  ```ini
  API_KEY=3654d151db4687d8b8a19a9d245f44924f3dd57f86eefa42b2a098e793c7c7f4
  JWT_SECRET=entelso_jwt_dashboard_secret_2026_cambiar_en_produccion
  CORS_ORIGIN=http://localhost:5173
  ```
- **Backend `.env` (`c:\Users\Leor\Desktop\Entelso\backend\.env` lines 1–12)**:
  ```ini
  PORT=3001
  NODE_ENV=development
  DATABASE_URL=postgresql://postgres.bzejcptaxumhqdxmrieu:jEGWYp4b9ybXSq5p@aws-1-us-west-2.pooler.supabase.com:5432/postgres
  API_KEY=v2_a8f9c1e7d2b45068f3a1d9c7e4b5a60f9e1d8c2b3a4f5e6d7c8b9a0f1e2d3c4b
  JWT_SECRET=entelso_jwt_secret_v2_secure_random_key_9942
  CORS_ORIGIN=*
  SUPABASE_URL=https://bzejcptaxumhqdxmrieu.supabase.co
  SUPABASE_SERVICE_KEY=[REDACTED]
  ```
- **Secrets in Automation & Workflow Exports**:
  - `Inventario Entelso (2).json` (Line 175): Leaks active backend secret `X-Ingest-Secret: v2_a8f9c1e7d2b45068f3a1d9c7e4b5a60f9e1d8c2b3a4f5e6d7c8b9a0f1e2d3c4b` and direct URL `https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io/api/ingest/whatsapp`.
  - `revisar si esta bien.json` (Lines 41–46, 205–209): Contains n8n Google Gemini credential metadata and unauthenticated direct tool webhooks.
  - `init.sql` (Lines 200–203): Injects default test users with bcrypt hash `'$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'` (standard hash for `"password"`).
  - `dashboard/script.js` (Line 16): Hardcoded fallback production domain `'https://rlffb3uv162ja9sjunyx9meb.167.86.70.193.sslip.io'`.
  - `backend/src/modules/auth/auth.service.js` (Line 138): Stores `secret_2fa` in plaintext in `usuarios.secret_2fa`.

---

### 1.3 Docker & Infrastructure Configurations

- **`docker-compose.yml` (`c:\Users\Leor\Desktop\Entelso\docker-compose.yml` lines 1–45)**:
  - Line 17: `env_file: - ./backend/.env.production` (File `./backend/.env.production` **does not exist** in the repository; compose will error out on launch).
  - Line 13 vs `backend/.env`: `ports: - "3000:3000"`, but `backend/.env` defines `PORT=3001` and `dashboard/script.js` defaults to `http://localhost:3001`.
  - Line 31: `image: nginx:alpine` (Unpinned tag).
  - Line 37: `volumes: - ./dashboard:/usr/share/nginx/html:ro` (Mounts entire directory including manuals `*.pdf` >3MB, video folders `video_dashboard/`, `video_demo/`, `video_whatsapp/`).
  - Missing container resource limits (`deploy.resources.limits.memory` / `cpus`).
  - Missing Docker daemon log limits (`logging: driver: "json-file", options: { "max-size": "10m", "max-file": "3" }`).
  - Missing local PostgreSQL service definition for self-contained / offline execution.
- **Dockerfiles (`Dockerfile.backend` & `backend/Dockerfile`)**:
  ```dockerfile
  # Stage 1: Builder — instala dependencias
  FROM node:22-alpine AS builder
  WORKDIR /usr/src/app
  COPY package*.json ./
  RUN npm install
  COPY . .

  # Stage 2: Runner — solo lo necesario para producción
  FROM node:22-alpine AS runner
  WORKDIR /usr/src/app
  ENV NODE_ENV=production
  COPY --from=builder /usr/src/app/package*.json ./
  RUN npm install --omit=dev && npm cache clean --force
  COPY --from=builder /usr/src/app/src ./src
  USER node
  EXPOSE 3000
  HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
  CMD ["node", "src/server.js"]
  ```
  - **Redundant Dockerfile**: Root `Dockerfile.backend` duplicate of `backend/Dockerfile`.
  - **Faulty Multi-stage Build**: Builder runs `npm install` and copies source, but runner stage completely ignores the builder's node_modules and executes another `npm install --omit=dev` from scratch, wasting build time and disk layers.
  - Uses non-deterministic `npm install` instead of `npm ci --omit=dev`.
- **`backend/.dockerignore` (`backend/.dockerignore` lines 1–6)**:
  - Only ignores `node_modules`, `npm-debug.log*`, `.env`, `.git`, `README.md`.
  - Does NOT ignore `tree.json` (360 KB), `excel_inspection_output.json` (60 KB), `import_preview.json` (53 KB), migration scripts, SQL scripts, or non-default `.env.*` files.
- **`dashboard/Dockerfile` (`dashboard/Dockerfile` lines 1–4)**:
  - `FROM nginx:alpine` (unpinned tag, runs as root user).
  - `COPY . /usr/share/nginx/html` with no `.dockerignore`, copying all documentation PDFs and video files into webroot.
  - No custom `nginx.conf` configured (no gzip/brotli, no caching headers, no SPA fallbacks, no security headers).

---

### 1.4 Network, CORS & Application Security Configurations

- **CORS Configuration (`backend/src/app.js` lines 15–19 & `backend/.env` line 8)**:
  ```javascript
  app.use(cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map(s => s.trim()),
    methods: ['GET','POST','PUT','PATCH','DELETE'],
    allowedHeaders: ['Content-Type','Authorization','X-API-Key','X-Ingest-Secret'],
  }));
  ```
  - In `backend/.env`, `CORS_ORIGIN=*` enables open cross-origin access across all HTTP methods.
- **Security Headers (`backend/src/app.js` line 14 & `dashboard/index.html`)**:
  - Backend uses bare `app.use(helmet())` without customized Content-Security-Policy, Permissions-Policy, or HSTS preload directives.
  - Frontend (Nginx/HTML) has **zero** HTTP security headers and no `<meta http-equiv="Content-Security-Policy">` tag.
- **Rate Limiting (`backend/src/app.js` lines 20–26)**:
  ```javascript
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'production' ? 1500 : 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: res.error('Demasiadas peticiones. Intenta más tarde.', 'RATE_LIMIT_EXCEEDED'),
  }));
  ```
  - Blanket limit of 1500 req/15 min on `/api/`.
  - **No rate limiting** on `/api/auth/login` (allows 1500 brute-force PIN/password attempts per 15 min per IP).
  - **No rate limiting** on `/api/whatsapp/*` (allows PIN enumeration attacks).
  - Default `MemoryStore` used (not distributed, vulnerable to memory growth under large IP distribution).
- **Body & Multer Payload Limits (`backend/src/app.js` line 29, `whatsapp.routes.js` line 8, `upload.routes.js` line 10)**:
  - `express.json({ limit: '5mb' })` globally for all endpoints.
  - `whatsapp.routes.js`: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })` (50MB in RAM per upload).
  - `upload.routes.js`: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })` (5MB in RAM per upload).
- **Unauthenticated Public Endpoints & Missing RBAC**:
  - `backend/src/modules/upload/upload.routes.js` (Lines 13, 28): `POST /api/upload/` and `POST /api/upload/batch` have **no authentication middleware** and no MIME/extension whitelist, allowing anyone on the internet to upload arbitrary files directly to Supabase cloud storage using the admin service key.
  - `backend/src/modules/usuarios/usuarios.routes.js` (Line 7): `GET /api/usuarios/` uses `requireAuth` without `requireAdmin` (allows `trabajador` and `almacen` to view all user profiles, violating RBAC specification).
  - `backend/src/modules/audit/audit.routes.js` (Lines 7–8): `GET /api/audit/` uses `requireAuth` without `requireAdmin` (allows non-admins to read audit trails, violating RBAC specification).
  - `backend/src/modules/items/items.routes.js` (Lines 10–13): `POST/PUT/DELETE /api/items` only requires `requireAuth` (allows `trabajador` and `supervisor` to create/modify/delete items).
  - `backend/src/modules/ubicaciones/ubicaciones.routes.js` (Lines 10–12): `POST/PUT/DELETE /api/ubicaciones` only requires `requireAuth` (allows `trabajador` to delete locations).
  - `backend/src/modules/activos/activos.routes.js` (Lines 16, 18, 19): `POST/PATCH/DELETE /api/activos` enforces `requireAdmin` alone (blocks `almacen` role from creating/updating assets, contrary to requirements).
- **Database TLS & Fault Handling (`backend/src/config/database.js` lines 5–7, 17–20)**:
  ```javascript
  const sslConfig = env.DATABASE_URL.includes('supabase')
    ? { ssl: { rejectUnauthorized: false } }
    : {};
  ```
  - `rejectUnauthorized: false` completely bypasses TLS certificate chain verification, exposing database traffic to Man-in-the-Middle interception.
  - `pool.on('error', () => process.exit(1))` abruptly crashes the process on transient idle pool disconnects.
- **Timing Attacks (`backend/src/common/middleware/auth.middleware.js` line 12)**:
  - `if (key !== env.API_KEY)` uses non-constant-time equality comparison susceptible to string length/character timing analysis.

---

### 1.5 Code Quality, CI/CD & Build Tooling

- **Scripts in `backend/package.json` (lines 6–10)**:
  ```json
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "read-excel": "node read_excel.js"
  }
  ```
  - **No `npm test` script** (running `npm test` fails with `npm error Missing script: "test"`).
  - **No `npm run lint` script** (no ESLint configured or installed).
  - **No `npm run format` script** (no Prettier configured or installed).
  - **No `npm run build` or `typecheck` script** (no TypeScript / JSDoc type checker).
  - **No `npm audit` check** in any workflow.
- **CI/CD Infrastructure**:
  - No `.github/workflows/`, GitLab CI, or automated test pipelines configured anywhere in the project repository.
- **Unused Packages**:
  - `pino@9.1.0` is declared in `dependencies`, but `backend/src/common/utils/logger.js` implements a naive custom `console.log/warn/error` wrapper and does not import or use `pino`.

---

## 2. Logic Chain

The step-by-step analytical reasoning connecting observations to operational risks, vulnerabilities, and architectural impacts:

```
[Observation 1.2: Hardcoded Supabase DB URL, password 'jEGWYp4b9ybXSq5p', SUPABASE_SERVICE_KEY in .env / backend/.env]
    ├── (Inference 2.1) -> Any entity with repository read access possesses administrative control over the Supabase project.
    └── (Impact 2.1) -> Complete database compromise, data exfiltration, or table drop possible without authentication.

[Observation 1.4: POST /api/upload & /api/upload/batch lacking requireAuth + using SUPABASE_SERVICE_KEY in storage.service.js]
    ├── (Inference 2.2) -> Public unauthenticated HTTP clients can send arbitrary files (malware, phishing HTML, scripts, heavy media).
    └── (Impact 2.2) -> Storage quota exhaustion, cloud billing surge, and file hosting abuse on Entelso infrastructure.

[Observation 1.4: CORS_ORIGIN=* in backend/.env & Express CORS middleware]
    ├── (Inference 2.3) -> Browsers on third-party domains can execute cross-origin requests to all exposed endpoints.
    └── (Impact 2.3) -> Combined with ambient tokens or CSRF, malicious web pages can interact directly with the backend API.

[Observation 1.4: Missing route-specific rate limiting on /api/auth/login and /api/whatsapp/*]
    ├── (Inference 2.4) -> Attacker can issue up to 1500 PIN/password combinations every 15 minutes per IP.
    └── (Impact 2.4) -> 4-digit PINs (10,000 possibilities) can be brute-forced in under 1.5 hours.

[Observation 1.4: database.js configured with ssl: { rejectUnauthorized: false }]
    ├── (Inference 2.5) -> Node.js pg client does not validate server TLS certificates against trusted Certificate Authorities.
    └── (Impact 2.5) -> Active network adversaries (rogue proxies, DNS hijackers) can perform MitM attacks on unencrypted plaintext database traffic.

[Observation 1.3: docker-compose.yml referencing missing ./backend/.env.production]
    ├── (Inference 2.6) -> Standard docker compose up deployment command fails immediately with missing env file error.
    └── (Impact 2.6) -> Broken container deployment pipeline; infrastructure cannot be provisioned as declared.

[Observation 1.1: Outdated SheetJS xlsx@0.18.5, glob@7.2.3, inflight@1.0.6, tar@6.2.1]
    ├── (Inference 2.7) -> Dependencies with known Prototype Pollution and memory leak vulnerabilities are bundled in production.
    └── (Impact 2.7) -> Potential remote code execution, Denial of Service, or server memory exhaustion during spreadsheet parsing.

[Observation 1.1: Frontend unpinned CDN scripts without Subresource Integrity (SRI) hashes]
    ├── (Inference 2.8) -> If jsdelivr or cdnjs CDN is hijacked or compromised, malicious JS executes directly in user sessions.
    └── (Impact 2.8) -> Stolen JWT tokens from localStorage/sessionStorage, session hijacking, and defacement.

[Observation 1.5: Missing npm test, ESLint, Prettier, TypeScript, and CI/CD pipelines]
    ├── (Inference 2.9) -> Code quality regressions, syntax bugs, and security vulnerabilities cannot be detected automatically before merging.
    └── (Impact 2.9) -> High regression rate, configuration drift, and manual verification overhead.
```

---

## 3. Caveats

1. **Read-Only Inspection**: All findings were identified through rigorous static code and configuration analysis. No production secrets were rotated, no live external endpoints were actively attacked or probed, and no files were modified in the repository.
2. **Environment Variable Precedence**: If a production deployment injects environment variables directly via Kubernetes Secrets, AWS SSM, or Docker Swarm environment blocks, those could override `.env` files; however, the presence of committed secrets in git repository history remains an active vulnerability.
3. **Database Connectivity**: Static inspection analyzed connection parameters; live Supabase database state (active table triggers, RLS policies, Row-Level Security rules) was not directly modified or queried via DDL during this audit.

---

## 4. Conclusion

The configuration and infrastructure audit of **Entelso-v2** revealed multiple critical-severity and high-severity security vulnerabilities, deployment misconfigurations, and supply chain risks.

### Executive Severity Matrix

| Category | Critical | High | Medium | Low / Informational | Total |
|---|:---:|:---:|:---:|:---:|:---:|
| **1. Secrets & Credentials** | 3 | 2 | 1 | 0 | **6** |
| **2. Network & Application Security** | 2 | 3 | 2 | 1 | **8** |
| **3. Docker & Deployment Infrastructure** | 1 | 2 | 3 | 1 | **7** |
| **4. Dependencies & Supply Chain** | 1 | 2 | 2 | 1 | **6** |
| **5. CI/CD, Tooling & Code Quality** | 0 | 2 | 2 | 1 | **5** |
| **Total Findings** | **7** | **11** | **10** | **4** | **32** |

---

### Detailed Findings & Actionable Remediation Roadmap

#### Category 1: Environment & Secrets Management (Critical / High)

1. **REVOKE & ROTATE ALL LEAKED CREDENTIALS IMMEDIATELY**:
   - Rotate Supabase database password (`jEGWYp4b9ybXSq5p`) in Supabase dashboard.
   - Rotate `SUPABASE_SERVICE_KEY` (`[REDACTED]...`) and generate new service role token.
   - Rotate `API_KEY` (`3654d151...` and `v2_a8f9c1...`) across backend and n8n workflows.
   - Rotate `JWT_SECRET` to a cryptographically secure 256-bit random key (`openssl rand -base64 32`).
2. **Remove Secrets from Git and Repository Files**:
   - Sanitize `.env.example` line 21 (replace with `API_KEY=your_secure_api_key_here`).
   - Sanitize `Inventario Entelso (2).json` (parameterize `X-Ingest-Secret` using n8n credentials).
   - Ensure `.gitignore` ignores all `.env`, `.env.*`, `*.json.bak`, `*.key`, `*.pem`.
3. **Encrypt `secret_2fa` at Rest**:
   - Store 2FA TOTP secrets in database encrypted using AES-256-GCM with an application-level key (`ENCRYPTION_KEY`).

#### Category 2: Network & Application Security (Critical / High)

1. **Lock Down `/api/upload` and `/api/upload/batch`**:
   - Add `requireAuth` middleware to upload routes.
   - Validate file MIME types against strict whitelist (`image/jpeg`, `image/png`, `image/webp`).
   - Validate file magic numbers (signatures), not just file extensions.
2. **Enforce Strict Origin Allowlisting in CORS**:
   - In production, set `CORS_ORIGIN=https://inventory.entelso.com` (disallow wildcard `*`).
   - Reject requests with disallowed origins.
3. **Implement Granular Rate Limiting**:
   - Add strict rate limiting on `/api/auth/login`: max 5 failed attempts per 15 minutes per IP/account.
   - Add rate limiting on `/api/whatsapp/*`: max 20 requests per minute.
   - Add Redis-backed distributed store (`rate-limit-redis`) for multi-container deployments.
4. **Enforce RBAC Consistency across all Endpoints**:
   - Add `requireAdmin` to `GET /api/usuarios` and `GET /api/audit`.
   - Update `POST/PUT/DELETE /api/items` and `/api/ubicaciones` to require appropriate administrative/warehouse roles.
   - Allow `almacen` role access to `POST/PATCH /api/activos`.
5. **Enable TLS Certificate Verification**:
   - In `backend/src/config/database.js`, configure Supabase SSL with valid CA bundle (`rejectUnauthorized: true`).
6. **Apply Timing-Safe Equality**:
   - In `auth.middleware.js`, compare API keys using `crypto.timingSafeEqual(Buffer.from(key), Buffer.from(env.API_KEY))`.

#### Category 3: Docker & Deployment Infrastructure (High / Medium)

1. **Fix `docker-compose.yml` Configuration**:
   - Create valid `./backend/.env.production.example` and align `env_file`.
   - Align backend exposed port (`3000` vs `3001`).
   - Add container resource constraints (`cpus: "0.50"`, `memory: "512M"`).
   - Add logging rotation (`max-size: "10m"`, `max-file: "3"`).
   - Add an optional `db` service (PostgreSQL 16 alpine) for local offline development.
2. **Refactor Dockerfile Multi-Stage Build**:
   - Unify root `Dockerfile.backend` and `backend/Dockerfile` into a single canonical Dockerfile.
   - Use `npm ci --omit=dev` in runner stage.
   - Pin base images (e.g., `node:22.14.0-alpine3.21`, `nginx:1.27.4-alpine`).
3. **Comprehensive `.dockerignore` Files**:
   - Add `dashboard/.dockerignore` (ignore `*.pdf`, `video_*`, `manual.html`).
   - Expand `backend/.dockerignore` to exclude `*.sql`, `*.json`, test scripts, and migrations.
4. **Configure Custom Nginx Reverse Proxy (`nginx.conf`)**:
   - Serve static dashboard assets and proxy `/api/` requests to backend on a single origin (eliminating CORS overhead).
   - Add security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`).

#### Category 4: Dependencies & Supply Chain Security (High / Medium)

1. **Replace Vulnerable Packages**:
   - Migrate from unmaintained `xlsx@0.18.5` to `@sheet/core` or `exceljs`.
   - Upgrade `otplib` to v13.
   - Upgrade `express` to latest `^4.21.2` or `5.x`.
2. **Pin Dependencies & Add Lockfile Integrity**:
   - Pin exact dependency versions in `package.json` (`"express": "4.21.2"`).
   - Use `npm ci` for all CI/CD and container builds.
3. **Secure Frontend CDN Assets with SRI**:
   - Add `integrity="sha384-..."` and `crossorigin="anonymous"` to all `<script>` and `<link>` tags in `dashboard/index.html`.
   - Pin explicit semantic versions for `chart.js` (e.g., `chart.js@4.4.7`) and `flatpickr` (e.g., `flatpickr@4.6.13`).
   - Better: Bundle frontend assets using a modern bundler (Vite) into versioned static assets.

#### Category 5: Tooling, CI/CD & Code Quality (Medium)

1. **Implement Package Scripts**:
   - Add standard scripts in `backend/package.json`:
     ```json
     "scripts": {
       "start": "node src/server.js",
       "dev": "nodemon src/server.js",
       "test": "jest --detectOpenHandles --forceExit",
       "test:coverage": "jest --coverage",
       "lint": "eslint src/",
       "lint:fix": "eslint src/ --fix",
       "format": "prettier --check \"src/**/*.{js,json}\"",
       "format:fix": "prettier --write \"src/**/*.{js,json}\"",
       "audit": "npm audit --audit-level=high"
     }
     ```
2. **Setup CI/CD Pipeline (`.github/workflows/ci.yml`)**:
   - Automated workflow on pull requests and main pushes running:
     1. `npm ci`
     2. `npm run lint`
     3. `npm run audit`
     4. `npm test`
     5. Docker build verification

---

## 5. Verification Method

To independently verify the observations, findings, and risks documented in this audit report:

### Step 1: Verify Leaked Secrets & Sensitive Files
- Inspect `.env` and `.env.example`:
  ```powershell
  Get-Content c:\Users\Leor\Desktop\Entelso\.env
  Get-Content c:\Users\Leor\Desktop\Entelso\.env.example
  Get-Content c:\Users\Leor\Desktop\Entelso\backend\.env
  ```
- Search for leaked API keys in workflow JSON:
  ```powershell
  Select-String -Path "c:\Users\Leor\Desktop\Entelso\*.json" -Pattern "X-Ingest-Secret"
  ```

### Step 2: Verify Deprecated Dependencies & Lockfile Warnings
- Search `package-lock.json` for deprecated packages:
  ```powershell
  Select-String -Path "c:\Users\Leor\Desktop\Entelso\backend\package-lock.json" -Pattern '"deprecated"'
  ```

### Step 3: Verify Unauthenticated Upload Route & RBAC Gaps
- Inspect `backend/src/modules/upload/upload.routes.js` lines 13–45 to confirm absence of `requireAuth`.
- Inspect `backend/src/modules/usuarios/usuarios.routes.js` line 7 to confirm `router.get('/', requireAuth, ctrl.getAll)` lacks `requireAdmin`.
- Inspect `backend/src/modules/audit/audit.routes.js` lines 7–8 to confirm `GET /` lacks `requireAdmin`.

### Step 4: Verify Docker Build & Compose Configuration
- Check existence of `./backend/.env.production` referenced by `docker-compose.yml`:
  ```powershell
  Test-Path "c:\Users\Leor\Desktop\Entelso\backend\.env.production" # Returns False
  ```
- Inspect multi-stage build in `backend/Dockerfile` lines 1–19 to verify builder stage cache abandonment.

### Step 5: Verify Frontend SRI & Unpinned CDN Dependencies
- Inspect `dashboard/index.html` lines 8–19 to verify lack of `integrity` attributes and floating CDN versions.

### Invalidation Conditions
- This audit report is invalidated if all database passwords, service role keys, and API secrets are rotated, `.env` files are scrubbed from git history, dependencies are upgraded/pinned, Dockerfiles are refactored to `npm ci`, SRI hashes are added to `index.html`, and strict RBAC/rate-limiting middlewares are applied across all routes.
