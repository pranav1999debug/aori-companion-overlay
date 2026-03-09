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
    const { audio, mimeType } = await req.json();
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

    if (!audio) {
      return new Response(
        JSON.stringify({ error: "No audio provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode base64 audio to binary
    const binaryStr = atob(audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`[STT] Audio size: ${bytes.length} bytes, mimeType: ${mimeType || "not provided"}, first4: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    // Detect actual format from magic bytes
    let detectedType = mimeType || "audio/webm";
    let ext = "webm";
    
    // Check magic bytes
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      // EBML header = WebM/Matroska
      detectedType = "audio/webm";
      ext = "webm";
    } else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      // OggS header
      detectedType = "audio/ogg";
      ext = "ogg";
    } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      // RIFF header = WAV
      detectedType = "audio/wav";
      ext = "wav";
    } else {
      // Unknown format — try sending as webm anyway
      console.warn(`[STT] Unknown magic bytes, defaulting to webm`);
    }

    console.log(`[STT] Detected format: ${detectedType} (.${ext})`);

    // Build FormData with a proper File object for each attempt
    // (FormData can only be consumed once by fetch, so we rebuild per key)
    let response: Response | null = null;
    let lastErrorBody = "";

    for (const key of groqKeys) {
      try {
        const file = new File([bytes.buffer], `audio.${ext}`, { type: detectedType });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("model", "whisper-large-v3-turbo");
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
        // 400 = bad audio data, won't fix with another key
        if (response.status === 400) { break; }
        break;
      } catch (fetchErr) {
        console.error(`[STT] Fetch error:`, fetchErr);
        continue;
      }
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      console.error(`[STT] All keys failed. Last error: ${lastErrorBody}`);
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
