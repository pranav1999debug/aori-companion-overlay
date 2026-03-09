import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_INSTRUCTION = "Using this face as reference for the character's appearance, generate a full upper-body portrait (head, shoulders, and upper torso visible) of this same person/character. Keep the exact same face, hair, and style. The character should be wearing a casual outfit. IMPORTANT: The facial expression MUST match the emotion described below — change the face accordingly while keeping the same person's identity.";

const EMOTION_PROMPTS: Record<string, string> = {
  happy: `${BASE_INSTRUCTION} Expression: HAPPY — bright wide smile, raised cheeks, sparkling cheerful eyes, joyful and warm look.`,
  smirk: `${BASE_INSTRUCTION} Expression: SMIRK — one corner of the mouth raised in a smug half-smile, one eyebrow slightly raised, mischievous confident look.`,
  excited: `${BASE_INSTRUCTION} Expression: EXCITED — wide open sparkling eyes, big open-mouth smile, energetic and thrilled look, slightly leaning forward.`,
  angry: `${BASE_INSTRUCTION} Expression: ANGRY — deeply furrowed brows, narrowed fierce eyes, clenched jaw or gritted teeth, tense frustrated look.`,
  shy: `${BASE_INSTRUCTION} Expression: SHY — looking slightly away or downward, visible blush on cheeks, small timid smile, bashful and nervous body language.`,
  sad: `${BASE_INSTRUCTION} Expression: SAD — downturned mouth corners, droopy watery eyes, slightly furrowed brows, melancholic sorrowful look.`,
  love: `${BASE_INSTRUCTION} Expression: IN LOVE — heart-eyes or dreamy half-closed eyes, deep blush, warm adoring smile, swooning romantic look.`,
  proud: `${BASE_INSTRUCTION} Expression: PROUD — chin tilted slightly up, confident satisfied grin, chest slightly puffed, eyes gleaming with self-assurance.`,
  thinking: `${BASE_INSTRUCTION} Expression: THINKING — eyes looking upward or to the side, one hand touching chin, slightly pursed or neutral lips, contemplative curious look.`,
  confused: `${BASE_INSTRUCTION} Expression: CONFUSED — head tilted to one side, one eyebrow raised higher than the other, slight frown, bewildered puzzled look.`,
  sleepy: `${BASE_INSTRUCTION} Expression: SLEEPY — heavy half-closed droopy eyelids, open yawning mouth, relaxed slouching posture, tired drowsy look.`,
  jealous: `${BASE_INSTRUCTION} Expression: JEALOUS — narrowed suspicious side-glancing eyes, slight pout or pressed lips, arms crossed, envious displeased look.`,
  embarrassed: `${BASE_INSTRUCTION} Expression: EMBARRASSED — bright red blush across cheeks, wide surprised eyes, hands near face trying to hide, flustered panicked look.`,
  shock: `${BASE_INSTRUCTION} Expression: SHOCKED — extremely wide open eyes, jaw dropped open mouth, raised eyebrows, startled frozen look.`,
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
