import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";

const updateTemplateSchema = zod.object({
  name: zod.string().min(3).optional(),
  description: zod.string().optional().nullable(),
  eventCategory: zod.string().optional().nullable(),
  isDefault: zod.boolean().optional(),
  isActive: zod.boolean().optional(),
  items: zod.array(
    zod.object({
      title: zod.string().min(2, "Title is required"),
      description: zod.string().optional().nullable(),
      section: zod.enum(["BEFORE_VISIT", "DURING_VISIT", "AFTER_VISIT"]),
      displayOrder: zod.number(),
      isMandatory: zod.boolean(),
      defaultAssignedRole: zod.string().optional().nullable(),
    })
  ).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (err: any) {
    console.error("Error fetching template detail:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const result = updateTemplateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        // Reset default flag on all other templates
        await tx.checklistTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      // Update basic fields
      const template = await tx.checklistTemplate.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          eventCategory: data.eventCategory,
          isDefault: data.isDefault,
          isActive: data.isActive,
          updatedAt: new Date(),
        },
      });

      // Re-create items if provided in payload
      if (data.items !== undefined) {
        await tx.checklistTemplateItem.deleteMany({
          where: { templateId: id },
        });

        if (data.items.length > 0) {
          await tx.checklistTemplateItem.createMany({
            data: data.items.map((item) => ({
              templateId: id,
              title: item.title,
              description: item.description,
              section: item.section,
              displayOrder: item.displayOrder,
              isMandatory: item.isMandatory,
              defaultAssignedRole: item.defaultAssignedRole,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          });
        }
      }

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_CHECKLIST_TEMPLATE",
          details: `Updated checklist template "${template.name}"`,
          createdAt: new Date(),
        },
      });

      return template;
    });

    return NextResponse.json({ success: true, template: updated });
  } catch (err: any) {
    console.error("Error updating template details:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Cascade delete is handled by database rules on model definitions
      await tx.checklistTemplate.delete({
        where: { id },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "DELETE_CHECKLIST_TEMPLATE",
          details: `Deleted checklist template "${template.name}"`,
          createdAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting template:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
