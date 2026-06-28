import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { sendNotification } from "@/lib/notification-sender";
import * as zod from "zod";

const testNotificationSchema = zod.object({
  userId: zod.string().optional(),
  title: zod.string().default("Test Notification"),
  message: zod.string().default("This is a manual verification test push alert."),
  targetUrl: zod.string().optional().default("/"),
});

export async function POST(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    // Restrict manual test pushes to Super Admin
    if (!verification.roles.includes("Super Admin")) {
      return NextResponse.json({ error: "Forbidden: Super Administrators only" }, { status: 403 });
    }

    const body = await request.json();
    const result = testNotificationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const { userId, title, message, targetUrl } = result.data;
    const targetUserId = userId || verification.user.id;

    // Send push notification
    await sendNotification(targetUserId, title, message, {
      type: "general",
      targetUrl,
    });

    await prisma.activityLog.create({
      data: {
        userId: verification.user.id,
        action: "MANUAL_TEST_NOTIFICATION_SENT",
        details: `Sent manual test push notification to user ID: ${targetUserId}. Title: "${title}".`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error sending manual test notification:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
