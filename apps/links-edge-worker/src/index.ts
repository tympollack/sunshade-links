/**
 * apps/links-edge-worker/src/index.ts
 * SunShade Links Edge Worker Entrypoint
 */

export interface Env {
  LINKS_KV: KVNamespace;
  TELEMETRY_QUEUE: Queue<any>;
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/_health") {
      return new Response(JSON.stringify({ status: "healthy", service: "links-edge-worker" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("SunShade Links Edge Router", { status: 200 });
  },
};
