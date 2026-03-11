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
    const { characterQuery } = await req.json();

    if (!characterQuery || typeof characterQuery !== "string") {
      return new Response(
        JSON.stringify({ error: "No character query provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an anime/manga/game character encyclopedia. Given a character name (and optionally their series), return accurate details in JSON format.

Return ONLY valid JSON with these fields:
{
  "character_name": "Full canonical name (Japanese romanized)",
  "character_personality": "Detailed personality description (200-300 words). Include key traits, behavioral patterns, how they treat people they care about, their quirks, strengths, weaknesses. Write as if describing how an AI companion should roleplay this character.",
  "character_speaking_style": "How they speak. Include catchphrases, verbal tics, speech patterns, language mixing habits, formality level, and 2-3 famous dialogue examples from the series. Format famous lines as: 'Famous lines: \"line1\", \"line2\"'",
  "character_appearance": "Physical description for AI image generation. Include hair color/style, eye color, skin tone, typical outfit, body type, and notable features. Specify if anime style.",
  "character_gender": "male" or "female",
  "series": "Name of the anime/manga/game series"
}

Be accurate to the source material. If unsure about a character, still provide your best knowledge. For the speaking style, include actual famous dialogue quotes from the series translated to English with the original Japanese in parentheses if applicable.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Look up this character: ${characterQuery}` },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    try {
      const parsed = JSON.parse(jsonStr.trim());
      return new Response(
        JSON.stringify({ success: true, character: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      // Try to salvage - find any JSON object in the response
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        return new Response(
          JSON.stringify({ success: true, character: parsed }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Could not parse AI response as JSON");
    }
  } catch (e) {
    console.error("aori-character-lookup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
