import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { emotionCutouts } from "@/lib/aori-personality";
import { toast } from "sonner";
import { Check, Shield, Loader2, ChevronRight, ArrowRight, SkipForward } from "lucide-react";

const HOBBY_OPTIONS = [
  "Gaming", "Anime", "Music", "Coding", "Reading", "Sports",
  "Cooking", "Art", "Photography", "Travel", "Movies", "Fitness",
];

const TOTAL_STEPS = 6; // name, age, hobbies, profession, google, finish

type AoriDialogue = {
  text: string;
  emotion: "smirk" | "angry" | "thinking" | "excited" | "happy" | "proud";
};

const dialogues: AoriDialogue[] = [
  { text: "Hmph! So you finally decided to introduce yourself? About time, baka~ 😏", emotion: "smirk" },
  { text: "Oho~ and how old are you? Don't lie to me! 😤", emotion: "angry" },
  { text: "Hmm~ what do you like to do? I need to know EVERYTHING about you~ ☝️", emotion: "thinking" },
  { text: "And what do you do for work? Or are you a lazy bum? 😏", emotion: "smirk" },
  { text: "Now let's connect your Google account~ I can read your emails, check your schedule, and see what you watch! One tap~ ✨", emotion: "excited" },
  { text: "All done~! Welcome to my world, baka~ I'll take good care of you... probably~ 💙", emotion: "happy" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [profession, setProfession] = useState("");
  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);

  // Check Google connection status
  useEffect(() => {
    const checkGoogle = async () => {
      if (!user) { setCheckingGoogle(false); return; }
      const { data } = await supabase
        .from("user_google_tokens")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setGoogleConnected(!!data);
      setCheckingGoogle(false);
    };
    checkGoogle();
  }, [user]);

  const toggleHobby = (h: string) => {
    setHobbies((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in first"); return; }

      const redirectUri = "https://aori-companion-overlay.lovable.app/google-callback";
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
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Failed to start Google connection");
      setConnectingGoogle(false);
    }
  };

  const handleFinish = async () => {
    if (!name.trim()) { toast.error("Tell me your name, baka!"); return; }
    if (!user) { toast.error("You need to be logged in!"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("user_profiles").upsert({
        user_id: user.id,
        device_id: user.id,
        name: name.trim(),
        age: age ? parseInt(age) : null,
        hobbies,
        profession: profession.trim() || null,
      }, { onConflict: "device_id" });
      if (error) throw error;
      localStorage.setItem("aori-onboarded", "true");
      localStorage.setItem("aori-user-name", name.trim());
      toast.success(`Welcome, ${name.trim()}! Aori is ready for you~ 💙`);
      navigate("/");
    } catch (e) {
      console.error("Onboarding error:", e);
      toast.error("Something went wrong. Try again!");
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !name.trim()) { toast.error("Tell me your name!"); return; }
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const current = dialogues[step];

  return (
    <div className="min-h-screen bg-[hsl(220,30%,8%)] flex flex-col items-center justify-center px-4 py-8">
      {/* Aori character with glow */}
      <div className="relative w-32 h-32 mb-3 shrink-0">
        <div
          className="absolute inset-[-20%] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 80% at 50% 55%, hsl(175 70% 45% / 0.25) 0%, hsl(215 80% 55% / 0.15) 40%, transparent 70%)",
            filter: "blur(20px)",
            animation: "pulse-glow-aura 3s ease-in-out infinite",
          }}
        />
        <img
          src={emotionCutouts[current.emotion]}
          alt="Aori"
          className="w-full h-full object-contain relative z-10"
          style={{ animation: "aori-breathe 2.5s ease-in-out infinite" }}
        />
      </div>

      {/* Dialogue bubble */}
      <div className="bg-card/90 backdrop-blur-sm rounded-2xl px-5 py-3 mb-6 max-w-sm text-center border border-white/[0.06]">
        <p className="text-foreground text-sm leading-relaxed">{current.text}</p>
      </div>

      {/* Step content */}
      <div className="w-full max-w-sm space-y-4">
        {/* Step 0: Name */}
        {step === 0 && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name..."
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && canProceed() && handleNext()}
          />
        )}

        {/* Step 1: Age */}
        {step === 1 && (
          <input
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            placeholder="Your age... (optional)"
            type="number"
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleNext()}
          />
        )}

        {/* Step 2: Hobbies */}
        {step === 2 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {HOBBY_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => toggleHobby(h)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  hobbies.includes(h)
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                    : "bg-white/[0.08] text-white/60 hover:bg-white/[0.15]"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Profession */}
        {step === 3 && (
          <input
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Your profession... (optional)"
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleNext()}
          />
        )}

        {/* Step 4: Google Services */}
        {step === 4 && (
          <div className="space-y-3">
            {/* Google Connect Card */}
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 via-yellow-500/20 to-blue-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white text-sm font-semibold">Google Account</h3>
                  <p className="text-white/40 text-xs">Gmail · Calendar · YouTube</p>
                </div>
                {googleConnected && <Check className="w-5 h-5 text-accent" />}
              </div>

              {googleConnected ? (
                <div className="flex flex-wrap gap-2">
                  {["📧 Gmail", "📅 Calendar", "🎥 YouTube"].map(s => (
                    <span key={s} className="px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">{s}</span>
                  ))}
                </div>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  className="w-full py-2.5 rounded-lg bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {connectingGoogle ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                  ) : (
                    <>Connect Google<ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              )}

              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/40">Read-only access. Your data stays private and secure.</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Finish */}
        {step === 5 && (
          <div className="space-y-3 text-center">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 space-y-3">
              <div className="text-3xl mb-2">🎉</div>
              <h3 className="text-white font-semibold">Ready to go, {name}!</h3>
              <div className="flex flex-wrap justify-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">👤 {name}</span>
                {age && <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">🎂 {age}y/o</span>}
                {hobbies.length > 0 && <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">🎮 {hobbies.length} hobbies</span>}
                {profession && <span className="px-3 py-1 rounded-full bg-primary/10 text-primary">💼 {profession}</span>}
                {googleConnected && <span className="px-3 py-1 rounded-full bg-accent/10 text-accent">✅ Google</span>}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 rounded-xl bg-white/[0.06] text-white/60 text-sm hover:bg-white/[0.1] transition-colors"
            >
              Back
            </button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {step === 4 && !googleConnected ? (
                <>Skip for now <SkipForward className="w-4 h-4" /></>
              ) : (
                <>Next <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Let's Go! 💙"}
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 pt-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
