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
    const { text } = await req.json();
    const groqKeys = [
      Deno.env.get("GROQ_API_KEY"),
      Deno.env.get("GROQ_API_KEY_2"),
      Deno.env.get("GROQ_API_KEY_3"),
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

    for (const key of groqKeys) {
      ttsResponse = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "canopylabs/orpheus-v1-english",
          input: expressiveText,
          voice: "hannah",
          response_format: "wav",
        }),
      });

      if (ttsResponse.ok) break;
      if (ttsResponse.status === 429) { console.warn("TTS key rate limited, trying next..."); continue; }
      break;
    }

    if (!ttsResponse || !ttsResponse.ok) {
      const status = ttsResponse?.status || 500;
      console.error("All TTS keys failed:", status);
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
