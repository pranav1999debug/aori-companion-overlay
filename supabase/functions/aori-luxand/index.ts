// Luxand Cloud face recognition proxy
// Docs: https://documentation.luxand.cloud
// - POST /photo/search   -> recognize faces in a photo
// - POST /person         -> enroll a new person (multipart: name + photos)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LUXAND_BASE = "https://api.luxand.cloud";

function base64ToBlob(b64: string, mime = "image/jpeg"): Blob {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LUXAND_API_KEY = Deno.env.get("LUXAND_API_KEY");
    if (!LUXAND_API_KEY) throw new Error("LUXAND_API_KEY not configured");

    const { action, image, name, collections } = await req.json();
    if (!action || !image) {
      return new Response(JSON.stringify({ error: "Missing action or image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blob = base64ToBlob(image);

    if (action === "identify") {
      // Recognize a face against the workspace's enrolled persons
      const fd = new FormData();
      fd.append("photo", blob, "frame.jpg");
      if (collections) fd.append("collections", collections);

      const r = await fetch(`${LUXAND_BASE}/photo/search/v2`, {
        method: "POST",
        headers: { token: LUXAND_API_KEY },
        body: fd,
      });
      const text = await r.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      // Normalize response: Luxand returns array of matches with name & probability
      const matches = Array.isArray(data) ? data : (data.faces || data.result || []);
      const best = Array.isArray(matches) && matches.length > 0
        ? matches.reduce((a: any, b: any) => ((b.probability ?? 0) > (a.probability ?? 0) ? b : a), matches[0])
        : null;

      return new Response(
        JSON.stringify({
          recognized: !!(best && (best.probability ?? 0) > 0.7 && best.name),
          name: best?.name || null,
          probability: best?.probability ?? 0,
          uuid: best?.uuid || best?.person_uuid || null,
          raw: data,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "enroll") {
      if (!name?.trim()) {
        return new Response(JSON.stringify({ error: "Missing name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("store", "1");
      fd.append("photos", blob, "enroll.jpg");

      const r = await fetch(`${LUXAND_BASE}/v2/person`, {
        method: "POST",
        headers: { token: LUXAND_API_KEY },
        body: fd,
      });
      const text = await r.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        return new Response(JSON.stringify({ error: "Enroll failed", details: data }), {
          status: r.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, uuid: data.uuid || data.id || null, name: name.trim(), raw: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aori-luxand error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
