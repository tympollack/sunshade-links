import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthError } from "../../../../lib/authGuard";
import { getServiceSupabase } from "../../../../lib/supabase";

const CreateLinkSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Slug can only contain letters, numbers, dashes, and underscores"),
  destination_url: z.string().url("Must be a valid URL").refine((val) => {
    try {
      const u = new URL(val);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Only http and https URLs are allowed"),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  channel_tag: z.string().max(50).default("direct"),
  click_limit: z.number().int().positive().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const url = new URL(request.url);

    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
    const search = url.searchParams.get("search");
    const channel = url.searchParams.get("channel");
    const isActiveParam = url.searchParams.get("is_active");

    const supabase = getServiceSupabase();
    let query = supabase
      .schema("links" as any)
      .from("short_links")
      .select("*", { count: "exact" })
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`slug.ilike.%${search}%,title.ilike.%${search}%,destination_url.ilike.%${search}%`);
    }

    if (channel) {
      query = query.eq("channel_tag", channel);
    }

    if (isActiveParam !== null && isActiveParam !== undefined) {
      query = query.eq("is_active", isActiveParam === "true");
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.role !== "admin" && auth.role !== "service_role") {
      return NextResponse.json(
        { success: false, error: "Forbidden: insufficient permissions to create links" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const parseResult = CreateLinkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const payload = parseResult.data;
    const channelTag = payload.channel_tag || "direct";
    const supabase = getServiceSupabase();

    // Check for unique (slug, channel_tag) tuple across shared platform (BUG_0008)
    const { data: existing } = await supabase
      .schema("links" as any)
      .from("short_links")
      .select("id, tenant_id")
      .eq("slug", payload.slug)
      .eq("channel_tag", channelTag)
      .single();

    if (existing) {
      if (existing.tenant_id === auth.tenantId) {
        return NextResponse.json(
          { success: false, error: `Channel '${channelTag}' for slug '/${payload.slug}' already exists for this tenant.` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Slug '/${payload.slug}' with channel '${channelTag}' is already reserved or in use.` },
        { status: 409 }
      );
    }

    const { data: created, error } = await supabase
      .schema("links" as any)
      .from("short_links")
      .insert({
        tenant_id: auth.tenantId,
        slug: payload.slug,
        destination_url: payload.destination_url,
        title: payload.title || payload.slug,
        description: payload.description || null,
        channel_tag: payload.channel_tag,
        click_limit: payload.click_limit ?? null,
        expires_at: payload.expires_at ?? null,
        is_active: payload.is_active,
        trust_score: 100,
        trust_flags: {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
