import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";
import { generateExcelResponse, formatDateKolkata, MAX_EXPORT_LIMIT } from "@/lib/export-helper";
import { maskMobile } from "../route";

// GET /api/reports/ttd/requests/export.xlsx
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
    const isViewer = roles.includes("Viewer");

    if (!isSuper && !isAdmin && !isTTDManager && !isTTDStaff && !isViewer) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for TTD requests exports." }, { status: 403 });
    }

    const canSeeSensitive = isSuper || isAdmin || isTTDManager;

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    
    const darshanPreset = searchParams.get("darshanPreset");
    const darshanStart = searchParams.get("darshanStartDate");
    const darshanEnd = searchParams.get("darshanEndDate");

    const status = searchParams.get("status");
    const verificationStatus = searchParams.get("verificationStatus");
    const documentsStatus = searchParams.get("documentsStatus");
    const district = searchParams.get("district");
    const constituency = searchParams.get("constituency");
    const sourceType = searchParams.get("sourceType");
    const referencePerson = searchParams.get("referencePerson");
    const quotaPeriodId = searchParams.get("quotaPeriodId");
    const letterNumber = searchParams.get("letterNumber");
    const createdById = searchParams.get("createdById");

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      createdAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    if (darshanPreset) {
      const darshanRange = parseDateFilter(darshanPreset, darshanStart || undefined, darshanEnd || undefined);
      where.preferredDarshanDate = {
        gte: darshanRange.start,
        lt: darshanRange.end,
      };
    }

    if (!isSuper && !isAdmin && !isTTDManager) {
      where.createdById = currentUser.id;
    }

    if (status) where.status = status;
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (documentsStatus) where.documentsStatus = documentsStatus;
    if (district) where.district = district;
    if (constituency) where.constituency = constituency;
    if (sourceType) where.sourceType = sourceType;
    if (referencePerson) {
      where.referencePersonName = { contains: referencePerson, mode: "insensitive" };
    }
    if (quotaPeriodId) where.quotaPeriodId = quotaPeriodId;
    if (letterNumber) {
      where.letterNumber = { contains: letterNumber, mode: "insensitive" };
    }
    if (createdById) where.createdById = createdById;

    const count = await prisma.tTDRequest.count({ where });
    if (count > MAX_EXPORT_LIMIT) {
      return NextResponse.json(
        { error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters.` },
        { status: 400 }
      );
    }

    const requests = (await prisma.tTDRequest.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        quotaPeriod: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    })) as any[];

    const headers = [
      "Request Number",
      "Applicant Name",
      "Applicant Mobile",
      "District",
      "Constituency",
      "Preferred Darshan Date",
      "Members Count",
      "Source Type",
      "Status",
      "Verification Status",
      "Documents Status",
      "Quota Period Name",
      "Letter Number",
      "Letter Date",
      "Created Date",
      "Approved Date",
      "Distributed Date",
      "Created By",
    ];

    const dataRows = requests.map((r) => [
      r.requestNumber,
      r.applicantName,
      canSeeSensitive ? r.applicantMobile : maskMobile(r.applicantMobile),
      r.district || "N/A",
      r.constituency || "N/A",
      formatDateKolkata(r.preferredDarshanDate).split(",")[0],
      r.numberOfMembers,
      r.sourceType,
      r.status,
      r.verificationStatus,
      r.documentsStatus,
      r.quotaPeriod?.name || "N/A",
      r.letterNumber || "N/A",
      r.letterDate ? formatDateKolkata(r.letterDate).split(",")[0] : "N/A",
      formatDateKolkata(r.createdAt).split(",")[0],
      r.approvedAt ? formatDateKolkata(r.approvedAt).split(",")[0] : "N/A",
      r.distributedAt ? formatDateKolkata(r.distributedAt).split(",")[0] : "N/A",
      r.createdBy?.name || "System",
    ]);

    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "EXCEL_EXPORT_GENERATED",
        details: `Generated TTD requests Excel export. Row count: ${count}. Preset="${datePreset}".`,
      },
    });

    const filterSummary = {
      "Date Range": dateRange.label,
      "Request Status": status || "ALL",
      "Verification": verificationStatus || "ALL",
    };

    return generateExcelResponse(headers, dataRows, "TTD Requests Report", filterSummary);
  } catch (err: any) {
    console.error("Error exporting TTD requests:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
