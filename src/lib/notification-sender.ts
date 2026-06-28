import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";

export interface SendNotificationOptions {
  type?: string; // e.g. "schedule", "checklist", "social_media", "ttd"
  targetUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dedupKey?: string;
}

export async function sendNotification(
  userIds: string | string[],
  title: string,
  message: string,
  options: SendNotificationOptions = {}
) {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const { type = "general", targetUrl = "/", relatedEntityType = null, relatedEntityId = null, dedupKey = "" } = options;

    for (const userId of ids) {
      // 1. Create persistent Notification record
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          targetUrl,
          relatedEntityType,
          relatedEntityId,
        },
      });

      // 2. Queue BullMQ job with deduplication key as jobId
      // Format: userId-type-entityId-dedupKey
      const jobId = `${userId}-${type}-${relatedEntityId || "general"}-${dedupKey}`;

      await notificationQueue.add(
        "send-push",
        {
          notificationId: notification.id,
        },
        {
          jobId,
          // Prevent BullMQ errors if job already exists (it will be silently ignored or merged)
          removeOnComplete: true,
          removeOnFail: true,
        }
      );
    }
  } catch (err) {
    console.error("Error queueing notification:", err);
  }
}
