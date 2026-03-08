import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { emotionCutouts } from "@/lib/aori-personality";
import { toast } from "sonner";

export default function GoogleCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [debugInfo, setDebugInfo] = useState<string>("Starting...");

  useEffect(() => {
    const exchangeCode = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error");
      
      setDebugInfo(`URL: ${window.location.href.substring(0, 80)}...\nCode: ${code ? `yes (${code.length} chars)` : "no"}\nError param: ${error || "none"}`);

      if (error || !code) {
        setStatus("error");
        setDebugInfo(prev => prev + `\n❌ No code or error param: ${error}`);
        toast.error("Google authorization was cancelled or failed");
        setTimeout(() => navigate("/setup"), 3000);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        setDebugInfo(prev => prev + `\nSession: ${session ? "yes" : "NO SESSION"}`);
        
        if (!session) {
          setStatus("error");
          setDebugInfo(prev => prev + "\n❌ No session - redirecting to auth");
          setTimeout(() => navigate("/auth"), 2000);
          return;
        }

        const redirectUri = `${window.location.origin}/google-callback`;
        setDebugInfo(prev => prev + `\nRedirect URI: ${redirectUri}\nCalling PUT...`);

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-google-oauth`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ code, redirectUri }),
          }
        );

        const data = await res.json();
        setDebugInfo(prev => prev + `\nResponse: ${res.status} ${JSON.stringify(data).substring(0, 100)}`);
        
        if (!res.ok) throw new Error(data.error || "Token exchange failed");

        setStatus("success");
        toast.success("Google connected! 🎉");
        setTimeout(() => navigate("/setup"), 1500);
      } catch (e: any) {
        setStatus("error");
        setDebugInfo(prev => prev + `\n❌ Error: ${e?.message || e}`);
        toast.error(`Failed to connect Google: ${e?.message || "Unknown error"}`);
        setTimeout(() => navigate("/setup"), 5000);
      }
    };

    exchangeCode();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
      <img
        src={emotionCutouts[status === "success" ? "excited" : status === "error" ? "sad" : "thinking"]}
        alt="Aori"
        className="w-20 h-20 rounded-full object-cover object-top ring-2 ring-primary/30"
      />
      <div className="text-center space-y-2">
        {status === "processing" && (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting your Google account...</p>
          </>
        )}
        {status === "success" && (
          <>
            <p className="text-lg font-semibold text-primary">Connected! ✨</p>
            <p className="text-sm text-muted-foreground">Redirecting back...</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-lg font-semibold text-destructive">Something went wrong</p>
            <p className="text-sm text-muted-foreground">Redirecting back...</p>
          </>
        )}
        {/* Debug info - remove after fixing */}
        <pre className="mt-4 p-3 bg-muted rounded text-xs text-left max-w-sm overflow-auto whitespace-pre-wrap break-all">{debugInfo}</pre>
      </div>
    </div>
  );
}
