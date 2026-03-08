import { useEffect, useRef, useState } from "react";
import { Mic, Sparkles } from "lucide-react";

export interface VoiceEntry {
  id: number;
  text: string;
  sender: "user" | "aori";
  timestamp: number;
}

interface VoiceTranscriptProps {
  entries: VoiceEntry[];
  isListening: boolean;
  isSpeaking: boolean;
}

function TypewriterText({ text, speed = 30 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current++;
      if (indexRef.current <= text.length) {
        setDisplayed(text.slice(0, indexRef.current));
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3.5 bg-primary/70 ml-0.5 animate-pulse align-middle" />
      )}
    </>
  );
}

export default function VoiceTranscript({ entries, isListening, isSpeaking }: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0 && !isListening) return null;

  return (
    <div className="absolute bottom-24 left-4 right-16 z-25 pointer-events-none" style={{ maxHeight: "45vh" }}>
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-hidden"
        style={{ maskImage: "linear-gradient(to top, black 80%, transparent 100%)" }}
      >
        {entries.map((entry, i) => {
          const isLatest = i === entries.length - 1;
          const isAoriLatest = isLatest && entry.sender === "aori";
          return (
            <div
              key={entry.id}
              className={`flex ${entry.sender === "user" ? "justify-end" : "justify-start"}`}
              style={{
                animation: isLatest ? "voice-entry-in 0.3s ease-out" : undefined,
                opacity: isLatest ? 1 : i === entries.length - 2 ? 0.6 : 0.35,
                transition: "opacity 0.3s ease",
              }}
            >
              <div
                className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed backdrop-blur-md ${
                  entry.sender === "user"
                    ? "bg-white/[0.12] text-white/90 rounded-br-md"
                    : "bg-primary/[0.15] text-white rounded-bl-md border border-primary/20"
                }`}
              >
                {entry.sender === "aori" && (
                  <span className="text-primary text-[10px] font-semibold uppercase tracking-wider block mb-0.5">
                    Aori
                  </span>
                )}
                {isAoriLatest ? (
                  <TypewriterText text={entry.text} speed={25} />
                ) : (
                  entry.text
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div className="flex justify-end mt-2" style={{ animation: "voice-entry-in 0.2s ease-out" }}>
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-br-md bg-white/[0.08] backdrop-blur-md">
            <Mic className="w-3.5 h-3.5 text-destructive animate-pulse" />
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      {/* Speaking indicator — only when no latest aori entry is still typing */}
      {isSpeaking && !isListening && entries.length > 0 && entries[entries.length - 1]?.sender !== "aori" && (
        <div className="flex justify-start mt-2" style={{ animation: "voice-entry-in 0.2s ease-out" }}>
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-bl-md bg-primary/[0.1] backdrop-blur-md border border-primary/20">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-xs text-white/50">speaking...</span>
          </div>
        </div>
      )}
    </div>
  );
}
