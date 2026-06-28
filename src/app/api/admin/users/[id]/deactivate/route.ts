import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    if (!verification.hasPermission("users.deactivate")) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetIsSuper = targetUser.userRoles.some((ur) => ur.role.name === "Super Admin");

    // Super Admin check
    if (targetIsSuper && !verification.roles.includes("Super Admin")) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can deactivate a Super Admin account" },
        { status: 403 }
      );
    }

    // Final super admin safety block
    if (targetIsSuper) {
      const activeSuperCount = await prisma.user.count({
        where: {
          isActive: true,
          userRoles: {
            some: {
              role: { name: "Super Admin" },
            },
          },
        },
      });

      if (activeSuperCount <= 1) {
        return NextResponse.json(
          { error: "Forbidden: Cannot deactivate the final active Super Administrator." },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { isActive: false },
      });

      // Revoke all sessions
      await tx.session.deleteMany({
        where: { userId: id },
      });

      await tx.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "STAFF_DEACTIVATED",
          details: `Deactivated user account: ${targetUser.name} (${targetUser.email}). Session tokens revoked.`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deactivating user:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
