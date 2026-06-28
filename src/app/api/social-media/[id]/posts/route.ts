import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";

const createPostSchema = zod.object({
  platform: zod.enum(["FACEBOOK", "INSTAGRAM", "X", "YOUTUBE", "WEBSITE"]),
  postType: zod.enum(["POST", "REEL", "STORY", "VIDEO", "SHORT", "PRESS_RELEASE", "OTHER"]),
  status: zod.enum(["NOT_REQUIRED", "PENDING", "DRAFTING", "APPROVED", "PUBLISHED", "FAILED"]).default("PENDING"),
  postUrl: zod.string().url("Invalid post URL link").nullable().or(zod.literal("")).optional(),
  captionText: zod.string().optional().nullable(),
  remarks: zod.string().optional().nullable(),
  isRequired: zod.boolean().optional().default(true),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: socialMediaUpdateId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smUpdate = await prisma.socialMediaUpdate.findUnique({
      where: { id: socialMediaUpdateId },
      include: { schedule: true },
    });

    if (!smUpdate) {
      return NextResponse.json({ error: "Social media tracking not found" }, { status: 404 });
    }

    // Role check
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");
    const isSMTeam = roles.includes("Social Media Team") || smUpdate.assignedUserId === session.user.id;

    if (!isAdmin && !isSMTeam) {
      return NextResponse.json({ error: "Forbidden: Unauthorized access" }, { status: 403 });
    }

    const body = await request.json();
    const result = createPostSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Hostname checks for specific platforms
    if (data.postUrl) {
      try {
        const urlObj = new URL(data.postUrl);
        const host = urlObj.hostname.toLowerCase();
        
        if (data.platform === "FACEBOOK" && !host.includes("facebook.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid facebook.com link" }, { status: 400 });
        }
        if (data.platform === "INSTAGRAM" && !host.includes("instagram.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid instagram.com link" }, { status: 400 });
        }
        if (data.platform === "X" && !host.includes("x.com") && !host.includes("twitter.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid x.com or twitter.com link" }, { status: 400 });
        }
        if (data.platform === "YOUTUBE" && !host.includes("youtube.com") && !host.includes("youtu.be")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid youtube.com link" }, { status: 400 });
        }
      } catch (err) {
        return NextResponse.json({ error: "Validation failed: Invalid URL structure" }, { status: 400 });
      }
    }

    // Check duplicate
    const duplicate = await prisma.socialMediaPost.findUnique({
      where: {
        socialMediaUpdateId_platform_postType: {
          socialMediaUpdateId,
          platform: data.platform,
          postType: data.postType,
        },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: `A post record for platform ${data.platform} and type ${data.postType} already exists.` },
        { status: 400 }
      );
    }

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.socialMediaPost.create({
        data: {
          socialMediaUpdateId,
          platform: data.platform,
          postType: data.postType,
          status: data.status,
          postUrl: data.postUrl || null,
          captionText: data.captionText || null,
          remarks: data.remarks || null,
          isRequired: data.isRequired,
          publishedAt: data.status === "PUBLISHED" ? new Date() : null,
          publishedById: data.status === "PUBLISHED" ? session.user.id : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Recalculate status
      const allPosts = await tx.socialMediaPost.findMany({
        where: { socialMediaUpdateId },
      });
      const required = allPosts.filter((p) => p.isRequired);
      const published = required.filter((p) => p.status === "PUBLISHED").length;

      let smStatus = smUpdate.status;
      if (required.length > 0) {
        if (published === required.length) {
          smStatus = "PUBLISHED";
        } else if (published > 0) {
          smStatus = "PARTIALLY_PUBLISHED";
        }
      }

      await tx.socialMediaUpdate.update({
        where: { id: socialMediaUpdateId },
        data: { status: smStatus, updatedAt: new Date() },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "SOCIAL_MEDIA_POST_CREATED",
          details: `Registered ${data.platform} ${data.postType} post status for schedule "${smUpdate.schedule.title}"`,
          createdAt: new Date(),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, post });
  } catch (err: any) {
    console.error("Error creating platform post:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
