import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { emotionCutouts } from "@/lib/aori-personality";
import { toast } from "sonner";

export default function GoogleCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");

  useEffect(() => {
    const exchangeCode = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error");

      if (error || !code) {
        setStatus("error");
        toast.error("Google authorization was cancelled or failed");
        setTimeout(() => navigate("/setup"), 2000);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setStatus("error");
          navigate("/auth");
          return;
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-google-oauth`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              code,
              redirectUri: `${window.location.origin}/google-callback`,
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Token exchange failed");

        setStatus("success");
        toast.success("Google connected! 🎉");
        setTimeout(() => navigate("/setup"), 1500);
      } catch (e) {
        console.error("OAuth callback error:", e);
        setStatus("error");
        toast.error("Failed to connect Google. Try again!");
        setTimeout(() => navigate("/setup"), 2000);
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
      </div>
    </div>
  );
}
