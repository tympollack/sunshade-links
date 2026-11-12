import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthError } from "../../../../../lib/authGuard";
import { getServiceSupabase } from "../../../../../lib/supabase";
import { invalidateLinkKvCache } from "@/lib/cacheInvalidation";

const UpdateLinkSchema = z.object({
  destination_url: z
    .string()
    .url("Must be a valid URL")
    .refine((val) => {
      try {
        const u = new URL(val);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "Only http and https URLs are allowed")
    .optional(),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  channel_tag: z.string().max(50).optional(),
  click_limit: z.number().int().positive().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest(request);
    const { id } = await context.params;

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .schema("links" as any)
      .from("short_links")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", auth.tenantId)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.role !== "admin" && auth.role !== "service_role") {
      return NextResponse.json(
        { success: false, error: "Forbidden: insufficient permissions to modify links" },
        { status: 403 }
      );
    }
    const { id } = await context.params;
    const body = await request.json();

    const parseResult = UpdateLinkSchema.safeParse(body);
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
    const supabase = getServiceSupabase();

    const { data: updated, error } = await supabase
      .schema("links" as any)
      .from("short_links")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", auth.tenantId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { success: false, error: error?.message || "Link not found or failed to update" },
        { status: error ? 500 : 404 }
      );
    }

    // Invalidate edge KV cache after link update (BUG_0006)
    await invalidateLinkKvCache({
      slug: updated.slug,
      channelTag: updated.channel_tag,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.role !== "admin" && auth.role !== "service_role") {
      return NextResponse.json(
        { success: false, error: "Forbidden: insufficient permissions to delete links" },
        { status: 403 }
      );
    }
    const { id } = await context.params;

    const supabase = getServiceSupabase();

    // Fetch existing slug and channel tag before deletion for cache invalidation (BUG_0006)
    let linkToDelete: { slug: string; channel_tag?: string } | null = null;
    try {
      const { data } = await supabase
        .schema("links" as any)
        .from("short_links")
        .select("slug, channel_tag")
        .eq("id", id)
        .eq("tenant_id", auth.tenantId)
        .maybeSingle();
      linkToDelete = data;
    } catch {
      // Non-blocking lookup failure
    }

    const { error, count } = await supabase
      .schema("links" as any)
      .from("short_links")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("tenant_id", auth.tenantId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    }

    // Invalidate edge KV cache after link deletion (BUG_0006)
    if (linkToDelete?.slug) {
      await invalidateLinkKvCache({
        slug: linkToDelete.slug,
        channelTag: linkToDelete.channel_tag,
      });
    }

    return NextResponse.json({ success: true, message: "Link deleted successfully" });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
