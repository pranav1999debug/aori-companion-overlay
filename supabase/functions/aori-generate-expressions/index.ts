import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMOTION_PROMPTS: Record<string, string> = {
  happy: "Edit this character image to show a happy, joyful expression with a bright smile and cheerful eyes. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  smirk: "Edit this character image to show a smug, mischievous smirk expression with one eyebrow slightly raised. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  excited: "Edit this character image to show an excited, energetic expression with wide sparkling eyes and an open enthusiastic smile. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  angry: "Edit this character image to show an angry, frustrated expression with furrowed brows, narrowed eyes, and a frown or gritted teeth. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  shy: "Edit this character image to show a shy, bashful expression with a slight blush, averted gaze, and a small nervous smile. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  sad: "Edit this character image to show a sad, melancholic expression with downturned mouth, droopy eyes, and a sorrowful look. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  love: "Edit this character image to show a loving, adoring expression with heart-shaped or sparkling eyes, a warm dreamy smile, and a deep blush. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  proud: "Edit this character image to show a proud, confident expression with chin slightly raised, a satisfied grin, and eyes gleaming with self-assurance. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  thinking: "Edit this character image to show a thoughtful, contemplative expression with one hand near the chin, eyes looking upward, and a curious pondering look. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  confused: "Edit this character image to show a confused, puzzled expression with a tilted head, raised eyebrow, and a bewildered or uncertain look. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  sleepy: "Edit this character image to show a sleepy, drowsy expression with half-closed droopy eyes, a yawn or relaxed mouth, and a tired look. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  jealous: "Edit this character image to show a jealous, envious expression with narrowed suspicious eyes, a slight pout, and a displeased or covetous look. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  embarrassed: "Edit this character image to show an embarrassed, flustered expression with a deep blush, wide surprised eyes, and hands near the face in a flustered gesture. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
  shock: "Edit this character image to show a shocked, surprised expression with wide open eyes, an open mouth in surprise, and raised eyebrows. Keep the same character, outfit, art style, and proportions exactly the same. Only change the facial expression.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { baseImage, emotion, userId } = await req.json();
    if (!baseImage || !emotion || !userId) {
      throw new Error("Missing baseImage, emotion, or userId");
    }

    const prompt = EMOTION_PROMPTS[emotion];
    if (!prompt) throw new Error(`Unknown emotion: ${emotion}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Generating ${emotion} expression for user ${userId}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: baseImage } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please wait and try again" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits needed" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage) {
      throw new Error("No image generated by AI");
    }

    // Upload to storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Convert base64 to Uint8Array
    const base64Data = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const path = `${userId}/${emotion}.png`;
    const { error: uploadError } = await supabase.storage
      .from("character-avatars")
      .upload(path, bytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("character-avatars")
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    return new Response(
      JSON.stringify({ success: true, emotion, imageUrl: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-generate-expressions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
