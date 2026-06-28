import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// GET /api/reports/schedules
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    // Role verification
    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator");
    const isFieldStaff = roles.includes("Field Staff");
    const isSMTeam = roles.includes("Social Media Team");

    // Only permitted roles can view schedule reports
    if (!isSuper && !isAdmin && !isCoordinator && !isFieldStaff && !isSMTeam) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for schedules reports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const location = searchParams.get("location");
    const organizer = searchParams.get("organizer");
    const staffId = searchParams.get("staffId");
    const smRequired = searchParams.get("socialMediaRequired");
    const query = searchParams.get("query");

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    // Date range boundaries
    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      startAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    // Role-based records visibility filter
    if (!isSuper && !isAdmin) {
      // Coordinator, Field Staff, SM Team get only their assigned/managed schedules
      where.assignments = {
        some: {
          userId: currentUser.id,
        },
      };
    }

    // Apply normal filters
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (location) where.venue = { contains: location, mode: "insensitive" };
    if (organizer) where.organizerName = { contains: organizer, mode: "insensitive" };
    if (staffId) {
      where.assignments = {
        some: { userId: staffId },
      };
    }
    if (smRequired) {
      where.socialMediaRequired = smRequired === "true";
    }
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { venue: { contains: query, mode: "insensitive" } },
      ];
    }

    const allMatching = (await prisma.schedule.findMany({
      where,
      select: {
        id: true,
        status: true,
        priority: true,
        visitChecklist: {
          select: {
            items: {
              select: {
                isCompleted: true,
              },
            },
          },
        },
        socialMediaUpdate: {
          select: {
            isRequired: true,
            status: true,
          },
        },
      },
    })) as any[];

    const totalSchedules = allMatching.length;
    const completed = allMatching.filter((s) => s.status === "COMPLETED").length;
    const upcoming = allMatching.filter((s) => ["DRAFT", "CONFIRMED", "TRAVELLING", "ARRIVED", "IN_PROGRESS"].includes(s.status)).length;
    const cancelled = allMatching.filter((s) => s.status === "CANCELLED").length;
    const postponed = allMatching.filter((s) => s.status === "POSTPONED").length;
    const highPriority = allMatching.filter((s) => s.priority === "HIGH" || s.priority === "CRITICAL").length;

    // Calculate checklist completion rate
    let totalChecklistItems = 0;
    let completedChecklistItems = 0;
    allMatching.forEach((s) => {
      if (s.visitChecklist) {
        s.visitChecklist.items.forEach((item: any) => {
          totalChecklistItems++;
          if (item.isCompleted) completedChecklistItems++;
        });
      }
    });
    const checklistCompletionRate = totalChecklistItems > 0 
      ? Math.round((completedChecklistItems / totalChecklistItems) * 100) 
      : 0;

    // Calculate social media completion rate
    const smRequiredList = allMatching.filter((s) => s.socialMediaUpdate?.isRequired);
    const smCompleted = smRequiredList.filter((s) => s.socialMediaUpdate?.status === "PUBLISHED" || s.socialMediaUpdate?.status === "FULLY_PUBLISHED").length;
    const socialMediaCompletionRate = smRequiredList.length > 0
      ? Math.round((smCompleted / smRequiredList.length) * 100)
      : 0;

    // Paginated list
    const schedules = (await prisma.schedule.findMany({
      where,
      include: {
        assignments: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        visitChecklist: {
          select: {
            items: {
              select: {
                isCompleted: true,
              },
            },
          },
        },
        socialMediaUpdate: {
          select: {
            isRequired: true,
            status: true,
          },
        },
      },
      orderBy: { startAt: "asc" },
      skip,
      take: limit,
    })) as any[];

    // Audit Log for report view
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed tour schedules report. Filters: DatePreset="${datePreset}", Status="${status || "ALL"}". Returned ${schedules.length} rows.`,
      },
    });

    return NextResponse.json({
      metrics: {
        totalSchedules,
        completed,
        upcoming,
        cancelled,
        postponed,
        highPriority,
        checklistCompletionRate,
        socialMediaCompletionRate,
      },
      schedules: schedules.map((s) => {
        const totalItems = s.visitChecklist?.items.length || 0;
        const compItems = s.visitChecklist?.items.filter((i: any) => i.isCompleted).length || 0;
        return {
          id: s.id,
          title: s.title,
          category: s.category || "N/A",
          venue: s.venue,
          organizerName: s.organizerName || "N/A",
          priority: s.priority || "NORMAL",
          status: s.status,
          startAt: s.startAt,
          endAt: s.endAt,
          socialMediaRequired: s.socialMediaUpdate?.isRequired || false,
          socialMediaStatus: s.socialMediaUpdate?.status || "NOT_REQUIRED",
          checklistProgress: totalItems > 0 ? `${compItems}/${totalItems}` : "0/0",
          assignedStaff: s.assignments.map((a: any) => a.user.name).join(", ") || "None",
        };
      }),
      pagination: {
        total: totalSchedules,
        page,
        limit,
        totalPages: Math.ceil(totalSchedules / limit),
      },
    });
  } catch (err: any) {
    console.error("Error generating schedules report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
