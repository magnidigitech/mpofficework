import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { createChecklistForSchedule } from "@/lib/checklists";
import { sendNotification } from "@/lib/notification-sender";

const createScheduleSchema = zod.object({
  title: zod.string().min(3, "Title must be at least 3 characters"),
  description: zod.string().optional().nullable(),
  venue: zod.string().min(3, "Venue is required"),
  startAt: zod.string().min(1, "Start date and time is required"),
  endAt: zod.string().min(1, "End date and time is required"),
  status: zod.enum([
    "DRAFT",
    "CONFIRMED",
    "TRAVELLING",
    "ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
    "POSTPONED",
    "CANCELLED"
  ]).default("DRAFT"),
  organizerName: zod.string().optional().nullable(),
  organizerPhone: zod.string().optional().nullable(),
  googleMapsLink: zod.string().optional().nullable(),
  category: zod.string().optional().nullable(),
  priority: zod.string().optional().nullable(),
  internalInstructions: zod.string().optional().nullable(),
  requiredDocuments: zod.string().optional().nullable(),
  assignedStaffIds: zod.array(zod.string()).optional(),
  contacts: zod.array(
    zod.object({
      name: zod.string().optional().nullable().or(zod.literal("")),
      phone: zod.string().optional().nullable().or(zod.literal("")),
      designation: zod.string().optional().nullable().or(zod.literal("")),
    })
  ).optional(),
  checklistItems: zod.array(zod.string().min(2)).optional(),
  socialMediaRequired: zod.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch user roles and verify authorization
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const canCreate =
      roles.includes("Super Admin") ||
      roles.includes("MP Office Admin") ||
      roles.includes("Schedule Coordinator");

    if (!canCreate) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permissions to create schedules." },
        { status: 403 }
      );
    }

    // 3. Parse and validate payload
    const body = await request.json();
    const result = createScheduleSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Validate that end time is after start time
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    if (end <= start) {
      return NextResponse.json(
        { error: "End time must be after the start time" },
        { status: 400 }
      );
    }

    // 4. Database Transaction
    const newSchedule = await prisma.$transaction(async (tx) => {
      // Create Schedule
      const schedule = await tx.schedule.create({
        data: {
          title: data.title,
          description: data.description,
          venue: data.venue,
          startAt: start,
          endAt: end,
          status: data.status,
          organizerName: data.organizerName,
          organizerPhone: data.organizerPhone,
          googleMapsLink: data.googleMapsLink,
          category: data.category,
          priority: data.priority || "MEDIUM",
          internalInstructions: data.internalInstructions,
          requiredDocuments: data.requiredDocuments,
          contacts: {
            create: (data.contacts || [])
              .filter((c) => c.name?.trim() || c.phone?.trim() || c.designation?.trim())
              .map((c) => ({
                name: c.name || "",
                phone: c.phone || "",
                designation: c.designation || null,
              })),
          },
        },
      });

      // If status is CONFIRMED, create the checklist
      if (data.status === "CONFIRMED") {
        await createChecklistForSchedule(schedule.id, session.user.id, tx);
      }

      // If social media coverage is required, create one SocialMediaUpdate record
      if (data.socialMediaRequired) {
        await tx.socialMediaUpdate.create({
          data: {
            scheduleId: schedule.id,
            isRequired: true,
            status: "MEDIA_PENDING",
            approvalStatus: "NOT_SUBMITTED",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.activityLog.create({
          data: {
            userId: session.user.id,
            action: "SOCIAL_MEDIA_TRACKING_ENABLED",
            details: `Enabled social media tracking for schedule "${schedule.title}"`,
            createdAt: new Date(),
          },
        });
      }

      // Create Staff Assignments
      if (data.assignedStaffIds && data.assignedStaffIds.length > 0) {
        await tx.scheduleAssignment.createMany({
          data: data.assignedStaffIds.map((userId) => ({
            scheduleId: schedule.id,
            userId,
          })),
        });
      }

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "CREATE_SCHEDULE",
          details: `Created schedule "${schedule.title}" scheduled for ${start.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        },
      });

      return schedule;
    });

    // Notify assigned staff
    if (data.assignedStaffIds && data.assignedStaffIds.length > 0) {
      await sendNotification(
        data.assignedStaffIds,
        "New Schedule Assignment",
        `You have been assigned to schedule: "${newSchedule.title}"`,
        {
          type: "schedule",
          targetUrl: "/schedule",
          relatedEntityType: "Schedule",
          relatedEntityId: newSchedule.id,
        }
      );
    }

    return NextResponse.json({ success: true, schedule: newSchedule });
  } catch (err: any) {
    console.error("Error creating schedule:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
