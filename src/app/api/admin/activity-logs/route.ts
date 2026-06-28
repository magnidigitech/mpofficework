import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyActiveSession } from "@/lib/auth-helpers";
import { parseDateFilter } from "@/lib/report-filters";

// Mask sensitive keys in change diff details
function sanitizeChanges(detailsStr: string | null): string | null {
  if (!detailsStr) return null;
  
  // Try parsing details as JSON diff
  try {
    const parsed = JSON.parse(detailsStr);
    
    // Recursive masking function
    const maskSecrets = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) return obj.map(maskSecrets);
      if (typeof obj === "object") {
        const maskedObj: any = {};
        for (const [key, val] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey.includes("password") ||
            lowerKey.includes("secret") ||
            lowerKey.includes("token") ||
            lowerKey.includes("key") ||
            lowerKey.includes("p256dh") ||
            lowerKey.includes("auth") ||
            lowerKey.includes("credential")
          ) {
            maskedObj[key] = "[REDACTED_SENSITIVE_KEY]";
          } else if (typeof val === "object") {
            maskedObj[key] = maskSecrets(val);
          } else {
            maskedObj[key] = val;
          }
        }
        return maskedObj;
      }
      return obj;
    };

    const sanitizedObj = maskSecrets(parsed);
    return JSON.stringify(sanitizedObj);
  } catch (err) {
    // If not a JSON string, sanitize plain text if it contains sensitive references
    let txt = detailsStr;
    const sensitiveWords = [/password:\s*\S+/gi, /token:\s*\S+/gi, /secret:\s*\S+/gi, /p256dh:\s*\S+/gi, /auth:\s*\S+/gi];
    sensitiveWords.forEach((wordPattern) => {
      txt = txt.replace(wordPattern, (match) => {
        const key = match.split(":")[0];
        return `${key}: [REDACTED]`;
      });
    });
    return txt;
  }
}

// GET /api/admin/activity-logs
export async function GET(request: Request) {
  try {
    const verification = await verifyActiveSession(request);
    if (verification.errorResponse) {
      return NextResponse.json(verification.errorResponse, { status: verification.errorResponse.status });
    }

    const { roles } = verification;
    const isSuper = roles.includes("Super Admin");
    const isAdmin = roles.includes("MP Office Admin");

    // Restrict to Admins only
    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: "Forbidden: Administrative access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get("datePreset") || "custom";
    const customStart = searchParams.get("startDate") || "";
    const customEnd = searchParams.get("endDate") || "";
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const query = searchParams.get("query");

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const skip = (page - 1) * limit;

    const dateRange = parseDateFilter(datePreset, customStart, customEnd);

    const where: any = {
      createdAt: {
        gte: dateRange.start,
        lt: dateRange.end,
      },
    };

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (query) {
      where.OR = [
        { action: { contains: query, mode: "insensitive" } },
        { details: { contains: query, mode: "insensitive" } },
        { user: { name: { contains: query, mode: "insensitive" } } },
      ];
    }

    const total = await prisma.activityLog.count({ where });
    const logs = await prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            userRoles: {
              select: {
                role: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        timestamp: log.createdAt,
        action: log.action,
        details: sanitizeChanges(log.details),
        userName: log.user.name,
        userEmail: log.user.email,
        userRole: log.user.userRoles[0]?.role?.name || "Viewer",
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("Error retrieving activity logs:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
