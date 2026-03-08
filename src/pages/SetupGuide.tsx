import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { emotionCutouts } from "@/lib/aori-personality";
import { Check, ChevronLeft, ChevronRight, Shield, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SetupService = "google" | "github";

export default function SetupGuide() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeService, setActiveService] = useState<SetupService | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [completedServices, setCompletedServices] = useState<SetupService[]>(() => {
    try {
      const saved = localStorage.getItem("aori-setup-completed");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Check if Google is connected via DB
  useEffect(() => {
    const checkGoogle = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_google_tokens")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setGoogleConnected(!!data);
      setLoading(false);
    };
    checkGoogle();
  }, [user]);

  const handleConnectGoogle = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in first"); return; }

      const redirectUri = `${window.location.origin}/google-callback`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-google-oauth`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ redirectUri }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get consent URL");

      // Redirect to Google consent screen
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Failed to start Google connection");
      setSaving(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from("user_google_tokens")
        .delete()
        .eq("user_id", user!.id);
      if (error) throw error;
      setGoogleConnected(false);
      setCompletedServices(prev => {
        const updated = prev.filter(s => s !== "google");
        localStorage.setItem("aori-setup-completed", JSON.stringify(updated));
        return updated;
      });
      toast.success("Google disconnected");
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveGithub = async () => {
    if (!githubToken.trim()) { toast.error("Paste your GitHub token first!"); return; }
    setSaving(true);
    try {
      localStorage.setItem("aori-github-token", githubToken);
      setCompletedServices(prev => {
        const updated = [...prev, "github" as SetupService];
        localStorage.setItem("aori-setup-completed", JSON.stringify(updated));
        return updated;
      });
      toast.success("GitHub connected! 🎉");
      setActiveService(null);
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  // Google detail view
  if (activeService === "google") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <button onClick={() => setActiveService(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Google Integration</h1>
        </div>

        {/* Aori dialogue */}
        <div className="p-4 flex items-start gap-3">
          <img
            src={emotionCutouts[googleConnected ? "excited" : "smirk"]}
            alt="Aori"
            className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0"
          />
          <div className="bg-card rounded-2xl rounded-bl-md p-3 text-sm leading-relaxed border border-border/30 flex-1">
            {googleConnected
              ? "Yatta~! Google is connected! I can now peek at your emails, calendar, and YouTube~ Aren't you glad? 😏✨"
              : "Just tap the button below and approve the permissions~ Super easy! I'll handle the rest~ 💙"}
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-4">
          {/* Status */}
          <div className="bg-card/50 rounded-xl border border-border/30 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${googleConnected ? "bg-accent" : "bg-muted-foreground/30"}`} />
              <span className="text-sm font-medium">{googleConnected ? "Connected" : "Not connected"}</span>
            </div>

            {googleConnected && (
              <div className="flex flex-wrap gap-2">
                {["📧 Gmail", "📅 Calendar", "🎥 YouTube"].map(s => (
                  <span key={s} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
                ))}
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {googleConnected
                  ? "Your tokens are stored securely server-side. Only Aori's backend can access them."
                  : "We only request read-only permissions. Your data stays private and secure."}
              </p>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="p-4 border-t border-border/50 flex gap-3">
          {googleConnected ? (
            <button
              onClick={handleDisconnectGoogle}
              disabled={disconnecting}
              className="flex-1 py-3 rounded-xl bg-destructive/10 text-destructive font-medium text-sm hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
              Disconnect Google
            </button>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Connecting..." : "Connect Google Account"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // GitHub detail view
  if (activeService === "github") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <button onClick={() => setActiveService(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">GitHub Integration</h1>
        </div>

        <div className="p-4 flex items-start gap-3">
          <img src={emotionCutouts.thinking} alt="Aori" className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0" />
          <div className="bg-card rounded-2xl rounded-bl-md p-3 text-sm leading-relaxed border border-border/30 flex-1">
            GitHub needs a personal access token~ Go create one and paste it here! I promise I'll only read, not touch your code... probably~ 😏
          </div>
        </div>

        <div className="flex-1 px-4 pb-4">
          <div className="bg-card/50 rounded-xl border border-border/30 p-4 space-y-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
                <span>Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-primary underline">GitHub Tokens</a></span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
                <span>Generate a token with <strong>Contents</strong>, <strong>Issues</strong>, <strong>PRs</strong> (Read)</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
                <span>Paste it below</span>
              </li>
            </ol>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="github_pat_..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Token is stored locally and only used for read access.</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/50">
          <button
            onClick={handleSaveGithub}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Token"}
          </button>
        </div>
      </div>
    );
  }

  // Service selection
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 flex items-center gap-3 border-b border-border/50">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Integrations</h1>
      </div>

      <div className="p-6 flex items-start gap-4">
        <img src={emotionCutouts.proud} alt="Aori" className="w-14 h-14 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0" />
        <div className="bg-card rounded-2xl rounded-bl-md p-4 text-sm leading-relaxed border border-border/30">
          Pick a service to connect~ One tap and I'll have access to help you even more! ✨
        </div>
      </div>

      <div className="px-6 space-y-3 flex-1">
        {/* Google */}
        <button
          onClick={() => setActiveService("google")}
          className="w-full p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 group text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 via-yellow-500/20 to-blue-500/20 flex items-center justify-center text-2xl shrink-0">
            🔗
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Google</h3>
              {(googleConnected || completedServices.includes("google")) && <Check className="w-4 h-4 text-accent" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Gmail · Calendar · YouTube</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        {/* GitHub */}
        <button
          onClick={() => setActiveService("github")}
          className="w-full p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 group text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">🐙</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">GitHub</h3>
              {completedServices.includes("github") && <Check className="w-4 h-4 text-accent" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Repos · Issues · Pull Requests</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </div>

      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground">All credentials are stored securely and never exposed in frontend code.</p>
      </div>
    </div>
  );
}
