import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { hashPassword } from "better-auth/crypto";
import * as zod from "zod";

const resetPasswordSchema = zod.object({
  temporaryPassword: zod.string().min(6, "Temporary password must be at least 6 characters"),
});

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

    if (!verification.hasPermission("users.reset_password")) {
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
    const callerIsSuper = verification.roles.includes("Super Admin");

    // Protect Super Admin accounts from reset by normal Office Admin
    if (targetIsSuper && !callerIsSuper) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can reset a Super Admin's password." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const { temporaryPassword } = result.data;
    const hashed = await hashPassword(temporaryPassword);

    await prisma.$transaction(async (tx) => {
      // Update credential account matching this email
      await tx.account.updateMany({
        where: {
          userId: id,
          providerId: "credential",
        },
        data: {
          password: hashed,
          updatedAt: new Date(),
        },
      });

      // Force password change flag
      await tx.user.update({
        where: { id },
        data: {
          mustChangePassword: true,
          updatedAt: new Date(),
        },
      });

      // Revoke all active sessions belonging to the user
      await tx.session.deleteMany({
        where: { userId: id },
      });

      // Audit Log (without recording password value)
      await tx.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "STAFF_PASSWORD_RESET",
          details: `Administratively reset password for user ${targetUser.name} (${targetUser.email}). Session tokens revoked.`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error resetting password:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
