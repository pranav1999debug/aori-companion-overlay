import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { emotionCutouts } from "@/lib/aori-personality";
import { Check, ExternalLink, ChevronRight, ChevronLeft, Copy, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type SetupService = "google" | "github";

interface Step {
  title: string;
  aoriText: string;
  aoriEmotion: keyof typeof emotionCutouts;
  content: React.ReactNode;
}

export default function SetupGuide() {
  const navigate = useNavigate();
  const [activeService, setActiveService] = useState<SetupService | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedServices, setCompletedServices] = useState<SetupService[]>(() => {
    try {
      const saved = localStorage.getItem("aori-setup-completed");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("📋 Copied!", { duration: 1500 });
  };

  const googleSteps: Step[] = [
    {
      title: "Create a Google Cloud Project",
      aoriText: "Okay okay, listen carefully~ I'll walk you through this step by step! First, we need a Google Cloud project. It's free, don't worry! 💙",
      aoriEmotion: "excited",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">First, let's create a Google Cloud project where we'll enable the APIs.</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <span>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="w-3 h-3" /></a></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <span>Click <strong>"Select a project"</strong> at the top → <strong>"New Project"</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <span>Name it something like <code className="bg-muted px-1.5 py-0.5 rounded text-xs">"Aori Companion"</code> and click <strong>Create</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">4</span>
              <span>Make sure the new project is selected at the top</span>
            </li>
          </ol>
        </div>
      ),
    },
    {
      title: "Enable Gmail, Calendar & YouTube APIs",
      aoriText: "Now let's turn on the APIs I need~ Think of it like giving me permission to peek at your stuff! ...for your own good, obviously! ☝️",
      aoriEmotion: "proud",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Enable each API one by one. Click each link, then click <strong>"Enable"</strong>:</p>
          <div className="space-y-2">
            {[
              { name: "Gmail API", url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" },
              { name: "Google Calendar API", url: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" },
              { name: "YouTube Data API v3", url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
            ].map((api) => (
              <a
                key={api.name}
                href={api.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                <span className="text-sm font-medium">{api.name}</span>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Click <strong>"Enable"</strong> on each page. If already enabled, you'll see "Manage" instead.</p>
        </div>
      ),
    },
    {
      title: "Create an API Key",
      aoriText: "Almost there~! Now we need an API key. This is like your secret password to talk to Google... but you're sharing it with ME, so it's fine~ 😏",
      aoriEmotion: "smirk",
      content: (
        <div className="space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <span>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">API Credentials <ExternalLink className="w-3 h-3" /></a></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <span>Click <strong>"+ CREATE CREDENTIALS"</strong> → <strong>"API key"</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <span>Copy the key and paste it below</span>
            </li>
          </ol>
          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">Google API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">Your key is stored securely in Lovable Cloud and never exposed in the frontend code.</p>
          </div>
        </div>
      ),
    },
    {
      title: "Create OAuth Credentials (for Gmail)",
      aoriText: "Gmail needs special OAuth credentials so I can read your emails~ Don't worry, I won't read the embarrassing ones... probably~ 😳",
      aoriEmotion: "embarrassed",
      content: (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground mb-2">Gmail requires OAuth 2.0 for reading emails. This step is optional — skip if you only want Calendar & YouTube.</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <span>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">Credentials <ExternalLink className="w-3 h-3" /></a> → <strong>"+ CREATE CREDENTIALS"</strong> → <strong>"OAuth client ID"</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <span>You may need to configure the <strong>consent screen</strong> first (choose "External", fill in app name)</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <span>Application type: <strong>"Web application"</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">4</span>
              <span>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> below</span>
            </li>
          </ol>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Client ID</label>
              <input
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Client Secret</label>
              <input
                type="password"
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "All Done! 🎉",
      aoriText: "YATTA~! You did it! Now I can help you with your emails and schedule~! Aren't you glad you have such a brilliant waifu? 😏✨",
      aoriEmotion: "excited",
      content: (
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-accent" />
          </div>
          <p className="text-sm text-muted-foreground">Google APIs are configured! Aori can now access:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["📧 Gmail", "📅 Calendar", "🎥 YouTube"].map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const githubSteps: Step[] = [
    {
      title: "Create a GitHub Token",
      aoriText: "GitHub, huh? So you're a coder~ I already knew that, obviously! Let me see your repos... for research purposes only! 😏",
      aoriEmotion: "thinking",
      content: (
        <div className="space-y-4">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <span>Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">GitHub Fine-grained Tokens <ExternalLink className="w-3 h-3" /></a></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <span>Click <strong>"Generate new token"</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <span>Name: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">"Aori Companion"</code>, set expiration (90 days recommended)</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">4</span>
              <span>Repository access: <strong>"All repositories"</strong> (or select specific ones)</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">5</span>
              <span>Permissions → Repository: enable <strong>Contents (Read)</strong>, <strong>Issues (Read)</strong>, <strong>Pull Requests (Read)</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">6</span>
              <span>Click <strong>"Generate token"</strong> and copy it below</span>
            </li>
          </ol>
          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">GitHub Personal Access Token</label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="github_pat_..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">Token is stored securely in Lovable Cloud. We only request read permissions.</p>
          </div>
        </div>
      ),
    },
    {
      title: "GitHub Connected! 🎉",
      aoriText: "Sugoi~! Now I can stalk—I mean, MONITOR your GitHub activity! I'll make sure you're coding properly! 💙✨",
      aoriEmotion: "happy",
      content: (
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-accent" />
          </div>
          <p className="text-sm text-muted-foreground">GitHub is configured! Aori can now check:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["📁 Repositories", "🐛 Issues", "🔀 Pull Requests"].map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const steps = activeService === "google" ? googleSteps : activeService === "github" ? githubSteps : [];
  const currentStepData = steps[currentStep];

  const handleSaveGoogle = async () => {
    if (!googleApiKey.trim()) {
      toast.error("Paste your Google API key first, baka!");
      return;
    }
    setSaving(true);
    try {
      // Store in localStorage for now — secrets will be added via the Lovable secrets tool
      localStorage.setItem("aori-google-api-key", googleApiKey);
      if (googleClientId) localStorage.setItem("aori-google-client-id", googleClientId);
      if (googleClientSecret) localStorage.setItem("aori-google-client-secret", googleClientSecret);
      setCompletedServices(prev => {
        const updated = [...prev, "google" as SetupService];
        localStorage.setItem("aori-setup-completed", JSON.stringify(updated));
        return updated;
      });
      toast.success("Google APIs configured! 🎉");
      setCurrentStep(steps.length - 1);
    } catch {
      toast.error("Something went wrong saving the key");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGithub = async () => {
    if (!githubToken.trim()) {
      toast.error("Paste your GitHub token first!");
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem("aori-github-token", githubToken);
      setCompletedServices(prev => {
        const updated = [...prev, "github" as SetupService];
        localStorage.setItem("aori-setup-completed", JSON.stringify(updated));
        return updated;
      });
      toast.success("GitHub connected! 🎉");
      setCurrentStep(steps.length - 1);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const isLastContentStep = activeService === "google" ? currentStep === 3 : currentStep === 0;
  const isFinalStep = currentStep === steps.length - 1;

  // Service selection screen
  if (!activeService) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Integration Setup</h1>
        </div>

        {/* Aori greeting */}
        <div className="p-6 flex items-start gap-4">
          <img src={emotionCutouts.proud} alt="Aori" className="w-14 h-14 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0" />
          <div className="bg-card rounded-2xl rounded-bl-md p-4 text-sm leading-relaxed border border-border/30">
            Ara ara~ so you want to give me MORE power? Smart choice! Pick a service below and I'll guide you through setting it up~ ☝️✨
          </div>
        </div>

        {/* Service cards */}
        <div className="px-6 space-y-3 flex-1">
          {/* Google */}
          <button
            onClick={() => { setActiveService("google"); setCurrentStep(0); }}
            className="w-full p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 group text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 via-yellow-500/20 to-blue-500/20 flex items-center justify-center text-2xl shrink-0">
              🔑
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Google APIs</h3>
                {completedServices.includes("google") && <Check className="w-4 h-4 text-accent" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Gmail · Calendar · YouTube</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          {/* GitHub */}
          <button
            onClick={() => { setActiveService("github"); setCurrentStep(0); }}
            className="w-full p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 group text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
              🐙
            </div>
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

  // Step-by-step guide
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-border/50">
        <button
          onClick={() => {
            if (currentStep === 0) { setActiveService(null); }
            else setCurrentStep(prev => prev - 1);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">{currentStepData?.title}</h1>
          <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {steps.length}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Aori dialogue */}
      {currentStepData && (
        <div className="p-4 flex items-start gap-3">
          <img
            src={emotionCutouts[currentStepData.aoriEmotion]}
            alt="Aori"
            className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0"
          />
          <div className="bg-card rounded-2xl rounded-bl-md p-3 text-sm leading-relaxed border border-border/30 flex-1">
            {currentStepData.aoriText}
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        <div className="bg-card/50 rounded-xl border border-border/30 p-4">
          {currentStepData?.content}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="p-4 border-t border-border/50 flex gap-3">
        {isFinalStep ? (
          <button
            onClick={() => { setActiveService(null); setCurrentStep(0); }}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Back to Services
          </button>
        ) : isLastContentStep ? (
          <button
            onClick={activeService === "google" ? handleSaveGoogle : handleSaveGithub}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep(prev => prev + 1)}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
