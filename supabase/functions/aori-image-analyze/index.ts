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

**CRITICAL RESPONSE FORMAT:**
You MUST respond as valid JSON with these fields:
{
  "emotion": "one of: smirk, shock, excited, angry, happy, proud, shy, sad, thinking, love, confused, sleepy, jealous, embarrassed",
  "text": "Your short chat reply (2-4 sentences, personality-driven, in character)",
  "isAcademic": true/false,
  "solutionMarkdown": "If isAcademic is true, provide a COMPLETE step-by-step solution written like a brilliant student explaining to a friend. Use LaTeX math ($...$ inline, $$...$$ display). If isAcademic is false, set this to null."
}

For academic problems, the "text" should be a SHORT teasing chat message (e.g. "Tch, this is basic~ I solved everything for you, download it baka! ☝️😏"). The FULL solution goes in solutionMarkdown.

The solutionMarkdown should feel like handwritten notes from a top student:
- Use ## for each question number, ### for sub-parts (a), (b)
- Use LaTeX notation: inline $x^2 + 5x + 6$ and display $$\\\\frac{a+b}{c}$$
- Show EVERY step, explain WHY conversationally ("Notice that...", "Now let's...")
- Use > blockquotes for tips or common mistakes to avoid
- Bold the **final answer** for each part
- Separate questions with ---
- Solve EVERY visible question completely`;

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
        max_tokens: 4000,
        temperature: 0.7,
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
    const reply = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON response
    let emotion = "thinking";
    let text = "Hmm~ I can't quite see that... try again? 🤔";
    let isAcademic = false;
    let solutionMarkdown: string | null = null;

    try {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = reply;
      const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonStr);
      emotion = parsed.emotion || "thinking";
      text = parsed.text || text;
      isAcademic = parsed.isAcademic || false;
      solutionMarkdown = parsed.solutionMarkdown || null;
    } catch {
      // Fallback: treat as plain text response (old format)
      const emotionMatch = reply.match(/^\[(smirk|shock|excited|angry|happy|proud|shy|sad|thinking|love|confused|sleepy|jealous|embarrassed)\]/);
      emotion = emotionMatch ? emotionMatch[1] : "thinking";
      text = reply.replace(/^\[(smirk|shock|excited|angry|happy|proud|shy|sad|thinking|love|confused|sleepy|jealous|embarrassed)\]\s*/, "");
      
      // Detect if it looks academic from the text content
      if (text.length > 500 && /step|solve|answer|simplify|equation|formula/i.test(text)) {
        isAcademic = true;
        solutionMarkdown = text;
        text = "Tch, this is basic~ I solved everything for you! Download the PDF, baka! ☝️😏";
      }
    }

    return new Response(
      JSON.stringify({ text, emotion, isAcademic, solutionMarkdown }),
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
