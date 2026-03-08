import { useEffect, useRef } from "react";
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

export default function VoiceTranscript({ entries, isListening, isSpeaking }: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0 && !isListening) return null;

  return (
    <div className="absolute bottom-24 left-4 right-16 z-25 pointer-events-none" style={{ maxHeight: "40vh" }}>
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 overflow-hidden"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 20%, black 100%)" }}
      >
        {entries.map((entry, i) => {
          const isLatest = i === entries.length - 1;
          return (
            <div
              key={entry.id}
              className={`flex ${entry.sender === "user" ? "justify-end" : "justify-start"}`}
              style={{
                animation: isLatest ? "voice-entry-in 0.3s ease-out" : undefined,
                opacity: isLatest ? 1 : 0.5,
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
                {entry.text}
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

      {/* Speaking indicator */}
      {isSpeaking && !isListening && (
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
