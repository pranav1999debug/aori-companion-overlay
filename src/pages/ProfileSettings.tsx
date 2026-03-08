import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { emotionCutouts } from "@/lib/aori-personality";
import { ChevronLeft, LogOut, Save, User, Briefcase, Heart, Trash2, Phone, Loader2, Flame, Sparkles, Activity, RefreshCw, Key, Clock, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useContacts } from "@/hooks/useContacts";

interface KeyStatus {
  name: string;
  status: "available" | "rate_limited" | "terms_required" | "error";
  usedPercent: number | null;
  retryIn: string | null;
  error: string | null;
}

interface ApiStatus {
  totalStored: number;
  available: number;
  rateLimited: number;
  errored: number;
  keys: KeyStatus[];
}

const HOBBY_OPTIONS = [
  "Gaming", "Anime", "Music", "Coding", "Reading", "Sports",
  "Cooking", "Art", "Photography", "Travel", "Movies", "Fitness",
];

const PERSONALITY_TYPES = [
  { id: "tsundere", label: "Tsundere 😤" },
  { id: "yandere", label: "Yandere 🔪💕" },
  { id: "deredere", label: "Sweet & Loving 💗" },
  { id: "kuudere", label: "Cool & Calm ❄️" },
  { id: "sadodere", label: "Teasing Dom 😈" },
  { id: "flirty", label: "Flirty & Bold 🫦" },
];

const HEAT_LEVELS = [
  { id: "mild", label: "Mild 🌸" },
  { id: "spicy", label: "Spicy 🌶️" },
  { id: "hot", label: "Hot 🔥" },
  { id: "unhinged", label: "Unhinged 💀" },
];

