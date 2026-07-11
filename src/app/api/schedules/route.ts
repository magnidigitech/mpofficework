import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    // Determine roles and permissions if logged in
    let roles: string[] = [];
    let isAdmin = false;
    let isCoordinator = false;
    let userId: string | null = null;

    if (session && session.user) {
      userId = session.user.id;
      const userRoles = await prisma.userRole.findMany({
        where: { userId: session.user.id },
        include: { role: true },
      });
      roles = userRoles.map((ur) => ur.role.name);
      isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
      isCoordinator = roles.includes("Schedule Coordinator") || isAdmin;
    }

    // Get search parameters
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "all";

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

    // Role restriction: Field Coordinators/Staff only see their assigned schedules
    const isFieldCoordinatorOnly = userId && (roles.includes("Field Coordinator") || roles.includes("Field Staff")) && !isCoordinator;
    if (isFieldCoordinatorOnly) {
      whereFilter.assignments = {
        some: {
          userId: userId,
        },
      };
    }

    // Role restriction: Schedule Viewers (and unauthenticated users) can only see confirmed schedules
    const isScheduleViewer = !session || (roles.includes("Schedule Viewer") && !isAdmin && !isCoordinator);
    if (isScheduleViewer) {
      whereFilter.status = "CONFIRMED";
    }

    // Fetch schedules
    const schedules = await prisma.schedule.findMany({
      where: whereFilter,
      include: {
        visitChecklist: true,
        socialMediaUpdate: {
          include: {
            posts: true,
          },
        },
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
