import { NextRequest, NextResponse } from "next/server";
import { getBioProfile, saveBioProfile, BioProfile } from "@/lib/bioStore";

interface RouteContext {
  params: Promise<{ username: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { username } = await context.params;
  const profile = getBioProfile(username);
  return NextResponse.json({ success: true, data: profile });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { username } = await context.params;
    const body = (await request.json()) as BioProfile;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid profile body" }, { status: 400 });
    }
    body.username = username.toLowerCase().replace(/^@/, "");
    const res = saveBioProfile(body);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
