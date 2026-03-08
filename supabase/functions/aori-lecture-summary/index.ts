import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Fetch the video page to extract captions
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
    });
    const html = await pageRes.text();

    // Extract captions JSON from the page
    const captionsMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"/s);
    if (!captionsMatch) return null;

    let captionsJson;
    try {
      // Find the complete JSON object
      const startIdx = html.indexOf('"captions":');
      if (startIdx === -1) return null;
      let depth = 0;
      let jsonStart = -1;
      let jsonEnd = -1;
      for (let i = startIdx + 11; i < html.length; i++) {
        if (html[i] === '{') {
          if (depth === 0) jsonStart = i;
          depth++;
        } else if (html[i] === '}') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      if (jsonStart === -1 || jsonEnd === -1) return null;
      captionsJson = JSON.parse(html.substring(jsonStart, jsonEnd));
    } catch {
      return null;
    }

    const tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) return null;

    // Prefer English, fallback to first available
    const enTrack = tracks.find((t: any) => t.languageCode === "en") || tracks[0];
    const captionUrl = enTrack.baseUrl;

    const captionRes = await fetch(captionUrl);
    const captionXml = await captionRes.text();

    // Parse XML captions
    const textMatches = captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
    const lines: string[] = [];
    for (const m of textMatches) {
      const text = m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (text) lines.push(text);
    }

    return lines.join(" ");
  } catch (e) {
    console.error("Transcript fetch error:", e);
    return null;
  }
}

async function getVideoInfo(videoId: string, accessToken?: string): Promise<{ title: string; channel: string; duration: string } | null> {
  try {
    const headers: Record<string, string> = {};
    let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}`;

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    } else {
      const apiKey = Deno.env.get("GOOGLE_API_KEY");
      if (apiKey) url += `&key=${apiKey}`;
      else return null;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      title: item.snippet?.title || "Unknown",
      channel: item.snippet?.channelTitle || "Unknown",
      duration: item.contentDetails?.duration || "",
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { youtubeUrl, accessToken } = await req.json();

    if (!youtubeUrl) {
      return new Response(JSON.stringify({ error: "No YouTube URL provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Lecture Summary] Processing video: ${videoId}`);

    // Fetch transcript and video info in parallel
    const [transcript, videoInfo] = await Promise.all([
      fetchTranscript(videoId),
      getVideoInfo(videoId, accessToken),
    ]);

    const titleInfo = videoInfo ? `Title: "${videoInfo.title}" by ${videoInfo.channel}` : `Video ID: ${videoId}`;
    const usedFallback = !transcript || transcript.length < 50;

    if (usedFallback) {
      console.log(`[Lecture Summary] No captions found, using Gemini video analysis fallback`);
    } else {
      console.log(`[Lecture Summary] Transcript length: ${transcript.length} chars`);
    }

    const summarySystemPrompt = `You are a brilliant academic note-taker. Generate a comprehensive, well-structured lecture summary report.

Format the report as follows:
# 📚 Lecture Summary Report

## Video Information
- **Title**: [title]
- **Channel**: [channel]

## 🎯 Key Topics Covered
[List main topics as bullet points]

## 📝 Detailed Summary
[Organize by topic/section with clear headings. Include key concepts, definitions, formulas, and important points]

## 💡 Key Takeaways
[5-8 most important points to remember]

## 📋 Quick Review Questions
[3-5 questions to test understanding]

## 🔗 Related Topics for Further Study
[Suggest related concepts to explore]

Be thorough but concise. Use markdown formatting. If it's a technical/STEM lecture, include any formulas or equations mentioned. If it's humanities, focus on arguments and evidence.`;

    let userContent: string;

    if (usedFallback) {
      // Gemini fallback: ask it to analyze the YouTube video directly
      userContent = `Please watch and summarize this YouTube lecture video: https://www.youtube.com/watch?v=${videoId}\n\n${titleInfo}\n\nThe video has no captions/subtitles available, so please analyze the video content directly — listen to the audio, read any text/slides shown on screen, and provide a comprehensive summary.`;
    } else {
      // Truncate if too long
      const maxChars = 50000;
      const truncatedTranscript = transcript!.length > maxChars
        ? transcript!.substring(0, maxChars) + "\n[... transcript truncated due to length]"
        : transcript!;
      userContent = `Please summarize this lecture:\n\n${titleInfo}\n\nTranscript:\n${truncatedTranscript}`;
    }

    // Use gemini-2.5-pro for video analysis (multimodal), flash for text-only
    const model = usedFallback ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: summarySystemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI summary error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit reached. Try again in a minute." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to generate summary" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || "Failed to generate summary";

    return new Response(JSON.stringify({
      summary,
      videoTitle: videoInfo?.title || videoId,
      videoChannel: videoInfo?.channel || "Unknown",
      transcriptLength: transcript.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Lecture summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
