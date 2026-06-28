import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { sendNotification } from "@/lib/notification-sender";

const patchChecklistItemSchema = zod.object({
  isCompleted: zod.boolean().optional(),
  assignedUserId: zod.string().nullable().optional(),
  remarks: zod.string().nullable().optional(),
  expectedVersion: zod.number().optional(),
  clientMutationId: zod.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;

    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch checklist item with checklist & schedule details
    const item = await prisma.visitChecklistItem.findUnique({
      where: { id: itemId },
      include: {
        visitChecklist: {
          include: {
            schedule: {
              include: {
                assignments: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
    }

    const schedule = item.visitChecklist.schedule;

    // 3. Verify permissions
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);

    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isCoordinator = roles.includes("Schedule Coordinator") && 
      (schedule.assignments.some(a => a.userId === session.user.id) || isAdmin);
    const isStaff = roles.includes("Field Coordinator");

    const payload = await request.json();
    const result = patchChecklistItemSchema.safeParse(payload);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Check staff permissions: Assigned staff can only edit items assigned to them and cannot change assignedUserId
    if (isStaff && !isAdmin && !isCoordinator) {
      const isAssignedToMe = item.assignedUserId === session.user.id;
      if (!isAssignedToMe) {
        return NextResponse.json(
          { error: "Forbidden: You can only update checklist items assigned to you." },
          { status: 403 }
        );
      }
      if (data.assignedUserId !== undefined && data.assignedUserId !== item.assignedUserId) {
        return NextResponse.json(
          { error: "Forbidden: Staff members cannot reassign checklist items." },
          { status: 403 }
        );
      }
    }

    // Viewers cannot update
    if (roles.includes("Viewer") && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Viewers have read-only access." }, { status: 403 });
    }

    // 4. Idempotency Check using clientMutationId
    if (data.clientMutationId) {
      const existingMutation = await prisma.checklistMutation.findUnique({
        where: { clientMutationId: data.clientMutationId },
      });
      if (existingMutation) {
        // Already processed, return current item
        return NextResponse.json({ success: true, item, status: "duplicate" });
      }
    }

    // 5. Version Conflict Check
    if (data.expectedVersion !== undefined && data.expectedVersion !== item.version) {
      return NextResponse.json(
        {
          error: "Version conflict detected",
          checklistItemId: item.id,
          localVersion: data.expectedVersion,
          serverVersion: item.version,
          serverValue: {
            isCompleted: item.isCompleted,
            assignedUserId: item.assignedUserId,
            remarks: item.remarks,
          },
          updatedAt: item.updatedAt,
        },
        { status: 409 }
      );
    }

    // 6. Execute updates inside a transaction
    const resultItem = await prisma.$transaction(async (tx) => {
      // Build update payload
      const updateData: any = {
        version: { increment: 1 },
      };

      if (data.isCompleted !== undefined && data.isCompleted !== item.isCompleted) {
        updateData.isCompleted = data.isCompleted;
        updateData.completedById = data.isCompleted ? session.user.id : null;
        updateData.completedAt = data.isCompleted ? new Date() : null;
      }

      if (data.assignedUserId !== undefined) {
        updateData.assignedUserId = data.assignedUserId;
      }

      if (data.remarks !== undefined) {
        updateData.remarks = data.remarks;
      }

      // Apply updates to the item
      const updated = await tx.visitChecklistItem.update({
        where: { id: itemId },
        data: updateData,
      });

      // Record client mutation for idempotency
      if (data.clientMutationId) {
        await tx.checklistMutation.create({
          data: {
            clientMutationId: data.clientMutationId,
            userId: session.user.id,
            checklistItemId: itemId,
            mutationType: data.isCompleted !== undefined ? "TOGGLE_COMPLETE" : "UPDATE",
            processedAt: new Date(),
          },
        });
      }

      // 7. Recalculate VisitChecklist progress and status
      const allItems = await tx.visitChecklistItem.findMany({
        where: { visitChecklistId: item.visitChecklistId },
      });

      const totalItems = allItems.length;
      const completedItems = allItems.filter((i) => i.isCompleted).length;
      const pendingMandatoryItems = allItems.filter((i) => i.isMandatory && !i.isCompleted).length;

      let checklistStatus = "NOT_STARTED";
      if (completedItems > 0) {
        if (pendingMandatoryItems === 0) {
          checklistStatus = "COMPLETED";
        } else {
          checklistStatus = "IN_PROGRESS";
        }
      }

      await tx.visitChecklist.update({
        where: { id: item.visitChecklistId },
        data: {
          completedItems,
          totalItems,
          status: checklistStatus,
          updatedAt: new Date(),
        },
      });

      // 8. Log Activity Logs
      let logAction = "UPDATE_CHECKLIST_ITEM";
      let logDetails = `Updated checklist item "${item.title}" for schedule "${schedule.title}"`;

      if (data.isCompleted !== undefined && data.isCompleted !== item.isCompleted) {
        logAction = data.isCompleted ? "COMPLETE_CHECKLIST_ITEM" : "REOPEN_CHECKLIST_ITEM";
        logDetails = data.isCompleted 
          ? `Completed checklist item "${item.title}"` 
          : `Reopened checklist item "${item.title}"`;
      } else if (data.assignedUserId !== undefined && data.assignedUserId !== item.assignedUserId) {
        logAction = "ASSIGN_CHECKLIST_ITEM";
        if (data.assignedUserId) {
          const assignedUser = await tx.user.findUnique({ where: { id: data.assignedUserId } });
          logDetails = `Assigned checklist item "${item.title}" to ${assignedUser?.name || "staff"}`;
        } else {
          logDetails = `Removed staff assignment from checklist item "${item.title}"`;
        }
      } else if (data.remarks !== undefined && data.remarks !== item.remarks) {
        logAction = "REMARKS_CHECKLIST_ITEM";
        logDetails = `Updated remarks on checklist item "${item.title}"`;
      }

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: logAction,
          details: logDetails,
          createdAt: new Date(),
        },
      });

      return updated;
    });

    if (resultItem.assignedUserId && resultItem.assignedUserId !== item.assignedUserId) {
      await sendNotification(
        resultItem.assignedUserId,
        "Checklist Item Assigned",
        `You have been assigned checklist task: "${resultItem.title}"`,
        {
          type: "checklist",
          targetUrl: "/schedule",
          relatedEntityType: "ChecklistItem",
          relatedEntityId: resultItem.id,
        }
      );
    }

    return NextResponse.json({ success: true, item: resultItem });
  } catch (err: any) {
    console.error("Error patching checklist item:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
