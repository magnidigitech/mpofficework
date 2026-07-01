import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";
import { generateRequestNumber, getUserRoles } from "@/lib/ttd-utils";
import { sendNotification } from "@/lib/notification-sender";

export const dynamic = "force-dynamic";

const createRequestSchema = zod.object({
  applicantName: zod.string().min(2, "Applicant name is required"),
  applicantMobile: zod.string().min(10, "Valid mobile number is required"),
  alternateMobile: zod.string().optional().nullable(),
  address: zod.string().optional().nullable(),
  district: zod.string().optional().nullable(),
  constituency: zod.string().optional().nullable(),
  sourceType: zod.enum([
    "OFFICE_WALK_IN",
    "PHONE_CALL",
    "STAFF_REFERENCE",
    "PUBLIC_MEETING",
    "PERSONAL_REFERENCE",
    "SCHEDULE_VISIT",
    "OTHER",
  ]),
  sourceDescription: zod.string().optional().nullable(),
  relatedScheduleId: zod.string().optional().nullable(),
  referencePersonName: zod.string().optional().nullable(),
  referencePersonMobile: zod.string().optional().nullable(),
  preferredDarshanDate: zod.string().min(1, "Preferred Darshan date is required"),
  alternateDarshanDate: zod.string().optional().nullable(),
  notes: zod.string().optional().nullable(),
  members: zod.array(
    zod.object({
      fullName: zod.string().min(2, "Member name is required"),
      age: zod.number().min(1, "Age must be positive"),
      gender: zod.string().min(1, "Gender is required"),
      mobile: zod.string().optional().nullable(),
      relationshipToApplicant: zod.string().optional().nullable(),
      identityType: zod.string().min(2, "Identity type is required"),
      identityLastFourDigits: zod.string().length(4, "Identity number must be last 4 digits only"),
      isPrimaryApplicant: zod.boolean().default(false),
    })
  ).min(1, "At least one travelling member is required"),
});

// GET: List requests with filters and pagination
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userPerms = await getUserRoles(session.user.id);

    // Filters
    const status = searchParams.get("status");
    const verificationStatus = searchParams.get("verificationStatus");
    const documentsStatus = searchParams.get("documentsStatus");
    const applicantMobile = searchParams.get("applicantMobile");
    const applicantName = searchParams.get("applicantName");
    const district = searchParams.get("district");
    const constituency = searchParams.get("constituency");
    const sourceType = searchParams.get("sourceType");
    const quotaPeriodId = searchParams.get("quotaPeriodId");
    const letterNumber = searchParams.get("letterNumber");
    const relatedScheduleId = searchParams.get("relatedScheduleId");
    const query = searchParams.get("query"); // General search query

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) where.status = status;
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (documentsStatus) where.documentsStatus = documentsStatus;
    if (applicantMobile) where.applicantMobile = { contains: applicantMobile };
    if (applicantName) where.applicantName = { contains: applicantName, mode: "insensitive" };
    if (district) where.district = district;
    if (constituency) where.constituency = constituency;
    if (sourceType) where.sourceType = sourceType;
    if (quotaPeriodId) where.quotaPeriodId = quotaPeriodId;
    if (letterNumber) where.letterNumber = letterNumber;
    if (relatedScheduleId) where.relatedScheduleId = relatedScheduleId;

    if (query) {
      where.OR = [
        { requestNumber: { contains: query, mode: "insensitive" } },
        { applicantName: { contains: query, mode: "insensitive" } },
        { applicantMobile: { contains: query } },
        { members: { some: { fullName: { contains: query, mode: "insensitive" } } } },
      ];
    }

    // Role restrictions: Schedule Coordinators can only see requests created by them or linked to their schedules
    if (userPerms.isCoordinator && !userPerms.isTTDStaff) {
      where.OR = [
        { createdById: session.user.id },
        { relatedSchedule: { assignments: { some: { userId: session.user.id } } } },
      ];
    }

    const total = await prisma.tTDRequest.count({ where });
    const requests = await prisma.tTDRequest.findMany({
      where,
      select: {
        id: true,
        requestNumber: true,
        applicantName: true,
        applicantMobile: true,
        preferredDarshanDate: true,
        numberOfMembers: true,
        sourceType: true,
        status: true,
        verificationStatus: true,
        documentsStatus: true,
        createdAt: true,
        letterNumber: true,
        quotaPeriod: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return NextResponse.json({
      requests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("Error listing TTD requests:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create TTD request
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userPerms = await getUserRoles(session.user.id);
    if (userPerms.isViewer && !userPerms.isCoordinator) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const result = createRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Additional validations
    if (data.sourceType === "SCHEDULE_VISIT" && !data.relatedScheduleId) {
      return NextResponse.json(
        { error: "relatedScheduleId is required when sourceType is SCHEDULE_VISIT." },
        { status: 400 }
      );
    }

    if (data.sourceType === "OTHER" && !data.sourceDescription) {
      return NextResponse.json(
        { error: "sourceDescription is required when sourceType is OTHER." },
        { status: 400 }
      );
    }

    const primaryCount = data.members.filter((m) => m.isPrimaryApplicant).length;
    if (primaryCount !== 1) {
      return NextResponse.json(
        { error: "Exactly one member must be marked as the primary applicant." },
        { status: 400 }
      );
    }

    const newRequest = await prisma.$transaction(async (tx) => {
      const requestNumber = await generateRequestNumber(tx);

      const requestRecord = await tx.tTDRequest.create({
        data: {
          requestNumber,
          applicantName: data.applicantName,
          applicantMobile: data.applicantMobile,
          alternateMobile: data.alternateMobile || null,
          address: data.address || null,
          district: data.district || null,
          constituency: data.constituency || null,
          sourceType: data.sourceType,
          sourceDescription: data.sourceDescription || null,
          relatedScheduleId: data.relatedScheduleId || null,
          referencePersonName: data.referencePersonName || null,
          referencePersonMobile: data.referencePersonMobile || null,
          preferredDarshanDate: new Date(data.preferredDarshanDate),
          alternateDarshanDate: data.alternateDarshanDate ? new Date(data.alternateDarshanDate) : null,
          numberOfMembers: data.members.length,
          status: "REQUESTED",
          verificationStatus: "NOT_STARTED",
          documentsStatus: "NOT_SUBMITTED",
          createdById: session.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create members
      await tx.tTDRequestMember.createMany({
        data: data.members.map((m) => ({
          requestId: requestRecord.id,
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

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TTD_REQUEST_CREATED",
          details: `Created TTD request ${requestNumber} for ${data.applicantName} with ${data.members.length} members.`,
          createdAt: new Date(),
        },
      });

      return requestRecord;
    });

    // Notify TTD Managers
    const managers = await prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            role: {
              name: { in: ["Super Admin", "MP Office Admin", "TTD Manager"] },
            },
          },
        },
      },
      select: { id: true },
    });
    const managerIds = managers.map((m) => m.id);
    if (managerIds.length > 0) {
      await sendNotification(
        managerIds,
        "New TTD Request Submitted",
        `New TTD Request ${newRequest.requestNumber} submitted for ${newRequest.applicantName}`,
        {
          type: "ttd",
          targetUrl: "/ttd-letters",
          relatedEntityType: "TTDRequest",
          relatedEntityId: newRequest.id,
        }
      );
    }

    return NextResponse.json({ success: true, request: newRequest });
  } catch (err: any) {
    console.error("Error creating TTD request:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
