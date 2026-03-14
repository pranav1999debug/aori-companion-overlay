import { useState, useRef, useCallback, useEffect } from "react";
import { X, Music, ExternalLink } from "lucide-react";

interface YouTubePlayerProps {
  searchQuery: string;
  onClose: () => void;
}

export default function YouTubePlayer({ searchQuery, onClose }: YouTubePlayerProps) {
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const popupRef = useRef<Window | null>(null);

  const youtubeUrl = `https://m.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

  // Open YouTube in a popup window on mount
  useEffect(() => {
    const popup = window.open(
      youtubeUrl,
      "aori_music",
      "width=420,height=700,left=100,top=100,menubar=no,toolbar=no,location=no,status=no"
    );
    popupRef.current = popup;

    // Check if popup was blocked
    if (!popup || popup.closed) {
      // Fallback: open in new tab
      window.open(youtubeUrl, "_blank");
    }

    return () => {
      // Don't auto-close on unmount so music keeps playing
    };
  }, [youtubeUrl]);

  const handleClose = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    onClose();
  };

  const handleReopen = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
    } else {
      const popup = window.open(
        youtubeUrl,
        "aori_music",
        "width=420,height=700,left=100,top=100,menubar=no,toolbar=no,location=no,status=no"
      );
      popupRef.current = popup;
      if (!popup || popup.closed) {
        window.open(youtubeUrl, "_blank");
      }
    }
  };

  // Drag handling
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const point = "touches" in e ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const p = "touches" in ev ? ev.touches[0] : ev;
      const maxX = window.innerWidth - 56;
      const maxY = window.innerHeight - 56;
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
  }, [pos]);

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
          onClick={(e) => { e.stopPropagation(); handleReopen(); }}
          className="relative z-10 w-full h-full rounded-full flex items-center justify-center"
          title="Open YouTube"
        >
          <Music className="w-6 h-6 text-white" />
        </button>

        {/* Close X on the circle */}
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[hsl(220,25%,10%)] border border-white/20 flex items-center justify-center z-20"
        >
          <X className="w-3 h-3 text-white/70" />
        </button>
      </div>

      {/* Label */}
      <div className="mt-1 text-[9px] text-white/40 text-center max-w-14 truncate">
        🎵 {searchQuery}
      </div>
    </div>
  );
}
