import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const keyNames = [
      "GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4",
      "GROQ_API_KEY_5", "GROQ_API_KEY_6", "GROQ_API_KEY_7", "GROQ_API_KEY_8",
      "GROQ_API_KEY_9", "GROQ_API_KEY_10",
    ];

    const keys: { name: string; key: string }[] = [];
    for (const name of keyNames) {
      const val = Deno.env.get(name);
      if (val) keys.push({ name, key: val });
    }

    const totalStored = keys.length;

    // Check each key's rate limit status using Groq's models endpoint (lightweight)
    const keyStatuses = await Promise.all(
      keys.map(async ({ name, key }) => {
        try {
          // Use a minimal TTS request to check rate limits
          const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "canopylabs/orpheus-v1-english",
              input: "test",
              voice: "hannah",
              response_format: "wav",
            }),
          });

          if (res.ok) {
            // Consume body
            await res.arrayBuffer();
            return { name, status: "available", used: 0, limit: 3600, retryIn: null, error: null };
          }

          const body = await res.text();
          
          if (res.status === 429) {
            // Parse rate limit info from error body
            const usedMatch = body.match(/Used (\d+)/);
            const limitMatch = body.match(/Limit (\d+)/);
            const retryMatch = body.match(/try again in (.+?)\./);
            return {
              name,
              status: "rate_limited",
              used: usedMatch ? parseInt(usedMatch[1]) : null,
              limit: limitMatch ? parseInt(limitMatch[1]) : 3600,
              retryIn: retryMatch ? retryMatch[1] : null,
              error: null,
            };
          }

          if (res.status === 400 && body.includes("terms")) {
            return { name, status: "terms_required", used: null, limit: null, retryIn: null, error: "Terms not accepted" };
          }

          return { name, status: "error", used: null, limit: null, retryIn: null, error: `HTTP ${res.status}` };
        } catch (e) {
          return { name, status: "error", used: null, limit: null, retryIn: null, error: e.message };
        }
      })
    );

    const available = keyStatuses.filter(k => k.status === "available").length;
    const rateLimited = keyStatuses.filter(k => k.status === "rate_limited").length;
    const errored = keyStatuses.filter(k => k.status === "terms_required" || k.status === "error").length;

    return new Response(
      JSON.stringify({
        totalStored,
        available,
        rateLimited,
        errored,
        keys: keyStatuses.map(k => ({
          name: k.name.replace("GROQ_API_KEY", "Key").replace("_", " "),
          status: k.status,
          usedPercent: k.used && k.limit ? Math.round((k.used / k.limit) * 100) : null,
          retryIn: k.retryIn,
          error: k.error,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
