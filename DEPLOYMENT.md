# DEPLOYMENT GUIDE - MP OFFICE PORTAL

This document details the configuration instructions and architectural setup to deploy the MP Office Portal on Hostinger VPS using Coolify and Docker.

---

## 1. TARGET INFRASTRUCTURE
* **Host OS**: Hostinger VPS with Ubuntu 24.04
* **Node Target**: Node 22 (using `node:22-alpine` base image)
* **Control Panel**: Coolify (Self-hosted)
* **Application Pack**: Docker Multi-stage target
* **Services**:
  1. Next.js Web App (Docker Target: `web`)
  2. BullMQ Worker (Docker Target: `worker`)
  3. Coolify-managed PostgreSQL Resource (Version 16+)
  4. Coolify-managed Redis Resource (Version 7+)
  5. Persistent Volume Mount: `/app/uploads`

---

## 2. COOLIFY RESOURCE DEPLOYMENT CONFIGURATIONS

Depending on your version of Coolify, choose one of the following deployment options.

### Option A: Coolify Supports Docker Build Targets
If your Coolify dashboard exposes a **Docker Target** input field in the application resource settings:
1. **Web App Resource**:
   * **Build Pack**: `Dockerfile`
   * **Docker Target**: `web`
   * **Application Port**: `3000`
   * **Domain**: `https://schedule.yourdomain.com`
2. **Worker Resource**:
   * **Build Pack**: `Dockerfile`
   * **Docker Target**: `worker`
   * **Domains**: Leave blank (no public domain or ports exposed)
   * **Start Command**: `npm run worker:production`

### Option B: Coolify Does Not Support Docker Targets
If your Coolify version does not expose a Docker target input field, configure both applications using a production Docker Compose configuration:
1. Create a **Docker Compose** application in Coolify.
2. Provide the following `docker-compose.yml` configurations to build the unified `Dockerfile` with separate target targets:
   ```yaml
   version: '3.8'

   services:
     web:
       build:
         context: .
         dockerfile: Dockerfile
         target: web
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
         - DATABASE_URL=$$DATABASE_URL
         - REDIS_URL=$$REDIS_URL
         - BETTER_AUTH_SECRET=$$BETTER_AUTH_SECRET
         - BETTER_AUTH_URL=$$BETTER_AUTH_URL
         - NEXT_PUBLIC_APP_URL=$$NEXT_PUBLIC_APP_URL
         - NEXT_PUBLIC_VAPID_PUBLIC_KEY=$$NEXT_PUBLIC_VAPID_PUBLIC_KEY
         - VAPID_PRIVATE_KEY=$$VAPID_PRIVATE_KEY
         - VAPID_SUBJECT=$$VAPID_SUBJECT
         - UPLOAD_DIR=/app/uploads
       volumes:
         - mp-office-uploads:/app/uploads

     worker:
       build:
         context: .
         dockerfile: Dockerfile
         target: worker
       environment:
         - NODE_ENV=production
         - DATABASE_URL=$$DATABASE_URL
         - REDIS_URL=$$REDIS_URL
         - BETTER_AUTH_SECRET=$$BETTER_AUTH_SECRET
         - BETTER_AUTH_URL=$$BETTER_AUTH_URL
         - NEXT_PUBLIC_APP_URL=$$NEXT_PUBLIC_APP_URL
         - NEXT_PUBLIC_VAPID_PUBLIC_KEY=$$NEXT_PUBLIC_VAPID_PUBLIC_KEY
         - VAPID_PRIVATE_KEY=$$VAPID_PRIVATE_KEY
         - VAPID_SUBJECT=$$VAPID_SUBJECT
       restart: always

   volumes:
     mp-office-uploads:
       external: true
       name: mp-office-uploads
   ```

---

## 3. DEPLOYMENT SEQUENCE & MIGRATIONS

You must execute updates and initial installs in this exact sequence:

1. **Back up PostgreSQL**: Create a manual data snapshot in the Coolify PostgreSQL resource panel.
2. **Build the new image**: Trigger the Coolify image compile/build.
3. **Run migrations**: Run the migration script once on the database:
   ```bash
   npm run db:migrate:deploy
   ```
4. **Run seeding (Optional)**: Run the production seeding command only during initial setup or when safe defaults need updating:
   ```bash
   npm run db:seed:production
   ```
5. **Start/Update Web Application**: Trigger start or rolling update of the Next.js web application container.
6. **Verify health**: Verify success by querying the readiness API: `https://schedule.yourdomain.com/api/health/ready`.
7. **Start/Update Worker**: Trigger start or rolling update of the BullMQ Notification Worker container.
8. **Run Smoke Tests**: Execute post-deployment smoke tests according to the `PRODUCTION_CHECKLIST.md` guidelines.
9. **Remove Admin Password Envs**: Open your Coolify environment parameters configuration panel and remove the `INITIAL_ADMIN_PASSWORD` variable immediately after initial administrator creation is verified.

---

## 4. PROXIES & NETWORK FIREWALL RULES
* **Public Ports**: 
  - `80` (HTTP redirects to HTTPS)
  - `443` (HTTPS - Coolify Traefik reverse proxy handles SSL termination automatically)
  - `22` (SSH - VPS control access)
* **Internal Ports**:
  - Web container: `3000` (routed via Coolify reverse proxy)
  - Database: `5432` (accessible internally only)
  - Redis: `6379` (accessible internally only)
