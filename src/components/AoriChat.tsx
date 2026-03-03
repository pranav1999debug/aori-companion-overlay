import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX, Camera, Eye, MessageCircle, X, ChevronDown } from "lucide-react";
import { AoriEmotion, emotionImages } from "@/lib/aori-personality";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Message {
  id: number;
  text: string;
  sender: "user" | "aori";
  emotion?: AoriEmotion;
}

const ChatBubble = ({ message }: { message: Message }) => {
  const isUser = message.sender === "user";
  return (
    <div
      className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} items-end`}
      style={{ animation: "slide-up 0.3s ease-out" }}
    >
      {!isUser && message.emotion && (
        <img
          src={emotionImages[message.emotion]}
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
  );
};

export default function AoriChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, text: "Hey~! You finally opened me! About time, baka~ 💙", sender: "aori", emotion: "smirk" },
  ]);
  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState<AoriEmotion>("smirk");
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [lastAoriText, setLastAoriText] = useState("Hey~! You finally opened me! About time, baka~ 💙");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastObservationRef = useRef<string>("");

  // Detect language segments and speak each with the right voice
  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    const clean = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[~*💙]/gu, "")
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const findVoice = (langPattern: RegExp, namePattern?: RegExp) => {
      if (namePattern) {
        const byName = voices.find(v => namePattern.test(v.name));
        if (byName) return byName;
      }
      return voices.find(v => langPattern.test(v.lang));
    };

    const jaVoice = findVoice(/^ja/i, /google.*日本|haruka|kyoko|nanami|ja-jp/i);
    const hiVoice = findVoice(/^hi/i, /google.*हिन्दी|swara|hi-in/i);
    const enVoice = findVoice(/^en/i, /samantha|zira|google.*female|aria|jenny/i);

    const segments: { text: string; lang: "ja" | "hi" | "en" }[] = [];
    const langRegex = /([\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]+)|([\u0900-\u097F\u0A00-\u0A7F]+(?:\s+[\u0900-\u097F\u0A00-\u0A7F]+)*)|([^\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF\u0900-\u097F\u0A00-\u0A7F]+)/g;
    let match;
    while ((match = langRegex.exec(clean)) !== null) {
      const segment = match[0].trim();
      if (!segment) continue;
      if (match[1]) segments.push({ text: segment, lang: "ja" });
      else if (match[2]) segments.push({ text: segment, lang: "hi" });
      else segments.push({ text: segment, lang: "en" });
    }
    if (segments.length === 0) segments.push({ text: clean, lang: "en" });

    segments.forEach((seg, i) => {
      const utterance = new SpeechSynthesisUtterance(seg.text);
      switch (seg.lang) {
        case "ja":
          utterance.lang = "ja-JP";
          if (jaVoice) utterance.voice = jaVoice;
          utterance.rate = 1.0; utterance.pitch = 1.4;
          break;
        case "hi":
          utterance.lang = "hi-IN";
          if (hiVoice) utterance.voice = hiVoice;
          utterance.rate = 1.0; utterance.pitch = 1.2;
          break;
        default:
          utterance.lang = "en-US";
          if (enVoice) utterance.voice = enVoice;
          utterance.rate = 1.05; utterance.pitch = 1.3;
          break;
      }
      if (i > 0) {
        const pause = new SpeechSynthesisUtterance(" ");
        pause.rate = 0.1;
        window.speechSynthesis.speak(pause);
      }
      window.speechSynthesis.speak(utterance);
    });
  }, [voiceEnabled]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { toast.error("Speech recognition not supported"); return; }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setChatOpen(true);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error !== "aborted") toast.error("Couldn't hear you. Try again!");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
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
      setCurrentEmotion(emotion);
      setLastAoriText(`👁️ ${responseText}`);
      setMessages((prev) => [...prev, { id: Date.now(), text: `👁️ ${responseText}`, sender: "aori", emotion }]);
      speakText(responseText);
    } catch (e) {
      console.error("Vision analysis failed:", e);
    }
  }, [captureFrame, speakText]);

  const toggleWebcam = useCallback(async () => {
    if (webcamEnabled) {
      webcamStream?.getTracks().forEach((t) => t.stop());
      setWebcamStream(null);
      setWebcamEnabled(false);
      if (webcamIntervalRef.current) { clearInterval(webcamIntervalRef.current); webcamIntervalRef.current = null; }
      const msg = "Hmph... fine, I won't look at you then. *pouts* 😤";
      setLastAoriText(msg);
      setMessages((prev) => [...prev, { id: Date.now(), text: msg, sender: "aori", emotion: "angry" }]);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      setWebcamStream(stream);
      setWebcamEnabled(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => setTimeout(() => analyzeFrame(), 500);
      }
      webcamIntervalRef.current = setInterval(() => analyzeFrame(), 60000);
      const msg = "Ara ara~ now I can see you! Don't do anything weird, baka~ 😏👁️";
      setLastAoriText(msg);
      setMessages((prev) => [...prev, { id: Date.now(), text: msg, sender: "aori", emotion: "smirk" }]);
    } catch (e) {
      toast.error("Couldn't access your camera. Check permissions!");
    }
  }, [webcamEnabled, webcamStream, analyzeFrame]);

  useEffect(() => {
    if (videoRef.current && webcamStream) videoRef.current.srcObject = webcamStream;
  }, [webcamStream]);

  useEffect(() => {
    return () => {
      webcamStream?.getTracks().forEach((t) => t.stop());
      if (webcamIntervalRef.current) clearInterval(webcamIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (chatOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping, chatOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    const userMsg: Message = { id: Date.now(), text, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);
    try {
      const { data, error } = await supabase.functions.invoke("aori-chat", { body: { messages: newHistory } });
      if (error) throw error;
      const emotion = (data.emotion || "smirk") as AoriEmotion;
      const responseText = data.text || "Hmm~ say that again? 😏";
      setCurrentEmotion(emotion);
      setLastAoriText(responseText);
      setMessages((prev) => [...prev, { id: Date.now() + 1, text: responseText, sender: "aori", emotion }]);
      setChatHistory((prev) => [...prev, { role: "assistant", content: `[${emotion}] ${responseText}` }]);
      speakText(responseText);
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Aori couldn't respond right now. Try again!");
      setMessages((prev) => [...prev, { id: Date.now() + 1, text: "Hmph... something went wrong. Try again, baka! 😤", sender: "aori", emotion: "angry" }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-[hsl(var(--aori-navy))] via-[hsl(220,30%,12%)] to-[hsl(220,25%,8%)]">
      {/* Hidden webcam elements */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Fullscreen Aori Avatar */}
      <div className="absolute inset-0 flex items-end justify-center pb-28">
        <img
          src={emotionImages[currentEmotion]}
          alt={`Aori ${currentEmotion}`}
          className="h-[75vh] max-h-[700px] object-contain drop-shadow-2xl"
          style={{ 
            animation: "float 4s ease-in-out infinite",
            filter: "drop-shadow(0 0 40px hsl(215 80% 55% / 0.2))",
          }}
        />
      </div>

      {/* Ambient glow behind avatar */}
      <div 
        className="absolute bottom-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(215 80% 55% / 0.6), transparent 70%)" }}
      />

      {/* Speech bubble — latest Aori message */}
      {lastAoriText && !chatOpen && (
        <div 
          className="absolute top-6 left-4 right-4 mx-auto max-w-md"
          style={{ animation: "slide-up 0.3s ease-out" }}
        >
          <div className="bg-card/85 backdrop-blur-md rounded-2xl rounded-tl-md px-4 py-3 shadow-xl border border-border/30">
            <p className="text-sm text-foreground leading-relaxed">{lastAoriText}</p>
          </div>
          <div className="w-3 h-3 bg-card/85 backdrop-blur-md rotate-45 ml-6 -mt-1.5 border-l border-b border-border/30" />
        </div>
      )}

      {/* Webcam preview (top right) */}
      {webcamEnabled && webcamStream && (
        <div className="absolute top-4 right-4 w-24 h-20 rounded-xl overflow-hidden ring-2 ring-primary/40 shadow-2xl z-20">
          <video
            ref={(el) => { if (el && webcamStream) el.srcObject = webcamStream; }}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <div className="absolute bottom-1 right-1">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30">
        <div className="flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-t from-black/60 to-transparent">
          {/* Voice toggle */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className="p-3 rounded-full bg-card/20 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-card/40 transition-all"
            title={voiceEnabled ? "Mute" : "Unmute"}
          >
            {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Mic button */}
          <button
            onClick={isListening ? stopListening : startListening}
            className={`p-4 rounded-full transition-all ${
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                : "bg-primary text-primary-foreground hover:scale-105"
            }`}
            title={isListening ? "Stop" : "Talk to Aori"}
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleWebcam}
            className={`p-3 rounded-full backdrop-blur-sm border border-white/10 transition-all ${
              webcamEnabled ? "bg-primary/30 text-primary" : "bg-card/20 text-white/80 hover:bg-card/40"
            }`}
            title={webcamEnabled ? "Stop webcam" : "Let Aori see you"}
          >
            {webcamEnabled ? <Eye className="w-5 h-5 animate-pulse" /> : <Camera className="w-5 h-5" />}
          </button>

          {/* Chat history toggle */}
          <button
            onClick={() => setChatOpen(true)}
            className="p-3 rounded-full bg-card/20 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-card/40 transition-all relative"
            title="Chat history"
          >
            <MessageCircle className="w-5 h-5" />
            {messages.length > 1 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-bold">
                {messages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Chat overlay panel */}
      {chatOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-xl" style={{ animation: "slide-up 0.3s ease-out" }}>
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
            <img
              src={emotionImages[currentEmotion]}
              alt="Aori"
              className="w-9 h-9 rounded-full object-cover object-top ring-2 ring-primary/40"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-foreground text-sm">Aori Tatsumi</h2>
              <p className="text-xs text-muted-foreground">
                {isTyping ? "typing..." : "Your stubborn AI companion 💙"}
              </p>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="p-2 rounded-full hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Scrollable messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {isTyping && (
              <div className="flex gap-2 items-end" style={{ animation: "slide-up 0.3s ease-out" }}>
                <img src={emotionImages[currentEmotion]} alt="Aori" className="w-7 h-7 rounded-full object-cover object-top ring-2 ring-primary/30" />
                <div className="bg-card/90 backdrop-blur-sm px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div className="px-3 py-3 border-t border-border/50 shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex gap-2 items-center"
            >
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`p-2 rounded-full transition-colors ${
                  isListening ? "bg-destructive/10 text-destructive animate-pulse" : "text-muted-foreground hover:text-primary"
                }`}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Talk to Aori~"
                className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                autoFocus
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2.5 rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
