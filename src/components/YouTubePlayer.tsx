import { useState, useRef, useCallback } from "react";
import { X, Minimize2, Maximize2, Music } from "lucide-react";

interface YouTubePlayerProps {
  searchQuery: string;
  onClose: () => void;
}

export default function YouTubePlayer({ searchQuery, onClose }: YouTubePlayerProps) {
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const youtubeUrl = `https://m.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

  // Drag handling for both minimized and expanded states
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const point = "touches" in e ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const p = "touches" in ev ? ev.touches[0] : ev;
      const maxX = window.innerWidth - (minimized ? 56 : 300);
      const maxY = window.innerHeight - (minimized ? 56 : 420);
      setPos({
        x: Math.max(0, Math.min(maxX, dragRef.current.origX + (p.clientX - dragRef.current.startX))),
        y: Math.max(0, Math.min(maxY, dragRef.current.origY + (p.clientY - dragRef.current.startY))),
      });
    };
    const handleEnd = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
  }, [pos, minimized]);

  // Minimized: floating circle button
  if (minimized) {
    return (
      <div
        className="fixed z-[100] select-none"
        style={{ left: pos.x, top: pos.y, touchAction: "none" }}
      >
        <div
          className="relative w-14 h-14 rounded-full bg-destructive/90 backdrop-blur-md shadow-2xl cursor-grab active:cursor-grabbing flex items-center justify-center border-2 border-white/20"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          {/* Pulse animation ring */}
          <div className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" style={{ animationDuration: "2s" }} />
          
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
            className="relative z-10 w-full h-full rounded-full flex items-center justify-center"
          >
            <Music className="w-6 h-6 text-white" />
          </button>
          
          {/* Close X on the circle */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[hsl(220,25%,10%)] border border-white/20 flex items-center justify-center z-20"
          >
            <X className="w-3 h-3 text-white/70" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded: draggable YouTube iframe window
  return (
    <div
      className="fixed z-[100] select-none"
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
    >
      <div className="w-[300px] h-[420px] rounded-2xl bg-[hsl(220,25%,8%)] backdrop-blur-xl border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col">
        {/* Title bar - draggable */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-[hsl(220,25%,12%)] cursor-grab active:cursor-grabbing shrink-0 border-b border-white/[0.06]"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-[11px] text-white/50 font-medium truncate max-w-[160px]">
              🎵 {searchQuery}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5 text-white/50" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </div>

        {/* YouTube iframe */}
        <div className="flex-1 relative">
          <iframe
            src={youtubeUrl}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            title="YouTube Music"
          />
        </div>
      </div>
    </div>
  );
}
