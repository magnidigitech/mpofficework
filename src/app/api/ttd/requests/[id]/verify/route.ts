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
      include: { members: true },
    });

    if (!requestRecord) {
      return NextResponse.json({ error: "TTD Request not found" }, { status: 404 });
    }

    const userPerms = await getUserRoles(session.user.id);
    if (!userPerms.isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const { remarks } = body;

    // Check complete applicant/member details
    if (!requestRecord.applicantName || !requestRecord.applicantMobile) {
      return NextResponse.json({ error: "Applicant details are incomplete." }, { status: 400 });
    }

    if (requestRecord.members.length === 0) {
      return NextResponse.json({ error: "Travelling member list is empty." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "VERIFIED",
          verificationStatus: "VERIFIED",
          documentsStatus: "VERIFIED",
          notes: remarks 
            ? (requestRecord.notes ? `${requestRecord.notes}\n[Verified]: ${remarks}` : `[Verified]: ${remarks}`)
            : requestRecord.notes,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_VERIFICATION_COMPLETED",
          details: `Completed verification for request ${record.requestNumber}. Remarks: "${remarks || "None"}"`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error completing verification:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
