// Catbox.moe image upload proxy
// Uploads base64 image -> catbox.moe via userhash, returns hosted URL
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const userhash = Deno.env.get("CATBOX_USERHASH") || "";
    const { image, filename } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blob = base64ToBlob(image);
    const fd = new FormData();
    fd.append("reqtype", "fileupload");
    if (userhash) fd.append("userhash", userhash);
    fd.append("fileToUpload", blob, filename || `aori-${Date.now()}.jpg`);

    const r = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: fd });
    const text = (await r.text()).trim();

    if (!r.ok || !text.startsWith("https://")) {
      return new Response(JSON.stringify({ error: "Catbox upload failed", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aori-catbox-upload error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
