import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get search parameters
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "all";

    // 1. Fetch user roles from DB
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator") || isAdmin;

    // Timezone bounds calculations (Asia/Kolkata offset: +5.5 hours)
    const now = new Date();
    const kolkataOffset = 5.5 * 60 * 60 * 1000;
    const localTime = new Date(now.getTime() + kolkataOffset);

    const startOfKolkataToday = new Date(Date.UTC(
      localTime.getUTCFullYear(),
      localTime.getUTCMonth(),
      localTime.getUTCDate(),
      0, 0, 0, 0
    ));
    const startOfToday = new Date(startOfKolkataToday.getTime() - kolkataOffset);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const startOfTomorrow = endOfToday;
    const endOfTomorrow = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);

    const startOfWeek = startOfToday;
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Build Prisma query filter
    const whereFilter: any = {};

    // Apply view date filters
    if (view === "today") {
      whereFilter.startAt = {
        gte: startOfToday,
        lt: endOfToday,
      };
    } else if (view === "tomorrow") {
      whereFilter.startAt = {
        gte: startOfTomorrow,
        lt: endOfTomorrow,
      };
    } else if (view === "weekly") {
      whereFilter.startAt = {
        gte: startOfWeek,
        lt: endOfWeek,
      };
    }

    // Role restriction: Field Coordinators only see their assigned schedules
    const isFieldCoordinatorOnly = roles.includes("Field Coordinator") && !isCoordinator;
    if (isFieldCoordinatorOnly) {
      whereFilter.assignments = {
        some: {
          userId: session.user.id,
        },
      };
    }

    // Fetch schedules
    const schedules = await prisma.schedule.findMany({
      where: whereFilter,
      include: {
        visitChecklist: true,
        socialMediaUpdate: true,
        contacts: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobileNumber: true,
              },
            },
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    });

    return NextResponse.json(schedules);
  } catch (err: any) {
    console.error("Error fetching schedules:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
