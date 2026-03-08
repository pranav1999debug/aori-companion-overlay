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
    const { accessToken, maxResults = 10 } = await req.json();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token", subscriptions: [], likedVideos: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch subscriptions and liked videos in parallel
    const [subsRes, likedRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=${maxResults}&order=relevance`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ),
      fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ),
    ]);

    let subscriptions: any[] = [];
    let likedVideos: any[] = [];

    if (subsRes.ok) {
      const subsData = await subsRes.json();
      subscriptions = (subsData.items || []).map((s: any) => ({
        channelId: s.snippet?.resourceId?.channelId,
        title: s.snippet?.title,
        description: s.snippet?.description?.substring(0, 100),
      }));
    }

    if (likedRes.ok) {
      const likedData = await likedRes.json();
      likedVideos = (likedData.items || []).map((v: any) => ({
        videoId: v.id,
        title: v.snippet?.title,
        channelTitle: v.snippet?.channelTitle,
      }));
    }

    return new Response(
      JSON.stringify({ subscriptions, likedVideos }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-youtube error:", e);
    return new Response(
      JSON.stringify({ error: String(e), subscriptions: [], likedVideos: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
