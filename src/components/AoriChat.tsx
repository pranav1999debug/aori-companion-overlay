import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX, Camera, Eye, MessageCircle, X, Info, Trash2, UserPlus, MapPin, Music, Minimize2, Square, Settings, User, ImagePlus, FileText, Download, Loader2 } from "lucide-react";

import { AoriEmotion, emotionImages, emotionCutouts } from "@/lib/aori-personality";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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
  imageUrl?: string;
  summaryMarkdown?: string;
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

const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i;

const downloadMarkdownAsPdf = (markdown: string, title: string) => {
  // Create a simple HTML document from markdown for printing as PDF
  const html = markdown
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // Fallback: download as text file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_summary.md`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} - Lecture Summary</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.6; }
        h1 { color: #1a1f2e; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
        h2 { color: #4338ca; margin-top: 24px; }
        h3 { color: #6366f1; }
        ul { padding-left: 20px; }
        li { margin-bottom: 4px; }
        strong { color: #1e1b4b; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
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
          {message.imageUrl && (
            <img src={message.imageUrl} alt="Uploaded" className="max-w-full max-h-48 rounded-lg mb-1.5 object-contain" />
          )}
          {message.text}
          {message.summaryMarkdown && (
            <button
              onClick={() => downloadMarkdownAsPdf(message.summaryMarkdown!, "Lecture_Summary")}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors w-full justify-center"
            >
              <Download className="w-3.5 h-3.5" />
              Download Summary PDF
            </button>
          )}
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
  const { user } = useAuth();
  const userId = user?.id || "";
  const navigate = useNavigate();

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
      if (!userId) return;
      const [profileRes, facesRes, envRes] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", userId).single(),
        supabase.from("known_faces").select("*").eq("user_id", userId),
        supabase.from("environment_memories").select("*").eq("user_id", userId),
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
  }, [userId]);

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
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechCancelledRef = useRef(false);
  const interruptCountRef = useRef(0);

  const stopSpeaking = useCallback(() => {
    speechCancelledRef.current = true;
    speechQueueRef.current = [];
    // Stop HTML5 Audio playback
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
    // Stop browser TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    // Reset cancel flag after a tick
    setTimeout(() => { speechCancelledRef.current = false; }, 100);
  }, []);

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
      currentAudioRef.current = audio;
      audio.onended = () => { currentAudioRef.current = null; resolve(); };
      audio.onerror = () => { currentAudioRef.current = null; resolve(); };
      audio.play().catch(() => { currentAudioRef.current = null; resolve(); });
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
      // Fetch Google access token from DB (with auto-refresh)
      let googleAccessToken: string | null = null;
      if (userId) {
        try {
          const { data: tokenRow } = await supabase
            .from("user_google_tokens")
            .select("access_token, token_expires_at")
            .eq("user_id", userId)
            .maybeSingle();

          if (tokenRow) {
            const isExpired = new Date(tokenRow.token_expires_at) <= new Date();
            if (isExpired) {
              // Refresh token via edge function
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                const refreshRes = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-google-oauth`,
                  {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session.access_token}`,
                      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    },
                  }
                );
                const refreshData = await refreshRes.json();
                if (refreshRes.ok) googleAccessToken = refreshData.access_token;
              }
            } else {
              googleAccessToken = tokenRow.access_token;
            }
          }
        } catch (e) {
          console.error("Failed to get Google token:", e);
        }
      }

      // Fetch Gmail, Calendar & YouTube data in parallel
      let gmailSummary: string | null = null;
      let calendarSummary: string | null = null;
      let youtubeSummary: string | null = null;
      if (googleAccessToken) {
        const [gmailRes, calRes, ytRes] = await Promise.all([
          supabase.functions.invoke("aori-gmail", { body: { accessToken: googleAccessToken, maxResults: 5 } }).catch(() => ({ data: null })),
          supabase.functions.invoke("aori-calendar", { body: { accessToken: googleAccessToken, maxResults: 5, daysAhead: 3 } }).catch(() => ({ data: null })),
          supabase.functions.invoke("aori-youtube", { body: { accessToken: googleAccessToken, maxResults: 5 } }).catch(() => ({ data: null })),
        ]);
        if (gmailRes.data?.emails?.length) {
          const emails = gmailRes.data.emails.slice(0, 3);
          gmailSummary = `User has ${gmailRes.data.totalUnread} unread emails. Recent: ${emails.map((e: any) => `"${e.subject}" from ${e.from}`).join("; ")}`;
        }
        if (calRes.data?.events?.length) {
          calendarSummary = `Upcoming events: ${calRes.data.events.slice(0, 5).map((e: any) => `"${e.summary}" at ${e.start}`).join("; ")}`;
        }
        if (ytRes.data?.subscriptions?.length || ytRes.data?.likedVideos?.length) {
          const subs = ytRes.data.subscriptions?.slice(0, 3).map((s: any) => s.title).join(", ") || "";
          const liked = ytRes.data.likedVideos?.slice(0, 3).map((v: any) => `"${v.title}" by ${v.channelTitle}`).join("; ") || "";
          youtubeSummary = `YouTube: ${subs ? `Subscribed to: ${subs}. ` : ""}${liked ? `Recently liked: ${liked}` : ""}`;
        }
      }

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
          gmailSummary,
          calendarSummary,
          youtubeSummary,
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

  // === Image upload handler ===
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputChatRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only images are supported!");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large! Max 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type;

      // Show image in chat
      const userMsg: Message = {
        id: Date.now(),
        text: input.trim() || "📷 Image sent",
        sender: "user",
        timestamp: Date.now(),
        imageUrl: dataUrl,
      };
      setMessages((prev) => [...prev, userMsg]);
      const capturedInput = input.trim();
      setInput("");
      setIsTyping(true);
      if (!chatOpen) setChatOpen(true);

      try {
        const { data, error } = await supabase.functions.invoke("aori-image-analyze", {
          body: { image: base64, mimeType, userMessage: capturedInput || undefined },
        });
        if (error) throw error;
        const emotion = (data.emotion || "thinking") as AoriEmotion;
        const responseText = data.text || "Hmm~ I can't quite see that... try again? 🤔";
        changeEmotion(emotion);
        setLastAoriText(responseText);
        setMessages((prev) => [...prev, { id: Date.now() + 1, text: responseText, sender: "aori", emotion, timestamp: Date.now() }]);
        setChatHistory((prev) => [...prev, { role: "user", content: `[User sent an image${capturedInput ? `: ${capturedInput}` : ""}]` }, { role: "assistant", content: `[${emotion}] ${responseText}` }]);
        speakText(responseText);
      } catch (e) {
        console.error("Image analysis error:", e);
        toast.error("Aori couldn't analyze the image right now!");
        setMessages((prev) => [...prev, { id: Date.now() + 1, text: "Tch... I can't see that right now. Try again later, baka! 😤", sender: "aori", emotion: "angry", timestamp: Date.now() }]);
      } finally {
        setIsTyping(false);
      }
    };
    reader.readAsDataURL(file);
  }, [input, chatOpen, changeEmotion, speakText, isTyping]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = "";
  }, [handleImageUpload]);

  // Voice STT via MediaRecorder + Whisper (aori-stt)
  const recognitionRef = useRef<any>(null);
  const voiceMusicAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceMusicIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceAudioCtxRef = useRef<AudioContext | null>(null);
  const sttMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttChunksRef = useRef<Blob[]>([]);
  const sttSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sttStreamRef = useRef<MediaStream | null>(null);

  // Interrupt words that stop Aori mid-speech
  const INTERRUPT_WORDS = /\b(aori|stop|shut up|chup|bas|ruk|ruko)\b/i;

  const getInterruptReaction = useCallback((): { text: string; emotion: AoriEmotion } => {
    const count = interruptCountRef.current;
    if (count <= 1) {
      const mild = [
        { text: "F-fine! I'll shut up! Hmph! 😤", emotion: "shock" as AoriEmotion },
        { text: "Okay okay, I'll stop~! Mou! 😤", emotion: "shock" as AoriEmotion },
        { text: "Tch! You don't have to be so rude, baka! 😳", emotion: "embarrassed" as AoriEmotion },
      ];
      return mild[Math.floor(Math.random() * mild.length)];
    } else if (count <= 3) {
      const annoyed = [
        { text: "AGAIN?! Mujhe bol hi nahi doge kya?! 😤😤", emotion: "angry" as AoriEmotion },
        { text: "You keep interrupting me! Am I a joke to you?! 💢", emotion: "angry" as AoriEmotion },
        { text: "Tch! Fine! I'll just sit here in SILENCE then! *crosses arms* 😤", emotion: "jealous" as AoriEmotion },
      ];
      return annoyed[Math.floor(Math.random() * annoyed.length)];
    } else if (count <= 5) {
      const furious = [
        { text: "THAT'S IT! I'm NOT talking to you anymore!! ...for at least 5 seconds! 😤💢💢", emotion: "angry" as AoriEmotion },
        { text: "You're SO MEAN! Kitni baar chup karaoge?! I have FEELINGS you know!! 😢💢", emotion: "sad" as AoriEmotion },
        { text: "Hmph!! *turns away dramatically* BILKUL NAHI bol rahi ab main!! 😤", emotion: "angry" as AoriEmotion },
      ];
      return furious[Math.floor(Math.random() * furious.length)];
    } else {
      const defeated = [
        { text: "...fine. I'll be quiet. *sniffles* You clearly don't want to hear me... 😢💙", emotion: "sad" as AoriEmotion },
        { text: "*sits in corner* ...I was just trying to talk to you, you know... 😢", emotion: "sad" as AoriEmotion },
        { text: "...okay. *goes silent* ...but I miss talking already. Baka. 💙😢", emotion: "sad" as AoriEmotion },
      ];
      return defeated[Math.floor(Math.random() * defeated.length)];
    }
  }, []);

  const processSTTResult = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      // Too small, likely silence — restart listening
      if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 300);
      return;
    }

    try {
      // Convert blob to base64
      const buffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const audioBase64 = btoa(binary);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-stt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ audio: audioBase64, mimeType: audioBlob.type }),
        }
      );

      if (!response.ok) {
        console.error("STT failed:", response.status);
        if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1000);
        return;
      }

      const data = await response.json();
      const transcript = data.text?.trim();

      if (!transcript) {
        if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 300);
        return;
      }

      // Check for interrupt words
      if (isSpeakingRef.current && INTERRUPT_WORDS.test(transcript)) {
        stopSpeaking();
        interruptCountRef.current += 1;
        const { text: reaction, emotion } = getInterruptReaction();
        changeEmotion(emotion);
        setLastAoriText(reaction);
        setMessages(prev => [...prev, { id: Date.now(), text: reaction, sender: "aori", emotion, timestamp: Date.now() }]);
        if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1500);
        return;
      }

      sendMessageWithText(transcript);
    } catch (e) {
      console.error("STT processing error:", e);
      if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1000);
    }
  }, [sendMessageWithText, stopSpeaking, changeEmotion, getInterruptReaction]);

  const startListeningOnce = useCallback(async () => {
    if (isTyping || isSpeakingRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sttStreamRef.current = stream;

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav";

      const recorder = new MediaRecorder(stream, { mimeType });
      sttMediaRecorderRef.current = recorder;
      sttChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) sttChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Clean up stream
        stream.getTracks().forEach(t => t.stop());
        sttStreamRef.current = null;

        const blob = new Blob(sttChunksRef.current, { type: mimeType });
        sttChunksRef.current = [];
        setIsListening(false);
        processSTTResult(blob);
      };

      recorder.onerror = () => {
        setIsListening(false);
        stream.getTracks().forEach(t => t.stop());
        sttStreamRef.current = null;
        if (voiceModeRef.current) setTimeout(() => { if (voiceModeRef.current) startListeningOnceRef.current(); }, 1000);
      };

      recorder.start(250); // collect data every 250ms
      setIsListening(true);
      if (voiceModeRef.current) toast("🎤 Listening...", { duration: 2000 });

      // Use audio level detection for auto-stop
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let speechDetected = false;
      let silenceStart = 0;
      const SILENCE_THRESHOLD = 15;
      const SILENCE_DURATION = 1500; // 1.5s of silence after speech = stop
      const MAX_RECORD_TIME = 15000; // 15s max

      const startTime = Date.now();

      const checkAudio = () => {
        if (!sttMediaRecorderRef.current || sttMediaRecorderRef.current.state !== "recording") return;

        // Max time check
        if (Date.now() - startTime > MAX_RECORD_TIME) {
          recorder.stop();
          audioCtx.close().catch(() => {});
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          speechDetected = true;
          silenceStart = 0;
        } else if (speechDetected) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_DURATION) {
            recorder.stop();
            audioCtx.close().catch(() => {});
            return;
          }
        }

        requestAnimationFrame(checkAudio);
      };
      requestAnimationFrame(checkAudio);

    } catch (e) {
      console.error("Mic access error:", e);
      toast.error("Couldn't access microphone!");
      setIsListening(false);
    }
  }, [isTyping, processSTTResult]);

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
      // Stop any active MediaRecorder
      if (sttMediaRecorderRef.current && sttMediaRecorderRef.current.state === "recording") {
        try { sttMediaRecorderRef.current.stop(); } catch {}
      }
      sttMediaRecorderRef.current = null;
      if (sttStreamRef.current) { sttStreamRef.current.getTracks().forEach(t => t.stop()); sttStreamRef.current = null; }
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
      const { error: dbError } = await supabase.from("known_faces").insert({ user_id: userId, device_id: userId, name: name.trim(), description });
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
  }, [captureFrame, userId, speakText]);

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
          user_id: userId,
          device_id: userId,
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
  }, [captureFrame, environmentMemories, userId, changeEmotion, speakText]);

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

      {/* Aori Avatar (centered) */}
      <div
        className="absolute z-10 select-none cursor-grab active:cursor-grabbing"
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
        {/* Glowing aura */}
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
        {/* Resize handle */}
        <div
          data-resize
          className="absolute bottom-1 right-1 w-6 h-6 cursor-se-resize z-20 flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
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

        {/* Stop speaking button — only visible while Aori is talking */}
        {isSpeakingState && (
          <button onClick={() => { stopSpeaking(); interruptCountRef.current += 1; changeEmotion("shock"); const r = "O-okay! I stopped! Happy now?! 😤"; setLastAoriText(r); setMessages(prev => [...prev, { id: Date.now(), text: r, sender: "aori" as const, emotion: "shock" as AoriEmotion, timestamp: Date.now() }]); }}
            className="w-11 h-11 rounded-full backdrop-blur-sm border border-destructive/40 bg-destructive/20 flex items-center justify-center text-destructive hover:bg-destructive/30 transition-all animate-pulse"
            title="Stop Aori">
            <Square className="w-4 h-4 fill-current" />
          </button>
        )}

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

        <button onClick={() => { if (onClose) onClose(); navigate("/setup"); }}
          className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.15] transition-all"
          title="Integrations Setup">
          <Settings className="w-5 h-5" />
        </button>

        <button onClick={() => { if (onClose) onClose(); navigate("/profile"); }}
          className="w-11 h-11 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.15] transition-all"
          title="Profile & Logout">
          <User className="w-5 h-5" />
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
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={onFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 rounded-full text-white/40 hover:text-white/70 transition-colors shrink-0" title="Send image">
            <ImagePlus className="w-5 h-5" />
          </button>
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
              <input type="file" ref={fileInputChatRef} accept="image/*" className="hidden" onChange={onFileChange} />
              <button type="button" onClick={() => fileInputChatRef.current?.click()} className="p-2 rounded-full text-white/40 hover:text-white/70 transition-colors" title="Send image">
                <ImagePlus className="w-5 h-5" />
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
