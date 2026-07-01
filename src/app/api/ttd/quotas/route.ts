import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { getUserRoles } from "@/lib/ttd-utils";

export const dynamic = "force-dynamic";

const createQuotaSchema = zod.object({
  name: zod.string().min(2, "Quota period name is required"),
  startDate: zod.string().min(1, "Start date is required"),
  endDate: zod.string().min(1, "End date is required"),
  allocatedLetters: zod.number().min(0, "Allocated letters must be zero or positive"),
  isActive: zod.boolean().default(true),
  notes: zod.string().optional().nullable(),
  allowOverlap: zod.boolean().optional().default(false),
});

// GET: List quota periods
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
    }

    const quotas = await prisma.tTDQuotaPeriod.findMany({
      where,
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(quotas);
  } catch (err: any) {
    console.error("Error fetching quota periods:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create quota period
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userPerms = await getUserRoles(session.user.id);
    if (!userPerms.isOfficeAdmin) {
      return NextResponse.json({ error: "Forbidden: Administrators only" }, { status: 403 });
    }

    const body = await request.json();
    const result = createQuotaSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (end <= start) {
      return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    }

    // Overlap checks
    if (data.isActive && !data.allowOverlap) {
      const overlapping = await prisma.tTDQuotaPeriod.findFirst({
        where: {
          isActive: true,
          OR: [
            {
              startDate: { lte: end },
              endDate: { gte: start },
            },
          ],
        },
      });

      if (overlapping && !userPerms.isAdmin) {
        return NextResponse.json(
          { error: `The date range overlaps with another active quota period: "${overlapping.name}". Only Super Administrators can bypass overlap checks.` },
          { status: 400 }
        );
      }
    }

    const newPeriod = await prisma.$transaction(async (tx) => {
      const record = await tx.tTDQuotaPeriod.create({
        data: {
          name: data.name,
          startDate: start,
          endDate: end,
          allocatedLetters: data.allocatedLetters,
          reservedLetters: 0,
          issuedLetters: 0,
          isActive: data.isActive,
          notes: data.notes || null,
          createdById: session.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Log transaction
      await tx.tTDQuotaTransaction.create({
        data: {
          quotaPeriodId: record.id,
          transactionType: "ADJUSTMENT",
          quantity: data.allocatedLetters,
          previousReserved: 0,
          newReserved: 0,
          previousIssued: 0,
          newIssued: 0,
          reason: `Initial period creation with allocation: ${data.allocatedLetters}`,
          performedById: session.user.id,
          createdAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_QUOTA_PERIOD_CREATED",
          details: `Created quota period "${data.name}" allocating ${data.allocatedLetters} letters.`,
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, quota: newPeriod });
  } catch (err: any) {
    console.error("Error creating quota period:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
