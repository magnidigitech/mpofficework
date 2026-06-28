import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// GET /api/admin/notification-deliveries
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles } = verification;
    if (!roles.includes("Super Admin") && !roles.includes("MP Office Admin")) {
      return NextResponse.json({ error: "Forbidden: Administrative access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const userId = searchParams.get("userId");
    const errorCode = searchParams.get("errorCode");

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      createdAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    if (status) where.status = status;
    if (errorCode) where.errorCode = errorCode;
    if (userId) {
      where.notification = { userId };
    }
    if (type) {
      where.notification = {
        ...where.notification,
        type,
      };
    }

    const total = await prisma.notificationDelivery.count({ where });
    const deliveries = await prisma.notificationDelivery.findMany({
      where,
      include: {
        notification: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        pushSubscription: {
          select: {
            deviceName: true,
            browser: true,
            operatingSystem: true,
            isActive: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      deliveries: deliveries.map((d) => ({
        id: d.id,
        notificationId: d.notificationId,
        title: d.notification.title,
        message: d.notification.message,
        type: d.notification.type,
        recipientName: d.notification.user.name,
        recipientEmail: d.notification.user.email,
        deviceName: d.pushSubscription.deviceName || "Unknown Device",
        deviceBrowser: d.pushSubscription.browser || "Unknown Browser",
        deviceOS: d.pushSubscription.operatingSystem || "Unknown OS",
        deviceIsSubscribed: d.pushSubscription.isActive,
        status: d.status,
        attemptCount: d.attemptCount,
        lastAttemptAt: d.lastAttemptAt,
        deliveredAt: d.deliveredAt,
        errorCode: d.errorCode || "N/A",
        errorMessage: d.errorMessage || "None",
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("Error fetching notification deliveries logs:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
