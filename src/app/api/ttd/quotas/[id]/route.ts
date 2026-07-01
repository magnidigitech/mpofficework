import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { getUserRoles } from "@/lib/ttd-utils";

export const dynamic = "force-dynamic";

const updateQuotaSchema = zod.object({
  name: zod.string().optional(),
  startDate: zod.string().optional(),
  endDate: zod.string().optional(),
  allocatedLetters: zod.number().min(0).optional(),
  isActive: zod.boolean().optional(),
  notes: zod.string().nullable().optional(),
  adjustmentReason: zod.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const period = await prisma.tTDQuotaPeriod.findUnique({
      where: { id },
    });

    if (!period) {
      return NextResponse.json({ error: "TTD Quota Period not found" }, { status: 404 });
    }

    const body = await request.json();
    const result = updateQuotaSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    const start = data.startDate ? new Date(data.startDate) : period.startDate;
    const end = data.endDate ? new Date(data.endDate) : period.endDate;

    if (end <= start) {
      return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
    }

    // Checking reductions constraints
    if (data.allocatedLetters !== undefined) {
      if (period.reservedLetters + period.issuedLetters > data.allocatedLetters) {
        return NextResponse.json(
          { 
            error: `Insufficient capacity: Cannot reduce allocated letters to ${data.allocatedLetters}. Currently, ${period.reservedLetters} are reserved and ${period.issuedLetters} are issued (total: ${period.reservedLetters + period.issuedLetters}).` 
          },
          { status: 400 }
        );
      }

      if (!data.adjustmentReason || data.adjustmentReason.trim().length === 0) {
        return NextResponse.json(
          { error: "Validation failed: An adjustment reason is mandatory when altering quota allocations." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        startDate: start,
        endDate: end,
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.allocatedLetters !== undefined) updateData.allocatedLetters = data.allocatedLetters;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.notes !== undefined) updateData.notes = data.notes;

      const record = await tx.tTDQuotaPeriod.update({
        where: { id },
        data: updateData,
      });

      // Write transaction if allocation is updated
      if (data.allocatedLetters !== undefined && data.allocatedLetters !== period.allocatedLetters) {
        await tx.tTDQuotaTransaction.create({
          data: {
            quotaPeriodId: id,
            transactionType: "ADJUSTMENT",
            quantity: data.allocatedLetters - period.allocatedLetters,
            previousReserved: period.reservedLetters,
            newReserved: period.reservedLetters,
            previousIssued: period.issuedLetters,
            newIssued: period.issuedLetters,
            reason: data.adjustmentReason,
            performedById: session.user.id,
            createdAt: new Date(),
          },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_QUOTA_PERIOD_UPDATED",
          details: `Updated quota period "${record.name}".` + (data.allocatedLetters !== undefined ? ` Allocated letters adjusted to ${data.allocatedLetters}. Reason: "${data.adjustmentReason}"` : ""),
          createdAt: new Date(),
        },
      });

      return record;
    });

    return NextResponse.json({ success: true, quota: updated });
  } catch (err: any) {
    console.error("Error patching quota period:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
