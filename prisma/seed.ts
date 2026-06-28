import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgrespassword@localhost:5432/mp_office_db",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database roles and permissions...");

  // Define Permissions
  const permissionsList = [
    // User Management
    { name: "users.view", description: "View staff accounts" },
    { name: "users.create", description: "Create staff accounts" },
    { name: "users.update", description: "Update staff accounts" },
    { name: "users.activate", description: "Activate staff accounts" },
    { name: "users.deactivate", description: "Deactivate staff accounts" },
    { name: "users.reset_password", description: "Reset staff passwords" },
    { name: "roles.manage", description: "Manage roles and permissions mapping" },

    // Schedules
    { name: "schedules.view_all", description: "View all tour schedules" },
    { name: "schedules.view_assigned", description: "View only assigned tour schedules" },
    { name: "schedules.create", description: "Create new tour schedules" },
    { name: "schedules.update", description: "Update existing tour schedules" },
    { name: "schedules.delete", description: "Delete tour schedules" },
    { name: "schedules.assign_staff", description: "Assign staff to tour events" },
    { name: "schedules.override_checklist", description: "Override checklist validation states" },

    // Checklists
    { name: "checklists.view", description: "View visit checklists" },
    { name: "checklists.update_assigned", description: "Update assigned checklist items" },
    { name: "checklists.update_all", description: "Update all checklist items" },
    { name: "checklist_templates.manage", description: "Manage checklist templates" },

    // Social Media
    { name: "social_media.view", description: "View social media tracking info" },
    { name: "social_media.update", description: "Update social media links & content" },
    { name: "social_media.assign", description: "Assign social media responsibilities" },
    { name: "social_media.approve", description: "Approve social media content updates" },
    { name: "social_media.delete", description: "Delete social media tracking records" },

    // TTD VIP Letters
    { name: "ttd.view_all", description: "View all TTD letters requests" },
    { name: "ttd.view_assigned", description: "View assigned TTD letters requests" },
    { name: "ttd.create", description: "Create TTD letter requests" },
    { name: "ttd.verify", description: "Verify TTD letter requests" },
    { name: "ttd.approve", description: "Approve TTD letter requests (reserve quota)" },
    { name: "ttd.prepare_letter", description: "Prepare recommendation letters" },
    { name: "ttd.distribute", description: "Distribute prepared recommendation letters" },
    { name: "ttd.manage_quota", description: "Manage TTD ticket quota periods" },
    { name: "ttd.cancel_issued", description: "Cancel distributed recommendation letters" },

    // Notifications
    { name: "notifications.send_manual", description: "Send manual test push notifications" },
    { name: "notifications.view_delivery_logs", description: "View notification delivery logs" },

    // System
    { name: "activity_logs.view", description: "View system audit logs" },
    { name: "settings.manage", description: "Manage system configurations" },
  ];

  const dbPermissions: Record<string, any> = {};
  for (const perm of permissionsList) {
    dbPermissions[perm.name] = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  // Define Roles and their Permissions Mapping
  const rolesWithPermissions = [
    {
      name: "Super Admin",
      description: "Complete control over the portal",
      permissions: permissionsList.map((p) => p.name),
    },
    {
      name: "MP Office Admin",
      description: "Manage normal staff accounts, schedules, checklists, social media approval, and TTD quotas",
      permissions: [
        "users.view", "users.create", "users.update", "users.activate", "users.deactivate", "users.reset_password", "roles.manage",
        "schedules.view_all", "schedules.create", "schedules.update", "schedules.delete", "schedules.assign_staff",
        "checklists.view", "checklists.update_all", "checklist_templates.manage",
        "social_media.view", "social_media.update", "social_media.approve",
        "ttd.view_all", "ttd.create", "ttd.verify", "ttd.approve", "ttd.prepare_letter", "ttd.distribute", "ttd.manage_quota",
        "notifications.view_delivery_logs",
        "activity_logs.view"
      ],
    },
    {
      name: "Schedule Coordinator",
      description: "Create and update schedules and view assigned events",
      permissions: [
        "schedules.view_all", "schedules.create", "schedules.update", "schedules.assign_staff",
        "checklists.view", "checklists.update_assigned",
        "ttd.create", "ttd.view_assigned"
      ],
    },
    {
      name: "Field Staff",
      description: "View assigned schedules and update checklists in the field",
      permissions: [
        "schedules.view_assigned",
        "checklists.view", "checklists.update_assigned"
      ],
    },
    {
      name: "Social Media Team",
      description: "Track and post social media links for visits",
      permissions: [
        "schedules.view_assigned",
        "social_media.view", "social_media.update"
      ],
    },
    {
      name: "TTD Manager",
      description: "Manage TTD letter verification, approval, preparation, and distribution",
      permissions: [
        "ttd.view_all", "ttd.verify", "ttd.approve", "ttd.prepare_letter", "ttd.distribute"
      ],
    },
    {
      name: "TTD Staff",
      description: "Create and prepare TTD VIP requests pre-approval",
      permissions: [
        "ttd.create", "ttd.view_assigned", "ttd.verify"
      ],
    },
    {
      name: "Viewer",
      description: "Read-only access to permitted records",
      permissions: [
        "schedules.view_all",
        "checklists.view",
        "social_media.view",
        "ttd.view_all"
      ],
    },
  ];

  for (const roleDef of rolesWithPermissions) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description },
      create: {
        name: roleDef.name,
        description: roleDef.description,
      },
    });

    // Link Permissions to this Role
    for (const permName of roleDef.permissions) {
      const permission = dbPermissions[permName];
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Seed default Super Admin User
  const adminEmail = "admin@mpoffice.com";
  const adminPassword = "adminpassword";

  console.log(`Checking/Creating default Super Admin user: ${adminEmail}`);

  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        name: "MP Office Admin",
        email: adminEmail,
        emailVerified: true,
        mobileNumber: "9876543210",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  const hashedPassword = await hashPassword(adminPassword);

  // Clean up any old invalid account records from previous seed attempts
  await prisma.account.deleteMany({
    where: {
      userId: adminUser.id,
      providerId: "email-password",
    },
  });

  const existingAccount = await prisma.account.findFirst({
    where: {
      userId: adminUser.id,
      providerId: "credential",
    },
  });

  if (!existingAccount) {
    await prisma.account.create({
      data: {
        accountId: adminEmail,
        providerId: "credential",
        userId: adminUser.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log("Super Admin account credentials created successfully.");
  } else {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        accountId: adminEmail,
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });
    console.log("Super Admin account credentials updated successfully.");
  }

  // Find Super Admin Role
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "Super Admin" },
  });

  if (superAdminRole && adminUser) {
    // Map user to Super Admin role
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
      },
    });
    console.log("Super Admin role mapped successfully to admin user.");
  }

  // Seed Default Checklist Template
  console.log("Checking/Creating default Checklist Template...");
  let defaultTemplate = await prisma.checklistTemplate.findFirst({
    where: { isDefault: true },
  });

  if (!defaultTemplate) {
    defaultTemplate = await prisma.checklistTemplate.create({
      data: {
        name: "Default Visit Checklist",
        description: "Standard checklist for MP visits covering pre-visit planning, event management, and post-event outreach.",
        isDefault: true,
        isActive: true,
        createdById: adminUser?.id || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  // Idempotently create items for the default template
  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: defaultTemplate.id },
  });

  const templateItems = [
    // BEFORE VISIT
    { title: "Organizer contacted", section: "BEFORE_VISIT", isMandatory: true, displayOrder: 1 },
    { title: "Event date and time confirmed", section: "BEFORE_VISIT", isMandatory: true, displayOrder: 2 },
    { title: "Location verified", section: "BEFORE_VISIT", isMandatory: true, displayOrder: 3 },
    { title: "Google Maps link checked", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 4 },
    { title: "Invitation verified", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 5 },
    { title: "Assigned staff confirmed", section: "BEFORE_VISIT", isMandatory: true, displayOrder: 6 },
    { title: "Vehicle arrangement confirmed", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 7 },
    { title: "Speech points prepared", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 8 },
    { title: "Required documents collected", section: "BEFORE_VISIT", isMandatory: true, displayOrder: 9 },
    { title: "Photography team informed", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 10 },
    { title: "Social media team informed", section: "BEFORE_VISIT", isMandatory: false, displayOrder: 11 },

    // DURING VISIT
    { title: "MP arrived", section: "DURING_VISIT", isMandatory: true, displayOrder: 1 },
    { title: "Organizer received MP", section: "DURING_VISIT", isMandatory: false, displayOrder: 2 },
    { title: "Photos captured", section: "DURING_VISIT", isMandatory: true, displayOrder: 3 },
    { title: "Videos captured", section: "DURING_VISIT", isMandatory: false, displayOrder: 4 },
    { title: "Important people details collected", section: "DURING_VISIT", isMandatory: false, displayOrder: 5 },
    { title: "Speech highlights recorded", section: "DURING_VISIT", isMandatory: false, displayOrder: 6 },
    { title: "Public requests collected", section: "DURING_VISIT", isMandatory: true, displayOrder: 7 },
    { title: "Event completed", section: "DURING_VISIT", isMandatory: true, displayOrder: 8 },

    // AFTER VISIT
    { title: "Photos uploaded", section: "AFTER_VISIT", isMandatory: true, displayOrder: 1 },
    { title: "Videos uploaded", section: "AFTER_VISIT", isMandatory: false, displayOrder: 2 },
    { title: "Press note prepared", section: "AFTER_VISIT", isMandatory: true, displayOrder: 3 },
    { title: "Telugu caption prepared", section: "AFTER_VISIT", isMandatory: false, displayOrder: 4 },
    { title: "English caption prepared", section: "AFTER_VISIT", isMandatory: false, displayOrder: 5 },
    { title: "Content sent for approval", section: "AFTER_VISIT", isMandatory: true, displayOrder: 6 },
    { title: "Social media publishing completed", section: "AFTER_VISIT", isMandatory: true, displayOrder: 7 },
    { title: "Published post links added", section: "AFTER_VISIT", isMandatory: false, displayOrder: 8 },
    { title: "Follow-up tasks assigned", section: "AFTER_VISIT", isMandatory: false, displayOrder: 9 },
  ];

  await prisma.checklistTemplateItem.createMany({
    data: templateItems.map(item => ({
      templateId: defaultTemplate.id,
      title: item.title,
      section: item.section,
      isMandatory: item.isMandatory,
      displayOrder: item.displayOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  });

  console.log("Default checklist template and items seeded successfully.");

  // Seeding System Settings
  console.log("Checking/Creating default System Settings...");
  const settingsToSeed = [
    // GENERAL
    { key: "office_name", value: "MP Office Hyderabad", valueType: "string", category: "GENERAL", isPublic: true, description: "Name of the Member of Parliament Office" },
    { key: "application_name", value: "MP Office Portal", valueType: "string", category: "GENERAL", isPublic: true, description: "Portal application display name" },
    { key: "default_timezone", value: "Asia/Kolkata", valueType: "string", category: "GENERAL", isPublic: true, description: "Timezone for processing dates and reports" },
    { key: "default_pagination_size", value: "10", valueType: "number", category: "GENERAL", isPublic: true, description: "Default grid/table records count per page" },
    { key: "support_contact_number", value: "+919876543210", valueType: "string", category: "GENERAL", isPublic: true, description: "Administrative support helpdesk contact details" },

    // SCHEDULE
    { key: "default_reminder_times", value: "30,120,1440", valueType: "string", category: "SCHEDULE", isPublic: false, description: "Comma separated reminder notification delays in minutes before event start" },
    { key: "allow_checklist_override", value: "true", valueType: "boolean", category: "SCHEDULE", isPublic: false, description: "Allow Super Admins to manually override pending mandatory checklist items when completing schedules" },
    { key: "default_schedule_categories", value: "Constituency Visit,Public Meeting,Official Meeting,Personal Visit", valueType: "string", category: "SCHEDULE", isPublic: true, description: "Comma separated list of default travel Categories" },

    // SOCIAL MEDIA
    { key: "default_required_platforms", value: "X,Facebook,Instagram", valueType: "string", category: "SOCIAL_MEDIA", isPublic: true, description: "Comma separated list of target posting platforms" },
    { key: "approval_required_flag", value: "true", valueType: "boolean", category: "SOCIAL_MEDIA", isPublic: false, description: "Require content approval from Office Admins before publication" },
    { key: "pending_publishing_warning_delay", value: "24", valueType: "number", category: "SOCIAL_MEDIA", isPublic: false, description: "Warning threshold in hours to flag delayed posts after visits complete" },

    // TTD
    { key: "low_quota_threshold", value: "5", valueType: "number", category: "TTD", isPublic: true, description: "Quota counter threshold below which warnings are triggered" },
    { key: "duplicate_lookback_period", value: "30", valueType: "number", category: "TTD", isPublic: false, description: "Period in days to check duplicate requests by the same traveler" },
    { key: "default_request_expiry_days", value: "10", valueType: "number", category: "TTD", isPublic: false, description: "Days before travel when a request is considered expired" },
    { key: "identity_document_requirement_flag", value: "true", valueType: "boolean", category: "TTD", isPublic: false, description: "Require uploading official verification documents" },

    // NOTIFICATIONS
    { key: "enable_schedule_reminders", value: "true", valueType: "boolean", category: "NOTIFICATIONS", isPublic: false, description: "Enable background BullMQ dispatching of schedule reminders" },
    { key: "enable_checklist_alerts", value: "true", valueType: "boolean", category: "NOTIFICATIONS", isPublic: false, description: "Trigger push notifications on checklist actions" },
    { key: "enable_social_media_alerts", value: "true", valueType: "boolean", category: "NOTIFICATIONS", isPublic: false, description: "Trigger alerts for social media tasks" },
    { key: "enable_ttd_alerts", value: "true", valueType: "boolean", category: "NOTIFICATIONS", isPublic: false, description: "Trigger notifications for TTD approval actions" },

    // FILES
    { key: "maximum_upload_size", value: "10", valueType: "number", category: "FILES", isPublic: true, description: "Maximum allowed file size in MB" },
    { key: "allowed_document_types", value: "pdf,docx,doc", valueType: "string", category: "FILES", isPublic: true, description: "Allowed document extensions" },
    { key: "allowed_image_types", value: "jpg,png,jpeg", valueType: "string", category: "FILES", isPublic: true, description: "Allowed image format extensions" },

    // DATA RETENTION
    { key: "notification_logs_retention_days", value: "30", valueType: "number", category: "DATA_RETENTION", isPublic: false, description: "Retention limit in days for notification deliveries logs" },
    { key: "read_notifications_retention_days", value: "14", valueType: "number", category: "DATA_RETENTION", isPublic: false, description: "Retention limit in days for read notifications in inbox" },
    { key: "expired_push_retention_days", value: "60", valueType: "number", category: "DATA_RETENTION", isPublic: false, description: "Retention limit in days for expired browser push tokens" },
    { key: "temporary_export_retention_minutes", value: "30", valueType: "number", category: "DATA_RETENTION", isPublic: false, description: "Retention threshold in minutes for transient downloads" },
    { key: "old_offline_sync_metadata_retention_days", value: "90", valueType: "number", category: "DATA_RETENTION", isPublic: false, description: "Retention threshold for sync conflict and history tables" },
  ];

  for (const s of settingsToSeed) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {
        valueType: s.valueType,
        category: s.category,
        isPublic: s.isPublic,
        description: s.description,
      },
      create: {
        key: s.key,
        value: s.value,
        valueType: s.valueType,
        category: s.category,
        isPublic: s.isPublic,
        description: s.description,
      },
    });
  }
  console.log("System Settings loaded successfully.");
  console.log("Seeding complete. Predefined roles, permissions, admin user, default checklist template, and system settings loaded.");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
