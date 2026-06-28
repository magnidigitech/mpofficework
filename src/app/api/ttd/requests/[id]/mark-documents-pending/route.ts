import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserRoles } from "@/lib/ttd-utils";

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

    const userPerms = await getUserRoles(session.user.id);
    if (!userPerms.isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Validation failed: A missing-document note/reason is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "DOCUMENTS_PENDING",
          documentsStatus: "PARTIAL",
          notes: requestRecord.notes 
            ? `${requestRecord.notes}\n[Documents Pending]: ${reason}`
            : `[Documents Pending]: ${reason}`,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_DOCUMENTS_PENDING",
          details: `Marked documents pending for request ${record.requestNumber}. Reason: "${reason}"`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error marking documents pending:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
