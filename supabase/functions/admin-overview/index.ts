import { createClient } from "npm:@supabase/supabase-js@2";

const configuredOrigin = Deno.env.get("APP_ORIGIN") ?? "https://sooull.vercel.app";
const allowedOrigins = new Set([configuredOrigin, "https://sooull.vercel.app", "https://soull-admin.vercel.app", "https://soull-admin-console.vercel.app", "http://localhost:5173", "http://localhost:5174"]);

function headers(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : configuredOrigin;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function json(status: number, data: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, origin);
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: "Origin is not allowed." }, origin);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token) return json(401, { error: "Sign in is required." }, origin);
  if (!url || !anonKey || !serviceKey) return json(503, { error: "Administrator service is not configured." }, origin);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serverClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Your session is invalid. Sign in again." }, origin);

    const [{ data: role, error: roleError }, { data: assurance, error: assuranceError }] = await Promise.all([
      userClient.rpc("current_admin_role"),
      userClient.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (roleError) {
      console.error("admin role check failed", roleError);
      return json(503, { error: "Administrator authorization could not be checked." }, origin);
    }
    if (!role) return json(403, { error: "This account is not authorized for SOOULL administration." }, origin);
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      return json(403, { error: "Administrator access requires a verified second authentication factor." }, origin);
    }

    const payload = await req.json().catch(() => ({}));
    const action = payload?.action === "users" ? "users" : payload?.action === "audit" ? "audit" : "overview";
    const requiredPermission = action === "users" ? "users.view" : action === "audit" ? "audit.view" : "dashboard.view";
    const { data: permitted, error: permissionError } = await userClient.rpc("admin_has_permission", {
      p_permission: requiredPermission,
    });
    if (permissionError) {
      console.error("admin permission check failed", permissionError);
      return json(503, { error: "Administrator permissions could not be checked." }, origin);
    }
    if (permitted !== true) {
      return json(403, { error: "Your administrator role does not permit this action." }, origin);
    }

    if (action === "audit") {
      const { data: rows, error: auditReadError } = await serverClient
        .schema("private")
        .from("admin_audit_logs")
        .select("id,actor_id,target_user_id,action,details,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (auditReadError) {
        console.error("admin audit history read failed", auditReadError);
        return json(503, { error: "Administrator audit history is temporarily unavailable." }, origin);
      }
      const actorIds = [...new Set((rows ?? []).map((row) => row.actor_id).filter(Boolean))];
      const targetIds = [...new Set((rows ?? []).map((row) => row.target_user_id).filter(Boolean))];
      const ids = [...new Set([...actorIds, ...targetIds])];
      const emailMap = new Map<string, string>();
      await Promise.all(ids.map(async (id) => {
        const { data } = await serverClient.auth.admin.getUserById(id);
        if (data?.user?.email) emailMap.set(id, data.user.email);
      }));
      const audit = (rows ?? []).map((row) => ({
        ...row,
        actor_email: emailMap.get(row.actor_id) ?? null,
        target_email: row.target_user_id ? emailMap.get(row.target_user_id) ?? null : null,
      }));
      return json(200, { audit }, origin);
    }

    if (action === "users") {
      const page = Math.max(1, Math.min(100000, Number(payload?.page) || 1));
      const perPage = Math.max(10, Math.min(50, Number(payload?.perPage) || 25));
      const { data: userPage, error: usersError } = await serverClient.auth.admin.listUsers({ page, perPage });
      if (usersError) {
        console.error("admin user list failed", usersError);
        return json(503, { error: "Customer account data is temporarily unavailable." }, origin);
      }
      const authUsers = userPage?.users ?? [];
      const ids = authUsers.map((item) => item.id);
      const { data: profiles, error: profilesError } = ids.length
        ? await serverClient.from("profiles").select("id,first_name,last_name").in("id", ids)
        : { data: [], error: null };
      if (profilesError) {
        console.error("admin profile labels failed", profilesError);
        return json(503, { error: "Customer profile labels are temporarily unavailable." }, origin);
      }
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const users = authUsers.map((item) => {
        const profile = profileMap.get(item.id);
        return {
          id: item.id,
          email: item.email ?? "",
          name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          created_at: item.created_at,
          last_sign_in_at: item.last_sign_in_at ?? null,
          email_confirmed_at: item.email_confirmed_at ?? null,
          banned_until: item.banned_until ?? null,
        };
      });
      const { error: auditError } = await serverClient.rpc("admin_record_audit", {
        p_actor_id: authData.user.id,
        p_action: "admin.customers.listed",
        p_target_user_id: null,
        p_details: { page, perPage, returned: users.length },
      });
      if (auditError) {
        console.error("admin audit write failed", auditError);
        return json(503, { error: "Administrator audit logging is unavailable. Customer lookup is paused." }, origin);
      }
      return json(200, { users, page, perPage, hasMore: users.length === perPage }, origin);
    }

    const { data: metrics, error: metricsError } = await serverClient.rpc("admin_metrics");
    if (metricsError) {
      console.error("admin metrics query failed", metricsError);
      return json(503, { error: "Platform metrics are temporarily unavailable." }, origin);
    }

    const { error: auditError } = await serverClient.rpc("admin_record_audit", {
      p_actor_id: authData.user.id,
      p_action: "admin.dashboard.viewed",
      p_target_user_id: null,
      p_details: { role },
    });
    if (auditError) {
      console.error("admin audit write failed", auditError);
      return json(503, { error: "Administrator audit logging is unavailable. Dashboard access is paused." }, origin);
    }

    return json(200, {
      role,
      metrics: metrics ?? {},
      generatedAt: new Date().toISOString(),
    }, origin);
  } catch (error) {
    console.error("admin-overview failed", error);
    return json(500, { error: "The administrator dashboard could not be loaded." }, origin);
  }
});
