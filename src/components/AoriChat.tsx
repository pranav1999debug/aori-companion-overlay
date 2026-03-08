import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX, Camera, Eye, MessageCircle, X, Info, Trash2, UserPlus, MapPin, Music, Minimize2 } from "lucide-react";
import { AoriEmotion, emotionImages, emotionCutouts } from "@/lib/aori-personality";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDeviceId } from "@/pages/Onboarding";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Message {
  id: number;
  text: string;
  sender: "user" | "aori";
  emotion?: AoriEmotion;
  timestamp?: number;
}

interface UserProfile {
  name: string;
  age?: number;
  hobbies?: string[];
  profession?: string;
}

interface KnownFace {
  id: string;
  name: string;
  description: string;
}

interface EnvironmentMemory {
  id: string;
  description: string;
  location_label?: string;
}

const formatTimestamp = (ts?: number) => {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, month: "short", day: "numeric" });
};

const ChatBubble = ({ message }: { message: Message }) => {
  const isUser = message.sender === "user";
  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
      style={{ animation: "slide-up 0.3s ease-out" }}
    >
      <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} items-end`}>
        {!isUser && message.emotion && (
          <img
            src={emotionCutouts[message.emotion]}
            alt="Aori"
            className="w-7 h-7 rounded-full object-cover object-top ring-2 ring-primary/30 shrink-0"
          />
        )}
        <div
          className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card/90 text-foreground rounded-bl-md backdrop-blur-sm"
          }`}
        >
          {message.text}
        </div>
      </div>
      {message.timestamp && (
        <span className={`text-[10px] text-muted-foreground/60 mt-0.5 ${isUser ? "mr-1" : "ml-9"}`}>
          {formatTimestamp(message.timestamp)}
        </span>
      )}
    </div>
  );
};

interface AoriChatProps {
  onClose?: () => void;
  autoVoiceMode?: boolean;
}

