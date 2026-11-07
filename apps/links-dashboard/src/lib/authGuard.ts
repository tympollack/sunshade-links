import { getServiceSupabase } from "./supabase";

export interface AuthContext {
  tenantId: string;
  userId: string;
  role: "admin" | "member" | "service_role";
  authType: "api_key" | "jwt" | "dev";
}

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Verifies Bearer token or cookie from request headers
 */
export async function authenticateRequest(request: Request): Promise<AuthContext> {
  // Allow test / dev environment bypass if explicitly configured
  const devBypassKey = process.env.DEV_AUTH_BYPASS_KEY;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");

  if (!authHeader) {
    // Check for cookie token in browser context
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/sb-[a-z0-9_-]+-auth-token=([^;]+)/i) || cookieHeader.match(/sb-access-token=([^;]+)/i);
    if (match && match[1]) {
      return verifyJwtToken(decodeURIComponent(match[1]));
    }

    throw new AuthError("Missing Authorization header or session cookie", 401, "MISSING_CREDENTIALS");
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    throw new AuthError("Malformed Authorization header. Format: Bearer <token>", 401, "MALFORMED_HEADER");
  }

  const token = parts[1].trim();

  // 1. Check for API Key (prefix tk_live_ or tk_test_)
  if (token.startsWith("tk_live_") || token.startsWith("tk_test_")) {
    return verifyApiKey(token);
  }

  // 2. Dev Bypass Key match
  if (devBypassKey && timingSafeCompare(token, devBypassKey)) {
    return {
      tenantId: "ten_dev",
      userId: "usr_dev_admin",
      role: "admin",
      authType: "dev",
    };
  }

  // 3. Fallback to Supabase JWT verification
  return verifyJwtToken(token);
}

/**
 * Verifies live/test tenant API keys timing-safely
 */
async function verifyApiKey(apiKey: string): Promise<AuthContext> {
  const masterKey = process.env.SUNSHADE_API_KEY || process.env.LINKS_API_KEY;
  if (masterKey && timingSafeCompare(apiKey, masterKey)) {
    return {
      tenantId: "ten_master",
      userId: "usr_system",
      role: "service_role",
      authType: "api_key",
    };
  }

  // Query Supabase for matching tenant API key
  try {
    const supabase = getServiceSupabase();
    const { data: tenant, error } = await supabase
      .schema("tracker" as any)
      .from("tenants")
      .select("id, slug, role")
      .eq("api_key", apiKey)
      .single();

    if (!error && tenant) {
      return {
        tenantId: tenant.id,
        userId: `usr_${tenant.slug || tenant.id}`,
        role: (tenant.role as "admin" | "member") || "member",
        authType: "api_key",
      };
    }
  } catch {
    // Database check fallback
  }

  throw new AuthError("Invalid or revoked API key", 401, "INVALID_API_KEY");
}

/**
 * Verifies Supabase JWT token
 */
async function verifyJwtToken(token: string): Promise<AuthContext> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new AuthError(error?.message || "Invalid or expired JWT token", 401, "INVALID_TOKEN");
    }

    const tenantId =
      (data.user.app_metadata?.tenant_id as string) ||
      (data.user.user_metadata?.tenant_id as string) ||
      data.user.id;

    const role = (data.user.app_metadata?.role as "admin" | "member") || "member";

    return {
      tenantId,
      userId: data.user.id,
      role,
      authType: "jwt",
    };
  } catch (err: unknown) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Failed to authenticate JWT token", 401, "AUTH_FAILURE");
  }
}
