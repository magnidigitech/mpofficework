import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";

const createTemplateSchema = zod.object({
  name: zod.string().min(3, "Name must be at least 3 characters"),
  description: zod.string().optional().nullable(),
  eventCategory: zod.string().optional().nullable(),
  isDefault: zod.boolean().default(false),
  isActive: zod.boolean().default(true),
});

export async function GET(request: Request) {
  try {
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

    const templates = await prisma.checklistTemplate.findMany({
      include: {
        items: {
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (err: any) {
    console.error("Error fetching templates:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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
    const result = createTemplateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Use a transaction to create template, handles resetting default flag on others
    const template = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        // Reset default flag on all other templates
        await tx.checklistTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return await tx.checklistTemplate.create({
        data: {
          name: data.name,
          description: data.description,
          eventCategory: data.eventCategory,
          isDefault: data.isDefault,
          isActive: data.isActive,
          createdById: session.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true, template });
  } catch (err: any) {
    console.error("Error creating template:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
