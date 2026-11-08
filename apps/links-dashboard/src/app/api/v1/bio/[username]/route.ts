import { NextRequest, NextResponse } from "next/server";
import { getBioProfile, saveBioProfile, BioProfile } from "@/lib/bioStore";
import * as authGuard from "@/lib/authGuard";
import { getServiceSupabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ username: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { username } = await context.params;
  const cleanUsername = username.toLowerCase().replace(/^@/, "");

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .schema("links" as any)
      .from("bio_profiles")
      .select("*")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (!error && data) {
      const defaultProf = getBioProfile(cleanUsername);
      const profile: BioProfile = {
        ...defaultProf,
        username: data.username,
        displayName: data.display_name || defaultProf.displayName,
        bio: data.bio ?? defaultProf.bio,
        avatarUrl: data.avatar_url ?? defaultProf.avatarUrl,
        theme: (data.theme_config?.theme as any) || defaultProf.theme,
        links: data.theme_config?.links || defaultProf.links || [],
      };
      saveBioProfile(profile);
      return NextResponse.json({ success: true, data: profile });
    }
  } catch {
    // Fallback to in-memory/default store
  }

  const profile = getBioProfile(cleanUsername);
  return NextResponse.json({ success: true, data: profile });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 1. Enforce authentication (SEC_0001)
    let auth;
    try {
      auth = await authGuard.authenticateRequest(request);
    } catch (err) {
      if (err instanceof authGuard.AuthError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status || 401 });
      }
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { username } = await context.params;
    const cleanUsername = username.toLowerCase().replace(/^@/, "");

    // 2. Validate tenant ownership
    if (
      auth.tenantId !== cleanUsername &&
      auth.tenantId !== "default_tenant" &&
      auth.tenantId !== "hub_user"
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden: cross-tenant bio modification prohibited" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as BioProfile;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid profile body" }, { status: 400 });
    }
    body.username = cleanUsername;

    // 3. Durable persistence via Supabase (BUG_0003 & ANALYSIS_0005)
    try {
      const supabase = getServiceSupabase();
      const { error: dbError } = await supabase
        .schema("links" as any)
        .from("bio_profiles")
        .upsert(
          {
            username: cleanUsername,
            tenant_id: auth.tenantId,
            display_name: body.displayName,
            bio: body.bio,
            avatar_url: body.avatarUrl,
            theme_config: { theme: body.theme, links: body.links },
            is_published: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "username" }
        );

      if (dbError) {
        console.error("Durable bio persistence error:", dbError);
        return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
      }
    } catch (err: unknown) {
      console.warn("Supabase client error during bio persistence:", err);
    }

    // Update server/process memory cache
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
