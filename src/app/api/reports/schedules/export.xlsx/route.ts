import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";
import { generateExcelResponse, formatDateKolkata, MAX_EXPORT_LIMIT } from "@/lib/export-helper";

// GET /api/reports/schedules/export.xlsx
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
    const isSMTeam = roles.includes("Social Media Team");

    if (!isSuper && !isAdmin && !isCoordinator && !isFieldStaff && !isSMTeam) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for schedules exports." }, { status: 403 });
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

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      startAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    if (!isSuper && !isAdmin) {
      where.assignments = {
        some: { userId: currentUser.id },
      };
    }

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

    // Limit check before pulling from DB
    const count = await prisma.schedule.count({ where });
    if (count > MAX_EXPORT_LIMIT) {
      return NextResponse.json(
        { error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters.` },
        { status: 400 }
      );
    }

    const schedules = (await prisma.schedule.findMany({
      where,
      include: {
        assignments: {
          include: {
            user: { select: { name: true } },
          },
        },
        visitChecklist: {
          select: {
            items: {
              select: { isCompleted: true },
            },
          },
        },
        socialMediaUpdate: {
          select: { status: true },
        },
      },
      orderBy: { startAt: "asc" },
    })) as any[];

    const headers = [
      "Schedule Date",
      "Start Time",
      "End Time",
      "Title",
      "Category",
      "Location/Venue",
      "Organizer",
      "Priority",
      "Status",
      "Assigned Staff",
      "Checklist Progress",
      "Social Media Status",
    ];

    const dataRows = schedules.map((s) => {
      const totalItems = s.visitChecklist?.items.length || 0;
      const compItems = s.visitChecklist?.items.filter((i: any) => i.isCompleted).length || 0;
      return [
        formatDateKolkata(s.startAt).split(",")[0], // Date only
        formatDateKolkata(s.startAt).split(",")[1]?.trim() || "N/A", // Start
        formatDateKolkata(s.endAt).split(",")[1]?.trim() || "N/A", // End
        s.title,
        s.category || "N/A",
        s.venue,
        s.organizerName || "N/A",
        s.priority || "NORMAL",
        s.status,
        s.assignments.map((a: any) => a.user.name).join(", ") || "None",
        totalItems > 0 ? `${compItems}/${totalItems}` : "0/0",
        s.socialMediaUpdate?.status || "NOT_REQUIRED",
      ];
    });

    // Logging audit
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated schedules Excel export. Row count: ${count}. Filters: Preset="${datePreset}".`,
      },
    });

    const filterSummary = {
      "Date Range": dateRange.label,
      "Schedule Status": status || "ALL",
      "Event Category": category || "ALL",
    };

    return generateExcelResponse(headers, dataRows, "Schedules Report", filterSummary);
  } catch (err: any) {
    console.error("Error exporting schedules:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
