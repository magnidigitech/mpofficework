import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";

// GET /api/reports/ttd/quotas
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
      return NextResponse.json({ error: "Forbidden: Insufficient permissions for TTD quota reports." }, { status: 403 });
    }

    const periods = (await prisma.tTDQuotaPeriod.findMany({
      include: {
        createdBy: { select: { name: true } },
        transactions: {
          select: {
            id: true,
            transactionType: true,
            quantity: true,
            reason: true,
            createdAt: true,
            performedBy: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { startDate: "desc" },
    })) as any[];

    const formattedPeriods = periods.map((p) => {
      const computedAvailable = p.allocatedLetters - p.reservedLetters - p.issuedLetters;
      // Flag inconsistent counters if computed available does not match database record counter
      // Wait, is there a direct available counter or do we calculate it?
      // Let's check schema: TTDQuotaPeriod has allocatedLetters, reservedLetters, issuedLetters.
      // So computedAvailable represents available slots. If reserved or issued counters exceed allocation, it is flagged.
      const isInconsistent = p.reservedLetters < 0 || p.issuedLetters < 0 || computedAvailable < 0;

      return {
        id: p.id,
        name: p.name,
        startAt: p.startDate,
        endAt: p.endDate,
        allocatedLetters: p.allocatedLetters,
        reservedLetters: p.reservedLetters,
        issuedLetters: p.issuedLetters,
        availableLetters: computedAvailable,
        isActive: p.isActive,
        isInconsistent,
        createdByName: p.createdBy?.name || "System",
        createdAt: p.createdAt,
        recentTransactions: p.transactions.map((t: any) => ({
          id: t.id,
          type: t.transactionType,
          quantity: t.quantity,
          reason: t.reason || "N/A",
          performedByName: t.performedBy?.name || "System",
          createdAt: t.createdAt,
        })),
      };
    });

    // Summary Metrics
    const totalAllocated = periods.reduce((acc, p) => acc + p.allocatedLetters, 0);
    const totalReserved = periods.reduce((acc, p) => acc + p.reservedLetters, 0);
    const totalIssued = periods.reduce((acc, p) => acc + p.issuedLetters, 0);
    const totalAvailable = totalAllocated - totalReserved - totalIssued;
    const activePeriods = periods.filter((p) => p.isActive).length;
    const inconsistentCount = formattedPeriods.filter((p) => p.isInconsistent).length;

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "REPORT_VIEWED",
        details: `Viewed TTD quotas report. Found ${periods.length} quota periods.`,
      },
    });

    return NextResponse.json({
      metrics: {
        totalAllocated,
        totalReserved,
        totalIssued,
        totalAvailable,
        activePeriods,
        inconsistentCount,
      },
      quotaPeriods: formattedPeriods,
    });
  } catch (err: any) {
    console.error("Error generating TTD quotas report:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
