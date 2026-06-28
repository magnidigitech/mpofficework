## Recommended Tech Stack

For your **MP schedule, checklist, social media tracking, TTD letter management and push-notification PWA**, the best balance of professionalism, scalability, and limited Antigravity credit usage is a **single-codebase modular application**.

| Layer                 | Recommended Technology                    |
| --------------------- | ----------------------------------------- |
| Full-stack framework  | **Next.js App Router + TypeScript**       |
| UI                    | **Tailwind CSS + shadcn/ui**              |
| PWA                   | **Service Worker + Workbox/Serwist**      |
| Offline storage       | **IndexedDB using Dexie.js**              |
| Authentication        | **Better Auth**                           |
| Permissions           | Custom role-based access control          |
| Database              | **Self-hosted PostgreSQL**                |
| ORM                   | **Prisma ORM**                            |
| Push notifications    | **Standard Web Push + VAPID**             |
| Scheduled jobs        | **Redis + BullMQ worker**                 |
| Validation            | **Zod**                                   |
| Forms                 | **React Hook Form**                       |
| File storage          | VPS local storage initially               |
| Deployment            | **Docker Compose on Hostinger VPS**       |
| Reverse proxy and SSL | **Nginx or Traefik**                      |
| Process monitoring    | Docker restart policies and health checks |
| Backups               | Automated PostgreSQL backups              |

---

# 1. Next.js Full-Stack Application

Use:

* Next.js App Router
* TypeScript
* React Server Components
* Server Actions where appropriate
* Route Handlers for API endpoints

Next.js supports building the frontend and backend endpoints inside the same project and can be self-hosted using a Node.js server or Docker. Route Handlers support standard API operations such as GET, POST, PUT, PATCH and DELETE. ([Next.js][1])

### Why this is best for your application

* One codebase
* Fewer files for Antigravity to analyse
* No separate frontend and backend projects
* Easier authentication
* Shared TypeScript types
* Easier Docker deployment
* Lower maintenance
* Less repeated code
* Faster development

I would **not use a separate NestJS backend in Phase 1**. It would create additional controllers, DTOs, modules and API integration work. NestJS is a good option for a much larger system, but it is unnecessary for your initial application.

---

# 2. PostgreSQL and Prisma

Use your own PostgreSQL database on the Hostinger VPS.

Use **Prisma ORM** for:

* Database schema
* Migrations
* Type-safe database queries
* Relationships
* Transaction handling
* Development database inspection

Prisma officially supports self-hosted PostgreSQL and provides a generated, type-safe client for TypeScript applications. ([Prisma][2])

### Main database tables

* `users`
* `roles`
* `permissions`
* `user_roles`
* `schedules`
* `schedule_assignments`
* `schedule_contacts`
* `checklist_templates`
* `checklist_items`
* `checklist_updates`
* `social_media_updates`
* `social_media_links`
* `ttd_quotas`
* `ttd_letters`
* `ttd_letter_members`
* `attachments`
* `push_subscriptions`
* `notification_jobs`
* `notifications`
* `activity_logs`

Use UUIDs for primary IDs and store all dates in UTC while displaying them in **Asia/Kolkata** timezone.

---

# 3. Authentication and Permissions

Use **Better Auth with Prisma and PostgreSQL**.

Better Auth supports PostgreSQL, Prisma adapters and cookie-based sessions stored and verified through the server. ([Better Auth][3])

### Authentication method

Since this is an internal MP office application:

* Admin creates staff accounts
* Login with mobile number/email and password
* No public registration
* Secure HTTP-only session cookies
* Password reset handled by admin initially
* Optional OTP login can be added later

### Roles

* Super Admin
* MP Office Admin
* Schedule Coordinator
* Field Coordinator
* Social Media Team
* TTD Letter Team
* Viewer

Every protected server action and API route must verify both:

1. Active login session
2. Required role or permission

Do not protect pages only through frontend visibility. Permissions must also be verified on the server.

---

# 4. PWA Technology

Use:

* Web App Manifest
* Service Worker
* Workbox or a Workbox-based Next.js integration
* Install prompt
* Offline app shell
* IndexedDB local data
* Update notification when a new app version is deployed

