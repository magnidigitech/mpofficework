import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/settings/public
export async function GET() {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { isPublic: true },
      select: {
        key: true,
        value: true,
        valueType: true,
        category: true,
        description: true,
      },
      orderBy: { key: "asc" },
    });

    return NextResponse.json({ settings });
  } catch (err: any) {
    console.error("Error retrieving public settings:", err);
    return NextResponse.json({ error: "Failed to load public configuration" }, { status: 500 });
  }
}
