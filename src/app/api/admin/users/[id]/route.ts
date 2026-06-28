import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import * as zod from "zod";

const updateUserSchema = zod.object({
  name: zod.string().min(2).optional(),
  mobileNumber: zod.string().min(10).optional(),
  designation: zod.string().nullable().optional(),
  department: zod.string().nullable().optional(),
  employeeCode: zod.string().min(3).optional(),
  role: zod.string().min(2).optional(),
  isActive: zod.boolean().optional(),
  profileImage: zod.string().nullable().optional(),
});

// GET /api/admin/users/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    if (!verification.hasPermission("users.view")) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        mobileNumber: true,
        designation: true,
        department: true,
        employeeCode: true,
        profileImage: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
            assignments: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get recent activity log summary for this user
    const recentLogs = await prisma.activityLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({
      ...user,
      role: user.userRoles[0]?.role?.name || "None",
      pushDeviceCount: user._count.subscriptions,
      assignmentCount: user._count.assignments,
      recentLogs,
    });
  } catch (err: any) {
    console.error("Error retrieving user details:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    if (!verification.hasPermission("users.update")) {
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

    const body = await request.json();
    const result = updateUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Checks and constraints
    const targetIsSuper = targetUser.userRoles.some((ur) => ur.role.name === "Super Admin");
    const callerIsSuper = verification.roles.includes("Super Admin");

    // 1. Office Admin cannot edit or modify a Super Admin
    if (targetIsSuper && !callerIsSuper) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can modify a Super Admin account" },
        { status: 403 }
      );
    }

    // 2. Prevent Office Admin from promoting someone to Super Admin
    if (data.role === "Super Admin" && !callerIsSuper) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can assign the Super Admin role" },
        { status: 403 }
      );
    }

    // 3. Final active Super Admin validation check
    const isDeactivatingSuper = targetIsSuper && data.isActive === false;
    const isDemotingSuper = targetIsSuper && data.role && data.role !== "Super Admin";

    if (isDeactivatingSuper || isDemotingSuper) {
      // Count other active super admins
      const activeSuperAdminsCount = await prisma.user.count({
        where: {
          isActive: true,
          userRoles: {
            some: {
              role: { name: "Super Admin" },
            },
          },
        },
      });

      if (activeSuperAdminsCount <= 1) {
        return NextResponse.json(
          { error: "Forbidden: Cannot deactivate or demote the final active Super Administrator." },
          { status: 400 }
        );
      }
    }

    // 4. Unique checks if mobileNumber or employeeCode is updated
    if (data.mobileNumber && data.mobileNumber !== targetUser.mobileNumber) {
      const dupMobile = await prisma.user.findFirst({
        where: { mobileNumber: data.mobileNumber, id: { not: id } },
      });
      if (dupMobile) return NextResponse.json({ error: "Mobile number is already registered" }, { status: 400 });
    }

    if (data.employeeCode && data.employeeCode !== targetUser.employeeCode) {
      const dupCode = await prisma.user.findFirst({
        where: { employeeCode: data.employeeCode, id: { not: id } },
      });
      if (dupCode) return NextResponse.json({ error: "Employee code is already registered" }, { status: 400 });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updatePayload: any = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.mobileNumber !== undefined) updatePayload.mobileNumber = data.mobileNumber;
      if (data.designation !== undefined) updatePayload.designation = data.designation;
      if (data.department !== undefined) updatePayload.department = data.department;
      if (data.employeeCode !== undefined) updatePayload.employeeCode = data.employeeCode;
      if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
      if (data.profileImage !== undefined) updatePayload.profileImage = data.profileImage;

      const user = await tx.user.update({
        where: { id },
        data: updatePayload,
      });

      // Update role if provided and exists
      if (data.role) {
        const newRole = await tx.role.findUnique({ where: { name: data.role } });
        if (!newRole) throw new Error(`Role "${data.role}" not found.`);

        // Delete old roles and assign new one
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({
          data: {
            userId: id,
            roleId: newRole.id,
          },
        });
      }

      // Audit Log
      await tx.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "STAFF_UPDATED",
          details: `Updated staff profile details for ${user.name} (${user.email}).` + 
            (data.role ? ` Assigned role changed to "${data.role}".` : "") +
            (data.isActive !== undefined ? ` Account active state set to ${data.isActive}.` : ""),
        },
      });

      // Revoke user sessions if deactivated
      if (data.isActive === false) {
        await tx.session.deleteMany({
          where: { userId: id },
        });
      }

      return user;
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error("Error updating user details:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
