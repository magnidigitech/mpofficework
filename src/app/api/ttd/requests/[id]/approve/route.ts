import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserRoles } from "@/lib/ttd-utils";
import { sendNotification } from "@/lib/notification-sender";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestRecord = await prisma.tTDRequest.findUnique({
      where: { id },
    });

    if (!requestRecord) {
      return NextResponse.json({ error: "TTD Request not found" }, { status: 404 });
    }

    // Status check
    if (requestRecord.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Validation failed: Only VERIFIED requests can be approved." },
        { status: 400 }
      );
    }

    // Role check
    const userPerms = await getUserRoles(session.user.id);
    if (!userPerms.isOfficeAdmin) {
      return NextResponse.json({ error: "Forbidden: Administrators only" }, { status: 403 });
    }

    const body = await request.json();
    const { quotaPeriodId } = body;

    if (!quotaPeriodId) {
      return NextResponse.json({ error: "quotaPeriodId is required for approval." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Lock/fetch selected quota period
      const period = await tx.tTDQuotaPeriod.findUnique({
        where: { id: quotaPeriodId },
      });

      if (!period || !period.isActive) {
        throw new Error("Selected quota period is invalid or inactive.");
      }

      // Check available capacity: Allocated - Reserved - Issued
      const available = period.allocatedLetters - period.reservedLetters - period.issuedLetters;
      if (available < 1) {
        throw new Error(`Insufficient quota capacity. ${period.name} has no letters remaining.`);
      }

      // 2. Increment reservedLetters by 1
      const updatedPeriod = await tx.tTDQuotaPeriod.update({
        where: { id: quotaPeriodId },
        data: {
          reservedLetters: {
            increment: 1,
          },
        },
      });

      // 3. Update TTDRequest
      const updatedRequest = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "QUOTA_RESERVED",
          quotaPeriodId,
          quotaReservedAt: new Date(),
          quotaReservedById: session.user.id,
          approvedAt: new Date(),
          approvedById: session.user.id,
          updatedAt: new Date(),
        },
      });

      // 4. Create RESERVE transaction
      await tx.tTDQuotaTransaction.create({
        data: {
          quotaPeriodId,
          requestId: id,
          transactionType: "RESERVE",
          quantity: 1,
          previousReserved: period.reservedLetters,
          newReserved: updatedPeriod.reservedLetters,
          previousIssued: period.issuedLetters,
          newIssued: updatedPeriod.issuedLetters,
          reason: `Reserved quota slot on request approval for ${updatedRequest.requestNumber}`,
          performedById: session.user.id,
          createdAt: new Date(),
        },
      });

      // 5. Activity log
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_REQUEST_APPROVED",
          details: `Approved TTD request ${updatedRequest.requestNumber} and reserved quota under "${period.name}".`,
          createdAt: new Date(),
        },
      });

      return updatedRequest;
    });

    if (updated.createdById) {
      await sendNotification(
        updated.createdById,
        "TTD Request Approved",
        `TTD Darshan request ${updated.requestNumber} has been APPROVED.`,
        {
          type: "ttd",
          targetUrl: "/ttd-letters",
          relatedEntityType: "TTDRequest",
          relatedEntityId: updated.id,
        }
      );
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error approving TTD request:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
