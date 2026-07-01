import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { hashPassword } from "better-auth/crypto";
import * as zod from "zod";

const createUserSchema = zod.object({
  name: zod.string().min(2, "Name is required"),
  email: zod.string().email("Valid email is required"),
  mobileNumber: zod.string().min(10, "Valid mobile is required"),
  designation: zod.string().optional().nullable(),
  department: zod.string().optional().nullable(),
  employeeCode: zod.string().min(3, "Employee code is required"),
  role: zod.string().min(2, "Role is required"),
  password: zod.string().min(6, "Password must be at least 6 characters"),
  isActive: zod.boolean().default(true),
});

// GET /api/admin/users
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    if (!verification.hasPermission("users.view")) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const roleFilter = searchParams.get("role");
    const deptFilter = searchParams.get("department");
    const activeFilter = searchParams.get("active"); // "true" or "false"
    
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { mobileNumber: { contains: query } },
        { employeeCode: { contains: query, mode: "insensitive" } },
      ];
    }

    if (roleFilter) {
      where.userRoles = {
        some: {
          role: { name: roleFilter },
        },
      };
    }

    if (deptFilter) {
      where.department = deptFilter;
    }

    if (activeFilter === "true" || activeFilter === "false") {
      where.isActive = activeFilter === "true";
    }

    const total = await prisma.user.count({ where });
    const users = await prisma.user.findMany({
      where,
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
          },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        role: u.userRoles[0]?.role?.name || "None",
        pushDeviceCount: u._count.subscriptions,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("Error listing users:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users
export async function POST(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    if (!verification.hasPermission("users.create")) {
      return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const result = createUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Check unique constraints
    const duplicateEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (duplicateEmail) {
      return NextResponse.json({ error: "Email is already registered" }, { status: 400 });
    }

    const duplicateMobile = await prisma.user.findUnique({ where: { mobileNumber: data.mobileNumber } });
    if (duplicateMobile) {
      return NextResponse.json({ error: "Mobile number is already registered" }, { status: 400 });
    }

    const duplicateCode = await prisma.user.findUnique({ where: { employeeCode: data.employeeCode } });
    if (duplicateCode) {
      return NextResponse.json({ error: "Employee code is already registered" }, { status: 400 });
    }

    // Role restrictions: Office Admin cannot create Super Admin
    const isCreatingSuper = data.role === "Super Admin";
    if (isCreatingSuper && !verification.roles.includes("Super Admin")) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Administrators can create other Super Admin accounts" },
        { status: 403 }
      );
    }

    // Verify role exists
    const targetRole = await prisma.role.findUnique({
      where: { name: data.role },
    });
    if (!targetRole) {
      return NextResponse.json({ error: `Selected role "${data.role}" does not exist` }, { status: 400 });
    }

    const newUser = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          emailVerified: true,
          mobileNumber: data.mobileNumber,
          designation: data.designation || null,
          department: data.department || null,
          employeeCode: data.employeeCode,
          isActive: data.isActive,
          mustChangePassword: true,
          createdById: verification.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create credential account mapping
      const hashedPassword = await hashPassword(data.password);
      await tx.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: data.email,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Map role
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: targetRole.id,
        },
      });

      // Audit Log (exclude password)
      await tx.activityLog.create({
        data: {
          userId: verification.user.id,
          action: "STAFF_CREATED",
          details: `Created staff user account ${user.name} (${user.email}) under role "${data.role}".`,
        },
      });

      return user;
    });

    return NextResponse.json({ success: true, userId: newUser.id });
  } catch (err: any) {
    console.error("Error creating staff:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
