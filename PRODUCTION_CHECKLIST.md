# PRODUCTION SMOKE TEST CHECKLIST

This document lists the essential validation steps that must be executed on the target environment after every deployment.

---

## 1. AUTHENTICATION & SECURITY
- [ ] **First-Time Password Change**: Confirm that logging in with the bootstrap admin account triggers a mandatory password reset.
- [ ] **Deactivation Test**: Create a temporary staff account, deactivate it, and verify that login requests are instantly rejected.
- [ ] **Cookie Protection**: Open browser Developer tools and verify that session cookies (`better-auth.session_token`) are flagged as `HttpOnly`, `Secure`, and `SameSite=Lax`.
- [ ] **Authorized Storage Access**: Attempt to fetch a private document attachment URL without logging in. Verify that the server returns a `401 Unauthorized` block.

---

## 2. SCHEDULES & CALENDAR
- [ ] **Event Creation**: Create a tour schedule with description, category, and assignments.
- [ ] **Time Display**: Verify that dates and times render correctly in the `"Asia/Kolkata"` timezone (IST).
- [ ] **Staff Assignment**: Assign multiple staff members to an event, and verify that the event appears on their dashboard feeds.

---

## 3. VISIT CHECKLISTS & OFFLINE SYNC
- [ ] **Automatic Checklist Generation**: Confirm that creating a schedule automatically generates the associated checklist.
- [ ] **Checklist Updates**: Edit checkbox items and write remarks. Confirm that changes persist.
- [ ] **Offline Operation**: Go offline (using Chrome DevTools Network offline throttle) and update a checklist item. Check that it stores locally in IndexedDB.
- [ ] **Reconnection Sync**: Return online and confirm that pending mutations are automatically synced to the server without conflict alerts.

---

## 4. SOCIAL MEDIA TRACKING
- [ ] **Post Requirements**: Toggle the social media required coverage option on a schedule.
- [ ] **Workflow Steps**: Submit content draft, approve draft, and publish the links.
- [ ] **Delayed Warnings**: Check that schedules with pending posts older than 24 hours are correctly flagged with warning alerts.

---

## 5. TTD VIP LETTERS & QUOTA
- [ ] **Duplicate Request Warning**: Create a TTD request for a traveler who had a request in the last 30 days. Verify that a warning badge is triggered.
- [ ] **Status Flow**:
  - Start verification and verify request details.
  - Approve request (verify that the quota period allocation decreases by 1).
  - Prepare recommendation letter (enter letter ID and date).
  - Distribute letter to primary applicant.
- [ ] **Quota Ledger Audit**: Open TTD Quotas report and verify that allocations, reservations, and issuance counters are consistent.

---

## 6. PUSH NOTIFICATIONS & WORKER LOGS
- [ ] **PWA Subscription**: Click "Enable Notifications" in the browser and verify the browser prompt.
- [ ] **Test Delivery**: Trigger a manual test notification from the admin panel. Confirm receipt of the push alert.
- [ ] **Worker Verification**: Check the logs of the BullMQ Worker container to confirm the task processor started, established connection to Redis, and executed the job.

---

## 7. OPERATIONAL REPORTS & EXPORTS
- [ ] **Filters Presets**: Test "This Week", "This Month", and "Custom" date presets on schedules and checklists reports.
- [ ] **Excel Downloads**: Export the Schedules report. Confirm that:
  - Max export limit boundaries (2000 rows) are verified.
  - User input values containing `=`, `+`, `-`, or `@` are sanitized with a prepended single quote.
- [ ] **Print/PDF Layouts**: Click Print on the reports workspace page. Confirm that the printable page hide-controls are active and format cleanly on standard A4 layout boundaries.
