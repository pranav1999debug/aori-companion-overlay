import { useState, useRef, useEffect } from "react";
import { Send, Mic, Heart } from "lucide-react";
import { AoriEmotion, emotionImages, getAoriResponse } from "@/lib/aori-personality";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = { id: Date.now(), text, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const response = getAoriResponse(text);
      setCurrentEmotion(response.emotion);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: response.text, sender: "aori", emotion: response.emotion },
      ]);
      setIsTyping(false);
    }, 800 + Math.random() * 1200);
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
          <button type="button" className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-full">
            <Mic className="w-5 h-5" />
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