Service workers are the core technology used for offline access, background handling and push notifications in PWAs. Workbox provides reusable service-worker caching and routing modules. ([web.dev][4])

### Offline data to support

Do not make the entire application offline during Phase 1.

Store only:

* Today’s schedule
* Tomorrow’s schedule
* Assigned visit details
* Visit checklists
* Pending checklist updates
* Emergency contact details

Use **IndexedDB with Dexie.js** for structured offline data.

When the internet is unavailable:

1. Checklist updates are stored locally.
2. The UI shows an “Offline — waiting to sync” status.
3. Updates are added to a local sync queue.
4. When connectivity returns, the app sends the changes to the server.
5. The server confirms each successful update.
6. Successfully synced local records are removed.

Do not depend only on automatic browser background sync. The application should also retry syncing whenever it is opened or reconnects.

---

# 5. Push Notification Stack

Use **standard Web Push with VAPID keys**, not Firebase as the primary push system.

The Push API can deliver messages even when the application is not currently in the foreground, using the registered service worker. ([MDN Web Docs][5])

### Push notification flow

1. User logs in.
2. User presses **Enable Notifications**.
3. The service worker requests notification permission.
4. Browser creates a push subscription.
5. Subscription information is saved in PostgreSQL.
6. A scheduled notification job is created.
7. BullMQ processes the job at the required time.
8. The worker sends the Web Push message.
9. The service worker displays the notification.
10. Clicking it opens the related schedule or TTD letter.

### Notification examples

* Visit starts in 30 minutes
* Schedule time has changed
* New visit assigned
* Organizer contact updated
* Checklist is incomplete
* MP has arrived at the venue
* Event completed but social media post pending
* TTD letter request approved
* TTD quota is running low
* Tomorrow’s schedule has been published

---

## Important iPhone Requirement

Web Push is supported for Home Screen web apps on iPhones and iPads from iOS/iPadOS 16.4 onward. On iPhone, the user must first add the PWA to the Home Screen, open it from the Home Screen, and grant notification permission. Apple uses the standard Web Push system for this. ([Apple Developer][6])

Therefore, include an iPhone installation screen explaining:

1. Open the application in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Open the installed application.
5. Tap **Enable Notifications**.

Notification permission should only be requested after the user presses a clear button. Do not display the browser permission popup immediately after login.

---

# 6. Redis and BullMQ

Use Redis only for:

* Scheduled push notifications
* Delayed jobs
* Notification retries
* Optional short-term caching
* Job processing status

BullMQ supports delayed jobs, repeatable schedules, retries and dedicated workers using Redis. ([BullMQ][7])

### Examples

When a schedule is created for 11:00 AM:

* Add a reminder job for 10:00 AM
* Add a reminder job for 10:30 AM
* Add a checklist warning job after the event ends
* Cancel or replace jobs when the schedule changes

The BullMQ worker should run as a separate Docker service but use the same project code.

---

# 7. User Interface

Use:

* Tailwind CSS
* shadcn/ui components
* Lucide icons
* Mobile-first responsive layout
* Bottom navigation on mobile
* Sidebar navigation on desktop

### Mobile bottom navigation

* Home
* Schedule
* Add
* TTD Letters
* Profile

### Design style

* White/light-grey background
* Yellow as a controlled accent
* Dark text
* Clear status badges
* Large mobile buttons
* Minimal animation
* No unnecessary dashboards
* No gradients
* No decorative effects
* Clean government-office-style interface

---

# 8. Forms and Validation

Use:

* React Hook Form
* Zod
* Server-side validation
* Client-side validation for user convenience

Every important field must be validated again on the server.

Examples:

* Mobile number format
* Schedule ending time after starting time
* TTD quota availability
* Duplicate member phone number
* Valid social media link
* Mandatory checklist items
* Number of TTD members
* Valid preferred darshan date

---

# 9. File Storage

For Phase 1, store uploads on the Hostinger VPS using a mounted Docker volume.

Suggested folders:

```text
/uploads/schedules/
/uploads/events/
/uploads/ttd-letters/
/uploads/members/
/uploads/social-media/
```

