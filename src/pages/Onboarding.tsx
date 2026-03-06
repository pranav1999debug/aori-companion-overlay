import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { emotionCutouts } from "@/lib/aori-personality";
import { toast } from "sonner";

const HOBBY_OPTIONS = [
  "Gaming", "Anime", "Music", "Coding", "Reading", "Sports",
  "Cooking", "Art", "Photography", "Travel", "Movies", "Fitness",
];

function getDeviceId(): string {
  let id = localStorage.getItem("aori-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("aori-device-id", id);
  }
  return id;
}

export { getDeviceId };

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [profession, setProfession] = useState("");
  const [saving, setSaving] = useState(false);

  const aoriDialogues = [
    { text: "Hmph! So you finally decided to introduce yourself? About time, baka~ 😏", emotion: "smirk" as const },
    { text: "Oho~ and how old are you? Don't lie to me! 😤", emotion: "angry" as const },
    { text: "Hmm~ what do you like to do? I need to know EVERYTHING about you~ ☝️", emotion: "thinking" as const },
    { text: "And what do you do for work? Or are you a lazy bum? 😏", emotion: "smirk" as const },
  ];

  const toggleHobby = (h: string) => {
    setHobbies((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);
  };

  const handleFinish = async () => {
    if (!name.trim()) { toast.error("Tell me your name, baka!"); return; }
    setSaving(true);
    const deviceId = getDeviceId();
    try {
      const { error } = await supabase.from("user_profiles").upsert({
        device_id: deviceId,
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

  const current = aoriDialogues[step];

  return (
    <div className="min-h-screen bg-[hsl(220,30%,8%)] flex flex-col items-center justify-center px-4">
      {/* Aori character */}
      <div className="relative w-32 h-32 mb-4">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 80% at 50% 55%, hsl(175 70% 45% / 0.25) 0%, hsl(215 80% 55% / 0.15) 40%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <img src={emotionCutouts[current.emotion]} alt="Aori" className="w-full h-full object-contain" />
      </div>

      {/* Dialogue bubble */}
      <div className="bg-card/90 backdrop-blur-sm rounded-2xl px-5 py-3 mb-8 max-w-sm text-center">
        <p className="text-foreground text-sm leading-relaxed">{current.text}</p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-sm space-y-4">
        {step === 0 && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name..."
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
          />
        )}
        {step === 1 && (
          <input
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            placeholder="Your age..."
            type="number"
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
          />
        )}
        {step === 2 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {HOBBY_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => toggleHobby(h)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  hobbies.includes(h)
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/[0.08] text-white/60 hover:bg-white/[0.15]"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <input
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Your profession..."
            className="w-full bg-white/[0.08] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 text-sm"
            autoFocus
          />
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
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 0 && !name.trim()) { toast.error("Tell me your name!"); return; }
                setStep(step + 1);
              }}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving..." : "Let's Go! 💙"}
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-white/20"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
