import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_INSTRUCTION = `Using this face as the ONLY reference for the character's identity and ART STYLE, generate a FULL-BODY illustration from HEAD TO TOES of this EXACT same character as a TRANSPARENT PNG CUTOUT with NO BACKGROUND AT ALL — completely transparent behind the character. CRITICAL: You MUST preserve the EXACT SAME ART STYLE as the reference image — if the reference is a REALISTIC photo/render, generate a REALISTIC output. If the reference is anime/cartoon, generate anime/cartoon. Do NOT convert realistic images to anime or vice versa. There must be ZERO background — no white, no color, no ground, no shadows, no scenery, no props, no gradients, no effects. ONLY the character with a fully transparent background, like a sticker with the background completely removed. Show the ENTIRE body: head, torso, arms, hands, legs, feet — all visible. The character should wear a casual stylish outfit consistent with the reference. The BODY LANGUAGE and POSE must strongly reflect the emotion below, not just the face. Keep the character's face, hair color, skin tone, and identity identical to the reference image. CRITICAL: Change both the FACIAL EXPRESSION and the FULL BODY POSE to match the emotion.`;

const EMOTION_PROMPTS: Record<string, string> = {
  happy: `${BASE_INSTRUCTION} Emotion: HAPPY — beaming wide smile, eyes sparkling with joy, arms open or hands clasped together cheerfully, relaxed upright posture, maybe a little bounce in stance. Whole body radiates warmth and friendliness.`,
  smirk: `${BASE_INSTRUCTION} Emotion: SMIRK — one corner of mouth raised smugly, one eyebrow cocked, arms crossed confidently or one hand on hip, weight shifted to one leg, cocky relaxed lean. Body says "I know something you don't."`,
  excited: `${BASE_INSTRUCTION} Emotion: EXCITED — huge open-mouth grin, wide sparkling eyes, fists pumped up or arms raised in celebration, leaning forward on toes, energetic dynamic pose. Whole body bursting with enthusiasm.`,
  angry: `${BASE_INSTRUCTION} Emotion: ANGRY — deeply furrowed brows, gritted teeth or snarl, clenched fists at sides, tense shoulders raised, feet planted wide in aggressive stance, leaning forward slightly. Body is coiled with fury.`,
  shy: `${BASE_INSTRUCTION} Emotion: SHY — looking down or to the side, visible blush, one arm holding the other arm, knees slightly turned inward, shoulders hunched in, small timid smile. Body language screams bashful and nervous.`,
  sad: `${BASE_INSTRUCTION} Emotion: SAD — downturned mouth, watery droopy eyes, shoulders slumped forward, arms hanging limp or hugging self, head tilted down, weight sagging. Whole body looks defeated and melancholic.`,
  love: `${BASE_INSTRUCTION} Emotion: IN LOVE — dreamy half-closed eyes with hearts or sparkles, deep blush, hands clasped near chest or cheek, slight swaying pose, knees slightly bent inward. Body melting with adoration.`,
  proud: `${BASE_INSTRUCTION} Emotion: PROUD — chin up, confident grin, chest puffed out, hands on hips in a power pose or arms crossed with satisfaction, feet planted firmly, tall upright posture. Body exudes self-assurance.`,
  thinking: `${BASE_INSTRUCTION} Emotion: THINKING — eyes looking up or to the side, one hand on chin or touching temple, slight head tilt, other arm supporting the thinking arm, weight shifted to one leg. Contemplative curious stance.`,
  confused: `${BASE_INSTRUCTION} Emotion: CONFUSED — head tilted, one eyebrow raised, slight frown, one hand scratching head or palms up in a shrug gesture, off-balance stance. Body says "I have no idea what's going on."`,
  sleepy: `${BASE_INSTRUCTION} Emotion: SLEEPY — heavy droopy eyelids, yawning mouth, one hand rubbing eye, slouched posture, head tilting to one side, knees slightly bent as if about to fall asleep standing. Body is completely drained.`,
  jealous: `${BASE_INSTRUCTION} Emotion: JEALOUS — narrowed side-glancing eyes, slight pout, arms tightly crossed, body turned slightly away but eyes looking back, tense hunched shoulders. Envious and displeased body language.`,
  embarrassed: `${BASE_INSTRUCTION} Emotion: EMBARRASSED — bright red face, wide panicked eyes, both hands covering cheeks or mouth, knees turned inward, body shrinking and cringing. Full-body flustered reaction.`,
  shock: `${BASE_INSTRUCTION} Emotion: SHOCKED — jaw dropped wide open, eyes huge and round, hands up near face with fingers spread, body leaning back, one foot stepping back. Completely frozen startled pose.`,
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
        model: "google/gemini-3-pro-image-preview",
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
