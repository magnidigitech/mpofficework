import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { getUserRoles, checkDuplicates } from "@/lib/ttd-utils";

export const dynamic = "force-dynamic";

const updateRequestSchema = zod.object({
  applicantName: zod.string().optional(),
  applicantMobile: zod.string().optional(),
  alternateMobile: zod.string().nullable().optional(),
  address: zod.string().nullable().optional(),
  district: zod.string().nullable().optional(),
  constituency: zod.string().nullable().optional(),
  sourceType: zod.enum([
    "OFFICE_WALK_IN",
    "PHONE_CALL",
    "STAFF_REFERENCE",
    "PUBLIC_MEETING",
    "PERSONAL_REFERENCE",
    "SCHEDULE_VISIT",
    "OTHER",
  ]).optional(),
  sourceDescription: zod.string().nullable().optional(),
  relatedScheduleId: zod.string().nullable().optional(),
  referencePersonName: zod.string().nullable().optional(),
  referencePersonMobile: zod.string().nullable().optional(),
  preferredDarshanDate: zod.string().optional(),
  alternateDarshanDate: zod.string().nullable().optional(),
  notes: zod.string().nullable().optional(),
  verificationStatus: zod.enum(["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "FAILED"]).optional(),
  documentsStatus: zod.enum(["NOT_SUBMITTED", "PARTIAL", "COMPLETE", "VERIFIED", "REJECTED"]).optional(),
  overrideReason: zod.string().optional(), // Super Admin correction reason
  members: zod.array(
    zod.object({
      id: zod.string().optional(), // Present if updating existing member
      fullName: zod.string().min(2),
      age: zod.number().min(1),
      gender: zod.string(),
      mobile: zod.string().nullable().optional(),
      relationshipToApplicant: zod.string().nullable().optional(),
      identityType: zod.string(),
      identityLastFourDigits: zod.string().length(4),
      isPrimaryApplicant: zod.boolean().default(false),
    })
  ).optional(),
});

// GET: Fetch details
export async function GET(
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

    const requestRecord = await prisma.tTDRequest.findUnique({
      where: { id },
      include: {
        members: true,
        quotaPeriod: true,
        quotaTransactions: {
          include: {
            performedBy: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        createdBy: {
          select: { name: true, email: true },
        },
        quotaReservedBy: {
          select: { name: true, email: true },
        },
        approvedBy: {
          select: { name: true, email: true },
        },
        rejectedBy: {
          select: { name: true, email: true },
        },
        letterPreparedBy: {
          select: { name: true, email: true },
        },
        distributedBy: {
          select: { name: true, email: true },
        },
        cancelledBy: {
          select: { name: true, email: true },
        },
        attachments: true,
        relatedSchedule: {
          select: { id: true, title: true, startAt: true, status: true },
        },
      },
    });

    if (!requestRecord) {
      return NextResponse.json({ error: "TTD Request not found" }, { status: 404 });
    }

    // Role verification check
    const userPerms = await getUserRoles(session.user.id);
    const isOwner = requestRecord.createdById === session.user.id;

    let canView = userPerms.isTTDStaff || isOwner;
    if (!canView && userPerms.isCoordinator && requestRecord.relatedScheduleId) {
      // Check if coordinator is assigned to linked schedule
      const isAssigned = await prisma.scheduleAssignment.findFirst({
        where: {
          scheduleId: requestRecord.relatedScheduleId,
          userId: session.user.id,
        },
      });
      if (isAssigned) canView = true;
    }

    if (!canView) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    // Calculate duplicate warnings dynamically
    const duplicateWarnings = await checkDuplicates({
      applicantName: requestRecord.applicantName,
      applicantMobile: requestRecord.applicantMobile,
      alternateMobile: requestRecord.alternateMobile,
      preferredDarshanDate: requestRecord.preferredDarshanDate,
      members: requestRecord.members.map((m) => ({
        fullName: m.fullName,
        mobile: m.mobile,
      })),
    });

    // Activity log history matching this request
    const activityLogs = await prisma.activityLog.findMany({
      where: {
        details: {
          contains: requestRecord.requestNumber,
        },
      },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ...requestRecord,
      duplicateWarnings,
      activityLogs,
    });
  } catch (err: any) {
    console.error("Error fetching TTD Request detail:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Edit / Update details
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

    const requestRecord = await prisma.tTDRequest.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!requestRecord) {
      return NextResponse.json({ error: "TTD Request not found" }, { status: 404 });
    }

    // Role check
    const userPerms = await getUserRoles(session.user.id);
    const isOwner = requestRecord.createdById === session.user.id;
    let canEdit = userPerms.isTTDStaff || isOwner;

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    // Edits constraints
    const isDistributedOrUsed = ["DISTRIBUTED", "USED", "CANCELLED", "REJECTED"].includes(requestRecord.status);
    const isSuperAdmin = userPerms.isAdmin;

    const body = await request.json();
    const result = updateRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    if (isDistributedOrUsed) {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { error: "Forbidden: Only Super Administrators can modify a finalized, cancelled, or rejected request." },
          { status: 403 }
        );
      }
      if (!data.overrideReason || data.overrideReason.trim().length < 5) {
        return NextResponse.json(
          { error: "Validation failed: A valid override reason is mandatory when correcting finalized entries." },
          { status: 400 }
        );
      }
    }

    // Apply updates inside transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatePayload: any = {
        updatedAt: new Date(),
      };

      if (data.applicantName !== undefined) updatePayload.applicantName = data.applicantName;
      if (data.applicantMobile !== undefined) updatePayload.applicantMobile = data.applicantMobile;
      if (data.alternateMobile !== undefined) updatePayload.alternateMobile = data.alternateMobile;
      if (data.address !== undefined) updatePayload.address = data.address;
      if (data.district !== undefined) updatePayload.district = data.district;
      if (data.constituency !== undefined) updatePayload.constituency = data.constituency;
      if (data.sourceType !== undefined) updatePayload.sourceType = data.sourceType;
      if (data.sourceDescription !== undefined) updatePayload.sourceDescription = data.sourceDescription;
      if (data.relatedScheduleId !== undefined) updatePayload.relatedScheduleId = data.relatedScheduleId;
      if (data.referencePersonName !== undefined) updatePayload.referencePersonName = data.referencePersonName;
      if (data.referencePersonMobile !== undefined) updatePayload.referencePersonMobile = data.referencePersonMobile;
      if (data.preferredDarshanDate !== undefined) updatePayload.preferredDarshanDate = new Date(data.preferredDarshanDate);
      if (data.alternateDarshanDate !== undefined) {
        updatePayload.alternateDarshanDate = data.alternateDarshanDate ? new Date(data.alternateDarshanDate) : null;
      }
      if (data.notes !== undefined) updatePayload.notes = data.notes;
      if (data.verificationStatus !== undefined) updatePayload.verificationStatus = data.verificationStatus;
      if (data.documentsStatus !== undefined) updatePayload.documentsStatus = data.documentsStatus;

      // Reactivation block: editing does NOT automatically reactivate rejected/cancelled requests
      // This is preserved by not touching the `status` during normal edits.

      // Update members list if provided
      if (data.members) {
        // Delete all old members and recreate, or update
        // Wiping and recreations is extremely clean for simple list mutations
        await tx.tTDRequestMember.deleteMany({
          where: { requestId: id },
        });

        await tx.tTDRequestMember.createMany({
          data: data.members.map((m) => ({
            requestId: id,
            fullName: m.fullName,
            age: m.age,
            gender: m.gender,
            mobile: m.mobile || null,
            relationshipToApplicant: m.relationshipToApplicant || null,
            identityType: m.identityType,
            identityLastFourDigits: m.identityLastFourDigits,
            isPrimaryApplicant: m.isPrimaryApplicant,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });

        updatePayload.numberOfMembers = data.members.length;
      }

      const updatedRecord = await tx.tTDRequest.update({
        where: { id },
        data: updatePayload,
      });

      // Log Activity
      let logMsg = `Updated request details for ${requestRecord.requestNumber}.`;
      if (isOverrideAppliedAndRequired(isDistributedOrUsed, isSuperAdmin)) {
        logMsg = `Super Admin updated finalized request ${requestRecord.requestNumber}. Reason: "${data.overrideReason}".`;
      }

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_REQUEST_UPDATED",
          details: logMsg,
          createdAt: new Date(),
        },
      });

      return updatedRecord;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("Error updating TTD request:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function isOverrideAppliedAndRequired(isFinal: boolean, isAdmin: boolean) {
  return isFinal && isAdmin;
}
