import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { text, voice: requestedVoice } = await req.json();

    // Try to get user's own API key first
    const authHeader = req.headers.get("Authorization");
    let userKey: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data } = await sb.from("user_api_keys").select("api_key").eq("service", "groq").eq("is_active", true).maybeSingle();
        if (data?.api_key) userKey = data.api_key;
      } catch {}
    }

    const groqKeys = [
      ...(userKey ? [userKey] : []),
      Deno.env.get("GROQ_API_KEY"),
      Deno.env.get("GROQ_API_KEY_2"),
      Deno.env.get("GROQ_API_KEY_3"),
      Deno.env.get("GROQ_API_KEY_4"),
      Deno.env.get("GROQ_API_KEY_5"),
      Deno.env.get("GROQ_API_KEY_6"),
      Deno.env.get("GROQ_API_KEY_7"),
      Deno.env.get("GROQ_API_KEY_8"),
      Deno.env.get("GROQ_API_KEY_9"),
      Deno.env.get("GROQ_API_KEY_10"),
    ].filter(Boolean) as string[];
    if (!groqKeys.length) throw new Error("No GROQ API keys configured");

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean text for TTS
    const clean = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[~*💙]/gu, "")
      .replace(/\*[^*]+\*/g, "")
      .trim();

    if (!clean) {
      return new Response(
        JSON.stringify({ error: "Empty text after cleaning" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add vocal direction for expressiveness
    const expressiveText = `[cheerful] ${clean}`;

    let ttsResponse: Response | null = null;

    for (let i = 0; i < groqKeys.length; i++) {
      const key = groqKeys[i];
      try {
        ttsResponse = await fetch("https://api.groq.com/openai/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "canopylabs/orpheus-v1-english",
            input: expressiveText,
            voice: requestedVoice || "hannah",
            response_format: "wav",
          }),
        });

        if (ttsResponse.ok) break;
        // Capture and log the actual error body from Groq
        let errorBody = "";
        try {
          errorBody = await ttsResponse.text();
        } catch {}
        console.error(`[${new Date().toISOString()}] TTS key ${i + 1} failed | Status: ${ttsResponse.status} | Body: ${errorBody}`);
      } catch (fetchErr) {
        console.error(`[${new Date().toISOString()}] TTS key ${i + 1} fetch exception:`, fetchErr);
      }
    }

    if (!ttsResponse || !ttsResponse.ok) {
      const status = ttsResponse?.status || 500;
      console.error(`[${new Date().toISOString()}] All TTS keys exhausted | Final status: ${status}`);
      return new Response(
        JSON.stringify({ error: status === 429 ? "rate_limited" : `TTS API error: ${status}`, message: "TTS failed" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Groq returns raw audio bytes — convert to base64
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    let binary = "";
    for (let i = 0; i < audioBytes.length; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    const audioBase64 = btoa(binary);

    return new Response(
      JSON.stringify({ audio: audioBase64, mimeType: "audio/wav" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-tts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
