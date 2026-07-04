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
    if (!userPerms.isOfficeAdmin) {
      return NextResponse.json({ error: "Forbidden: Administrators only" }, { status: 403 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Validation failed: Rejection reason is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Check if it holds reserved quota
      if (requestRecord.status === "QUOTA_RESERVED" && requestRecord.quotaPeriodId) {
        const period = await tx.tTDQuotaPeriod.findUnique({
          where: { id: requestRecord.quotaPeriodId },
        });

        if (period) {
          // Release reserved slot
          const updatedPeriod = await tx.tTDQuotaPeriod.update({
            where: { id: period.id },
            data: {
              reservedLetters: {
                decrement: 1,
              },
            },
          });

          // Create RELEASE transaction
          await tx.tTDQuotaTransaction.create({
            data: {
              quotaPeriodId: period.id,
              requestId: id,
              transactionType: "RELEASE",
              quantity: 1,
              previousReserved: period.reservedLetters,
              newReserved: updatedPeriod.reservedLetters,
              previousIssued: period.issuedLetters,
              newIssued: updatedPeriod.issuedLetters,
              reason: `Released reserved quota slot on request rejection: ${reason}`,
              performedById: session.user.id,
              createdAt: new Date(),
            },
          });
        }
      }

      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectedById: session.user.id,
          rejectionReason: reason,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_REQUEST_REJECTED",
          details: `Rejected TTD request ${record.requestNumber}. Reason: "${reason}"`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    if (updated.createdById) {
      await sendNotification(
        updated.createdById,
        "TTD Request Rejected",
        `Your request ${updated.requestNumber} for ${updated.applicantName} was rejected. Reason: ${reason}`,
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
    console.error("Error rejecting TTD request:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
