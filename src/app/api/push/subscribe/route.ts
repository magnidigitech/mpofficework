import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import * as zod from "zod";

const subscribeSchema = zod.object({
  endpoint: zod.string().url("Valid endpoint URL is required"),
  keys: zod.object({
    p256dh: zod.string().min(5),
    auth: zod.string().min(5),
  }),
  deviceName: zod.string().optional().nullable(),
  browser: zod.string().optional().nullable(),
  operatingSystem: zod.string().optional().nullable(),
  userAgent: zod.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const body = await request.json();
    const result = subscribeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Upsert subscription based on endpoint
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: {
        userId: verification.user.id,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        deviceName: data.deviceName || null,
        browser: data.browser || null,
        operatingSystem: data.operatingSystem || null,
        userAgent: data.userAgent || null,
        isActive: true,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: verification.user.id,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        deviceName: data.deviceName || null,
        browser: data.browser || null,
        operatingSystem: data.operatingSystem || null,
        userAgent: data.userAgent || null,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    // Audit Log
    await prisma.activityLog.create({
      data: {
        userId: verification.user.id,
        action: "PUSH_SUBSCRIBED",
        details: `Registered push notifications device: ${data.deviceName || "Unknown Device"} (${data.browser || "Unknown Browser"}).`,
      },
    });

    return NextResponse.json({ success: true, subscriptionId: subscription.id });
  } catch (err: any) {
    console.error("Error subscribing to push notifications:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