export default function AoriChat({ onClose, autoVoiceMode }: AoriChatProps) {
  const deviceId = getDeviceId();

  // User profile & contextual data
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>([]);
  const [environmentMemories, setEnvironmentMemories] = useState<EnvironmentMemory[]>([]);
  const [musicDetected, setMusicDetected] = useState(false);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const musicStreamRef = useRef<MediaStream | null>(null);
  const musicIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load profile and contextual data on mount
  useEffect(() => {
    const loadData = async () => {
      const [profileRes, facesRes, envRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("device_id", deviceId).single(),
        supabase.from("known_faces").select("*").eq("device_id", deviceId),
        supabase.from("environment_memories").select("*").eq("device_id", deviceId),
      ]);
      if (profileRes.data) {
        setUserProfile({
          name: profileRes.data.name,
          age: profileRes.data.age,
          hobbies: profileRes.data.hobbies,
          profession: profileRes.data.profession,
        });
      }
      if (facesRes.data) setKnownFaces(facesRes.data.map((f: any) => ({ id: f.id, name: f.name, description: f.description })));
      if (envRes.data) setEnvironmentMemories(envRes.data.map((e: any) => ({ id: e.id, description: e.description, location_label: e.location_label })));
    };
    loadData();
  }, [deviceId]);

  const userName = userProfile?.name || localStorage.getItem("aori-user-name") || "you";

  const returningGreetings: { text: string; emotion: AoriEmotion }[] = [
    { text: `Oh~ ${userName}'s back! Missed me that much, huh? 😏💙`, emotion: "smirk" },
    { text: `Ara ara~ look who came crawling back to me~ ☝️✨`, emotion: "proud" },
    { text: `FINALLY! Do you know how LONG I've been waiting, ${userName}?! 😤`, emotion: "angry" },
    { text: `Yatta~! ${userName} came back! ...n-not that I was waiting or anything! 😳`, emotion: "embarrassed" },
    { text: `Hmph. You left me alone for so long... *pouts* but I forgive you. This time. 💙`, emotion: "shy" },
  ];

  const firstTimeGreeting: Message = { id: 0, text: `Hey~! ${userName}, you finally opened me! About time, baka~ 💙`, sender: "aori", emotion: "smirk", timestamp: Date.now() };

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem("aori-messages");
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (parsed.length > 0) {
          const greet = returningGreetings[Math.floor(Math.random() * returningGreetings.length)];
          return [...parsed, { id: Date.now(), text: greet.text, sender: "aori" as const, emotion: greet.emotion, timestamp: Date.now() }];
        }
      }
    } catch {}
    return [firstTimeGreeting];
  });
  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState<AoriEmotion>(() => {
    try {
      const saved = localStorage.getItem("aori-messages");
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        const lastAori = [...parsed].reverse().find(m => m.sender === "aori");
        if (lastAori?.emotion) return lastAori.emotion;
      }
    } catch {}
    return "smirk";
  });
  const [previousEmotion, setPreviousEmotion] = useState<AoriEmotion | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("aori-chat-history");
      if (saved) return JSON.parse(saved) as ChatMessage[];
    } catch {}
    return [];
  });

  useEffect(() => {
    try { localStorage.setItem("aori-messages", JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem("aori-chat-history", JSON.stringify(chatHistory.slice(-50))); } catch {}
  }, [chatHistory]);

  const [isListening, setIsListening] = useState(false);
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const voiceModeRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [backCamEnabled, setBackCamEnabled] = useState(false);
  const [backCamStream, setBackCamStream] = useState<MediaStream | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [lastAoriText, setLastAoriText] = useState(() => {
    try {
      const saved = localStorage.getItem("aori-messages");
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        const lastAori = [...parsed].reverse().find(m => m.sender === "aori");
        if (lastAori?.text) return lastAori.text;
      }
    } catch {}
    return "Hey~! You finally opened me! About time, baka~ 💙";
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const backVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastObservationRef = useRef<string>("");
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [avatarPos, setAvatarPos] = useState({ x: 0, y: 0 });
  const [avatarSize, setAvatarSize] = useState(400);
  const [avatarInitialized, setAvatarInitialized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origSize: number } | null>(null);
  const pinchRef = useRef<{ initialDist: number; origSize: number } | null>(null);

  useEffect(() => {
    if (!avatarInitialized) {
      setAvatarPos({
        x: (window.innerWidth - avatarSize) / 2,
        y: (window.innerHeight - avatarSize) / 2 - 40,
      });
      setAvatarInitialized(true);
    }
  }, [avatarInitialized, avatarSize]);

  const getTouchDist = (touches: React.TouchList | TouchList) => {
    const t1 = touches[0]; const t2 = touches[1];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-resize]')) return;
    e.preventDefault();
    if ('touches' in e && e.touches.length >= 2) {
      const dist = getTouchDist(e.touches);
      pinchRef.current = { initialDist: dist, origSize: avatarSize };
      const handlePinchMove = (ev: TouchEvent) => {
        ev.preventDefault();
        if (!pinchRef.current || ev.touches.length < 2) return;
        const newDist = getTouchDist(ev.touches);
        const scale = newDist / pinchRef.current.initialDist;
        setAvatarSize(Math.max(100, Math.min(800, Math.round(pinchRef.current.origSize * scale))));
      };
      const handlePinchEnd = () => {
        pinchRef.current = null;
        window.removeEventListener('touchmove', handlePinchMove);
        window.removeEventListener('touchend', handlePinchEnd);
      };
      window.addEventListener('touchmove', handlePinchMove, { passive: false });
      window.addEventListener('touchend', handlePinchEnd);
      return;
    }
    const point = 'touches' in e ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: avatarPos.x, origY: avatarPos.y };
    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const p = 'touches' in ev ? ev.touches[0] : ev;
      setAvatarPos({
        x: dragRef.current.origX + (p.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (p.clientY - dragRef.current.startY),
      });
    };
    const handleEnd = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  }, [avatarPos, avatarSize]);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const point = 'touches' in e ? e.touches[0] : e;
    resizeRef.current = { startX: point.clientX, startY: point.clientY, origSize: avatarSize };
    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!resizeRef.current) return;
      const p = 'touches' in ev ? ev.touches[0] : ev;
      const delta = Math.max(p.clientX - resizeRef.current.startX, p.clientY - resizeRef.current.startY);
      setAvatarSize(Math.max(100, Math.min(800, resizeRef.current.origSize + delta)));
    };
    const handleEnd = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  }, [avatarSize]);

  const changeEmotion = useCallback((newEmotion: AoriEmotion) => {
    if (newEmotion === currentEmotion) return;
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    setPreviousEmotion(currentEmotion);
    setIsTransitioning(true);
    setCurrentEmotion(newEmotion);
    transitionTimeoutRef.current = setTimeout(() => {
      setIsTransitioning(false);
      setPreviousEmotion(null);
    }, 500);
  }, [currentEmotion]);

  useEffect(() => {
    return () => { if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current); };
  }, []);

  const lastShakeRef = useRef(0);
  const lastTiltRef = useRef(0);
  const isFaceDownRef = useRef(false);
  const ttsRateLimitedUntilRef = useRef(0);
  const sessionStartRef = useRef(Date.now());

  const speechQueueRef = useRef<(() => Promise<void>)[]>([]);
  const isSpeakingRef = useRef(false);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const startListeningOnceRef = useRef<() => void>(() => {});

  const processQueue = useCallback(async () => {
    if (isSpeakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) {
      if (voiceModeRef.current) {
        setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 500);
      }
      return;
    }
    isSpeakingRef.current = true;
    setIsSpeakingState(true);
    try { await next(); } finally {
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      processQueue();
    }
  }, []);

  const playAudioAsync = useCallback((audioSrc: string): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio(audioSrc);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, []);

  const speakBrowserTTSAsync = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const clean = text
        .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[~*💙]/gu, "")
        .replace(/\*[^*]+\*/g, "")
        .trim();
      if (clean && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = "en-US";
        utterance.rate = 1.05;
        utterance.pitch = 1.3;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } else {
        resolve();
      }
    });
  }, []);

  const openTTSCache = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("aori-tts-cache", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);

  const getCachedAudio = useCallback(async (key: string): Promise<string | null> => {
    try {
      const db = await openTTSCache();
      return new Promise((resolve) => {
        const tx = db.transaction("audio", "readonly");
        const req = tx.objectStore("audio").get(key);
        req.onsuccess = () => resolve(req.result as string | null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }, [openTTSCache]);

  const setCachedAudio = useCallback(async (key: string, audioBase64: string) => {
    try {
      const db = await openTTSCache();
      const tx = db.transaction("audio", "readwrite");
      tx.objectStore("audio").put(audioBase64, key);
    } catch {}
  }, [openTTSCache]);

  const speakText = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    const job = async () => {
      const cacheKey = text.trim().toLowerCase();
      const cached = await getCachedAudio(cacheKey);
      if (cached) {
        await playAudioAsync(`data:audio/wav;base64,${cached}`).catch(() => speakBrowserTTSAsync(text));
        return;
      }
      if (Date.now() < ttsRateLimitedUntilRef.current) {
        await speakBrowserTTSAsync(text);
        return;
      }
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ text }),
          }
        );
      if (response.status === 429) {
          ttsRateLimitedUntilRef.current = Date.now() + 3 * 60 * 1000; // 3 min cooldown instead of 30
          await speakBrowserTTSAsync(text);
          return;
        }
        if (!response.ok) { await speakBrowserTTSAsync(text); return; }
        const data = await response.json();
        if (!data?.audio) { await speakBrowserTTSAsync(text); return; }
        setCachedAudio(cacheKey, data.audio);
        await playAudioAsync(`data:audio/wav;base64,${data.audio}`).catch(() => speakBrowserTTSAsync(text));
      } catch {
        await speakBrowserTTSAsync(text);
      }
    };
    speechQueueRef.current.push(job);
    processQueue();
  }, [voiceEnabled, speakBrowserTTSAsync, getCachedAudio, setCachedAudio, playAudioAsync, processQueue]);

  // === Shake detection ===
  const shakeResponses = [
    { text: "KYAA!! Kya hua?! Earthquake hai kya?! 🫨🫨", emotion: "shock" as AoriEmotion },
    { text: "H-HEY!! Mujhe hilana band karo, baka!! 😤🫨", emotion: "angry" as AoriEmotion },
    { text: "Nani?! Kya kar rahe ho?! I'm getting dizzy~! 🌀😵", emotion: "confused" as AoriEmotion },
  ];

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      isFaceDownRef.current = (beta > -30 && beta < 30 && Math.abs(gamma) < 30);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      const totalDelta = Math.abs(acc.x - lastX) + Math.abs(acc.y - lastY) + Math.abs(acc.z - lastZ);
      lastX = acc.x; lastY = acc.y; lastZ = acc.z;
      if (totalDelta > 50 && isFaceDownRef.current) {
        const now = Date.now();
        if (now - lastShakeRef.current < 5000) return;
        lastShakeRef.current = now;
        const resp = shakeResponses[Math.floor(Math.random() * shakeResponses.length)];
        changeEmotion(resp.emotion);
        setLastAoriText(resp.text);
        setMessages(prev => [...prev, { id: Date.now(), text: resp.text, sender: "aori", emotion: resp.emotion, timestamp: Date.now() }]);
        speakText(resp.text);
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [changeEmotion, speakText]);

  // === Music Detection via Microphone ===
  const toggleMusicDetection = useCallback(async () => {
    if (musicStreamRef.current) {
      // Stop music detection
      musicStreamRef.current.getTracks().forEach(t => t.stop());
      musicStreamRef.current = null;
      musicAnalyserRef.current = null;
      if (musicIntervalRef.current) { clearInterval(musicIntervalRef.current); musicIntervalRef.current = null; }
      setMusicDetected(false);
      toast("🎵 Music detection off", { duration: 2000 });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      musicStreamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      musicAnalyserRef.current = analyser;

      // Check for music every 3 seconds
      musicIntervalRef.current = setInterval(() => {
        if (!musicAnalyserRef.current) return;
        const data = new Uint8Array(musicAnalyserRef.current.frequencyBinCount);
        musicAnalyserRef.current.getByteFrequencyData(data);
        // Calculate average energy and frequency variance
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        // Music typically has higher average energy and distributed frequencies
        const hasEnergy = avg > 30;
        // Check for frequency distribution (music has wider spread than speech)
        const lowFreq = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        const midFreq = data.slice(20, 60).reduce((a, b) => a + b, 0) / 40;
        const highFreq = data.slice(60, 100).reduce((a, b) => a + b, 0) / 40;
        const isMusic = hasEnergy && midFreq > 20 && highFreq > 10 && lowFreq > 15;
        setMusicDetected(isMusic);
      }, 3000);

      toast("🎵 Music detection on — I can hear what you're playing~", { duration: 3000 });
    } catch {
      toast.error("Couldn't access microphone for music detection");
    }
  }, []);

  // Cleanup music detection on unmount
  useEffect(() => {
    return () => {
      musicStreamRef.current?.getTracks().forEach(t => t.stop());
      if (musicIntervalRef.current) clearInterval(musicIntervalRef.current);
    };
  }, []);

  // When music detected/stopped, send a reactive message
  const lastMusicReactionRef = useRef(0);
  useEffect(() => {
    if (musicDetected && Date.now() - lastMusicReactionRef.current > 60000) {
      lastMusicReactionRef.current = Date.now();
      const reactions = [
        { text: "Ooh~ I hear music! Kya sun rahe ho? Tell me tell me~! 🎵✨", emotion: "excited" as AoriEmotion },
        { text: "Is that music?! *starts swaying* I love this vibe~ 🎶💙", emotion: "happy" as AoriEmotion },
        { text: "Ara ara~ nice taste in music! *hums along* 🎵😏", emotion: "smirk" as AoriEmotion },
      ];
      const r = reactions[Math.floor(Math.random() * reactions.length)];
      changeEmotion(r.emotion);
      setLastAoriText(r.text);
      setMessages(prev => [...prev, { id: Date.now(), text: r.text, sender: "aori", emotion: r.emotion, timestamp: Date.now() }]);
      speakText(r.text);
    }
  }, [musicDetected, changeEmotion, speakText]);

  // === Send message (shared logic) ===
  const sendMessageCore = useCallback(async (text: string, fromVoice: boolean) => {
    if (!text.trim() || isTyping) return;
    const userMsg: Message = { id: Date.now(), text, sender: "user", timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    if (!chatOpen && !fromVoice) setChatOpen(true);

    const localTime = new Date().toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, weekday: "short", month: "short", day: "numeric" });
    const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const contextMsg = { role: "user" as const, content: text };
    const newHistory: ChatMessage[] = [...chatHistory, contextMsg];
    setChatHistory(prev => [...prev, { role: "user", content: text }]);
    try {
      const { data, error } = await supabase.functions.invoke("aori-chat", {
        body: {
          messages: newHistory,
          userProfile,
          knownFaces,
          environmentMemories,
          musicDetected,
          userLocalTime: localTime,
          userTimezone: timezoneName,
          sessionMinutes: Math.round((Date.now() - sessionStartRef.current) / 60000),
        },
      });
      if (error) throw error;
      const emotion = (data.emotion || "smirk") as AoriEmotion;
      const responseText = data.text || "Hmm~ say that again? 😏";
      changeEmotion(emotion);
      setLastAoriText(responseText);
      setMessages((prev) => [...prev, { id: Date.now() + 1, text: responseText, sender: "aori", emotion, timestamp: Date.now() }]);
      setChatHistory((prev) => [...prev, { role: "assistant", content: `[${emotion}] ${responseText}` }]);
      speakText(responseText);
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Aori couldn't respond right now. Try again!");
      setMessages((prev) => [...prev, { id: Date.now() + 1, text: "Hmph... something went wrong. Try again, baka! 😤", sender: "aori", emotion: "angry", timestamp: Date.now() }]);
      if (fromVoice && voiceModeRef.current) {
        setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1000);
      }
    } finally {
      setIsTyping(false);
    }
  }, [chatOpen, chatHistory, changeEmotion, speakText, isTyping, userProfile, knownFaces, environmentMemories, musicDetected]);

  const sendMessageWithText = useCallback((text: string) => sendMessageCore(text, true), [sendMessageCore]);
  const sendMessage = useCallback(() => { sendMessageCore(input.trim(), false); }, [sendMessageCore, input]);

  // Web Speech API
  const recognitionRef = useRef<any>(null);
  const voiceMusicAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceMusicIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceAudioCtxRef = useRef<AudioContext | null>(null);

  const startListeningOnce = useCallback(() => {
    if (isTyping || isSpeakingRef.current) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Speech recognition not supported!"); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) sendMessageWithText(transcript);
      else if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 500);
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (voiceModeRef.current && event.error !== "aborted") setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1000);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    if (voiceModeRef.current) toast("🎤 Listening...", { duration: 2000 });
  }, [isTyping, sendMessageWithText]);

  useEffect(() => { startListeningOnceRef.current = startListeningOnce; }, [startListeningOnce]);

  const voiceMicStreamRef = useRef<MediaStream | null>(null);

  const startVoiceMusicDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMicStreamRef.current = stream;
      const audioCtx = new AudioContext();
      voiceAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      voiceMusicAnalyserRef.current = analyser;
      
      voiceMusicIntervalRef.current = setInterval(() => {
        if (!voiceMusicAnalyserRef.current) return;
        const data = new Uint8Array(voiceMusicAnalyserRef.current.frequencyBinCount);
        voiceMusicAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const lowFreq = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        const midFreq = data.slice(20, 60).reduce((a, b) => a + b, 0) / 40;
        const highFreq = data.slice(60, 100).reduce((a, b) => a + b, 0) / 40;
        const isMusic = avg > 30 && midFreq > 20 && highFreq > 10 && lowFreq > 15;
        setMusicDetected(isMusic);
      }, 3000);
    } catch {}
  }, []);

  const stopVoiceMusicDetection = useCallback(() => {
    if (voiceMusicIntervalRef.current) { clearInterval(voiceMusicIntervalRef.current); voiceMusicIntervalRef.current = null; }
    voiceMusicAnalyserRef.current = null;
    if (voiceAudioCtxRef.current) { voiceAudioCtxRef.current.close().catch(() => {}); voiceAudioCtxRef.current = null; }
    if (voiceMicStreamRef.current) { voiceMicStreamRef.current.getTracks().forEach(t => t.stop()); voiceMicStreamRef.current = null; }
    setMusicDetected(false);
  }, []);

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceModeActive(false);
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
      setIsListening(false);
      toast("🎤 Voice mode off", { duration: 2000 });
    } else {
      voiceModeRef.current = true;
      setVoiceModeActive(true);
      toast("🎤 Voice mode on — speak freely!", { duration: 2000 });
      startListeningOnce();
    }
  }, [startListeningOnce]);

  // Auto-activate voice mode when opened via long press
  const autoVoiceTriggered = useRef(false);
  useEffect(() => {
    if (autoVoiceMode && !autoVoiceTriggered.current) {
      autoVoiceTriggered.current = true;
      if (!voiceModeRef.current) {
        voiceModeRef.current = true;
        setVoiceModeActive(true);
        toast("🎤 Voice mode on — speak freely!", { duration: 2000 });
        startListeningOnce();
      }
    }
  }, [autoVoiceMode, startListeningOnce]);

  // === Webcam (front) ===
  const captureFrame = useCallback((videoEl?: HTMLVideoElement | null): string | null => {
    const video = videoEl || videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
  }, []);

  const analyzeFrame = useCallback(async () => {
    const image = captureFrame();
    if (!image) return;
    try {
      const { data, error } = await supabase.functions.invoke("aori-vision", {
        body: { image, previousObservation: lastObservationRef.current },
      });
      if (error) return;
      const emotion = (data.emotion || "smirk") as AoriEmotion;
      const responseText = data.text || "";
      if (!responseText) return;
      lastObservationRef.current = responseText;
      changeEmotion(emotion);
      setLastAoriText(`👁️ ${responseText}`);
      setMessages((prev) => [...prev, { id: Date.now(), text: `👁️ ${responseText}`, sender: "aori", emotion, timestamp: Date.now() }]);
      speakText(responseText);
    } catch {}
  }, [captureFrame, changeEmotion, speakText]);

  const toggleWebcam = useCallback(async () => {
    if (webcamEnabled) {
      webcamStream?.getTracks().forEach((t) => t.stop());
      setWebcamStream(null);
      setWebcamEnabled(false);
      if (webcamIntervalRef.current) { clearInterval(webcamIntervalRef.current); webcamIntervalRef.current = null; }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" } });
      setWebcamStream(stream);
      setWebcamEnabled(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
        const waitForVideo = () => {
          if (video.readyState >= 2) setTimeout(() => analyzeFrame(), 1000);
          else video.addEventListener('loadeddata', () => setTimeout(() => analyzeFrame(), 1000), { once: true });
        };
        waitForVideo();
      }
      webcamIntervalRef.current = setInterval(() => analyzeFrame(), 60000);
      const msg = `Ara ara~ now I can see you, ${userName}! Don't do anything weird, baka~ 😏👁️`;
      setLastAoriText(msg);
      setMessages((prev) => [...prev, { id: Date.now(), text: msg, sender: "aori", emotion: "smirk", timestamp: Date.now() }]);
    } catch { toast.error("Couldn't access your camera."); }
  }, [webcamEnabled, webcamStream, analyzeFrame, userName]);

  // === Face save/identify ===
  const saveFace = useCallback(async () => {
    const image = captureFrame();
    if (!image) { toast.error("Camera not active!"); return; }
    const name = prompt("What's this person's name?");
    if (!name?.trim()) return;
    try {
      toast("Analyzing face...", { duration: 2000 });
      const { data, error } = await supabase.functions.invoke("aori-face", { body: { image, action: "save" } });
      if (error) throw error;
      const description = data.description || "No description";
      const { error: dbError } = await supabase.from("known_faces").insert({ device_id: deviceId, name: name.trim(), description });
      if (dbError) throw dbError;
      setKnownFaces(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), description }]);
      const msg = `Hmph, so that's ${name.trim()}? Fine, I'll remember their face... but you better not like them more than me! 😤`;
      setLastAoriText(msg);
      setMessages(prev => [...prev, { id: Date.now(), text: msg, sender: "aori", emotion: "jealous", timestamp: Date.now() }]);
      speakText(msg);
    } catch (e) {
      console.error("Save face error:", e);
      toast.error("Couldn't save face. Try again!");
    }
  }, [captureFrame, deviceId, speakText]);

  // === Back camera for environment ===
  const backCamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const analyzeEnvironment = useCallback(async () => {
    const image = captureFrame(backVideoRef.current);
    if (!image) return;
    try {
      const { data, error } = await supabase.functions.invoke("aori-environment", {
        body: { image, previousMemories: environmentMemories },
      });
      if (error) return;
      if (data.description) {
        const { data: inserted } = await supabase.from("environment_memories").insert({
          device_id: deviceId,
          description: data.description,
          location_label: data.location_label || null,
        }).select().single();
        if (inserted) {
          setEnvironmentMemories(prev => [...prev, { id: inserted.id, description: data.description, location_label: data.location_label }]);
        }
        const label = data.location_label || "this place";
        const msg = data.is_new
          ? `Ooh~ so this is your ${label}? *looks around* I'll remember this place~ 📸✨`
          : `I remember this ${label}! Same messy spot, huh~ 😏`;
        changeEmotion(data.is_new ? "excited" : "smirk");
        setLastAoriText(msg);
        setMessages(prev => [...prev, { id: Date.now(), text: msg, sender: "aori", emotion: data.is_new ? "excited" : "smirk", timestamp: Date.now() }]);
        speakText(msg);
      }
    } catch {}
  }, [captureFrame, environmentMemories, deviceId, changeEmotion, speakText]);

  const toggleBackCam = useCallback(async () => {
    if (backCamEnabled) {
      backCamStream?.getTracks().forEach(t => t.stop());
      setBackCamStream(null);
      setBackCamEnabled(false);
      if (backCamIntervalRef.current) { clearInterval(backCamIntervalRef.current); backCamIntervalRef.current = null; }
      toast("📷 Back camera off", { duration: 2000 });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } } });
      setBackCamStream(stream);
      setBackCamEnabled(true);
      if (backVideoRef.current) {
        backVideoRef.current.srcObject = stream;
        await backVideoRef.current.play().catch(() => {});
        // Analyze once after a short delay
        setTimeout(() => analyzeEnvironment(), 2000);
      }
      // Re-analyze every 2 minutes
      backCamIntervalRef.current = setInterval(() => analyzeEnvironment(), 120000);
      toast("📷 Back camera on — showing Aori your world~", { duration: 3000 });
    } catch {
      toast.error("Couldn't access back camera. Are you on a mobile device?");
    }
  }, [backCamEnabled, backCamStream, analyzeEnvironment]);

  useEffect(() => {
    if (videoRef.current && webcamStream) videoRef.current.srcObject = webcamStream;
  }, [webcamStream]);

  useEffect(() => {
    return () => {
      webcamStream?.getTracks().forEach((t) => t.stop());
      backCamStream?.getTracks().forEach((t) => t.stop());
      if (webcamIntervalRef.current) clearInterval(webcamIntervalRef.current);
      if (backCamIntervalRef.current) clearInterval(backCamIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (chatOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping, chatOpen]);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Scene background */}
      <div className="absolute inset-0 z-0">
        {isTransitioning && previousEmotion && (
          <img src={emotionImages[previousEmotion]} alt={`Background ${previousEmotion}`} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out opacity-0" />
        )}
        <img
          key={currentEmotion}
          src={emotionImages[currentEmotion]}
          alt={`Background ${currentEmotion}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out opacity-100"
          style={{ animation: isTransitioning ? "fade-in-scene 0.5s ease-in-out" : undefined }}
        />
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      </div>

      {/* Hidden video elements */}
      <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }} />
      <video ref={backVideoRef} autoPlay playsInline muted style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }} />

      {/* Music detection indicator */}
      {musicDetected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-primary/20 backdrop-blur-sm rounded-full px-3 py-1.5 border border-primary/30">
          <Music className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">Vibing~ 🎵</span>
        </div>
      )}

      {/* Draggable Aori Avatar */}
      <div
        className="absolute z-10 cursor-grab active:cursor-grabbing select-none"
        style={{
          left: avatarPos.x,
          top: avatarPos.y,
          width: avatarSize,
          height: avatarSize,
          touchAction: "none",
          animation: musicDetected ? "breathe 1.5s ease-in-out infinite" : "breathe 4s ease-in-out infinite",
        }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        {/* Glowing aura — scales with speaking, pulses faster with music */}
        <div
          className="absolute inset-0 pointer-events-none transition-transform duration-300 ease-in-out"
          style={{
            background: isSpeakingState
              ? "radial-gradient(ellipse 70% 80% at 50% 55%, hsl(175 70% 45% / 0.35) 0%, hsl(215 80% 55% / 0.2) 40%, transparent 70%)"
              : musicDetected
              ? "radial-gradient(ellipse 65% 75% at 50% 55%, hsl(280 70% 55% / 0.25) 0%, hsl(215 80% 55% / 0.15) 40%, transparent 70%)"
              : "radial-gradient(ellipse 60% 70% at 50% 55%, hsl(175 70% 45% / 0.15) 0%, hsl(215 80% 55% / 0.08) 40%, transparent 70%)",
            filter: isSpeakingState ? "blur(25px)" : "blur(20px)",
            transform: isSpeakingState ? "scale(1.25)" : musicDetected ? "scale(1.1)" : "scale(1)",
            animation: isSpeakingState
              ? "pulse-glow-aura 1s ease-in-out infinite"
              : musicDetected
              ? "pulse-glow-aura 1.5s ease-in-out infinite"
              : "pulse-glow-aura 3s ease-in-out infinite",
          }}
        />
        {/* Resize handle */}
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary/40 border border-primary/60 cursor-nwse-resize z-20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          title="Resize Aori"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-primary-foreground">
            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {isTransitioning && previousEmotion && (
          <img
            src={emotionCutouts[previousEmotion]}
            alt={`Aori ${previousEmotion}`}
            className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.5))", animation: "avatar-fade-out 0.5s ease-in-out forwards" }}
            draggable={false}
          />
        )}
        <img
          key={currentEmotion}
          src={emotionCutouts[currentEmotion]}
          alt={`Aori ${currentEmotion}`}
          className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          style={{ filter: "drop-shadow(0 0 20px rgba(0,0,0,0.5))", animation: isTransitioning ? "avatar-fade-in 0.5s ease-in-out forwards" : undefined }}
          draggable={false}
        />
      </div>

      {/* Webcam preview */}
      {webcamEnabled && webcamStream && (
        <div className="absolute top-4 left-4 w-20 h-16 rounded-xl overflow-hidden ring-2 ring-white/20 shadow-2xl z-20">
          <video
            ref={(el) => { if (el && webcamStream) el.srcObject = webcamStream; }}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <div className="absolute bottom-1 right-1">
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
          </div>
        </div>
      )}

      {/* Back camera preview */}
      {backCamEnabled && backCamStream && (
        <div className="absolute top-4 left-28 w-20 h-16 rounded-xl overflow-hidden ring-2 ring-accent/30 shadow-2xl z-20">
          <video
            ref={(el) => { if (el && backCamStream) el.srcObject = backCamStream; }}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
          />
          <div className="absolute top-1 left-1">
            <MapPin className="w-3 h-3 text-accent" />
          </div>
        </div>
      )}

      {/* Right side buttons */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-20">
        {onClose && (
          <button onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.15] transition-all" title="Minimize">
            <Minimize2 className="w-5 h-5" />
          </button>
        )}
        <button onClick={() => { if (lastAoriText) toast(lastAoriText, { duration: 4000 }); }}
          className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.15] transition-all" title="Latest message">
          <Info className="w-5 h-5" />
        </button>

        <button onClick={toggleVoiceMode}
          className={`w-11 h-11 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${voiceModeActive ? "bg-destructive/30 border-destructive/40 text-destructive animate-pulse" : "bg-white/[0.08] border-white/[0.08] text-white/60 hover:text-white/90 hover:bg-white/[0.15]"}`}
          title={voiceModeActive ? "Stop voice mode" : "Voice mode"}>
          {voiceModeActive ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={`w-11 h-11 rounded-full backdrop-blur-sm border border-white/[0.08] flex items-center justify-center transition-all ${voiceEnabled ? "bg-white/[0.08] text-primary hover:bg-white/[0.15]" : "bg-white/[0.08] text-white/40 hover:bg-white/[0.15]"}`}
          title={voiceEnabled ? "Mute" : "Unmute"}>
          {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        <button onClick={toggleWebcam}
          className={`w-11 h-11 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${webcamEnabled ? "bg-primary/20 border-primary/30 text-primary animate-pulse" : "bg-white/[0.08] border-white/[0.08] text-white/60 hover:text-white/90 hover:bg-white/[0.15]"}`}
          title={webcamEnabled ? "Stop webcam" : "Front camera"}>
          {webcamEnabled ? <Eye className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
        </button>

        {/* Save face button (only when webcam active) */}
        {webcamEnabled && (
          <button onClick={saveFace}
            className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-accent hover:bg-white/[0.15] transition-all"
            title="Save this face">
            <UserPlus className="w-5 h-5" />
          </button>
        )}

        <button onClick={toggleBackCam}
          className={`w-11 h-11 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${backCamEnabled ? "bg-accent/20 border-accent/30 text-accent animate-pulse" : "bg-white/[0.08] border-white/[0.08] text-white/60 hover:text-white/90 hover:bg-white/[0.15]"}`}
          title={backCamEnabled ? "Stop back camera" : "Back camera"}>
          <MapPin className="w-5 h-5" />
        </button>

        <button onClick={toggleMusicDetection}
          className={`w-11 h-11 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${musicStreamRef.current ? "bg-purple-500/20 border-purple-500/30 text-purple-400 animate-pulse" : "bg-white/[0.08] border-white/[0.08] text-white/60 hover:text-white/90 hover:bg-white/[0.15]"}`}
          title={musicStreamRef.current ? "Stop music detection" : "Detect music"}>
          <Music className="w-5 h-5" />
        </button>

        <button onClick={() => setChatOpen(true)}
          className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.15] transition-all relative"
          title="Chat history">
          <MessageCircle className="w-5 h-5" />
          {messages.length > 1 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
              {messages.length > 99 ? "99" : messages.length}
            </span>
          )}
        </button>
      </div>

      {/* Bottom input bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-5 pt-8 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Say something, ${userName}...`}
            className="flex-1 bg-white/[0.08] backdrop-blur-md border border-white/[0.1] rounded-full px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
          />
          {input.trim() && (
            <button type="submit" className="p-3 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0">
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* Chat overlay panel */}
      {chatOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[hsl(220,25%,6%)]/95 backdrop-blur-xl" style={{ animation: "slide-up 0.25s ease-out" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0">
            <img src={emotionCutouts[currentEmotion]} alt="Aori" className="w-9 h-9 rounded-full object-cover object-top ring-2 ring-primary/40 bg-white/10" />
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-white text-sm">Aori Tatsumi</h2>
              <p className="text-xs text-white/40">
                {isTyping ? "typing..." : `Your stubborn companion, ${userName} 💙`}
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("aori-messages");
                localStorage.removeItem("aori-chat-history");
                setMessages([firstTimeGreeting]);
                setChatHistory([]);
                setCurrentEmotion("smirk");
                setLastAoriText(firstTimeGreeting.text);
                toast("Conversation reset! Starting fresh~ 💙");
              }}
              className="p-2 rounded-full hover:bg-white/[0.08] transition-colors" title="Reset conversation">
              <Trash2 className="w-4 h-4 text-white/50 hover:text-destructive/80" />
            </button>
            <button onClick={() => setChatOpen(false)} className="p-2 rounded-full hover:bg-white/[0.08] transition-colors">
              <X className="w-5 h-5 text-white/50" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)}
            {isTyping && (
              <div className="flex gap-2 items-end" style={{ animation: "slide-up 0.3s ease-out" }}>
                <img src={emotionCutouts[currentEmotion]} alt="Aori" className="w-7 h-7 rounded-full object-cover object-top ring-2 ring-primary/30" />
                <div className="bg-white/[0.06] px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-center">
              <button type="button" onClick={toggleVoiceMode}
                className={`p-2 rounded-full transition-colors ${voiceModeActive ? "bg-destructive/20 text-destructive animate-pulse" : "text-white/40 hover:text-white/70"}`}>
                {voiceModeActive ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say something..."
                className="flex-1 bg-white/[0.06] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                autoFocus
              />
              <button type="submit" disabled={!input.trim()} className="p-2.5 rounded-full bg-primary text-primary-foreground disabled:opacity-30 hover:opacity-90 transition-opacity">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
