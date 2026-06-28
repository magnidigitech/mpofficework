import { NextResponse } from "next/server";
import { verifyActiveSession } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    return NextResponse.json({
      user: {
        id: verification.user.id,
        name: verification.user.name,
        email: verification.user.email,
        mobileNumber: verification.user.mobileNumber,
        designation: verification.user.designation,
        department: verification.user.department,
        employeeCode: verification.user.employeeCode,
        profileImage: verification.user.profileImage,
        isActive: verification.user.isActive,
        mustChangePassword: verification.user.mustChangePassword,
        lastLoginAt: verification.user.lastLoginAt,
      },
      roles: verification.roles,
      permissions: verification.permissions,
    });
  } catch (err: any) {
    console.error("Error fetching current user profile:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
