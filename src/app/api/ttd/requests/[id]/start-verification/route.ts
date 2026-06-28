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

    // Update status to UNDER_VERIFICATION and verificationStatus to IN_PROGRESS
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "UNDER_VERIFICATION",
          verificationStatus: "IN_PROGRESS",
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_VERIFICATION_STARTED",
          details: `Started verification for request ${record.requestNumber}`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error starting TTD verification:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
