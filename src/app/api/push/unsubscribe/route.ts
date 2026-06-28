import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import * as zod from "zod";

const unsubscribeSchema = zod.object({
  endpoint: zod.string().url("Valid endpoint URL is required"),
});

export async function POST(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const body = await request.json();
    const result = unsubscribeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const { endpoint } = result.data;

    // Set isActive to false or delete the subscription endpoint
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      if (existing.userId !== verification.user.id) {
        return NextResponse.json({ error: "Forbidden: Subscription belongs to another user" }, { status: 403 });
      }

      await prisma.pushSubscription.delete({
        where: { id: existing.id },
      });

      await prisma.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "PUSH_UNSUBSCRIBED",
          details: `Removed push notifications device: ${existing.deviceName || "Unknown Device"}.`,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error unsubscribing push notifications:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
