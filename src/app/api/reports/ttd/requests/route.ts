import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "N/A";
  const str = mobile.trim();
  if (str.length < 5) return "*****";
  return `${str.slice(0, 3)}*****${str.slice(-2)}`;
}

// GET /api/reports/ttd/requests
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

    // Authorize TTD reports view
    if (!isSuper && !isAdmin && !isTTDManager && !isTTDStaff && !isViewer) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for TTD reports." }, { status: 403 });
    }

    // Checking if user is permitted to see unmasked sensitive contact numbers
    const canSeeSensitive = isSuper || isAdmin || isTTDManager;

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    
    // Preferred darshan date range filters
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

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      createdAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    // Apply preferred darshan date range filters if provided
    if (darshanPreset) {
      const darshanRange = parseDateFilter(darshanPreset, darshanStart || undefined, darshanEnd || undefined);
      where.preferredDarshanDate = {
        gte: darshanRange.start,
        lt: darshanRange.end,
      };
    }

    // Role-based visibility check: TTD Staff/Viewer see only requests they created or are assigned to
    if (!isSuper && !isAdmin && !isTTDManager) {
      // Limit to requests created by this user
      where.createdById = currentUser.id;
    }

    // Additional filters
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

    const totalRequests = await prisma.tTDRequest.count({ where });

    // Retrieve summary counts for matching set
    const allMatching = await prisma.tTDRequest.findMany({
      where,
      select: {
        status: true,
        verificationStatus: true,
        documentsStatus: true,
        numberOfMembers: true,
      },
    });

    const totalLetters = allMatching.length;
    const requested = allMatching.filter((r) => r.status === "REQUESTED").length;
    const approved = allMatching.filter((r) => r.status === "QUOTA_RESERVED" || r.status === "APPROVED").length;
    const prepared = allMatching.filter((r) => r.status === "LETTER_PREPARED").length;
    const distributed = allMatching.filter((r) => r.status === "DISTRIBUTED" || r.status === "USED").length;
    const cancelled = allMatching.filter((r) => r.status === "CANCELLED").length;
    const rejected = allMatching.filter((r) => r.status === "REJECTED").length;
    
    let totalTravellers = 0;
    allMatching.forEach((r) => {
      totalTravellers += r.numberOfMembers || 0;
    });

    // Query list
    const requests = (await prisma.tTDRequest.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        quotaPeriod: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    })) as any[];

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed TTD requests report. Preset="${datePreset}". Returned ${requests.length} rows.`,
      },
    });

    return NextResponse.json({
      metrics: {
        totalLetters,
        totalTravellers,
        requested,
        approved,
        prepared,
        distributed,
        cancelled,
        rejected,
      },
      requests: requests.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        applicantName: r.applicantName,
        applicantMobile: canSeeSensitive ? r.applicantMobile : maskMobile(r.applicantMobile),
        alternateMobile: canSeeSensitive ? r.alternateMobile : maskMobile(r.alternateMobile),
        district: r.district || "N/A",
        constituency: r.constituency || "N/A",
        preferredDarshanDate: r.preferredDarshanDate,
        numberOfMembers: r.numberOfMembers,
        sourceType: r.sourceType,
        status: r.status,
        verificationStatus: r.verificationStatus,
        documentsStatus: r.documentsStatus,
        quotaPeriodName: r.quotaPeriod?.name || "N/A",
        letterNumber: r.letterNumber || "N/A",
        createdAt: r.createdAt,
        approvedAt: r.approvedAt,
        distributedAt: r.distributedAt,
        createdByName: r.createdBy?.name || "Portal System",
      })),
      pagination: {
        total: totalRequests,
        page,
        limit,
        totalPages: Math.ceil(totalRequests / limit),
      },
    });
  } catch (err: any) {
    console.error("Error generating TTD report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
