import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";
import { generateExcelResponse, formatDateKolkata, MAX_EXPORT_LIMIT } from "@/lib/export-helper";

// GET /api/reports/social-media/export.xlsx
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
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for social media exports." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const status = searchParams.get("status");
    const approvalStatus = searchParams.get("approvalStatus");
    const assignedUserId = searchParams.get("assignedUserId");

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

    if (!isSuper && !isAdmin) {
      where.assignedUserId = currentUser.id;
    }

    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (assignedUserId) where.assignedUserId = assignedUserId;

    const count = await prisma.socialMediaUpdate.count({ where });
    if (count > MAX_EXPORT_LIMIT) {
      return NextResponse.json(
        { error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters.` },
        { status: 400 }
      );
    }

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
    })) as any[];

    const headers = [
      "Schedule/Visit",
      "Event Date",
      "Assigned Staff",
      "Workflow Status",
      "Approval Status",
      "Notes",
      "Platform Details",
    ];

    const dataRows = updates.map((u: any) => {
      const postsDetails = u.posts
        .map((p: any) => `[${p.platform}] Type: ${p.postType || "POST"} | Status: ${p.status} | URL: ${p.publishedUrl || "N/A"} (${p.publishedBy?.name || "N/A"})`)
        .join("\n");

      return [
        u.schedule.title,
        formatDateKolkata(u.schedule.startAt).split(",")[0],
        u.assignedUser?.name || "Unassigned",
        u.status,
        u.approvalStatus,
        u.notes || "None",
        postsDetails,
      ];
    });

    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated social media Excel export. Row count: ${count}. Preset="${datePreset}".`,
      },
    });

    const filterSummary = {
      "Date Range": dateRange.label,
      "Workflow Status": status || "ALL",
      "Approval Status": approvalStatus || "ALL",
    };

    return generateExcelResponse(headers, dataRows, "Social Media Report", filterSummary);
  } catch (err: any) {
    console.error("Error exporting social media updates:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
