# BACKUP & RESTORE RUNBOOK

This document details the operational guidelines for executing database/storage backups, restoring services, and resolving database migration failures on the production environment.

---

## 1. BACKUP STRATEGY

### A. Coolify PostgreSQL Backup Plan
* **Frequency**: Daily automated backups.
* **Retention Schedule**:
  - Keep last 7 daily backups.
  - Keep last 4 weekly backups.
  - Keep last 3 monthly backups.
* **Storage Destination**: External S3-compatible cloud bucket (do NOT store backups exclusively on the Hostinger VPS local disk).
* **Manual Backup Before Upgrades**: Run a manual backup in the Coolify PostgreSQL resource panel under the **Backups** tab before deploying code containing database schema migrations.

### B. Persistent Volume `/app/uploads` Backup Plan
Because databases do not contain binary upload files, the persistent directory `/app/uploads` must be backed up separately:
* **Frequency**: Daily cron-job sync.
* **Command Example**: Use `rclone` or AWS CLI from the host machine to sync the volume to your S3 storage:
  ```bash
  tar -czf /tmp/uploads_backup.tar.gz -C /var/lib/docker/volumes/mp-office-uploads/_data .
  aws s3 cp /tmp/uploads_backup.tar.gz s3://your-backup-bucket/uploads/uploads_$(date +%F).tar.gz
  rm /tmp/uploads_backup.tar.gz
  ```

---

## 2. PRODUCTION RESTORE RUNBOOK

In the event of database corruption, data loss, or server failure, follow this exact restoration sequence:

1. **Enable Maintenance Mode**:
   - In the Coolify panel for the Web Application, stop the web container or change the routing domain to a temporary maintenance page.
2. **Stop the Worker**:
   - Stop the BullMQ Notification Worker container in Coolify to prevent queue triggers during database changes.
3. **Restore PostgreSQL Database**:
   - Navigate to PostgreSQL -> **Backups** in Coolify.
   - Choose the preferred daily backup timestamp and click **Restore**.
4. **Restore Storage Volume**:
   - Download the corresponding upload volume archive (`uploads_YYYY-MM-DD.tar.gz`) from S3.
   - Extract it directly into the volume directory on the Hostinger VPS:
     ```bash
     tar -xzf uploads_backup.tar.gz -C /var/lib/docker/volumes/mp-office-uploads/_data
     ```
   - Verify permissions match the non-root execution user:
     ```bash
     chown -R 1001:1001 /var/lib/docker/volumes/mp-office-uploads/_data
     ```
5. **Check Migration Status**:
   - Run the Prisma migration status command to verify database alignment:
     ```bash
     DATABASE_URL="[CONNECTION_STRING]" npx prisma migrate status
     ```
6. **Restart Services**:
   - Start the Web application container.
   - Confirm liveness and readiness metrics by calling `/api/health/ready`.
   - Start the BullMQ Notification Worker container.
7. **Verify & Test**:
   - Run core smoke tests (logins, schedule filters, checklists, and manual push tests).

---

## 3. DATABASE MIGRATION FAILURE RESOLUTION

If `npx prisma migrate deploy` fails during deployment:
* **The deployment process will exit with a non-zero code** and prevent the new Next.js web application image from routing traffic, maintaining current production version access.
* **Do NOT run destructive down migrations** or `prisma migrate reset` in production (this will clear all tables!).

### Resolution Procedure:
1. **Fetch Diagnostic Details**:
   - Check the migration logs in the Coolify deployment panel.
   - Run the status checker command to see which migration is partially applied:
     ```bash
     npx prisma migrate status
     ```
2. **Handle Drifts & Partial Application**:
   - If a migration failed halfway through execution, log into your PostgreSQL database console and manually verify/adjust the tables to match the migration state.
   - Once database structures are corrected to match the migration schema state, mark the migration as resolved:
     ```bash
     npx prisma migrate resolve --applied [MIGRATION_DIRECTORY_NAME]
     ```
3. **Redeploy**:
   - Trigger a rebuild/re-deploy inside Coolify to verify the migration status passes correctly.
