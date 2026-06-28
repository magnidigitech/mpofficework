import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { notificationQueue } from "@/lib/queue";

// POST /api/admin/notification-deliveries/[id]/retry
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles, user: currentUser } = verification;
    if (!roles.includes("Super Admin")) {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can retry notifications" }, { status: 403 });
    }

    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id },
      include: {
        pushSubscription: true,
        notification: true,
      },
    });

    if (!delivery) {
      return NextResponse.json({ error: "Notification delivery log not found" }, { status: 404 });
    }

    if (delivery.status !== "FAILED") {
      return NextResponse.json(
        { error: `Cannot retry notification with status '${delivery.status}'. Only FAILED status can be retried.` },
        { status: 400 }
      );
    }

    if (!delivery.pushSubscription.isActive) {
      return NextResponse.json(
        { error: "Cannot retry notification: The target browser push subscription is inactive or has expired." },
        { status: 400 }
      );
    }

    // Update status to PENDING
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        attemptCount: 0,
        errorMessage: null,
        errorCode: null,
      },
    });

    // Queue BullMQ job
    const jobId = `retry-${delivery.id}`;
    await notificationQueue.add(
      "send-push",
      {
        notificationId: delivery.notificationId,
      },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: true,
      }
    );

    // Create activity log
    await prisma.activityLog.create({
      data: {
        userId: currentUser.id,
        action: "RETRY_NOTIFICATION",
        details: `Manually retried notification delivery for recipient '${delivery.notification.userId}'. Job ID: ${jobId}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Notification delivery queued successfully for retry.",
    });
  } catch (err: any) {
    console.error("Error retrying notification:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
