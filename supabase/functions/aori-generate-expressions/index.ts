import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_INSTRUCTION = `Use the uploaded image as the ONLY identity reference.

CRITICAL IDENTITY PRESERVATION: Preserve the exact same person including facial identity, eye shape, nose, lips, skin tone, hairstyle, hair color, and overall appearance. The generated image must clearly look like the SAME person as the reference image. Use strong identity preservation.

Convert the reference into a full body character from head to toe with natural realistic human proportions. Show the ENTIRE body: head, torso, arms, hands, legs, feet — all clearly visible. The character should wear a casual stylish outfit consistent with the reference.

Image style: ultra realistic photography, natural lighting, sharp focus, high detail skin texture, 85mm portrait lens look. If the reference is anime/cartoon/illustrated, match that SAME style instead. Do NOT convert between styles.

Framing: full body visible from head to toe.

Background: PERFECTLY PURE SOLID WHITE BACKGROUND (#FFFFFF). No background, no room, no environment, no objects, no shadows, no text, no watermark, no ground plane, no gradients, no checkerboard, no patterns. Isolated character only on flat pure white — PNG cutout style.

The FACIAL EXPRESSION and FULL BODY POSE must both strongly reflect the emotion below.`;

const EMOTION_PROMPTS: Record<string, string> = {
  happy: `${BASE_INSTRUCTION} Emotion: HAPPY — smiling warmly, relaxed posture, friendly open pose. Arms slightly open or hands clasped cheerfully.`,
  smirk: `${BASE_INSTRUCTION} Emotion: SMUG — confident half smile, one eyebrow slightly raised, arms crossed or one hand on hip. Weight shifted to one leg, cocky relaxed lean.`,
  excited: `${BASE_INSTRUCTION} Emotion: EXCITED — big joyful smile, energetic pose, both arms raised or jumping slightly. Whole body bursting with enthusiasm.`,
  angry: `${BASE_INSTRUCTION} Emotion: ANGRY — serious angry expression, eyebrows lowered, strong posture with crossed arms. Feet planted wide, tense shoulders.`,
  shy: `${BASE_INSTRUCTION} Emotion: SHY — soft shy smile, head slightly tilted down, hands together in front of body. Knees slightly turned inward, shoulders hunched.`,
  sad: `${BASE_INSTRUCTION} Emotion: SAD — sad expression, shoulders slightly lowered, hands loosely together. Head tilted down, weight sagging.`,
  love: `${BASE_INSTRUCTION} Emotion: LOVE — affectionate expression, hands forming a heart shape or touching chest. Dreamy eyes, slight blush.`,
  proud: `${BASE_INSTRUCTION} Emotion: PROUD — confident smile, standing tall with hands on hips. Chin up, chest out, power pose.`,
  thinking: `${BASE_INSTRUCTION} Emotion: THINKING — thoughtful expression, one hand touching chin. Head slightly tilted, eyes looking up or to the side.`,
  confused: `${BASE_INSTRUCTION} Emotion: CONFUSED — puzzled expression, head tilted, palms slightly raised in a shrug gesture. Off-balance stance.`,
  sleepy: `${BASE_INSTRUCTION} Emotion: SLEEPY — tired eyes, slight yawn or relaxed sleepy posture. One hand rubbing eye, slouched body.`,
  jealous: `${BASE_INSTRUCTION} Emotion: JEALOUS — annoyed jealous look, side glance, arms folded. Body turned slightly away but eyes looking back.`,
  embarrassed: `${BASE_INSTRUCTION} Emotion: EMBARRASSED — blushing face, shy posture, hands near cheeks. Body shrinking inward, knees turned in.`,
  shock: `${BASE_INSTRUCTION} Emotion: SHOCKED — wide eyes and open mouth, surprised body language with raised hands. Body leaning back, frozen startled pose.`,
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
