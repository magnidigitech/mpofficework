import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// GET /api/reports/social-media
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");
    const isSMTeam = roles.includes("Social Media Team");

    if (!isSuper && !isAdmin && !isSMTeam) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for social media reports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const status = searchParams.get("status"); // media update workflow status
    const approvalStatus = searchParams.get("approvalStatus");
    const assignedUserId = searchParams.get("assignedUserId");
    
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      isRequired: true,
      schedule: {
        startAt: {
          gte: dateRange.start,
          lt: dateRange.end,
        },
      },
    };

    // Role-based visibility
    if (!isSuper && !isAdmin) {
      // Social Media Team member sees only items assigned to them
      where.assignedUserId = currentUser.id;
    }

    // Apply filters
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (assignedUserId) where.assignedUserId = assignedUserId;

    // Aggregates for summary metrics
    const allMatching = await prisma.socialMediaUpdate.findMany({
      where,
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        posts: {
          select: {
            platform: true,
            status: true,
          },
        },
      },
    });

    const totalRequired = allMatching.length;
    const mediaPending = allMatching.filter((sm) => sm.status === "MEDIA_PENDING").length;
    const drafting = allMatching.filter((sm) => sm.status === "DRAFTING" || sm.status === "CAPTION_PREPARED").length;
    const waitingApproval = allMatching.filter((sm) => sm.status === "WAITING_FOR_APPROVAL" || sm.approvalStatus === "PENDING").length;
    const changesRequested = allMatching.filter((sm) => sm.status === "CHANGES_REQUESTED" || sm.approvalStatus === "CHANGES_REQUESTED").length;
    const partiallyPublished = allMatching.filter((sm) => sm.status === "PARTIALLY_PUBLISHED").length;
    const fullyPublished = allMatching.filter((sm) => sm.status === "PUBLISHED" || sm.status === "FULLY_PUBLISHED").length;

    // Platform-wise counts
    const platformCounts: Record<string, number> = {};
    allMatching.forEach((sm) => {
      sm.posts.forEach((post) => {
        if (post.status === "PUBLISHED" || post.status === "FULLY_PUBLISHED") {
          const plat = post.platform;
          platformCounts[plat] = (platformCounts[plat] || 0) + 1;
        }
      });
    });

    // Paginated list query
    const updates = (await prisma.socialMediaUpdate.findMany({
      where,
      include: {
        assignedUser: { select: { name: true } },
        schedule: { select: { title: true, startAt: true } },
        posts: {
          include: {
            publishedBy: { select: { name: true } },
          },
        },
      },
      orderBy: { schedule: { startAt: "asc" } },
      skip,
      take: limit,
    })) as any[];

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed social media updates report. Preset="${datePreset}". Returned ${updates.length} rows.`,
      },
    });

    return NextResponse.json({
      metrics: {
        totalRequired,
        mediaPending,
        drafting,
        waitingApproval,
        changesRequested,
        partiallyPublished,
        fullyPublished,
        platformCounts,
      },
      updates: updates.map((u) => ({
        id: u.id,
        scheduleTitle: u.schedule.title,
        eventDate: u.schedule.startAt,
        assignedStaffName: u.assignedUser?.name || "Unassigned",
        status: u.status,
        approvalStatus: u.approvalStatus,
        notes: u.notes || "None",
        posts: u.posts.map((p: any) => ({
          platform: p.platform,
          postType: p.postType || "POST",
          status: p.status,
          publishedUrl: p.publishedUrl || "N/A",
          publishedAt: p.publishedAt,
          publishedByStaffName: p.publishedBy?.name || "N/A",
        })),
      })),
      pagination: {
        total: totalRequired,
        page,
        limit,
        totalPages: Math.ceil(totalRequired / limit),
      },
    });
  } catch (err: any) {
    console.error("Error generating social media report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
