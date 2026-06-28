import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkDuplicates } from "@/lib/ttd-utils";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const warnings = await checkDuplicates(body);

    return NextResponse.json({ warnings });
  } catch (err: any) {
    console.error("Error checking TTD duplicates:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
