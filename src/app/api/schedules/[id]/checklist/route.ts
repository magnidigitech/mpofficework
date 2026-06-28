import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scheduleId } = await params;

    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch Schedule and verify existence
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        assignments: true,
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // 3. Fetch user roles and enforce permissions
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isViewer = roles.includes("Viewer");
    const isAssigned = schedule.assignments.some((a) => a.userId === session.user.id);

    const canView = isAdmin || isViewer || isAssigned || roles.includes("Schedule Coordinator");

    if (!canView) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view this checklist." },
        { status: 403 }
      );
    }

    // 4. Fetch VisitChecklist
    const checklist = await prisma.visitChecklist.findUnique({
      where: { scheduleId },
      include: {
        items: {
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true, mobileNumber: true },
            },
            completedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!checklist) {
      return NextResponse.json(
        { error: "Checklist not created yet for this schedule." },
        { status: 404 }
      );
    }

    // 5. Compute dynamic metrics to return
    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter((item) => item.isCompleted).length;
    const pendingItems = totalItems - completedItems;
    const pendingMandatoryItems = checklist.items.filter(
      (item) => item.isMandatory && !item.isCompleted
    ).length;

    // Progress percentage
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Group items by section
    const groupedItems = {
      BEFORE_VISIT: checklist.items.filter((item) => item.section === "BEFORE_VISIT"),
      DURING_VISIT: checklist.items.filter((item) => item.section === "DURING_VISIT"),
      AFTER_VISIT: checklist.items.filter((item) => item.section === "AFTER_VISIT"),
    };

    return NextResponse.json({
      scheduleId: schedule.id,
      scheduleTitle: schedule.title,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      venue: schedule.venue,
      scheduleStatus: schedule.status,
      checklistId: checklist.id,
      checklistStatus: checklist.status,
      progress,
      totalItems,
      completedItems,
      pendingItems,
      pendingMandatoryItems,
      groupedItems,
      updatedAt: checklist.updatedAt,
    });
  } catch (err: any) {
    console.error("Error fetching schedule checklist:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
