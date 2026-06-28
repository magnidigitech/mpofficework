import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { generateExcelResponse, formatDateKolkata } from "@/lib/export-helper";

// GET /api/reports/ttd/quotas/export.xlsx
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");
    const isTTDManager = roles.includes("TTD Manager");
    const isTTDStaff = roles.includes("TTD Staff");

    if (!isSuper && !isAdmin && !isTTDManager && !isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for TTD quotas exports." }, { status: 403 });
    }

    const periods = (await prisma.tTDQuotaPeriod.findMany({
      include: {
        createdBy: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
    })) as any[];

    const headers = [
      "Quota Period Name",
      "Start Date",
      "End Date",
      "Allocated Letters",
      "Reserved Letters",
      "Issued Letters",
      "Available Slots",
      "Active Status",
      "Created By",
      "Created Date",
    ];

    const dataRows = periods.map((p) => {
      const available = p.allocatedLetters - p.reservedLetters - p.issuedLetters;
      return [
        p.name,
        formatDateKolkata(p.startDate).split(",")[0],
        formatDateKolkata(p.endDate).split(",")[0],
        p.allocatedLetters,
        p.reservedLetters,
        p.issuedLetters,
        available,
        p.isActive ? "ACTIVE" : "INACTIVE",
        p.createdBy?.name || "System",
        formatDateKolkata(p.createdAt).split(",")[0],
      ];
    });

    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated TTD quota periods Excel export. Count: ${periods.length}.`,
      },
    });

    return generateExcelResponse(headers, dataRows, "TTD Quotas Report");
  } catch (err: any) {
    console.error("Error exporting TTD quotas:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
