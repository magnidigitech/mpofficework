import { prisma } from "@/lib/prisma";

export interface UserRoles {
  roles: string[];
  isAdmin: boolean;
  isOfficeAdmin: boolean;
  isTTDManager: boolean;
  isTTDStaff: boolean;
  isCoordinator: boolean;
  isViewer: boolean;
}

export async function getUserRoles(userId: string): Promise<UserRoles> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  const roles = userRoles.map((ur) => ur.role.name);

  const isAdmin = roles.includes("Super Admin");
  const isOfficeAdmin = roles.includes("MP Office Admin") || isAdmin;
  const isTTDManager = roles.includes("Social Media Team") || roles.includes("TTD Manager") || isOfficeAdmin; // maps standard admin permissions
  const isTTDStaff = roles.includes("TTD Staff") || isTTDManager;
  const isCoordinator = roles.includes("Schedule Coordinator") || isTTDStaff;
  const isViewer = roles.includes("Viewer") || roles.includes("Field Coordinator") || isCoordinator;

  return {
    roles,
    isAdmin,
    isOfficeAdmin,
    isTTDManager,
    isTTDStaff,
    isCoordinator,
    isViewer,
  };
}

export async function generateRequestNumber(tx: any): Promise<string> {
  const year = new Date().getFullYear();
  const lastRequest = await tx.tTDRequest.findFirst({
    where: {
      requestNumber: {
        startsWith: `TTD-${year}-`,
      },
    },
    orderBy: {
      requestNumber: "desc",
    },
    select: {
      requestNumber: true,
    },
  });

  let nextSeq = 1;
  if (lastRequest) {
    const parts = lastRequest.requestNumber.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `TTD-${year}-${String(nextSeq).padStart(6, "0")}`;
}

export async function checkDuplicates(data: {
  applicantName: string;
  applicantMobile: string;
  alternateMobile?: string | null;
  preferredDarshanDate: string | Date;
  members: { fullName: string; mobile?: string | null }[];
}) {
  const warnings: string[] = [];
  const darshanDate = new Date(data.preferredDarshanDate);
  darshanDate.setUTCHours(0, 0, 0, 0);

  // 1. Same applicant mobile has an active request
  const activeMobileRequest = await prisma.tTDRequest.findFirst({
    where: {
      applicantMobile: data.applicantMobile,
      status: {
        notIn: ["REJECTED", "CANCELLED", "EXPIRED", "USED"],
      },
    },
  });
  if (activeMobileRequest) {
    warnings.push(`Same mobile number ${data.applicantMobile} has an active request (${activeMobileRequest.requestNumber}).`);
  }

  // 2. Same applicant received a letter recently (status DISTRIBUTED or USED in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLetter = await prisma.tTDRequest.findFirst({
    where: {
      applicantMobile: data.applicantMobile,
      status: { in: ["DISTRIBUTED", "USED"] },
      distributedAt: { gte: thirtyDaysAgo },
    },
  });
  if (recentLetter) {
    warnings.push(`Same applicant received a TTD letter recently on ${recentLetter.distributedAt?.toLocaleDateString("en-IN")}.`);
  }

  // 3. Same member mobile or name appears in another request for the same darshan date
  const memberNames = data.members.map((m) => m.fullName.trim().toLowerCase());
  const memberMobiles = data.members.map((m) => m.mobile).filter(Boolean) as string[];

  if (memberNames.length > 0 || memberMobiles.length > 0) {
    const duplicateMembers = await prisma.tTDRequestMember.findMany({
      where: {
        request: {
          preferredDarshanDate: darshanDate,
          status: { notIn: ["REJECTED", "CANCELLED"] },
        },
        OR: [
          { fullName: { in: memberNames, mode: "insensitive" } },
          ...(memberMobiles.length > 0 ? [{ mobile: { in: memberMobiles } }] : []),
        ],
      },
      include: {
        request: true,
      },
    });

    if (duplicateMembers.length > 0) {
      for (const m of duplicateMembers) {
        warnings.push(`Member "${m.fullName}" is already registered in active request ${m.request.requestNumber} for the same Darshan date.`);
      }
    }
  }

  return warnings;
}
