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
    const groqKeys = [
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

    let audioFile: File;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Client sent FormData with binary audio file directly
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ error: "No audio file in form data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      audioFile = file;
    } else {
      // Legacy: JSON with base64-encoded audio
      const { audio, mimeType } = await req.json();
      if (!audio) {
        return new Response(
          JSON.stringify({ error: "No audio provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const binaryStr = atob(audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const ext = mimeType?.includes("wav") ? "wav" : mimeType?.includes("ogg") ? "ogg" : "webm";
      const fileType = mimeType || "audio/webm";
      audioFile = new File([bytes], `audio.${ext}`, { type: fileType });
    }

    // Log audio info
    const fileBytes = new Uint8Array(await audioFile.slice(0, 4).arrayBuffer());
    const first4 = Array.from(fileBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[STT] Audio size: ${audioFile.size} bytes, type: ${audioFile.type}, name: ${audioFile.name}, first4: ${first4}`);

    let response: Response | null = null;
    let lastErrorBody = "";

    for (const key of groqKeys) {
      try {
        // Rebuild FormData for each attempt (FormData is consumed by fetch)
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("language", "hi");
        formData.append("prompt", "This is a conversation in Hinglish (Hindi mixed with English). The speaker uses both Hindi and English words freely.");
        formData.append("response_format", "verbose_json");

        response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: formData,
        });

        if (response.ok) break;
        
        lastErrorBody = await response.text();
        console.error(`[STT] Key failed with ${response.status}: ${lastErrorBody}`);
        
        if (response.status === 429) { continue; }
        if (response.status === 400) { break; } // bad audio won't fix with another key
        break;
      } catch (fetchErr) {
        console.error(`[STT] Fetch error:`, fetchErr);
        continue;
      }
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      console.error(`[STT] Failed. Last error: ${lastErrorBody}`);
      return new Response(
        JSON.stringify({ error: status === 429 ? "Rate limited on all keys" : `STT API error: ${status}`, details: lastErrorBody }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log(`[STT] Detected language: ${data.language || "unknown"}, text: "${(data.text || "").substring(0, 80)}"`);
    return new Response(
      JSON.stringify({ text: data.text || "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-stt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});