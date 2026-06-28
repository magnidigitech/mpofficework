import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const count = await prisma.notification.count({
      where: {
        userId: verification.user.id,
        readAt: null,
      },
    });

    return NextResponse.json({ unreadCount: count });
  } catch (err: any) {
    console.error("Error fetching unread count:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
