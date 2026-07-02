import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: {
    window: 60,       // 60-second window
    max: 20,          // 20 attempts per window
    storage: "memory",
  },
  trustedOrigins: [
    "https://admin.bhashyamramakrishna.in",
    "http://localhost:3000",
  ],
  user: {
    additionalFields: {
      mobileNumber: {
        type: "string",
        required: false,
      },
      designation: {
        type: "string",
        required: false,
      },
      department: {
        type: "string",
        required: false,
      },
      employeeCode: {
        type: "string",
        required: false,
      },
      profileImage: {
        type: "string",
        required: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
      },
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
      },
      createdById: {
        type: "string",
        required: false,
      },
    },
  },
});
