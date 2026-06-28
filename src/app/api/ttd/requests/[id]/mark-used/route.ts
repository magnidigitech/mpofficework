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

    // Must be DISTRIBUTED
    if (requestRecord.status !== "DISTRIBUTED") {
      return NextResponse.json(
        { error: "Validation failed: Only distributed letters can be marked as USED." },
        { status: 400 }
      );
    }

    const userPerms = await getUserRoles(session.user.id);
    if (!userPerms.isTTDStaff) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const { remarks } = body;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDRequest.update({
        where: { id },
        data: {
          status: "USED",
          usedAt: new Date(),
          notes: remarks 
            ? (requestRecord.notes ? `${requestRecord.notes}\n[Used Remarks]: ${remarks}` : `[Used Remarks]: ${remarks}`)
            : requestRecord.notes,
          updatedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_LETTER_USED",
          details: `Marked recommendation letter ${record.letterNumber || ""} as USED. Remarks: "${remarks || "None"}".`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error marking TTD letter as used:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
