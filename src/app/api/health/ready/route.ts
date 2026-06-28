import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Redis from "ioredis";

export async function GET() {
  const healthStatus = {
    status: "ok",
    database: "ok",
    redis: "ok",
    queue: "ok",
  };

  let hasError = false;

  // 1. Check PostgreSQL Connection
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Health check - PostgreSQL failure:", err);
    healthStatus.database = "error";
    healthStatus.status = "error";
    hasError = true;
  }

  // 2. Check Redis Connection
  let redisClient: Redis | null = null;
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    
    const pingResult = await redisClient.ping();
    if (pingResult !== "PONG") {
      healthStatus.redis = "error";
      healthStatus.status = "error";
      hasError = true;
    }
  } catch (err) {
    console.error("Health check - Redis failure:", err);
    healthStatus.redis = "error";
    healthStatus.status = "error";
    hasError = true;
  } finally {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
    }
  }

  // 3. Check Notification Queue
  let queueClient: Redis | null = null;
  try {
    const queueRedisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    queueClient = new Redis(queueRedisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    const result = await queueClient.ping();
    if (result !== "PONG") {
      healthStatus.queue = "error";
      healthStatus.status = "error";
      hasError = true;
    }
  } catch (err) {
    console.error("Health check - Queue failure:", err);
    healthStatus.queue = "error";
    healthStatus.status = "error";
    hasError = true;
  } finally {
    if (queueClient) {
      try {
        queueClient.disconnect();
      } catch (e) {
        // ignore
      }
    }
  }

  return NextResponse.json(healthStatus, {
    status: hasError ? 503 : 200,
  });
}
