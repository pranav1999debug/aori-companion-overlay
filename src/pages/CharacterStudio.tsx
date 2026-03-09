import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AoriEmotion, emotionCutouts, emotionLabels } from "@/lib/aori-personality";
import { ChevronLeft, Save, Upload, Trash2, Loader2, Sparkles, MessageSquare, Palette, Image as ImageIcon, RotateCcw, Wand2, Download } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

const EMOTIONS: AoriEmotion[] = [
  "happy", "smirk", "excited", "angry", "shy", "sad", "love",
  "proud", "thinking", "confused", "sleepy", "jealous", "embarrassed", "shock",
];

export default function CharacterStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Character fields
  const [characterName, setCharacterName] = useState("");
  const [characterPersonality, setCharacterPersonality] = useState("");
  const [characterSpeakingStyle, setCharacterSpeakingStyle] = useState("");
  const [characterAppearance, setCharacterAppearance] = useState("");

  // Custom avatars per emotion
  const [customAvatars, setCustomAvatars] = useState<Record<string, string>>({});
  const [uploadingEmotion, setUploadingEmotion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseImageInputRef = useRef<HTMLInputElement>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<AoriEmotion | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatingEmotion, setGeneratingEmotion] = useState<string | null>(null);

  // Load existing character data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("character_name, character_personality, character_speaking_style, character_appearance")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setCharacterName((data as any).character_name || "");
        setCharacterPersonality((data as any).character_personality || "");
        setCharacterSpeakingStyle((data as any).character_speaking_style || "");
        setCharacterAppearance((data as any).character_appearance || "");
      }

      // Load existing avatar URLs from storage
      const avatarMap: Record<string, string> = {};
      for (const emotion of EMOTIONS) {
        const { data: files } = await supabase.storage
          .from("character-avatars")
          .list(`${user.id}`, { search: `${emotion}` });
        if (files && files.length > 0) {
          const file = files.find(f => f.name.startsWith(emotion));
          if (file) {
            const { data: urlData } = supabase.storage
              .from("character-avatars")
              .getPublicUrl(`${user.id}/${file.name}`);
            if (urlData?.publicUrl) {
              avatarMap[emotion] = urlData.publicUrl + `?t=${file.updated_at}`;
            }
          }
        }
      }
      setCustomAvatars(avatarMap);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleUploadAvatar = useCallback(async (file: File, emotion: AoriEmotion) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files allowed!");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB per image!");
      return;
    }

    setUploadingEmotion(emotion);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${emotion}.${ext}`;

      const { error } = await supabase.storage
        .from("character-avatars")
        .upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("character-avatars")
        .getPublicUrl(path);

      setCustomAvatars(prev => ({
        ...prev,
        [emotion]: urlData.publicUrl + `?t=${Date.now()}`,
      }));
      toast.success(`${emotionLabels[emotion]} avatar uploaded!`);
    } catch (e: any) {
      console.error("Upload error:", e);
      toast.error("Upload failed. Try again!");
    } finally {
      setUploadingEmotion(null);
    }
  }, [user]);

  const handleRemoveAvatar = useCallback(async (emotion: AoriEmotion) => {
    if (!user) return;
    try {
      const { data: files } = await supabase.storage
        .from("character-avatars")
        .list(`${user.id}`, { search: emotion });
      if (files) {
        const toDelete = files.filter(f => f.name.startsWith(emotion)).map(f => `${user.id}/${f.name}`);
        if (toDelete.length > 0) {
          await supabase.storage.from("character-avatars").remove(toDelete);
        }
      }
      setCustomAvatars(prev => {
        const next = { ...prev };
        delete next[emotion];
        return next;
      });
      toast.success(`${emotionLabels[emotion]} avatar removed`);
    } catch {
      toast.error("Failed to remove avatar");
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          character_name: characterName.trim() || null,
          character_personality: characterPersonality.trim() || null,
          character_speaking_style: characterSpeakingStyle.trim() || null,
          character_appearance: characterAppearance.trim() || null,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;

      // Cache in localStorage for chat to pick up immediately
      if (characterName.trim()) {
        localStorage.setItem("aori-character-name", characterName.trim());
      } else {
        localStorage.removeItem("aori-character-name");
      }

      toast.success("Character saved! Your companion has evolved~ ✨");
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Couldn't save. Try again!");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset to default Aori? This will remove your custom character name, personality, and all uploaded avatars.")) return;
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("user_profiles")
        .update({
          character_name: null,
          character_personality: null,
          character_speaking_style: null,
          character_appearance: null,
        } as any)
        .eq("user_id", user.id);

      // Remove all uploaded avatars
      const { data: files } = await supabase.storage
        .from("character-avatars")
        .list(user.id);
      if (files && files.length > 0) {
        await supabase.storage
          .from("character-avatars")
          .remove(files.map(f => `${user.id}/${f.name}`));
      }

      setCharacterName("");
      setCharacterPersonality("");
      setCharacterSpeakingStyle("");
      setCharacterAppearance("");
      setCustomAvatars({});
      localStorage.removeItem("aori-character-name");
      toast.success("Reset to default Aori~ 💙");
    } catch {
      toast.error("Reset failed");
    } finally {
      setSaving(false);
    }
  };

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedEmotion) {
      handleUploadAvatar(file, selectedEmotion);
    }
    e.target.value = "";
    setSelectedEmotion(null);
  }, [selectedEmotion, handleUploadAvatar]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateAll = useCallback(async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files allowed!");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB per image!");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const base64 = await fileToBase64(file);
      let completed = 0;

      for (const emotion of EMOTIONS) {
        setGeneratingEmotion(emotion);
        try {
          const { data, error } = await supabase.functions.invoke("aori-generate-expressions", {
            body: { baseImage: base64, emotion, userId: user.id },
          });

          if (error) {
            console.error(`Error generating ${emotion}:`, error);
            toast.error(`Failed to generate ${emotionLabels[emotion]}`);
          } else if (data?.imageUrl) {
            setCustomAvatars(prev => ({ ...prev, [emotion]: data.imageUrl }));
          } else if (data?.error) {
            console.error(`${emotion} error:`, data.error);
            if (data.error.includes("Rate limited")) {
              toast.error("Rate limited! Waiting before continuing...");
              await new Promise(r => setTimeout(r, 5000));
              // Retry once
              const { data: retryData } = await supabase.functions.invoke("aori-generate-expressions", {
                body: { baseImage: base64, emotion, userId: user.id },
              });
              if (retryData?.imageUrl) {
                setCustomAvatars(prev => ({ ...prev, [emotion]: retryData.imageUrl }));
              }
            }
          }
        } catch (err) {
          console.error(`Failed ${emotion}:`, err);
        }

        completed++;
        setGenerationProgress(Math.round((completed / EMOTIONS.length) * 100));
        
        // Small delay between requests to avoid rate limiting
        if (completed < EMOTIONS.length) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      toast.success("All expressions generated! ✨");
    } catch (e) {
      console.error("Generation error:", e);
      toast.error("Generation failed. Try again!");
    } finally {
      setIsGenerating(false);
      setGeneratingEmotion(null);
      setGenerationProgress(0);
    }
  }, [user]);

  const onBaseImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleGenerateAll(file);
    e.target.value = "";
  }, [handleGenerateAll]);

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
        <h1 className="text-lg font-semibold">Character Studio</h1>
        <div className="flex-1" />
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Aori
        </button>
      </div>

      {/* Intro */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div className="bg-card rounded-2xl rounded-bl-md p-3 text-sm leading-relaxed border border-border/30 flex-1">
          Create your own AI companion! Customize name, personality, speaking style, and upload unique avatars for each emotion~ ✨
        </div>
      </div>

      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={onFileChange} />
      <input type="file" ref={baseImageInputRef} accept="image/*" className="hidden" onChange={onBaseImageChange} />

      {/* Form */}
      <div className="flex-1 px-4 pb-4 space-y-5 overflow-y-auto">
        {/* Character Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Character Name
          </label>
          <input
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Leave empty for default (Aori Tatsumi)"
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50"
          />
          <p className="text-[11px] text-muted-foreground/60">Your AI companion's name. Used in chat and greetings.</p>
        </div>

        {/* Personality */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Custom Personality
          </label>
          <textarea
            value={characterPersonality}
            onChange={(e) => setCharacterPersonality(e.target.value)}
            placeholder="Describe their personality... e.g. 'A cheerful and protective guardian spirit who speaks with ancient wisdom but uses modern slang. Loves dad jokes.'"
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          <p className="text-[11px] text-muted-foreground/60">Overrides the default personality. Describe how they act, think, and react.</p>
        </div>

        {/* Speaking Style */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Speaking Style
          </label>
          <textarea
            value={characterSpeakingStyle}
            onChange={(e) => setCharacterSpeakingStyle(e.target.value)}
            placeholder="How do they talk? e.g. 'Uses lots of cat puns, says ~nya at the end of sentences, speaks in third person sometimes. Mixes Japanese and English.'"
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          <p className="text-[11px] text-muted-foreground/60">Defines speech patterns, catchphrases, and language quirks.</p>
        </div>

        {/* Character Appearance */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Character Appearance
          </label>
          <textarea
            value={characterAppearance}
            onChange={(e) => setCharacterAppearance(e.target.value)}
            placeholder="Describe what your character looks like for image generation. e.g. 'A realistic young woman with long brown hair, brown eyes, fair skin, wearing a white hoodie. Ultra realistic photography style.'"
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          <p className="text-[11px] text-muted-foreground/60">This is used for AI image generation. Describe hair, eyes, skin, outfit, and art style (realistic/anime).</p>
        </div>

        <div className="h-px bg-border/50 my-2" />

        {/* Avatar Grid */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Emotion Avatars
          </label>
          <p className="text-[11px] text-muted-foreground/60">Upload custom images for each emotion, or upload one image to auto-generate all expressions with AI.</p>

          {/* Generate All Button */}
          <button
            onClick={() => baseImageInputRef.current?.click()}
            disabled={isGenerating}
            className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm font-medium text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating {generatingEmotion ? emotionLabels[generatingEmotion as AoriEmotion] : ""}...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Upload 1 Image → Generate All 14 Expressions
              </>
            )}
          </button>

          {isGenerating && (
            <div className="space-y-1">
              <Progress value={generationProgress} className="h-2" />
              <p className="text-[11px] text-muted-foreground/60 text-center">
                {generationProgress}% — {Math.round(generationProgress / 100 * EMOTIONS.length)}/{EMOTIONS.length} emotions
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2">
            {EMOTIONS.map((emotion) => (
              <div key={emotion} className="flex flex-col items-center gap-1.5">
                <div className="relative w-20 h-20 rounded-xl border border-border/50 bg-card overflow-hidden group">
                  <img
                    src={customAvatars[emotion] || emotionCutouts[emotion]}
                    alt={emotion}
                    className="w-full h-full object-contain p-1"
                  />
                  {customAvatars[emotion] && (
                    <div className="absolute top-0.5 right-0.5">
                      <span className="w-2 h-2 rounded-full bg-primary block" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    {uploadingEmotion === emotion ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setSelectedEmotion(emotion);
                            fileInputRef.current?.click();
                          }}
                          className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        {customAvatars[emotion] && (
                          <>
                            <a
                              href={customAvatars[emotion]}
                              download={`${emotion}.png`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => handleRemoveAvatar(emotion)}
                              className="p-1.5 rounded-full bg-white/20 text-white hover:bg-destructive/60 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  {emotionLabels[emotion]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Character
        </button>
      </div>
    </div>
  );
}