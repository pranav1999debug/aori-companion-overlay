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
    const { image, knownFaces, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const knownList = (knownFaces || []).map((f: any) => `- ${f.name}: ${f.description}`).join("\n");

    let systemPrompt: string;
    if (action === "identify") {
      systemPrompt = `You are a face recognition assistant for Aori Tatsumi (an AI companion).
Look at the image and identify any people visible.

Known people:
${knownList || "No known faces yet."}

If you recognize someone from the known list, respond with:
{"recognized": true, "name": "their name", "description": "brief update on their appearance"}

If it's a new person, respond with:
{"recognized": false, "description": "detailed physical description: hair color/style, skin tone, glasses, facial hair, approximate age, distinguishing features"}

ONLY return valid JSON. No other text.`;
    } else {
      systemPrompt = `You are helping save a face for future recognition.
Describe this person's face in detail for future identification: hair color/style, skin tone, face shape, glasses, facial hair, approximate age, distinguishing features.
Return ONLY a JSON: {"description": "detailed description here"}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: action === "identify" ? "Who is this person?" : "Describe this person's face for future recognition." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits needed" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Face analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "{}";

    // Extract JSON from response
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("aori-face error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
