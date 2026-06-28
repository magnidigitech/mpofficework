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
    if (!userPerms.isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    // Must be LETTER_PREPARED
    if (requestRecord.status !== "LETTER_PREPARED") {
      return NextResponse.json(
        { error: "Validation failed: Only prepared letters can be distributed." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { confirmDistribution } = body;

    if (!confirmDistribution) {
      return NextResponse.json({ error: "Validation failed: Distribution confirmation is required." }, { status: 400 });
    }

    if (!requestRecord.quotaPeriodId) {
      return NextResponse.json({ error: "System error: Quota period link is missing." }, { status: 500 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Lock/fetch selected quota period
      const period = await tx.tTDQuotaPeriod.findUnique({
        where: { id: requestRecord.quotaPeriodId || "" },
      });

      if (!period) {
        throw new Error("Quota period not found.");
      }

      // 2. Adjust counters: Decrement reserved, Increment issued
      const updatedPeriod = await tx.tTDQuotaPeriod.update({
        where: { id: period.id },
        data: {
          reservedLetters: {
            decrement: 1,
          },
          issuedLetters: {
            increment: 1,
          },
        },
      });

      // 3. Update Request
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "DISTRIBUTED",
          distributedAt: new Date(),
          distributedById: session.user.id,
          updatedAt: new Date(),
        },
      });

      // 4. Create ISSUE transaction
      await tx.tTDQuotaTransaction.create({
        data: {
          quotaPeriodId: period.id,
          requestId: id,
          transactionType: "ISSUE",
          quantity: 1,
          previousReserved: period.reservedLetters,
          newReserved: updatedPeriod.reservedLetters,
          previousIssued: period.issuedLetters,
          newIssued: updatedPeriod.issuedLetters,
          reason: `Distributed prepared letter to applicant: ${record.applicantName}`,
          performedById: session.user.id,
          createdAt: new Date(),
        },
      });

      // 5. Activity log
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_LETTER_DISTRIBUTED",
          details: `Distributed TTD recommendation letter ${record.letterNumber || ""} to ${record.applicantName}.`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    if (updated.createdById) {
      await sendNotification(
        updated.createdById,
        "TTD Letter Distributed",
        `Prepared recommendation letter for request ${updated.requestNumber} has been distributed to applicant ${updated.applicantName}.`,
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
    console.error("Error distributing TTD letter:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