The database should store only:

* File name
* Storage path
* MIME type
* File size
* Uploaded by
* Related module
* Related record ID
* Created date

Do not store large PDFs or images directly inside PostgreSQL.

Later, file storage can be moved to:

* Cloudflare R2
* Amazon S3
* MinIO

without changing the entire application.

---

# 10. Hostinger VPS Deployment Structure

Use Docker Compose with these services:

```text
mp-office-app
├── nextjs-app
├── notification-worker
├── postgresql
├── redis
└── nginx
```

### Container responsibilities

#### `nextjs-app`

* Frontend
* Authentication
* API endpoints
* Server actions
* Database operations

#### `notification-worker`

* BullMQ worker
* Scheduled reminders
* Push notifications
* Retry processing

#### `postgresql`

* Application data
* User data
* Schedules
* TTD details
* Push subscriptions

#### `redis`

* Notification queues
* Delayed jobs
* Retry status

#### `nginx`

* HTTPS termination
* Domain routing
* Request size limits
* Static file handling
* Reverse proxy

Redis supports Docker deployment and persistent volumes, while Next.js officially supports self-hosting through Docker or a Node.js server. ([Redis][8])

---

# 11. Recommended Deployment Tools

Since you already work with Coolify, the best setup is:

* Hostinger Ubuntu VPS
* Docker
* Docker Compose
* Coolify
* PostgreSQL persistent volume
* Redis persistent volume
* Automatic SSL
* GitHub repository
* Production and staging environments

### Domains

```text
schedule.yourdomain.com
```

Optional staging:

```text
schedule-staging.yourdomain.com
```

---

# 12. Backup Plan

Configure:

* Daily PostgreSQL backup
* Seven daily backups
* Four weekly backups
* Three monthly backups
* Upload backups to separate external storage
* Weekly uploaded-file backup
* Monthly restore test

Do not keep the only backup on the same VPS.

---

# 13. Final Recommended Architecture

```text
Mobile/Desktop Browser
        │
        ▼
Nginx / HTTPS
        │
        ▼
Next.js Full-Stack PWA
   │             │
   │             ├── Service Worker
   │             ├── IndexedDB
   │             └── Push Subscription
   │
   ├── Better Auth
   ├── Prisma ORM
   ├── PostgreSQL
   └── BullMQ Producer
                 │
                 ▼
               Redis
                 │
                 ▼
        Notification Worker
                 │
                 ▼
          Web Push Services
                 │
                 ▼
        Android / iPhone / Desktop
```

## Final Stack to Lock in the Master Prompt

```text
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
Prisma ORM
PostgreSQL
Better Auth
Role-Based Access Control
Workbox/Serwist PWA
IndexedDB with Dexie.js
Standard Web Push with VAPID
Redis
BullMQ
Zod
React Hook Form
Docker Compose
Nginx
Hostinger VPS
Coolify
```

This gives you a professional PWA with installability, offline checklist updates, Android/iPhone push notifications, PostgreSQL storage and a clean deployment model—while keeping the application in one main codebase so Antigravity does not waste credits analysing separate frontend and backend projects.

[1]: https://nextjs.org/docs/app/guides/self-hosting?utm_source=chatgpt.com "Guides: Self-Hosting"
[2]: https://www.prisma.io/docs/orm/core-concepts/supported-databases/postgresql?utm_source=chatgpt.com "PostgreSQL database connector - Prisma ORM"
[3]: https://better-auth.com/docs/concepts/session-management?utm_source=chatgpt.com "Session Management"
[4]: https://web.dev/learn/pwa/service-workers?utm_source=chatgpt.com "Service workers"
[5]: https://developer.mozilla.org/en-US/docs/Web/API/Push_API?utm_source=chatgpt.com "Push API - MDN Web Docs"
[6]: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers?utm_source=chatgpt.com "Sending web push notifications in web apps and browsers"
[7]: https://docs.bullmq.io/guide/jobs/delayed?utm_source=chatgpt.com "Delayed"
[8]: https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/docker/?utm_source=chatgpt.com "Run Redis Open Source on Docker | Docs"
