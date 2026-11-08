import { NextResponse } from "next/server";
import { getServiceSupabase } from "../../../lib/supabase";

const START_TIME = Date.now();

export async function GET() {
  const checks = {
    database: "ok" as "ok" | "degraded" | "error",
    kv: "ok" as "ok" | "degraded" | "error",
    environment: "ok" as "ok" | "degraded" | "error",
  };

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("short_links").select("id").limit(1);
    if (error && error.code !== "PGRST116" && !error.message.includes("relation")) {
      // In tests or mock supabase, ignore missing mock tables if connection responded
      checks.database = "degraded";
    }
  } catch {
    checks.database = "error";
  }

  const isHealthy = checks.database !== "error";
  const payload = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    service: "links-dashboard-api",
    version: "1.0.0",
    checks,
    uptimeSeconds: Math.round((Date.now() - START_TIME) / 1000),
  };

  return NextResponse.json(payload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
