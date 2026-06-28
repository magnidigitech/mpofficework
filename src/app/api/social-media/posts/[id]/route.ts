import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as zod from "zod";

const patchPostSchema = zod.object({
  platform: zod.enum(["FACEBOOK", "INSTAGRAM", "X", "YOUTUBE", "WEBSITE"]).optional(),
  postType: zod.enum(["POST", "REEL", "STORY", "VIDEO", "SHORT", "PRESS_RELEASE", "OTHER"]).optional(),
  status: zod.enum(["NOT_REQUIRED", "PENDING", "DRAFTING", "APPROVED", "PUBLISHED", "FAILED"]).optional(),
  postUrl: zod.string().url("Invalid post URL link").nullable().or(zod.literal("")).optional(),
  captionText: zod.string().optional().nullable(),
  remarks: zod.string().optional().nullable(),
  isRequired: zod.boolean().optional(),
  publishedById: zod.string().optional().nullable(),
  publishedAt: zod.string().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const post = await prisma.socialMediaPost.findUnique({
      where: { id: postId },
      include: {
        socialMediaUpdate: {
          include: { schedule: true },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Platform post not found" }, { status: 404 });
    }

    const smUpdate = post.socialMediaUpdate;

    // Role verification
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
    const result = patchPostSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.format() },
        { status: 400 }
      );
    }
    const data = result.data;

    // Hostname verification
    const platform = data.platform || post.platform;
    const postUrl = data.postUrl !== undefined ? data.postUrl : post.postUrl;

    if (data.status === "PUBLISHED" || (data.status === undefined && post.status === "PUBLISHED")) {
      if (!postUrl || postUrl.trim() === "") {
        return NextResponse.json(
          { error: "Validation failed: A valid post URL is required when status is set to PUBLISHED." },
          { status: 400 }
        );
      }
    }

    if (postUrl) {
      try {
        const urlObj = new URL(postUrl);
        const host = urlObj.hostname.toLowerCase();
        
        if (platform === "FACEBOOK" && !host.includes("facebook.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid facebook.com link" }, { status: 400 });
        }
        if (platform === "INSTAGRAM" && !host.includes("instagram.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid instagram.com link" }, { status: 400 });
        }
        if (platform === "X" && !host.includes("x.com") && !host.includes("twitter.com")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid x.com or twitter.com link" }, { status: 400 });
        }
        if (platform === "YOUTUBE" && !host.includes("youtube.com") && !host.includes("youtu.be")) {
          return NextResponse.json({ error: "Validation failed: URL must be a valid youtube.com link" }, { status: 400 });
        }
      } catch (err) {
        return NextResponse.json({ error: "Validation failed: Invalid URL structure" }, { status: 400 });
      }
    }

    const updatedPost = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.platform) updateData.platform = data.platform;
      if (data.postType) updateData.postType = data.postType;
      if (data.status) updateData.status = data.status;
      if (data.postUrl !== undefined) updateData.postUrl = data.postUrl || null;
      if (data.captionText !== undefined) updateData.captionText = data.captionText || null;
      if (data.remarks !== undefined) updateData.remarks = data.remarks || null;
      if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;

      // Status updates transitions logic
      if (data.status) {
        if (data.status === "PUBLISHED") {
          updateData.publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date();
          updateData.publishedById = data.publishedById || session.user.id;
        } else if ((post.status as any) === "PUBLISHED" && (data.status as any) !== "PUBLISHED") {
          // Changed away from published
          updateData.publishedAt = null;
          updateData.publishedById = null;
        }
      }

      const updated = await tx.socialMediaPost.update({
        where: { id: postId },
        data: updateData,
      });

      // Recalculate status
      const allPosts = await tx.socialMediaPost.findMany({
        where: { socialMediaUpdateId: smUpdate.id },
      });
      const required = allPosts.filter((p) => p.isRequired);
      const published = required.filter((p) => p.status === "PUBLISHED").length;

      let smStatus = smUpdate.status;
      if (required.length > 0) {
        if (published === required.length) {
          smStatus = "PUBLISHED";
        } else if (published > 0) {
          smStatus = "PARTIALLY_PUBLISHED";
        } else if (smUpdate.status === "PUBLISHED" || smUpdate.status === "PARTIALLY_PUBLISHED") {
          smStatus = "APPROVED"; // Reset to approved if no posts are published anymore
        }
      }

      await tx.socialMediaUpdate.update({
        where: { id: smUpdate.id },
        data: { status: smStatus, updatedAt: new Date() },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: data.status === "PUBLISHED" ? "SOCIAL_MEDIA_POST_PUBLISHED" : "SOCIAL_MEDIA_POST_UPDATED",
          details: data.status === "PUBLISHED"
            ? `Published ${updated.platform} ${updated.postType} post for schedule "${smUpdate.schedule.title}"`
            : `Updated ${updated.platform} ${updated.postType} post status to ${updated.status} for schedule "${smUpdate.schedule.title}"`,
          createdAt: new Date(),
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, post: updatedPost });
  } catch (err: any) {
    console.error("Error updating platform post:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const post = await prisma.socialMediaPost.findUnique({
      where: { id: postId },
      include: {
        socialMediaUpdate: {
          include: { schedule: true },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Platform post not found" }, { status: 404 });
    }

    const smUpdate = post.socialMediaUpdate;

    // Enforce Admin only deletion permissions
    const userRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.name);
    const isAdmin = roles.includes("Super Admin") || roles.includes("MP Office Admin");

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Only administrators can delete post records" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialMediaPost.delete({
        where: { id: postId },
      });

      // Recalculate status
      const allPosts = await tx.socialMediaPost.findMany({
        where: { socialMediaUpdateId: smUpdate.id },
      });
      const required = allPosts.filter((p) => p.isRequired);
      const published = required.filter((p) => p.status === "PUBLISHED").length;

      let smStatus = smUpdate.status;
      if (required.length > 0) {
        if (published === required.length) {
          smStatus = "PUBLISHED";
        } else if (published > 0) {
          smStatus = "PARTIALLY_PUBLISHED";
        } else if (smUpdate.status === "PUBLISHED" || smUpdate.status === "PARTIALLY_PUBLISHED") {
          smStatus = "APPROVED";
        }
      } else {
        smStatus = "APPROVED";
      }

      await tx.socialMediaUpdate.update({
        where: { id: smUpdate.id },
        data: { status: smStatus, updatedAt: new Date() },
      });

      // Log Activity
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "SOCIAL_MEDIA_POST_DELETED",
          details: `Deleted ${post.platform} ${post.postType} post link from schedule "${smUpdate.schedule.title}"`,
          createdAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting platform post:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
