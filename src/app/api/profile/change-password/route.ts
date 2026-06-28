import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { verifyPassword, hashPassword } from "better-auth/crypto";
import * as zod from "zod";

const changePasswordSchema = zod.object({
  currentPassword: zod.string().min(1, "Current password is required"),
  newPassword: zod.string().min(6, "New password must be at least 6 characters"),
});

export async function POST(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const body = await request.json();
    const result = changePasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = result.data;

    // Fetch existing credentials account record
    const account = await prisma.account.findFirst({
      where: {
        userId: verification.user.id,
        providerId: "credential",
      },
    });

    if (!account || !account.password) {
      return NextResponse.json({ error: "No credentials password found for this account." }, { status: 400 });
    }

    // Verify current password
    const isMatch = await verifyPassword({
      password: currentPassword,
      hash: account.password,
    });

    if (!isMatch) {
      return NextResponse.json({ error: "Invalid current password" }, { status: 400 });
    }

    const newHashed = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // Update account password
      await tx.account.update({
        where: { id: account.id },
        data: {
          password: newHashed,
          updatedAt: new Date(),
        },
      });

      // Update user mustChangePassword flag
      await tx.user.update({
        where: { id: verification.user.id },
        data: {
          mustChangePassword: false,
          updatedAt: new Date(),
        },
      });

      // Revoke all OTHER sessions (except the current one) if we want, or keep it simple
      // For this phase, let's keep current session but we can clear old ones
      // Let's delete other sessions
      const currentToken = verification.session.token;
      await tx.session.deleteMany({
        where: {
          userId: verification.user.id,
          token: { not: currentToken },
        },
      });

      // Log security event
      await tx.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "PASSWORD_CHANGED",
          details: "User successfully updated their account password. Other active sessions revoked.",
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error changing password:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
