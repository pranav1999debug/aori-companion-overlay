import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX, Heart } from "lucide-react";
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

const AoriAvatar = ({ emotion, className = "" }: { emotion: AoriEmotion; className?: string }) => (
  <img
    src={emotionImages[emotion]}
    alt={`Aori ${emotion}`}
    className={`object-contain drop-shadow-lg ${className}`}
    style={{ animation: "bounce-in 0.4s ease-out" }}
  />
);

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
          className="w-8 h-8 rounded-full object-cover object-top ring-2 ring-primary/30"
        />
      )}
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-aori-bubble-aori text-foreground rounded-bl-md"
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Detect language segments and speak each with the right voice
  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    // Strip emojis and special chars for cleaner speech
    const clean = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[~*💙]/gu, "")
      .trim();
    if (!clean) return;
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();

    // Helper to find best voice for a language
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

    // Split text into language segments
    const segments: { text: string; lang: "ja" | "hi" | "en" }[] = [];
    // Japanese: Hiragana, Katakana, CJK
    // Hindi/Devanagari: \u0900-\u097F
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

    // Queue utterances for each segment with appropriate voice
    segments.forEach((seg, i) => {
      const utterance = new SpeechSynthesisUtterance(seg.text);
      
      switch (seg.lang) {
        case "ja":
          utterance.lang = "ja-JP";
          if (jaVoice) utterance.voice = jaVoice;
          utterance.rate = 1.0;
          utterance.pitch = 1.4;
          break;
        case "hi":
          utterance.lang = "hi-IN";
          if (hiVoice) utterance.voice = hiVoice;
          utterance.rate = 1.0;
          utterance.pitch = 1.2;
          break;
        default:
          utterance.lang = "en-US";
          if (enVoice) utterance.voice = enVoice;
          utterance.rate = 1.05;
          utterance.pitch = 1.3;
          break;
      }

      // Slight pause between segments for natural flow
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
    if (!SpeechRecognitionAPI) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

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
      const { data, error } = await supabase.functions.invoke("aori-chat", {
        body: { messages: newHistory },
      });

      if (error) throw error;

      const emotion = (data.emotion || "smirk") as AoriEmotion;
      const responseText = data.text || "Hmm~ say that again? 😏";

      setCurrentEmotion(emotion);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: responseText, sender: "aori", emotion },
      ]);
      setChatHistory((prev) => [...prev, { role: "assistant", content: `[${emotion}] ${responseText}` }]);
      speakText(responseText);
    } catch (e) {
      console.error("Chat error:", e);
      toast.error("Aori couldn't respond right now. Try again!");
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: "Hmph... something went wrong. Try again, baka! 😤", sender: "aori", emotion: "angry" },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-card border-b shadow-sm shrink-0">
        <div className="relative">
          <img
            src={emotionImages[currentEmotion]}
            alt="Aori"
            className="w-10 h-10 rounded-full object-cover object-top ring-2 ring-primary/40"
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-card" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-foreground text-base leading-tight">Aori Tatsumi</h1>
          <p className="text-xs text-muted-foreground">Your stubborn AI companion 💙</p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className="p-1.5 rounded-full transition-colors hover:bg-secondary"
          title={voiceEnabled ? "Mute Aori" : "Unmute Aori"}
        >
          {voiceEnabled ? (
            <Volume2 className="w-5 h-5 text-primary" />
          ) : (
            <VolumeX className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        <Heart className="w-5 h-5 text-aori-blush" fill="currentColor" />
      </header>

      {/* Avatar display */}
      <div className="flex justify-center py-4 bg-gradient-to-b from-secondary/50 to-transparent shrink-0">
        <AoriAvatar emotion={currentEmotion} className="h-48 md:h-64" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div className="flex gap-2 items-end" style={{ animation: "slide-up 0.3s ease-out" }}>
            <img src={emotionImages[currentEmotion]} alt="Aori" className="w-8 h-8 rounded-full object-cover object-top ring-2 ring-primary/30" />
            <div className="bg-aori-bubble-aori px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 bg-card border-t shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2 items-center"
        >
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            className={`p-2 rounded-full transition-colors ${
              isListening
                ? "bg-destructive/10 text-destructive animate-pulse"
                : "text-muted-foreground hover:text-primary"
            }`}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to Aori~"
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
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
  );
}
