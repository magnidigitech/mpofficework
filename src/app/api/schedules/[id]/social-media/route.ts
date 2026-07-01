import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { sendNotification } from "@/lib/notification-sender";

const createSocialMediaSchema = zod.object({
  assignedUserId: zod.string().optional().nullable(),
  notes: zod.string().optional().nullable(),
  createDefaultPlatforms: zod.boolean().optional().default(false),
});

const patchSocialMediaSchema = zod.object({
  status: zod.enum([
    "NOT_REQUIRED",
    "MEDIA_PENDING",
    "MEDIA_RECEIVED",
    "DRAFTING",
    "WAITING_FOR_APPROVAL",
    "CHANGES_REQUESTED",
    "APPROVED",
    "PARTIALLY_PUBLISHED",
    "PUBLISHED",
  ]).optional(),
  isRequired: zod.boolean().optional(),
  mediaReceived: zod.boolean().optional(),
  mediaReceivedAt: zod.string().nullable().optional(),
  captionPrepared: zod.boolean().optional(),
  captionPreparedAt: zod.string().nullable().optional(),
  approvalStatus: zod.enum(["NOT_SUBMITTED", "PENDING", "APPROVED", "CHANGES_REQUESTED"]).optional(),
  assignedUserId: zod.string().nullable().optional(),
  notes: zod.string().nullable().optional(),
  mediaFolderUrl: zod.string().url("Invalid Google Drive folder link").nullable().or(zod.literal("")).optional(),
  photoFolderUrl: zod.string().url("Invalid Photos link").nullable().or(zod.literal("")).optional(),
  videoFolderUrl: zod.string().url("Invalid Videos link").nullable().or(zod.literal("")).optional(),
  changeReason: zod.string().optional(), // For changes requested workflow
});

