import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";
import { generateExcelResponse, formatDateKolkata, MAX_EXPORT_LIMIT } from "@/lib/export-helper";

// GET /api/reports/checklists/export.xlsx
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
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for checklists exports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const scheduleId = searchParams.get("scheduleId");
    const category = searchParams.get("category");
    const section = searchParams.get("section");
    const staffId = searchParams.get("staffId");
    const status = searchParams.get("status");
    const isMandatory = searchParams.get("isMandatory");

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      visitChecklist: {
        schedule: {
          startAt: {
            gte: dateRange.start,
            lt: dateRange.end,
          },
        },
      },
    };

    if (!isSuper && !isAdmin) {
      if (isFieldStaff) {
        where.assignedUserId = currentUser.id;
      } else if (isCoordinator) {
        where.visitChecklist.schedule = {
          ...where.visitChecklist.schedule,
          assignments: {
            some: { userId: currentUser.id },
          },
        };
      }
    }

    if (scheduleId) where.visitChecklist.scheduleId = scheduleId;
    if (category) where.visitChecklist.schedule.category = category;
    if (section) where.section = section;
    if (staffId) where.assignedUserId = staffId;
    if (status) where.isCompleted = status === "completed";
    if (isMandatory) where.isMandatory = isMandatory === "true";

    const count = await prisma.visitChecklistItem.count({ where });
    if (count > MAX_EXPORT_LIMIT) {
      return NextResponse.json(
        { error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters.` },
        { status: 400 }
      );
    }

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
    })) as any[];

    const headers = [
      "Schedule/Visit",
      "Checklist Item",
      "Section",
      "Mandatory Status",
      "Assigned Staff",
      "Completion Status",
      "Completed By",
      "Completed Date",
      "Remarks",
    ];

    const dataRows = items.map((i) => [
      i.visitChecklist.schedule.title,
      i.title,
      i.section,
      i.isMandatory ? "MANDATORY" : "OPTIONAL",
      i.assignedUser?.name || "Unassigned",
      i.isCompleted ? "COMPLETED" : "PENDING",
      i.completedBy?.name || "N/A",
      i.completedAt ? formatDateKolkata(i.completedAt) : "N/A",
      i.remarks || "No remarks",
    ]);

    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated checklists Excel export. Row count: ${count}. Filters: Section="${section || "ALL"}".`,
      },
    });

    const filterSummary = {
      "Date Range": dateRange.label,
      "Completion Status": status || "ALL",
      "Section": section || "ALL",
    };

    return generateExcelResponse(headers, dataRows, "Checklist Report", filterSummary);
  } catch (err: any) {
    console.error("Error exporting checklists:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
