import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";
import { generateExcelResponse, MAX_EXPORT_LIMIT } from "@/lib/export-helper";

// GET /api/reports/staff-activity/export.xlsx
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");

    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for staff activity exports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const staffId = searchParams.get("userId");
    const roleFilter = searchParams.get("role");
    const deptFilter = searchParams.get("department");

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const staffWhere: any = {};
    if (staffId) staffWhere.id = staffId;
    if (deptFilter) staffWhere.department = deptFilter;
    if (roleFilter) {
      staffWhere.userRoles = {
        some: {
          role: { name: roleFilter },
        },
      };
    }

    const count = await prisma.user.count({ where: staffWhere });
    if (count > MAX_EXPORT_LIMIT) {
      return NextResponse.json(
        { error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters.` },
        { status: 400 }
      );
    }

    const staffMembers = await prisma.user.findMany({
      where: staffWhere,
      select: {
        id: true,
        name: true,
        email: true,
        employeeCode: true,
        department: true,
        designation: true,
        userRoles: {
          select: {
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const logsGrouped = await prisma.activityLog.groupBy({
      by: ["userId", "action"],
      where: {
        createdAt: {
          gte: dateRange.start,
          lt: dateRange.end,
        },
      },
      _count: {
        id: true,
      },
    });

    const headers = [
      "Employee Code",
      "Employee Name",
      "Email Address",
      "Security Role",
      "Department",
      "Designation",
      "Schedules Created",
      "Schedules Updated",
      "Checklists Completed",
      "Social Media Actions",
      "TTD Requests Created",
      "TTD Requests Verified",
      "TTD Letters Prepared",
      "TTD Letters Distributed",
    ];

    const dataRows = staffMembers.map((staff) => {
      const userLogs = logsGrouped.filter((l) => l.userId === staff.id);

      const getCount = (actionPattern: string) => {
        return userLogs
          .filter((l) => l.action === actionPattern)
          .reduce((sum, l) => sum + l._count.id, 0);
      };

      return [
        staff.employeeCode || "N/A",
        staff.name,
        staff.email,
        staff.userRoles[0]?.role?.name || "Viewer",
        staff.department || "MP Office",
        staff.designation || "Staff",
        getCount("CREATE_SCHEDULE"),
        getCount("UPDATE_SCHEDULE"),
        getCount("COMPLETE_CHECKLIST_ITEM") + getCount("TOGGLE_COMPLETE"),
        getCount("SOCIAL_MEDIA_UPDATE") + getCount("SOCIAL_MEDIA_APPROVED") + getCount("SOCIAL_MEDIA_SUBMITTED"),
        getCount("TTD_REQUEST_CREATED"),
        getCount("TTD_REQUEST_VERIFIED"),
        getCount("TTD_LETTER_PREPARED"),
        getCount("TTD_LETTER_DISTRIBUTED"),
      ];
    });

    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated staff activity operational Excel export. Row count: ${count}. Preset="${datePreset}".`,
      },
    });

    const filterSummary = {
      "Date Range": dateRange.label,
      "Role filter": roleFilter || "ALL",
      "Department filter": deptFilter || "ALL",
    };

    return generateExcelResponse(headers, dataRows, "Staff Activity Report", filterSummary);
  } catch (err: any) {
    console.error("Error exporting staff activity report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