// GET: View social media status for a schedule
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scheduleId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        assignments: true,
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Roles and Permissions Check
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator") && schedule.assignments.some(a => a.userId === session.user.id);
    const isStaff = schedule.assignments.some(a => a.userId === session.user.id);
    const isViewer = roles.includes("Viewer");
    const isSMTeam = roles.includes("Social Media Team");

    // Fetch Social Media Update record
    const socialMedia = await prisma.socialMediaUpdate.findUnique({
      where: { scheduleId },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        posts: {
          include: {
            publishedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!socialMedia) {
      return NextResponse.json(
        { error: "Social media tracking not enabled yet for this schedule." },
        { status: 404 }
      );
    }

    const isAssignedSM = socialMedia.assignedUserId === session.user.id;
    const canView = isAdmin || isCoordinator || isAssignedSM || isStaff || isViewer || isSMTeam;

    if (!canView) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permissions to view this social media tracker." },
        { status: 403 }
      );
    }

    // Calculations
    const requiredPosts = socialMedia.posts.filter((p) => p.isRequired);
    const publishedCount = requiredPosts.filter((p) => p.status === "PUBLISHED").length;
    const pendingCount = requiredPosts.length - publishedCount;

    return NextResponse.json({
      scheduleId: schedule.id,
      scheduleTitle: schedule.title,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      venue: schedule.venue,
      scheduleStatus: schedule.status,
      socialMediaUpdateId: socialMedia.id,
      isRequired: socialMedia.isRequired,
      workflowStatus: socialMedia.status,
      assignedUser: socialMedia.assignedUser,
      mediaReceived: socialMedia.mediaReceived,
      mediaReceivedAt: socialMedia.mediaReceivedAt,
      captionPrepared: socialMedia.captionPrepared,
      captionPreparedAt: socialMedia.captionPreparedAt,
      approvalStatus: socialMedia.approvalStatus,
      approvedBy: socialMedia.approvedBy,
      approvedAt: socialMedia.approvedAt,
      notes: socialMedia.notes,
      mediaFolderUrl: socialMedia.mediaFolderUrl,
      photoFolderUrl: socialMedia.photoFolderUrl,
      videoFolderUrl: socialMedia.videoFolderUrl,
      posts: socialMedia.posts,
      pendingPlatformCount: pendingCount,
      publishedPlatformCount: publishedCount,
      updatedAt: socialMedia.updatedAt,
    });
  } catch (err: any) {
    console.error("Error fetching social media status:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Enable social media coverage manually
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scheduleId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce coordinator/admin permission
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator");

    if (!isAdmin && !isCoordinator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Validate inputs
    const body = await request.json();
    const result = createSocialMediaSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Check duplicate
    const existing = await prisma.socialMediaUpdate.findUnique({
      where: { scheduleId },
    });

    if (existing && existing.isRequired) {
      return NextResponse.json(
        { error: "Social media tracking already enabled for this schedule." },
        { status: 400 }
      );
    }

    const socialMedia = await prisma.$transaction(async (tx) => {
      let record;
      if (existing) {
        record = await tx.socialMediaUpdate.update({
          where: { id: existing.id },
          data: {
            isRequired: true,
            status: "MEDIA_PENDING",
            assignedUserId: data.assignedUserId || null,
            notes: data.notes || null,
            updatedAt: new Date(),
          },
        });
      } else {
        record = await tx.socialMediaUpdate.create({
          data: {
            scheduleId,
            isRequired: true,
            status: "MEDIA_PENDING",
            approvalStatus: "NOT_SUBMITTED",
            assignedUserId: data.assignedUserId || null,
            notes: data.notes || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      // Create default platforms if selected (e.g. FACEBOOK, INSTAGRAM, X)
      if (data.createDefaultPlatforms) {
        const defaultPlatforms = ["FACEBOOK", "INSTAGRAM", "X"];
        await tx.socialMediaPost.createMany({
          data: defaultPlatforms.map((platform) => ({
            socialMediaUpdateId: record.id,
            platform,
            postType: "POST",
            status: "PENDING",
            isRequired: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });
      }

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "SOCIAL_MEDIA_TRACKING_ENABLED",
          details: `Enabled social media tracking for schedule "${schedule.title}"`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, socialMedia });
  } catch (err: any) {
    console.error("Error enabling social media:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update overall workflow details, notes, approvals, folder links
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scheduleId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const socialMedia = await prisma.socialMediaUpdate.findUnique({
      where: { scheduleId },
      include: {
        schedule: true,
      },
    });

    if (!socialMedia) {
      return NextResponse.json(
        { error: "Social media tracking not found." },
        { status: 404 }
      );
    }

    // Role-based permissions checks
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isSMTeam = roles.includes("Social Media Team") || socialMedia.assignedUserId === session.user.id;

    if (!isAdmin && !isSMTeam) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access." }, { status: 403 });
    }

    const body = await request.json();
    const result = patchSocialMediaSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Enforce Approval Constraints: Only Admin can approve content or request changes
    if (data.approvalStatus && data.approvalStatus !== socialMedia.approvalStatus) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: Only administrators can approve content or request corrections." },
          { status: 403 }
        );
      }
    }

    // Process updates
    const updated = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.status) updateData.status = data.status;
      if (data.isRequired !== undefined) {
        updateData.isRequired = data.isRequired;
        updateData.status = data.isRequired ? "MEDIA_PENDING" : "NOT_REQUIRED";
      }

      if (data.mediaReceived !== undefined) {
        updateData.mediaReceived = data.mediaReceived;
        updateData.mediaReceivedAt = data.mediaReceived 
          ? (data.mediaReceivedAt ? new Date(data.mediaReceivedAt) : new Date())
          : null;
        
        if (data.mediaReceived && updateData.status === undefined && socialMedia.status === "MEDIA_PENDING") {
          updateData.status = "MEDIA_RECEIVED";
        }
      }

      if (data.captionPrepared !== undefined) {
        updateData.captionPrepared = data.captionPrepared;
        updateData.captionPreparedAt = data.captionPrepared
          ? (data.captionPreparedAt ? new Date(data.captionPreparedAt) : new Date())
          : null;
        
        if (data.captionPrepared && updateData.status === undefined && socialMedia.status === "MEDIA_RECEIVED") {
          updateData.status = "DRAFTING";
        }
      }

      if (data.assignedUserId !== undefined) {
        updateData.assignedUserId = data.assignedUserId;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      // Links update
      if (data.mediaFolderUrl !== undefined) updateData.mediaFolderUrl = data.mediaFolderUrl || null;
      if (data.photoFolderUrl !== undefined) updateData.photoFolderUrl = data.photoFolderUrl || null;
      if (data.videoFolderUrl !== undefined) updateData.videoFolderUrl = data.videoFolderUrl || null;

      // Handle Approvals transitions
      if (data.approvalStatus) {
        updateData.approvalStatus = data.approvalStatus;
        if (data.approvalStatus === "APPROVED") {
          updateData.approvedById = session.user.id;
          updateData.approvedAt = new Date();
          updateData.status = "APPROVED";
        } else if (data.approvalStatus === "CHANGES_REQUESTED") {
          updateData.status = "CHANGES_REQUESTED";
          // Append reason/notes
          if (data.changeReason) {
            updateData.notes = socialMedia.notes 
              ? `${socialMedia.notes}\n[Correction Requested]: ${data.changeReason}`
              : `[Correction Requested]: ${data.changeReason}`;
          }
        } else if (data.approvalStatus === "PENDING") {
          updateData.status = "WAITING_FOR_APPROVAL";
        }
      }

      const record = await tx.socialMediaUpdate.update({
        where: { id: socialMedia.id },
        data: updateData,
      });

      // Log Activities
      let logAction = "SOCIAL_MEDIA_UPDATE";
      let logDetails = `Updated social media tracking for schedule "${socialMedia.schedule.title}"`;

      if (data.isRequired === false) {
        logAction = "SOCIAL_MEDIA_TRACKING_DISABLED";
        logDetails = `Marked social media as not required for schedule "${socialMedia.schedule.title}"`;
      } else if (data.mediaReceived) {
        logAction = "SOCIAL_MEDIA_MEDIA_RECEIVED";
        logDetails = `Marked media as received for schedule "${socialMedia.schedule.title}"`;
      } else if (data.captionPrepared) {
        logAction = "SOCIAL_MEDIA_CAPTION_PREPARED";
        logDetails = `Prepared captions for schedule "${socialMedia.schedule.title}"`;
      } else if (data.approvalStatus === "APPROVED") {
        logAction = "SOCIAL_MEDIA_APPROVED";
        logDetails = `Approved social media content for schedule "${socialMedia.schedule.title}"`;
      } else if (data.approvalStatus === "CHANGES_REQUESTED") {
        logAction = "SOCIAL_MEDIA_CHANGES_REQUESTED";
        logDetails = `Requested social media caption corrections: "${data.changeReason || "Not specified"}"`;
      } else if (data.approvalStatus === "PENDING") {
        logAction = "SOCIAL_MEDIA_SUBMITTED";
        logDetails = `Submitted social media content for approval for "${socialMedia.schedule.title}"`;
      }

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: logAction,
          details: logDetails,
          createdAt: new Date(),
        },
      });

      return record;
    });

    // Dispatch Notifications
    if (data.assignedUserId && data.assignedUserId !== socialMedia.assignedUserId) {
      await sendNotification(
        data.assignedUserId,
        "Social Media Duty Assigned",
        `You have been assigned social media responsibility for: "${socialMedia.schedule.title}"`,
        {
          type: "social_media",
          targetUrl: `/schedule/${scheduleId}/social-media`,
          relatedEntityType: "SocialMediaUpdate",
          relatedEntityId: socialMedia.id,
        }
      );
    }

    if (data.approvalStatus && data.approvalStatus !== socialMedia.approvalStatus) {
      if (data.approvalStatus === "PENDING") {
        const admins = await prisma.user.findMany({
          where: {
            isActive: true,
            userRoles: {
              some: {
                role: {
                  name: { in: ["Super Admin", "MP Office Admin"] },
                },
              },
            },
          },
          select: { id: true },
        });
        const adminIds = admins.map((a) => a.id);
        if (adminIds.length > 0) {
          await sendNotification(
            adminIds,
            "Social Media Approval Request",
            `Content submitted for approval for visit: "${socialMedia.schedule.title}"`,
            {
              type: "social_media",
              targetUrl: `/schedule/${scheduleId}/social-media`,
              relatedEntityType: "SocialMediaUpdate",
              relatedEntityId: socialMedia.id,
            }
          );
        }
      } else if (data.approvalStatus === "CHANGES_REQUESTED" && updated.assignedUserId) {
        await sendNotification(
          updated.assignedUserId,
          "Social Media Corrections Requested",
          `Changes requested for: "${socialMedia.schedule.title}". Reason: ${data.changeReason || "None"}`,
          {
            type: "social_media",
            targetUrl: `/schedule/${scheduleId}/social-media`,
            relatedEntityType: "SocialMediaUpdate",
            relatedEntityId: socialMedia.id,
          }
        );
      } else if (data.approvalStatus === "APPROVED") {
        const notifyUsers = [];
        if (updated.assignedUserId) notifyUsers.push(updated.assignedUserId);
        const coordinators = await prisma.scheduleAssignment.findMany({
          where: { scheduleId },
          select: { userId: true },
        });
        notifyUsers.push(...coordinators.map((c) => c.userId));
        const uniqueNotify = Array.from(new Set(notifyUsers));
        if (uniqueNotify.length > 0) {
          await sendNotification(
            uniqueNotify,
            "Social Media Content Approved",
            `Content approved for visit: "${socialMedia.schedule.title}"`,
            {
              type: "social_media",
              targetUrl: `/schedule/${scheduleId}/social-media`,
              relatedEntityType: "SocialMediaUpdate",
              relatedEntityId: socialMedia.id,
            }
          );
        }
      }
    }

    return NextResponse.json({ success: true, socialMedia: updated });
  } catch (err: any) {
    console.error("Error patching social media update:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
