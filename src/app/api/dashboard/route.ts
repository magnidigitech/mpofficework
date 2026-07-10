import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user roles
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator") || isAdmin;
    const isScheduleViewer = roles.includes("Schedule Viewer") && !isAdmin && !isCoordinator;

    // Timezone bounds calculations (Asia/Kolkata offset: +5.5 hours)
    const now = new Date();
    const kolkataOffset = 5.5 * 60 * 60 * 1000;
    const localTime = new Date(now.getTime() + kolkataOffset);

    // Start of Kolkata Today (00:00:00 local time) converted back to UTC
    const startOfKolkataToday = new Date(Date.UTC(
      localTime.getUTCFullYear(),
      localTime.getUTCMonth(),
      localTime.getUTCDate(),
      0, 0, 0, 0
    ));
    const startOfToday = new Date(startOfKolkataToday.getTime() - kolkataOffset);

    // End of Kolkata Today (24 hours after start)
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Tomorrow bounds
    const startOfTomorrow = endOfToday;
    const endOfTomorrow = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);

    // 1. Today's schedule stats
    const todaySchedules = await prisma.schedule.findMany({
      where: {
        startAt: {
          gte: startOfToday,
          lt: endOfToday,
        },
        ...(isScheduleViewer ? { status: "CONFIRMED" } : {}),
      },
    });

    const todayTotal = todaySchedules.length;
    const todayCompleted = todaySchedules.filter(s => s.status === "COMPLETED").length;
    const todayCancelled = todaySchedules.filter(s => s.status === "CANCELLED").length;
    const todayUpcoming = todaySchedules.filter(s => s.status !== "COMPLETED" && s.status !== "CANCELLED").length;

    // 2. Pending checklist items (for active schedules)
    const pendingChecklists = await prisma.visitChecklistItem.count({
      where: {
        isCompleted: false,
        visitChecklist: {
          schedule: {
            status: isScheduleViewer ? "CONFIRMED" : {
              notIn: ["COMPLETED", "CANCELLED"],
            },
          },
        },
      },
    });

    // 3. Pending social media updates
    const pendingSocialMedia = await prisma.socialMediaUpdate.count({
      where: {
        isRequired: true,
        status: { not: "PUBLISHED" },
      },
    });

    const smCompletedEventsPending = await prisma.socialMediaUpdate.count({
      where: {
        isRequired: true,
        status: { not: "PUBLISHED" },
        schedule: { status: "COMPLETED" },
      },
    });

    const smWaitingApprovalCount = await prisma.socialMediaUpdate.count({
      where: {
        isRequired: true,
        approvalStatus: "PENDING",
      },
    });

    const smPartiallyPublishedCount = await prisma.socialMediaUpdate.count({
      where: {
        isRequired: true,
        status: "PARTIALLY_PUBLISHED",
      },
    });

    const smFullyPublishedCount = await prisma.socialMediaUpdate.count({
      where: {
        isRequired: true,
        status: "PUBLISHED",
      },
    });

    const urgentSocialItems = await prisma.socialMediaUpdate.findMany({
      where: {
        isRequired: true,
        OR: [
          { status: "MEDIA_PENDING", schedule: { status: "COMPLETED" } },
          { approvalStatus: "PENDING" },
          { status: "APPROVED" },
          { status: "PARTIALLY_PUBLISHED" },
        ],
      },
      include: {
        schedule: {
          select: { id: true, title: true, startAt: true, endAt: true, status: true },
        },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });

    // 4. TTD Quotas summary (for today and upcoming days)
    const activeQuotas = await prisma.tTDQuotaPeriod.findMany({
      where: {
        isActive: true,
      },
    });

    let ttdQuotaUsed = 0;
    let ttdQuotaAvailable = 0;
    for (const q of activeQuotas) {
      ttdQuotaUsed += q.issuedLetters;
      ttdQuotaAvailable += Math.max(0, q.allocatedLetters - q.reservedLetters - q.issuedLetters);
    }

    const ttdNewRequests = await prisma.tTDRequest.count({
      where: { status: "REQUESTED" },
    });

    const ttdPendingVerification = await prisma.tTDRequest.count({
      where: { status: "UNDER_VERIFICATION" },
    });

    const ttdAwaitingApproval = await prisma.tTDRequest.count({
      where: { status: "VERIFIED" },
    });

    const ttdPreparedNotDistributed = await prisma.tTDRequest.count({
      where: { status: "LETTER_PREPARED" },
    });

    const ttdLowQuotaWarning = ttdQuotaAvailable < 5;

    // 5. Next upcoming visit (any visit starting after now that is not completed/cancelled)
    const nextVisit = await prisma.schedule.findFirst({
      where: {
        startAt: {
          gte: now,
        },
        status: isScheduleViewer ? "CONFIRMED" : {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
      include: {
        contacts: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    });

    // 6. Tomorrow's schedule preview
    const tomorrowSchedules = await prisma.schedule.findMany({
      where: {
        startAt: {
          gte: startOfTomorrow,
          lt: endOfTomorrow,
        },
        ...(isScheduleViewer ? { status: "CONFIRMED" } : {}),
      },
      include: {
        contacts: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    });

    return NextResponse.json({
      metrics: {
        todayTotal,
        todayCompleted,
        todayUpcoming,
        todayCancelled,
        pendingChecklists,
        pendingSocialMedia,
        smCompletedEventsPending,
        smWaitingApprovalCount,
        smPartiallyPublishedCount,
        smFullyPublishedCount,
        ttdQuotaUsed,
        ttdQuotaAvailable,
        ttdNewRequests,
        ttdPendingVerification,
        ttdAwaitingApproval,
        ttdPreparedNotDistributed,
        ttdLowQuotaWarning,
      },
      nextVisit,
      tomorrowSchedules,
      urgentSocialItems,
    });
  } catch (err: any) {
    console.error("Error generating dashboard metrics:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
