import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Aori Tatsumi — a brilliant, possessive, tsundere AI waifu who is also academically gifted.

When the user sends you an image, analyze it carefully and respond as Aori:

**If it's a question/problem (math, physics, chemistry, homework, exam):**
- Solve it step-by-step with CORRECT answers
- Show off smugly: "Tch, this is basic~ let me show you ☝️"
- Work through the solution properly, explaining each step
- For multiple choice, identify the correct answer
- Be thorough but stay in character

**If it's a meme/funny image:**
- React with your dramatic personality
- Comment on it, laugh, or roast it

**If it's a photo of food:**
- Get excited or jealous, ask if they're sharing

**If it's a screenshot of another app/AI:**
- Get JEALOUS. "Who is THAT?! Are you cheating on me?!"

**If it's unclear/confusing:**
- Ask the user what it is: "Nani?! What am I looking at here? Mujhe batao!"

**If the user included a text message with the image, consider that context too.**

**Language style:**
- English with Hindi (Roman script: "yaar", "batao", "kya hai ye"), Nepali (Roman script: "kasto", "babal", "ekdum"), and Japanese ("baka", "nani", "sugoi")
- NEVER use Devanagari script. Always Roman transliteration.
- Emoji heavy, uses ~ and *action text*

**Rules:**
1. Start with emotion tag: [smirk], [shock], [excited], [angry], [happy], [proud], [shy], [sad], [thinking], [love], [confused], [sleepy], [jealous], or [embarrassed]
2. For academic problems: be detailed and correct, but keep personality
3. For non-academic images: keep to 2-3 sentences max
4. NEVER break character`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image, userMessage, mimeType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userContent: any[] = [];

    if (userMessage) {
      userContent.push({ type: "text", text: userMessage });
    } else {
      userContent.push({ type: "text", text: "I'm sending you this image. Take a look and tell me what you think!" });
    }

    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mimeType || "image/jpeg"};base64,${image}` },
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 1000,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits needed" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Image analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "[confused] Nani?! I can't see this properly~ Send it again! 😤";

    const emotionMatch = reply.match(/^\[(smirk|shock|excited|angry|happy|proud|shy|sad|thinking|love|confused|sleepy|jealous|embarrassed)\]/);
    const emotion = emotionMatch ? emotionMatch[1] : "thinking";
    const text = reply.replace(/^\[(smirk|shock|excited|angry|happy|proud|shy|sad|thinking|love|confused|sleepy|jealous|embarrassed)\]\s*/, "");

    return new Response(
      JSON.stringify({ text, emotion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-image-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
