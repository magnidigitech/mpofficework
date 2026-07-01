import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { createChecklistForSchedule } from "@/lib/checklists";
import { sendNotification } from "@/lib/notification-sender";

const updateScheduleSchema = zod.object({
  title: zod.string().min(3).optional(),
  description: zod.string().optional().nullable(),
  venue: zod.string().min(3).optional(),
  startAt: zod.string().optional(),
  endAt: zod.string().optional(),
  status: zod.enum([
    "DRAFT",
    "CONFIRMED",
    "TRAVELLING",
    "ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
    "POSTPONED",
    "CANCELLED"
  ]).optional(),
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
  override: zod.object({
    reason: zod.string().min(5, "Override reason must be at least 5 characters"),
  }).optional(),
  socialMediaRequired: zod.boolean().optional(),
});

// GET: View Schedule details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        contacts: true,
        visitChecklist: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobileNumber: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Role-based visibility check
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator") || isAdmin;
    const isViewer = roles.includes("Viewer") || roles.includes("Field Coordinator") || roles.includes("Field Staff");

    if ((roles.includes("Field Coordinator") || roles.includes("Field Staff")) && !isCoordinator) {
      const isAssigned = schedule.assignments.some(
        (a) => a.userId === session.user.id
      );
      if (!isAssigned) {
        return NextResponse.json(
          { error: "Forbidden: You are not assigned to this schedule" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(schedule);
  } catch (err: any) {
    console.error("Error fetching schedule detail:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Edit / Update Schedule
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check: Admin or Schedule Coordinator required to edit
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const canEdit =
      roles.includes("Super Admin") ||
      roles.includes("MP Office Admin") ||
      roles.includes("Schedule Coordinator");

    if (!canEdit) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permissions to edit schedules." },
        { status: 403 }
      );
    }

    // Validate schedule existence
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateScheduleSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Validate times if provided
    const start = data.startAt ? new Date(data.startAt) : schedule.startAt;
    const end = data.endAt ? new Date(data.endAt) : schedule.endAt;
    if (end <= start) {
      return NextResponse.json(
        { error: "End time must be after the start time" },
        { status: 400 }
      );
    }

    // Validate checklist completion if changing status to COMPLETED
    let isOverrideApplied = false;
    let pendingMandatoryNames: string[] = [];

    if (data.status === "COMPLETED" && schedule.status !== "COMPLETED") {
      const checklist = await prisma.visitChecklist.findUnique({
        where: { scheduleId: id },
        include: { items: true },
      });

      if (checklist) {
        const pendingMandatories = checklist.items.filter(
          (item) => item.isMandatory && !item.isCompleted
        );

        if (pendingMandatories.length > 0) {
          const isSuperAdmin = roles.includes("Super Admin");
          if (isSuperAdmin && data.override?.reason) {
            isOverrideApplied = true;
            pendingMandatoryNames = pendingMandatories.map((item) => item.title);
          } else {
            return NextResponse.json(
              {
                error: "Cannot complete schedule: Mandatory checklist items are pending.",
                pendingMandatoryItems: pendingMandatories.map((item) => item.title),
                allowOverride: isSuperAdmin,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Database transaction to apply updates
    const updatedSchedule = await prisma.$transaction(async (tx) => {
      // 1. Update Schedule fields
      const updated = await tx.schedule.update({
        where: { id },
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
          priority: data.priority,
          internalInstructions: data.internalInstructions,
          requiredDocuments: data.requiredDocuments,
        },
      });

      // If status has become CONFIRMED, create the checklist
      if (data.status === "CONFIRMED") {
        await createChecklistForSchedule(id, session.user.id, tx);
      }

      // Handle Social Media Coverage requirement updates
      if (data.socialMediaRequired !== undefined) {
        if (data.socialMediaRequired) {
          const existing = await tx.socialMediaUpdate.findUnique({
            where: { scheduleId: id },
          });
          if (!existing) {
            await tx.socialMediaUpdate.create({
              data: {
                scheduleId: id,
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
                details: `Enabled social media tracking for schedule "${updated.title}"`,
                createdAt: new Date(),
              },
            });
          } else if (!existing.isRequired) {
            await tx.socialMediaUpdate.update({
              where: { id: existing.id },
              data: { isRequired: true, status: "MEDIA_PENDING" },
            });
            await tx.activityLog.create({
              data: {
                userId: session.user.id,
                action: "SOCIAL_MEDIA_TRACKING_ENABLED",
                details: `Re-enabled social media tracking for schedule "${updated.title}"`,
                createdAt: new Date(),
              },
            });
          }
        } else {
          const existing = await tx.socialMediaUpdate.findUnique({
            where: { scheduleId: id },
          });
          if (existing && existing.isRequired) {
            await tx.socialMediaUpdate.update({
              where: { id: existing.id },
              data: { isRequired: false, status: "NOT_REQUIRED" },
            });
            await tx.activityLog.create({
              data: {
                userId: session.user.id,
                action: "SOCIAL_MEDIA_TRACKING_DISABLED",
                details: `Marked social media tracking as not required for schedule "${updated.title}"`,
                createdAt: new Date(),
              },
            });
          }
        }
      }

      // 2. Re-assign staff if list is provided
      if (data.assignedStaffIds !== undefined) {
        await tx.scheduleAssignment.deleteMany({
          where: { scheduleId: id },
        });

        if (data.assignedStaffIds.length > 0) {
          await tx.scheduleAssignment.createMany({
            data: data.assignedStaffIds.map((userId) => ({
              scheduleId: id,
              userId,
            })),
          });
        }
      }

      // 3. Update contacts if provided
      if (data.contacts !== undefined) {
        await tx.scheduleContact.deleteMany({
          where: { scheduleId: id },
        });

        const activeContacts = data.contacts.filter((c) => c.name?.trim() || c.phone?.trim() || c.designation?.trim());
        if (activeContacts.length > 0) {
          await tx.scheduleContact.createMany({
            data: activeContacts.map((c) => ({
              scheduleId: id,
              name: c.name || "",
              phone: c.phone || "",
              designation: c.designation || null,
            })),
          });
        }
      }

      // 4. Log status change or update activity
      let logDetail = `Updated schedule details for "${updated.title}"`;
      let logAction = "UPDATE_SCHEDULE";

      if (isOverrideApplied) {
        logAction = "MANDATORY_CHECKLIST_OVERRIDE";
        logDetail = `Super Admin completed schedule "${updated.title}" with override. Reason: "${data.override?.reason || ""}". Pending items: ${pendingMandatoryNames.join(", ")}`;
      } else if (data.status && data.status !== schedule.status) {
        logDetail = `Changed status of schedule "${updated.title}" from ${schedule.status} to ${data.status}`;
      }

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: logAction,
          details: logDetail,
          createdAt: new Date(),
        },
      });

      return updated;
    });

    // Fetch currently assigned user IDs
    const currentAssignments = await prisma.scheduleAssignment.findMany({
      where: { scheduleId: id },
      select: { userId: true },
    });
    const assignedUserIds = currentAssignments.map((a) => a.userId);

    // Trigger Notifications
    if (assignedUserIds.length > 0) {
      if (data.venue && data.venue !== schedule.venue) {
        await sendNotification(assignedUserIds, "Schedule Venue Updated", `Venue for schedule "${updatedSchedule.title}" changed to ${updatedSchedule.venue}`, {
          type: "schedule",
          targetUrl: "/schedule",
          relatedEntityType: "Schedule",
          relatedEntityId: id,
        });
      }

      if (data.startAt && new Date(data.startAt).getTime() !== new Date(schedule.startAt).getTime()) {
        await sendNotification(assignedUserIds, "Schedule Rescheduled", `Rescheduled: "${updatedSchedule.title}" time has changed.`, {
          type: "schedule",
          targetUrl: "/schedule",
          relatedEntityType: "Schedule",
          relatedEntityId: id,
        });
      }

      if (data.status === "CANCELLED" && schedule.status !== "CANCELLED") {
        await sendNotification(assignedUserIds, "Schedule Cancelled", `Cancelled: "${updatedSchedule.title}" has been cancelled.`, {
          type: "schedule",
          targetUrl: "/schedule",
          relatedEntityType: "Schedule",
          relatedEntityId: id,
        });
      }
    }

    // Trigger assignment notification for newly assigned staff
    if (data.assignedStaffIds) {
      const oldStaffIds = schedule.assignments.map((a) => a.userId);
      const newlyAssigned = data.assignedStaffIds.filter((uid) => !oldStaffIds.includes(uid));
      if (newlyAssigned.length > 0) {
        await sendNotification(newlyAssigned, "New Schedule Assignment", `You have been assigned to schedule: "${updatedSchedule.title}"`, {
          type: "schedule",
          targetUrl: "/schedule",
          relatedEntityType: "Schedule",
          relatedEntityId: id,
        });
      }
    }

    return NextResponse.json({ success: true, schedule: updatedSchedule });
  } catch (err: any) {
    console.error("Error editing schedule:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete Schedule
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check: Only Super Admin and Office Admin can delete
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const canDelete =
      roles.includes("Super Admin") || roles.includes("MP Office Admin");

    if (!canDelete) {
      return NextResponse.json(
        { error: "Forbidden: Only Administrators can delete schedules." },
        { status: 403 }
      );
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Delete schedule (linked contacts, checklistItems and assignments cascade delete)
      await tx.schedule.delete({
        where: { id },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "DELETE_SCHEDULE",
          details: `Deleted schedule "${schedule.title}"`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting schedule:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
