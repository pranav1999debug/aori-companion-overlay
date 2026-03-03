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
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not configured");

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean text: strip emojis and action markers
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

    // Use Gemini's TTS model with the AI Studio API key
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GOOGLE_API_KEY}`;

    const ttsBody = {
      contents: [{
        parts: [{ text: `Say this with a cute, energetic anime girl voice: ${clean}` }]
      }],
      generationConfig: {
        response_modalities: ["AUDIO"],
        speech_config: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Kore" // Young female voice, fits Aori's character
            }
          }
        }
      }
    };

    const ttsResponse = await fetch(ttsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody),
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("Gemini TTS error:", ttsResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `TTS API error: ${ttsResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ttsData = await ttsResponse.json();
    const audioPart = ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!audioPart?.data) {
      console.error("No audio data in response:", JSON.stringify(ttsData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "No audio generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ audio: audioPart.data, mimeType: audioPart.mimeType || "audio/wav" }),
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
