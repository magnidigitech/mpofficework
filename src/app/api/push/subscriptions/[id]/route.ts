import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const subscription = await prisma.pushSubscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Push subscription not found" }, { status: 404 });
    }

    const isOwner = subscription.userId === verification.user.id;
    const isSuperAdmin = verification.roles.includes("Super Admin");

    if (!isOwner && !isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    await prisma.pushSubscription.delete({
      where: { id },
    });

    await prisma.activityLog.create({
      data: {
        userId: verification.user.id,
        action: "PUSH_SUBSCRIPTION_DELETED",
        details: `Deleted push notification device registration: ${subscription.deviceName || "Unknown Device"}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting push subscription:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