const LANGUAGE_OPTIONS = [
  { id: "english", label: "English 🇬🇧" },
  { id: "multilingual", label: "Multilingual 🌍" },
  { id: "hindi", label: "Hinglish 🇮🇳" },
  { id: "nepali", label: "Nepali Mix 🇳🇵" },
  { id: "japanese", label: "Japanese Mix 🇯🇵" },
];

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [profession, setProfession] = useState("");
  const [personalityType, setPersonalityType] = useState("tsundere");
  const [personalityHeat, setPersonalityHeat] = useState("mild");
  const [aoriRole, setAoriRole] = useState("college_student");
  const [aoriAge, setAoriAge] = useState("19");
  const [languageStyle, setLanguageStyle] = useState("multilingual");
  const [affectionLevel, setAffectionLevel] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { contacts, syncing, syncFromGoogle, loadContacts } = useContacts(user?.id || null);

  // API Status state
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [apiStatusLoading, setApiStatusLoading] = useState(false);

  // User API key state
  const [userApiKey, setUserApiKey] = useState("");
  const [existingUserKey, setExistingUserKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);

  const fetchApiStatus = useCallback(async () => {
    setApiStatusLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-api-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({}),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setApiStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch API status:", e);
    } finally {
      setApiStatusLoading(false);
    }
  }, []);

  // Load user's existing API key
  const loadUserKey = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_api_keys")
      .select("api_key")
      .eq("user_id", user.id)
      .eq("service", "groq")
      .maybeSingle();
    if (data?.api_key) {
      setExistingUserKey(data.api_key);
      setUserApiKey(data.api_key);
    }
  }, [user]);

  const saveUserKey = async () => {
    if (!user || !userApiKey.trim()) {
      toast.error("Please enter a valid API key");
      return;
    }
    if (!userApiKey.startsWith("gsk_")) {
      toast.error("Groq API keys start with 'gsk_'");
      return;
    }
    setSavingKey(true);
    try {
      const { error } = await supabase.from("user_api_keys").upsert({
        user_id: user.id,
        service: "groq",
        api_key: userApiKey.trim(),
        label: "My Groq Key",
        is_active: true,
      } as any, { onConflict: "user_id,service" });
      if (error) throw error;
      setExistingUserKey(userApiKey.trim());
      toast.success("API key saved! Your key will be used first 🚀");
    } catch (e) {
      console.error("Save key error:", e);
      toast.error("Failed to save key");
    } finally {
      setSavingKey(false);
    }
  };

  const deleteUserKey = async () => {
    if (!user) return;
    try {
      await supabase.from("user_api_keys").delete().eq("user_id", user.id).eq("service", "groq");
      setExistingUserKey(null);
      setUserApiKey("");
      toast.success("API key removed");
    } catch {
      toast.error("Failed to remove key");
    }
  };

  useEffect(() => {
    if (user) loadContacts();
  }, [user, loadContacts]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setName(data.name || "");
        setAge(data.age?.toString() || "");
        setHobbies(data.hobbies || []);
        setProfession(data.profession || "");
        setPersonalityType((data as any).personality_type || "tsundere");
        setPersonalityHeat((data as any).personality_heat || "mild");
        setAoriRole((data as any).aori_role || "college_student");
        setAoriAge((data as any).aori_age || "19");
        setLanguageStyle((data as any).language_style || "multilingual");
        setAffectionLevel((data as any).affection_level || 30);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const toggleHobby = (h: string) => {
    setHobbies((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);
  };

  const getAffectionLabel = (level: number) => {
    if (level < 20) return { label: "Stranger", emoji: "😒", color: "text-gray-400" };
    if (level < 40) return { label: "Acquaintance", emoji: "😏", color: "text-blue-400" };
    if (level < 60) return { label: "Friend", emoji: "😊", color: "text-green-400" };
    if (level < 80) return { label: "Close", emoji: "💕", color: "text-pink-400" };
    return { label: "In Love", emoji: "💘", color: "text-red-400" };
  };

  const affection = getAffectionLabel(affectionLevel);

  const handleSave = async () => {
    if (!user || !name.trim()) {
      toast.error("Name can't be empty, baka!");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("user_profiles").upsert({
        user_id: user.id,
        device_id: user.id,
        name: name.trim(),
        age: age ? parseInt(age) : null,
        hobbies,
        profession: profession.trim() || null,
        personality_type: personalityType,
        personality_heat: personalityHeat,
        aori_role: aoriRole,
        aori_age: aoriAge,
        language_style: languageStyle,
        affection_level: affectionLevel,
      } as any, { onConflict: "device_id" });
      if (error) throw error;
      localStorage.setItem("aori-user-name", name.trim());
      toast.success("Profile updated! Aori approves~ 💙");
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Couldn't save. Try again!");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("aori-onboarded");
    localStorage.removeItem("aori-user-name");
    localStorage.removeItem("aori-messages");
    localStorage.removeItem("aori-chat-history");
    await signOut();
    navigate("/auth");
  };

  const handleDeleteData = async () => {
    if (!user) return;
    if (!window.confirm("This will delete ALL your data (profile, faces, memories). Are you sure?")) return;
    try {
      await Promise.all([
        supabase.from("user_profiles").delete().eq("user_id", user.id),
        supabase.from("known_faces").delete().eq("user_id", user.id),
        supabase.from("environment_memories").delete().eq("user_id", user.id),
      ]);
      toast.success("All data deleted.");
      handleLogout();
    } catch {
      toast.error("Couldn't delete data.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-border/50">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Profile Settings</h1>
      </div>

      {/* Aori dialogue */}
      <div className="p-4 flex items-start gap-3">
        <img src={emotionCutouts.thinking} alt="Aori" className="w-12 h-12 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0" />
        <div className="bg-card rounded-2xl rounded-bl-md p-3 text-sm leading-relaxed border border-border/30 flex-1">
          Hmm~ changing your preferences? Make sure you don't make me too nice... I have a reputation to maintain~ 😏
        </div>
      </div>

      {/* Profile form */}
      <div className="flex-1 px-4 pb-4 space-y-5 overflow-y-auto">
        {/* Affection Level Slider */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> Relationship Level
          </label>
          <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${affection.color}`}>{affection.emoji} {affection.label}</span>
              <span className="text-xs text-muted-foreground">{affectionLevel}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={affectionLevel}
              onChange={(e) => setAffectionLevel(parseInt(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(340 80% 55%) ${affectionLevel}%, hsl(var(--muted)) ${affectionLevel}%, hsl(var(--muted)) 100%)`,
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/50">
              <span>😒 Cold</span>
              <span>😏 Teasing</span>
              <span>💕 Close</span>
              <span>💘 In Love</span>
            </div>
          </div>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Email
          </label>
          <div className="px-4 py-3 rounded-xl bg-muted/50 border border-border/50 text-sm text-muted-foreground">
            {user?.email || "Unknown"}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name..."
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Age */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Age</label>
          <input
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            placeholder="Your age..."
            type="number"
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Profession */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Profession
          </label>
          <input
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Your profession..."
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Hobbies */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> Hobbies
          </label>
          <div className="flex flex-wrap gap-2">
            {HOBBY_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => toggleHobby(h)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  hobbies.includes(h)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border/50 my-2" />

        {/* Personality Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Aori's Personality
          </label>
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_TYPES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersonalityType(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  personalityType === p.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Heat Level */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Spice Level
          </label>
          <div className="flex flex-wrap gap-2">
            {HEAT_LEVELS.map((h) => (
              <button
                key={h.id}
                onClick={() => setPersonalityHeat(h.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  personalityHeat === h.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aori Role & Age */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Aori's Role</label>
          <input
            value={aoriRole}
            onChange={(e) => setAoriRole(e.target.value)}
            placeholder="college_student, teacher, boss..."
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Aori's Age</label>
          <input
            value={aoriAge}
            onChange={(e) => setAoriAge(e.target.value.replace(/\D/g, ""))}
            placeholder="19"
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Language Style</label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguageStyle(l.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  languageStyle === l.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <div className="h-px bg-border/50 my-2" />

        {/* Contacts sync */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Phone Contacts
          </label>
          <p className="text-xs text-muted-foreground/70">
            Import contacts from Google so Aori can find people when you ask to send a message.
            {contacts.length > 0 && ` (${contacts.length} contacts synced)`}
          </p>
          <button
            onClick={syncFromGoogle}
            disabled={syncing}
            className="w-full py-3 rounded-xl bg-accent/20 text-accent-foreground text-sm font-medium hover:bg-accent/30 transition-colors flex items-center justify-center gap-2 border border-accent/20"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            {syncing ? "Syncing contacts..." : contacts.length > 0 ? "Re-sync Google Contacts" : "Import Google Contacts"}
          </button>
        </div>

        <div className="h-px bg-border/50 my-2" />

        {/* API Status Dashboard */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> API Key Status (TTS)
          </label>
          <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
            {!apiStatus && !apiStatusLoading && (
              <button
                onClick={fetchApiStatus}
                className="w-full py-2.5 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                Check API Key Status
              </button>
            )}
            {apiStatusLoading && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Probing {10} keys...
              </div>
            )}
            {apiStatus && !apiStatusLoading && (
              <>
                {/* Summary bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" /> {apiStatus.available} live
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <Clock className="w-3.5 h-3.5" /> {apiStatus.rateLimited} limited
                    </span>
                    <span className="flex items-center gap-1 text-red-400">
                      <XCircle className="w-3.5 h-3.5" /> {apiStatus.errored} error
                    </span>
                  </div>
                  <button onClick={fetchApiStatus} className="text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Overall usage bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Stored: {apiStatus.totalStored} keys</span>
                    <span>{Math.round((apiStatus.rateLimited / Math.max(apiStatus.totalStored, 1)) * 100)}% exhausted</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((apiStatus.available / Math.max(apiStatus.totalStored, 1)) * 100)}%`,
                        background: apiStatus.available > 3
                          ? "hsl(142 71% 45%)"
                          : apiStatus.available > 0
                          ? "hsl(38 92% 50%)"
                          : "hsl(0 84% 60%)",
                      }}
                    />
                  </div>
                </div>

                {/* Per-key details */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {apiStatus.keys.map((k, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg bg-muted/30">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        k.status === "available" ? "bg-green-400" :
                        k.status === "rate_limited" ? "bg-amber-400" :
                        "bg-red-400"
                      }`} />
                      <span className="font-mono text-muted-foreground flex-1 truncate">{k.name}</span>
                      {k.status === "rate_limited" && k.usedPercent !== null && (
                        <span className="text-amber-400 font-medium">{k.usedPercent}%</span>
                      )}
                      {k.retryIn && (
                        <span className="flex items-center gap-0.5 text-muted-foreground/70">
                          <Clock className="w-2.5 h-2.5" /> {k.retryIn}
                        </span>
                      )}
                      {k.error && (
                        <span className="flex items-center gap-0.5 text-red-400">
                          <AlertTriangle className="w-2.5 h-2.5" /> {k.error}
                        </span>
                      )}
                      {k.status === "available" && (
                        <span className="text-green-400">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-px bg-border/50 my-2" />

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>

        <button
          onClick={handleDeleteData}
          className="w-full py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete All My Data
        </button>
      </div>
    </div>
  );
}
