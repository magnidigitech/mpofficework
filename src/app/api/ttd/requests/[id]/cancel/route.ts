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

    // Role check
    const userPerms = await getUserRoles(session.user.id);
    const isFinalized = ["DISTRIBUTED", "USED"].includes(requestRecord.status);

    if (isFinalized && !userPerms.isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can cancel distributed or used recommendation letters." },
        { status: 403 }
      );
    }

    if (!userPerms.isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Validation failed: Cancellation reason is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      let transactionType: string | null = null;
      let prevReserved = 0;
      let newReserved = 0;
      let prevIssued = 0;
      let newIssued = 0;

      if (requestRecord.quotaPeriodId) {
        const period = await tx.tTDQuotaPeriod.findUnique({
          where: { id: requestRecord.quotaPeriodId },
        });

        if (period) {
          prevReserved = period.reservedLetters;
          newReserved = period.reservedLetters;
          prevIssued = period.issuedLetters;
          newIssued = period.issuedLetters;

          if (["QUOTA_RESERVED", "LETTER_PREPARED"].includes(requestRecord.status)) {
            // Decrement reserved slot
            const updatedPeriod = await tx.tTDQuotaPeriod.update({
              where: { id: period.id },
              data: {
                reservedLetters: {
                  decrement: 1,
                },
              },
            });
            newReserved = updatedPeriod.reservedLetters;
            transactionType = "RELEASE";
          } else if (isFinalized) {
            // Decrement issued slot
            const updatedPeriod = await tx.tTDQuotaPeriod.update({
              where: { id: period.id },
              data: {
                issuedLetters: {
                  decrement: 1,
                },
              },
            });
            newIssued = updatedPeriod.issuedLetters;
            transactionType = "CANCEL_ISSUE";
          }

          if (transactionType) {
            await tx.tTDQuotaTransaction.create({
              data: {
                quotaPeriodId: period.id,
                requestId: id,
                transactionType,
                quantity: 1,
                previousReserved: prevReserved,
                newReserved,
                previousIssued: prevIssued,
                newIssued,
                reason: `Cancelled request ${requestRecord.requestNumber}. Reason: "${reason}"`,
                performedById: session.user.id,
                createdAt: new Date(),
              },
            });
          }
        }
      }

      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: session.user.id,
          cancellationReason: reason,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_REQUEST_CANCELLED",
          details: `Cancelled TTD request ${record.requestNumber}. Reason: "${reason}"`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    if (updated.createdById) {
      await sendNotification(
        updated.createdById,
        "TTD Request Cancelled",
        `Your request ${updated.requestNumber} for ${updated.applicantName} was cancelled. Reason: ${reason}`,
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
    console.error("Error cancelling TTD request:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
