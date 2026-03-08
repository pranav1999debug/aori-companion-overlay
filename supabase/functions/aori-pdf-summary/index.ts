import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const summarySystemPrompt = `You are a brilliant academic note-taker. You will receive the extracted text content from PDF lecture slides. Generate a comprehensive, well-structured lecture summary report.

Format the report as follows:
# 📚 Lecture Summary Report

## Document Information
- **Title**: [extracted or inferred title]
- **Pages**: [number of pages if known]

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

    const { pdfBase64, pdfUrl, fileName } = await req.json();

    if (!pdfBase64 && !pdfUrl) {
      return new Response(JSON.stringify({ error: "No PDF provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[PDF Summary] Processing: ${fileName || pdfUrl || "uploaded file"}`);

    // Get the PDF data
    let base64Data: string;

    if (pdfBase64) {
      base64Data = pdfBase64;
    } else if (pdfUrl) {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
          return new Response(JSON.stringify({ error: "URL does not point to a PDF file" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const arrayBuf = await res.arrayBuffer();
        // Convert to base64
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Data = btoa(binary);
      } catch (e) {
        console.error("PDF fetch error:", e);
        return new Response(JSON.stringify({ error: "Failed to download PDF from URL" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "No PDF data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[PDF Summary] PDF size: ${Math.round(base64Data.length * 0.75 / 1024)}KB`);

    // Use Gemini with inline PDF data for multimodal analysis
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: summarySystemPrompt },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: fileName || "lecture.pdf",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: `Please analyze these PDF lecture slides and create a comprehensive summary report. The file name is "${fileName || "lecture.pdf"}".`,
              },
            ],
          },
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
      fileName: fileName || (pdfUrl ? pdfUrl.split("/").pop()?.split("?")[0] : "lecture.pdf"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("PDF summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
