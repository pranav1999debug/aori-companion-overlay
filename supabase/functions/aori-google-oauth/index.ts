import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
};

const GOOGLE_CLIENT_ID = () => Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = () => Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = () => Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
].join(" ");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getAuthenticatedUser = async (authHeader: string) => {
  const supabase = createClient(SUPABASE_URL(), Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

const refreshGoogleAccessToken = async (authHeader: string | null) => {
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { user, error: authError } = await getAuthenticatedUser(authHeader);
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY());
  const { data: tokenRow, error: fetchError } = await adminClient
    .from("user_google_tokens")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !tokenRow) {
    return jsonResponse({ error: "No Google tokens found" }, 404);
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID(),
      client_secret: GOOGLE_CLIENT_SECRET(),
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const refreshData = await refreshRes.json();
  if (!refreshRes.ok) {
    return jsonResponse(
      { error: refreshData.error_description || refreshData.error || "Token refresh failed" },
      400,
    );
  }

  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

  const { error: updateError } = await adminClient
    .from("user_google_tokens")
    .update({
      access_token: refreshData.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ error: "Failed to persist refreshed token" }, 500);
  }

  return jsonResponse({ access_token: refreshData.access_token, expires_at: newExpiresAt });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  // Step 1: Generate consent URL OR refresh token
  if (req.method === "POST" && path !== "callback") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const body = await req.json().catch(() => ({}));
      if (body?.action === "refresh") {
        return await refreshGoogleAccessToken(authHeader);
      }

      const { user, error } = await getAuthenticatedUser(authHeader);
      if (error || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const redirectUri = body?.redirectUri;
      if (!redirectUri) {
        return jsonResponse({ error: "Missing redirect URI" }, 400);
      }

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID(),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: user.id,
      });

      return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    } catch (e) {
      return jsonResponse({ error: String(e) }, 500);
    }
  }

  // Step 2: Exchange code for tokens (POST callback / PUT)
  if (req.method === "PUT" || (req.method === "POST" && path === "callback")) {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { user, error: authError } = await getAuthenticatedUser(authHeader);
      if (authError || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { code, redirectUri } = await req.json();

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID(),
          client_secret: GOOGLE_CLIENT_SECRET(),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return jsonResponse({ error: tokenData.error_description || "Token exchange failed" }, 400);
      }

      const adminClient = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY());
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

      const { error: upsertError } = await adminClient
        .from("user_google_tokens")
        .upsert({
          user_id: user.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          scopes: SCOPES.split(" "),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return jsonResponse({ error: "Failed to store tokens" }, 500);
      }

      return jsonResponse({ success: true });
    } catch (e) {
      console.error("OAuth callback error:", e);
      return jsonResponse({ error: String(e) }, 500);
    }
  }

  // Backward-compatible token refresh endpoint
  if (req.method === "PATCH") {
    try {
      return await refreshGoogleAccessToken(req.headers.get("Authorization"));
    } catch (e) {
      return jsonResponse({ error: String(e) }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});