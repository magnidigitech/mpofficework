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

    // Must have reserved quota
    if (requestRecord.status !== "QUOTA_RESERVED") {
      return NextResponse.json(
        { error: "Validation failed: Request must have reserved quota before preparing official letters." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { letterNumber, letterDate } = body;

    if (!letterNumber || letterNumber.trim().length === 0) {
      return NextResponse.json({ error: "Validation failed: A valid Letter Number is required." }, { status: 400 });
    }

    if (!letterDate || letterDate.trim().length === 0) {
      return NextResponse.json({ error: "Validation failed: A valid Letter Date is required." }, { status: 400 });
    }

    // Check unique letter number
    const duplicateLetter = await prisma.tTDRequest.findFirst({
      where: {
        letterNumber,
        id: { not: id },
      },
    });

    if (duplicateLetter) {
      return NextResponse.json(
        { error: `Validation failed: Letter number ${letterNumber} is already used in request ${duplicateLetter.requestNumber}.` },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "LETTER_PREPARED",
          letterNumber,
          letterDate: new Date(letterDate),
          letterPreparedAt: new Date(),
          letterPreparedById: session.user.id,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_LETTER_PREPARED",
          details: `Prepared TTD recommendation letter. Number: "${letterNumber}".`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    if (updated.createdById) {
      await sendNotification(
        updated.createdById,
        "TTD Letter Ready",
        `Recommendation letter prepared for Darshan request ${updated.requestNumber}. Letter ID: ${updated.letterNumber}`,
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
    console.error("Error preparing TTD letter:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
