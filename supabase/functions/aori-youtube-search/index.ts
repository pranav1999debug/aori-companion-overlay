import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SearchResult = {
  ok: boolean;
  status: number;
  data?: any;
  raw?: string;
};

const runSearch = async ({
  query,
  maxResults,
  apiKey,
  accessToken,
}: {
  query: string;
  maxResults: number;
  apiKey?: string;
  accessToken?: string;
}): Promise<SearchResult> => {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", String(maxResults));

  const headers: Record<string, string> = {};
  if (apiKey) {
    searchUrl.searchParams.set("key", apiKey);
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(searchUrl.toString(), { headers });
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    raw,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, accessToken, maxResults = 10 } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: "No search query provided", videos: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") || undefined;

    const attempts: string[] = [];
    let searchData: any = null;
    let finalStatus = 500;

    // 1) Prefer user access token (OAuth has YouTube Data API enabled by default)
    if (accessToken) {
      const tokenAttempt = await runSearch({ query, maxResults, accessToken });
      finalStatus = tokenAttempt.status;
      if (tokenAttempt.ok) {
        searchData = tokenAttempt.data;
      } else {
        attempts.push(`access_token:${tokenAttempt.status}`);
        console.error("YouTube token search failed:", tokenAttempt.raw);
      }
    }

    // 2) Fallback to API key if user token path failed/unavailable
    if (!searchData && GOOGLE_API_KEY) {
      const keyAttempt = await runSearch({ query, maxResults, apiKey: GOOGLE_API_KEY });
      finalStatus = keyAttempt.status;
      if (keyAttempt.ok) {
        searchData = keyAttempt.data;
      } else {
        attempts.push(`api_key:${keyAttempt.status}`);
        console.error("YouTube API key search failed:", keyAttempt.raw);
      }
    }

    if (!searchData) {
      const reason = attempts.length ? attempts.join(",") : "no_credentials";
      return new Response(
        JSON.stringify({ error: `YouTube API error: ${finalStatus} (${reason})`, videos: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const videos = (searchData.items || []).map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
    }));

    return new Response(JSON.stringify({ videos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aori-youtube-search error:", e);
    return new Response(JSON.stringify({ error: String(e), videos: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
