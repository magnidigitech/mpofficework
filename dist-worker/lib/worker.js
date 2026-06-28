"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const web_push_1 = __importDefault(require("web-push"));
const prisma_1 = require("./prisma");
const redisConnection = new ioredis_1.default(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});
// Configure VAPID keys
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@mpoffice.com";
if (vapidPublicKey && vapidPrivateKey) {
    web_push_1.default.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}
else {
    console.warn("VAPID keys not configured. Push notifications will not send successfully.");
}
const worker = new bullmq_1.Worker("notifications", async (job) => {
    const { notificationId } = job.data;
    // 1. Fetch notification
    const notification = await prisma_1.prisma.notification.findUnique({
        where: { id: notificationId },
    });
    if (!notification) {
        console.warn(`[Worker] Notification ${notificationId} not found in database.`);
        return;
    }
    // 2. Fetch active subscriptions
    const subscriptions = await prisma_1.prisma.pushSubscription.findMany({
        where: {
            userId: notification.userId,
            isActive: true,
        },
    });
    if (subscriptions.length === 0) {
        console.log(`[Worker] No active push subscriptions found for user ${notification.userId}`);
        return;
    }
    const payload = JSON.stringify({
        title: notification.title,
        body: notification.message,
        url: notification.targetUrl || "/",
        type: notification.type,
    });
    // 3. Dispatch web push for each subscription
    for (const sub of subscriptions) {
        // Create NotificationDelivery log row
        const delivery = await prisma_1.prisma.notificationDelivery.create({
            data: {
                notificationId: notification.id,
                pushSubscriptionId: sub.id,
                status: "PENDING",
                attemptCount: 1,
                lastAttemptAt: new Date(),
            },
        });
        try {
            await web_push_1.default.sendNotification({
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            }, payload);
            // Success: update status
            await prisma_1.prisma.notificationDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: "SENT",
                    deliveredAt: new Date(),
                },
            });
            await prisma_1.prisma.pushSubscription.update({
                where: { id: sub.id },
                data: {
                    lastUsedAt: new Date(),
                },
            });
            console.log(`[Worker] Notification delivery ${delivery.id} sent successfully.`);
        }
        catch (err) {
            console.error(`[Worker] Failed to send push to subscription ${sub.id}:`, err.message);
            // Check if subscription has permanently expired (410 Gone or 404 Not Found)
            const isExpired = err.statusCode === 410 || err.statusCode === 404;
            await prisma_1.prisma.notificationDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: isExpired ? "EXPIRED" : "FAILED",
                    errorCode: String(err.statusCode || "UNKNOWN"),
                    errorMessage: err.message || "Failed to deliver push notification.",
                },
            });
            if (isExpired) {
                // Disable expired subscription in database to prevent future attempts
                await prisma_1.prisma.pushSubscription.update({
                    where: { id: sub.id },
                    data: { isActive: false },
                });
                await prisma_1.prisma.activityLog.create({
                    data: {
                        userId: notification.userId,
                        action: "PUSH_SUBSCRIPTION_EXPIRED",
                        details: `Deactivated expired push subscription device: ${sub.deviceName || "Unknown"} (Endpoint: ${sub.endpoint.slice(0, 30)}...)`,
                    },
                });
            }
        }
    }
}, {
    connection: redisConnection,
    concurrency: 5,
});
worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
});
worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
});
console.log("BullMQ Notification Worker started and listening for jobs...");
exports.default = worker;
const gracefulShutdown = async (signal) => {
    console.log(`[Worker] Received ${signal}. Shutting down worker gracefully...`);
    try {
        await worker.close();
        await redisConnection.quit();
        await prisma_1.prisma.$disconnect();
        console.log(`[Worker] Cleanly closed all worker, Redis, and database connections. Exiting.`);
        process.exit(0);
    }
    catch (err) {
        console.error("[Worker] Error during graceful shutdown:", err);
        process.exit(1);
    }
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
