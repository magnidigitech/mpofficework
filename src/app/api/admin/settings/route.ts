import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { z } from "zod";

// Zod schemas matching settings value types
const stringSchema = z.string().min(1);
const numberSchema = z.number();
const booleanSchema = z.boolean();

const SETTING_VALIDATORS: Record<string, z.ZodTypeAny> = {
  // GENERAL
  office_name: stringSchema,
  application_name: stringSchema,
  default_timezone: stringSchema,
  default_pagination_size: numberSchema.int().positive(),
  support_contact_number: stringSchema,

  // SCHEDULE
  default_reminder_times: stringSchema.regex(/^(\d+,)*\d+$/),
  allow_checklist_override: booleanSchema,
  default_schedule_categories: stringSchema,
  whatsapp_status_update_template: stringSchema,

  // SOCIAL MEDIA
  default_required_platforms: stringSchema,
  approval_required_flag: booleanSchema,
  pending_publishing_warning_delay: numberSchema.int().nonnegative(),

  // TTD
  low_quota_threshold: numberSchema.int().nonnegative(),
  duplicate_lookback_period: numberSchema.int().nonnegative(),
  default_request_expiry_days: numberSchema.int().nonnegative(),
  identity_document_requirement_flag: booleanSchema,

  // NOTIFICATIONS
  enable_schedule_reminders: booleanSchema,
  enable_checklist_alerts: booleanSchema,
  enable_social_media_alerts: booleanSchema,
  enable_ttd_alerts: booleanSchema,

  // FILES
  maximum_upload_size: numberSchema.positive(),
  allowed_document_types: stringSchema,
  allowed_image_types: stringSchema,

  // DATA RETENTION
  notification_logs_retention_days: numberSchema.int().nonnegative(),
  read_notifications_retention_days: numberSchema.int().nonnegative(),
  expired_push_retention_days: numberSchema.int().nonnegative(),
  temporary_export_retention_minutes: numberSchema.int().nonnegative(),
  old_offline_sync_metadata_retention_days: numberSchema.int().nonnegative(),
};

// GET /api/admin/settings
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles } = verification;
    if (!roles.includes("Super Admin") && !roles.includes("MP Office Admin")) {
      return NextResponse.json({ error: "Forbidden: Administrative access required" }, { status: 403 });
    }

    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json({ settings });
  } catch (err: any) {
    console.error("Error fetching admin settings:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/admin/settings
export async function PATCH(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");

    // Only permitted users can update settings
    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Administrative access required" }, { status: 403 });
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const updates: Array<{ key: string; value: string; oldValue: string }> = [];

    // Transactional validation & update setup
    for (const [key, rawValue] of Object.entries(body)) {
      const validator = SETTING_VALIDATORS[key];
      if (!validator) {
        return NextResponse.json({ error: `Unknown or disallowed settings key: '${key}'` }, { status: 400 });
      }

      // Assert validation matching types
      const validationResult = validator.safeParse(rawValue);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: `Validation failed for setting '${key}': ${validationResult.error.issues[0]?.message}` },
          { status: 400 }
        );
      }

      // Check current db setting
      const existing = await prisma.systemSetting.findUnique({
        where: { key },
      });

      if (!existing) {
        return NextResponse.json({ error: `Setting not found: '${key}'` }, { status: 404 });
      }

      // Coerce value to string for storage
      const valueStr = String(rawValue);

      if (existing.value !== valueStr) {
        updates.push({
          key,
          value: valueStr,
          oldValue: existing.value,
        });
      }
    }

    // Apply updates inside database transaction
    await prisma.$transaction(
      updates.map((upd) =>
        prisma.systemSetting.update({
          where: { key: upd.key },
          data: {
            value: upd.value,
            updatedById: currentUser.id,
          },
        })
      )
    );

    // Record settings mutations inside ActivityLog
    for (const u of updates) {
      await prisma.activityLog.create({
        data: {
          userId: currentUser.id,
          action: "UPDATE_SETTING",
          details: JSON.stringify({
            settingKey: u.key,
            oldValue: u.oldValue,
            newValue: u.value,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      message: "Settings updated successfully.",
    });
  } catch (err: any) {
    console.error("Error updating settings:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
