import { Queue } from "bullmq";
import Redis from "ioredis";

// MaxRetriesPerRequest must be null for BullMQ
const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const notificationQueue = new Queue("notifications", {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});
