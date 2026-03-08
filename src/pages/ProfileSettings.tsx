import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { emotionCutouts } from "@/lib/aori-personality";
import { ChevronLeft, LogOut, Save, User, Briefcase, Heart, Trash2, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useContacts } from "@/hooks/useContacts";

const HOBBY_OPTIONS = [
  "Gaming", "Anime", "Music", "Coding", "Reading", "Sports",
  "Cooking", "Art", "Photography", "Travel", "Movies", "Fitness",
];

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [profession, setProfession] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const toggleHobby = (h: string) => {
    setHobbies((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);
  };

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
      }, { onConflict: "device_id" });
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
          Hmm~ changing your info? Make sure you don't put anything embarrassing... I'll be reading it, you know~ 😏
        </div>
      </div>

      {/* Profile form */}
      <div className="flex-1 px-4 pb-4 space-y-5 overflow-y-auto">
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

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>

        {/* Divider */}
        <div className="h-px bg-border/50 my-2" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>

        {/* Delete data */}
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
