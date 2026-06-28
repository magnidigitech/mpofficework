import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// GET /api/reports/checklists
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator");
    const isFieldStaff = roles.includes("Field Staff");

    if (!isSuper && !isAdmin && !isCoordinator && !isFieldStaff) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for checklist reports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const scheduleId = searchParams.get("scheduleId");
    const category = searchParams.get("category");
    const section = searchParams.get("section");
    const staffId = searchParams.get("staffId");
    const status = searchParams.get("status"); // "completed" or "pending"
    const isMandatory = searchParams.get("isMandatory"); // "true" or "false"
    
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {};

    // 1. Restrict based on date range of the linked Schedule
    where.visitChecklist = {
      schedule: {
        startAt: {
          gte: dateRange.start,
          lt: dateRange.end,
        },
      },
    };

    // 2. Role-based checklist items visibility
    if (!isSuper && !isAdmin) {
      if (isFieldStaff) {
        // Field Staff sees checklist items assigned to them specifically
        where.assignedUserId = currentUser.id;
      } else if (isCoordinator) {
        // Coordinator sees checklists of schedules they are assigned to
        where.visitChecklist.schedule = {
          ...where.visitChecklist.schedule,
          assignments: {
            some: { userId: currentUser.id },
          },
        };
      }
    }

    // Apply filters
    if (scheduleId) {
      where.visitChecklist.scheduleId = scheduleId;
    }
    if (category) {
      where.visitChecklist.schedule.category = category;
    }
    if (section) {
      where.section = section;
    }
    if (staffId) {
      where.assignedUserId = staffId;
    }
    if (status) {
      where.isCompleted = status === "completed";
    }
    if (isMandatory) {
      where.isMandatory = isMandatory === "true";
    }

    // Retrieve aggregate details without pagination
    const allMatching = await prisma.visitChecklistItem.findMany({
      where,
      select: {
        id: true,
        isCompleted: true,
        isMandatory: true,
        section: true,
        assignedUser: {
          select: { name: true },
        },
      },
    });

    const totalChecklistItems = allMatching.length;
    const completed = allMatching.filter((item) => item.isCompleted).length;
    const pending = totalChecklistItems - completed;
    const mandatoryPending = allMatching.filter((item) => item.isMandatory && !item.isCompleted).length;

    // Section-wise stats
    const sectionStats: Record<string, { total: number; completed: number }> = {};
    // Staff-wise stats
    const staffStats: Record<string, { total: number; completed: number }> = {};

    allMatching.forEach((item) => {
      // Sections
      const secKey = item.section;
      if (!sectionStats[secKey]) {
        sectionStats[secKey] = { total: 0, completed: 0 };
      }
      sectionStats[secKey].total++;
      if (item.isCompleted) sectionStats[secKey].completed++;

      // Staff
      const staffName = item.assignedUser?.name || "Unassigned";
      if (!staffStats[staffName]) {
        staffStats[staffName] = { total: 0, completed: 0 };
      }
      staffStats[staffName].total++;
      if (item.isCompleted) staffStats[staffName].completed++;
    });

    // Fetch Paginated List
    const items = (await prisma.visitChecklistItem.findMany({
      where,
      include: {
        assignedUser: { select: { name: true } },
        completedBy: { select: { name: true } },
        visitChecklist: {
          include: {
            schedule: { select: { title: true, startAt: true } },
          },
        },
      },
      orderBy: [
        { visitChecklist: { schedule: { startAt: "asc" } } },
        { displayOrder: "asc" },
      ],
      skip,
      take: limit,
    })) as any[];

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed checklists report. Preset="${datePreset}". Returned ${items.length} rows.`,
      },
    });

    return NextResponse.json({
      metrics: {
        totalChecklistItems,
        completed,
        pending,
        mandatoryPending,
        sectionStats,
        staffStats,
      },
      items: items.map((i) => ({
        id: i.id,
        scheduleTitle: i.visitChecklist.schedule.title,
        title: i.title,
        section: i.section,
        isMandatory: i.isMandatory,
        isCompleted: i.isCompleted,
        assignedStaffName: i.assignedUser?.name || "Unassigned",
        completedByStaffName: i.completedBy?.name || "N/A",
        completedAt: i.completedAt,
        remarks: i.remarks || "No remarks",
      })),
      pagination: {
        total: totalChecklistItems,
        page,
        limit,
        totalPages: Math.ceil(totalChecklistItems / limit),
      },
    });
  } catch (err: any) {
    console.error("Error generating checklist report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
