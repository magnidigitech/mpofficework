import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export interface SessionVerificationResult {
  session: any;
  user: any;
  roles: string[];
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  errorResponse?: any;
}

export async function verifyActiveSession(request: Request): Promise<SessionVerificationResult> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return {
        session: null,
        user: null,
        roles: [],
        permissions: [],
        hasPermission: () => false,
        errorResponse: { error: "Unauthorized", status: 401 },
      };
    }

    // Query DB to verify isActive and get fresh roles & permissions
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dbUser) {
      return {
        session: null,
        user: null,
        roles: [],
        permissions: [],
        hasPermission: () => false,
        errorResponse: { error: "User not found", status: 401 },
      };
    }

    if (!dbUser.isActive) {
      return {
        session,
        user: dbUser,
        roles: [],
        permissions: [],
        hasPermission: () => false,
        errorResponse: { error: "Forbidden: Account deactivated", status: 403 },
      };
    }

    // Map roles and permission strings
    const roles = dbUser.userRoles.map((ur) => ur.role.name);
    
    // Extract unique permissions
    const permissionsSet = new Set<string>();
    for (const ur of dbUser.userRoles) {
      for (const rp of ur.role.permissions) {
        permissionsSet.add(rp.permission.name);
      }
    }
    const permissions = Array.from(permissionsSet);

    const hasPermission = (permission: string) => {
      // Super Admin automatically bypasses all permission checks
      if (roles.includes("Super Admin")) return true;
      return permissions.includes(permission);
    };

    return {
      session,
      user: dbUser,
      roles,
      permissions,
      hasPermission,
    };
  } catch (err) {
    console.error("Error in verifyActiveSession helper:", err);
    return {
      session: null,
      user: null,
      roles: [],
      permissions: [],
      hasPermission: () => false,
      errorResponse: { error: "Internal server error during verification", status: 500 },
    };
  }
}
