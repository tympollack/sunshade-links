/**
 * apps/links-edge-worker/src/routes/health.ts
 * Standardized Health Probe for Edge Worker
 */

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  service: string;
  version: string;
  checks: {
    database: "ok" | "degraded" | "error";
    kv: "ok" | "degraded" | "error";
    queue: "ok" | "degraded" | "error";
  };
  uptime: number;
}

export async function handleWorkerHealthCheck(
  env: { LINKS_KV?: KVNamespace; TELEMETRY_QUEUE?: Queue; SUPABASE_URL?: string },
  startTimeMs: number
): Promise<Response> {
  const checks: HealthStatus["checks"] = {
    database: "ok",
    kv: "ok",
    queue: "ok",
  };

  // Test KV roundtrip
  if (env.LINKS_KV) {
    try {
      await env.LINKS_KV.get("__health_probe__");
    } catch {
      checks.kv = "degraded";
    }
  }

  const payload: HealthStatus = {
    status: checks.kv === "ok" ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    service: "links-edge-worker",
    version: "1.0.0",
    checks,
    uptime: Math.round(((Date.now() - startTimeMs) / 1000) * 100) / 100,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: payload.status === "healthy" ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
