import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";

const syncMutationSchema = zod.object({
  clientMutationId: zod.string(),
  checklistItemId: zod.string(),
  mutationType: zod.enum(["TOGGLE_COMPLETE", "ASSIGN_STAFF", "UPDATE_REMARKS", "UPDATE"]),
  updatedFields: zod.object({
    isCompleted: zod.boolean().optional(),
    assignedUserId: zod.string().nullable().optional(),
    remarks: zod.string().nullable().optional(),
  }),
  expectedVersion: zod.number(),
  clientUpdatedAt: zod.string(),
});

const syncPayloadSchema = zod.object({
  mutations: zod.array(syncMutationSchema),
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse batch payload
    const body = await request.json();
    const result = syncPayloadSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const { mutations } = result.data;

    // Fetch user roles once to optimize DB queries
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");

    // Output lists
    const successful: any[] = [];
    const duplicate: any[] = [];
    const failed: any[] = [];
    const conflicts: any[] = [];

    // Process mutations one-by-one to prevent batch blocking
    for (const mut of mutations) {
      try {
        // A. Check for duplicate mutation replay
        const existingMutation = await prisma.checklistMutation.findUnique({
          where: { clientMutationId: mut.clientMutationId },
        });

        if (existingMutation) {
          duplicate.push({
            clientMutationId: mut.clientMutationId,
            checklistItemId: mut.checklistItemId,
          });
          continue;
        }

        // B. Fetch target item
        const item = await prisma.visitChecklistItem.findUnique({
          where: { id: mut.checklistItemId },
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
          failed.push({
            clientMutationId: mut.clientMutationId,
            checklistItemId: mut.checklistItemId,
            error: "Checklist item not found on server",
          });
          continue;
        }

        const schedule = item.visitChecklist.schedule;

        // C. Verify authorization
        const isCoordinator = roles.includes("Schedule Coordinator") && 
          (schedule.assignments.some(a => a.userId === session.user.id) || isAdmin);
        const isStaff = roles.includes("Field Coordinator");

        if (roles.includes("Viewer") && !isAdmin) {
          failed.push({
            clientMutationId: mut.clientMutationId,
            checklistItemId: mut.checklistItemId,
            error: "Forbidden: Viewers cannot perform mutations",
          });
          continue;
        }

        if (isStaff && !isAdmin && !isCoordinator) {
          const isAssignedToMe = item.assignedUserId === session.user.id;
          if (!isAssignedToMe) {
            failed.push({
              clientMutationId: mut.clientMutationId,
              checklistItemId: mut.checklistItemId,
              error: "Forbidden: Staff members can only update assigned items",
            });
            continue;
          }
          if (mut.updatedFields.assignedUserId !== undefined && mut.updatedFields.assignedUserId !== item.assignedUserId) {
            failed.push({
              clientMutationId: mut.clientMutationId,
              checklistItemId: mut.checklistItemId,
              error: "Forbidden: Staff members cannot reassign items",
            });
            continue;
          }
        }

        // D. Version Conflict check
        if (mut.expectedVersion !== item.version) {
          conflicts.push({
            clientMutationId: mut.clientMutationId,
            checklistItemId: item.id,
            localSubmittedValue: mut.updatedFields,
            latestServerValue: {
              isCompleted: item.isCompleted,
              assignedUserId: item.assignedUserId,
              remarks: item.remarks,
            },
            serverVersion: item.version,
            serverUpdatedAt: item.updatedAt,
            conflictReason: "Version mismatch: item was modified by another request.",
          });

          // Log sync conflict in database
          await prisma.activityLog.create({
            data: {
              userId: session.user.id,
              action: "SYNC_CONFLICT_DETECTED",
              details: `Sync conflict on checklist item "${item.title}" (Server: v${item.version}, Client: v${mut.expectedVersion})`,
              createdAt: new Date(),
            },
          });
          continue;
        }

        // E. Apply mutation in transaction
        await prisma.$transaction(async (tx) => {
          const updateData: any = {
            version: { increment: 1 },
          };

          const fields = mut.updatedFields;

          if (fields.isCompleted !== undefined && fields.isCompleted !== item.isCompleted) {
            updateData.isCompleted = fields.isCompleted;
            updateData.completedById = fields.isCompleted ? session.user.id : null;
            updateData.completedAt = fields.isCompleted ? new Date() : null;
          }

          if (fields.assignedUserId !== undefined) {
            updateData.assignedUserId = fields.assignedUserId;
          }

          if (fields.remarks !== undefined) {
            updateData.remarks = fields.remarks;
          }

          // Apply update
          const updatedItem = await tx.visitChecklistItem.update({
            where: { id: mut.checklistItemId },
            data: updateData,
          });

          // Block duplicate executions
          await tx.checklistMutation.create({
            data: {
              clientMutationId: mut.clientMutationId,
              userId: session.user.id,
              checklistItemId: mut.checklistItemId,
              mutationType: mut.mutationType,
              processedAt: new Date(),
              createdAt: new Date(mut.clientUpdatedAt),
            },
          });

          // F. Recalculate VisitChecklist progress and status
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

          // G. Log Activity log
          await tx.activityLog.create({
            data: {
              userId: session.user.id,
              action: "SYNC_OFFLINE_MUTATION",
              details: `Synchronized offline change for checklist item "${item.title}"`,
              createdAt: new Date(),
            },
          });

          successful.push({
            clientMutationId: mut.clientMutationId,
            checklistItemId: mut.checklistItemId,
            version: updatedItem.version,
          });
        });
      } catch (err: any) {
        console.error(`Mutation sync failed for ${mut.clientMutationId}:`, err);
        failed.push({
          clientMutationId: mut.clientMutationId,
          checklistItemId: mut.checklistItemId,
          error: err.message || "Internal server sync error",
        });
      }
    }

    return NextResponse.json({
      successful,
      duplicate,
      failed,
      conflicts,
    });
  } catch (err: any) {
    console.error("Error synchronizing offline mutations:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
