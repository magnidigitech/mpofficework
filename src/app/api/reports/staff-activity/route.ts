import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// GET /api/reports/staff-activity
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
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for staff activity reports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const staffId = searchParams.get("userId");
    const roleFilter = searchParams.get("role");
    const deptFilter = searchParams.get("department");

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    // Fetch matching staff members
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

    const totalStaff = await prisma.user.count({ where: staffWhere });
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
      skip,
      take: limit,
    });

    // Group logs in date bounds to count actions for each staff
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

    // Map logs to user summaries
    const reportData = staffMembers.map((staff) => {
      const userLogs = logsGrouped.filter((l) => l.userId === staff.id);

      const getCount = (actionPattern: string) => {
        return userLogs
          .filter((l) => l.action === actionPattern)
          .reduce((sum, l) => sum + l._count.id, 0);
      };

      return {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        employeeCode: staff.employeeCode || "N/A",
        role: staff.userRoles[0]?.role?.name || "Viewer",
        department: staff.department || "MP Office",
        designation: staff.designation || "Staff",
        metrics: {
          schedulesCreated: getCount("CREATE_SCHEDULE"),
          schedulesUpdated: getCount("UPDATE_SCHEDULE"),
          checklistCompleted: getCount("COMPLETE_CHECKLIST_ITEM") + getCount("TOGGLE_COMPLETE"),
          socialMediaUpdated: getCount("SOCIAL_MEDIA_UPDATE") + getCount("SOCIAL_MEDIA_APPROVED") + getCount("SOCIAL_MEDIA_SUBMITTED"),
          ttdRequestsCreated: getCount("TTD_REQUEST_CREATED"),
          ttdRequestsVerified: getCount("TTD_REQUEST_VERIFIED"),
          lettersPrepared: getCount("TTD_LETTER_PREPARED"),
          lettersDistributed: getCount("TTD_LETTER_DISTRIBUTED"),
        },
      };
    });

    // Summary Totals
    const overallLogs = await prisma.activityLog.findMany({
      where: {
        createdAt: {
          gte: dateRange.start,
          lt: dateRange.end,
        },
      },
      select: { action: true },
    });

    const getOverallCount = (action: string) => overallLogs.filter((l) => l.action === action).length;

    const summaryTotals = {
      schedulesCreated: getOverallCount("CREATE_SCHEDULE"),
      schedulesUpdated: getOverallCount("UPDATE_SCHEDULE"),
      checklistCompleted: getOverallCount("COMPLETE_CHECKLIST_ITEM") + getOverallCount("TOGGLE_COMPLETE"),
      socialMediaUpdated: getOverallCount("SOCIAL_MEDIA_UPDATE") + getOverallCount("SOCIAL_MEDIA_APPROVED") + getOverallCount("SOCIAL_MEDIA_SUBMITTED"),
      ttdRequestsCreated: getOverallCount("TTD_REQUEST_CREATED"),
      lettersPrepared: getOverallCount("TTD_LETTER_PREPARED"),
      lettersDistributed: getOverallCount("TTD_LETTER_DISTRIBUTED"),
    };

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed staff activity operational audit report. Preset="${datePreset}".`,
      },
    });

    return NextResponse.json({
      summaryTotals,
      report: reportData,
      pagination: {
        total: totalStaff,
        page,
        limit,
        totalPages: Math.ceil(totalStaff / limit),
      },
    });
  } catch (err: any) {
    console.error("Error generating staff activity report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
