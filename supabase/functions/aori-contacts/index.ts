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
    const { accessToken, pageToken, pageSize } = await req.json();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing accessToken" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch contacts from Google People API
    const params = new URLSearchParams({
      personFields: "names,phoneNumbers,emailAddresses",
      pageSize: String(pageSize || 200),
      sortOrder: "FIRST_NAME_ASCENDING",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Google People API error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: `Google API error: ${res.status}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const connections = data.connections || [];

    const contacts = connections
      .filter((c: any) => {
        const hasName = c.names?.length > 0;
        const hasPhone = c.phoneNumbers?.length > 0;
        return hasName && hasPhone;
      })
      .map((c: any) => ({
        name: c.names[0]?.displayName || "Unknown",
        phone_numbers: (c.phoneNumbers || []).map((p: any) => 
          (p.canonicalForm || p.value || "").replace(/[\s\-()]/g, "")
        ).filter(Boolean),
        email_addresses: (c.emailAddresses || []).map((e: any) => e.value || "").filter(Boolean),
      }));

    return new Response(
      JSON.stringify({
        contacts,
        nextPageToken: data.nextPageToken || null,
        totalPeople: data.totalPeople || contacts.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("aori-contacts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
