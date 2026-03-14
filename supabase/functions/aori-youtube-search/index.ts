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
    const { query, accessToken, maxResults = 10 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "No search query provided", videos: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");

    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", "10");
    searchUrl.searchParams.set("maxResults", String(maxResults));

    // Prioritize API key (more reliable), fall back to access token
    const headers: Record<string, string> = {};
    if (GOOGLE_API_KEY) {
      searchUrl.searchParams.set("key", GOOGLE_API_KEY);
    } else if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    } else {
      return new Response(
        JSON.stringify({ error: "No API key or access token available", videos: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let res = await fetch(searchUrl.toString(), { headers });

    // If API key failed and we have an access token, try that
    if (!res.ok && GOOGLE_API_KEY && accessToken) {
      searchUrl.searchParams.delete("key");
      const retryHeaders = { "Authorization": `Bearer ${accessToken}` };
      res = await fetch(searchUrl.toString(), { headers: retryHeaders });
    }

    // If access token failed and we have API key, try that
    if (!res.ok && !GOOGLE_API_KEY && accessToken) {
      // Already tried access token, nothing to fall back to
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("YouTube search error:", errText);
      return new Response(
        JSON.stringify({ error: `YouTube API error: ${res.status}`, videos: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const videos = (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
    }));

    return new Response(
      JSON.stringify({ videos }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-youtube-search error:", e);
    return new Response(
      JSON.stringify({ error: String(e), videos: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
