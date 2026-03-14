import { useState, useRef, useCallback, useEffect } from "react";
import { X, Music, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface YouTubePlayerProps {
  searchQuery: string;
  onClose: () => void;
}

interface VideoItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

export default function YouTubePlayer({ searchQuery, onClose }: YouTubePlayerProps) {
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const isDragging = useRef(false);

  // Fetch videos on mount
  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try to get user's Google access token
        let accessToken: string | undefined;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: tokenData } = await supabase
            .from("user_google_tokens")
            .select("access_token")
            .eq("user_id", user.id)
            .maybeSingle();
          if (tokenData?.access_token) accessToken = tokenData.access_token;
        }

        const { data, error: fnError } = await supabase.functions.invoke("aori-youtube-search", {
          body: { query: searchQuery, accessToken, maxResults: 10 },
        });

        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);
        if (!data?.videos?.length) throw new Error("No results found");

        setVideos(data.videos.filter((v: VideoItem) => v.videoId));
      } catch (e: any) {
        console.error("YouTube search error:", e);
        setError(e.message || "Failed to search");
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [searchQuery]);

  const currentVideo = videos[currentIndex];

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = false;
    const point = "touches" in e ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      isDragging.current = true;
      const p = "touches" in ev ? ev.touches[0] : ev;
      const size = minimized ? 56 : 280;
      const maxX = window.innerWidth - size;
      const maxY = window.innerHeight - (minimized ? 56 : 320);
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

  // Minimized: floating circle
  if (minimized) {
    return (
      <div className="fixed z-[100] select-none" style={{ left: pos.x, top: pos.y, touchAction: "none" }}>
        <div
          className="relative w-14 h-14 rounded-full bg-destructive/90 backdrop-blur-md shadow-2xl cursor-grab active:cursor-grabbing flex items-center justify-center border-2 border-white/20"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" style={{ animationDuration: "2s" }} />
          <button
            onClick={(e) => { e.stopPropagation(); if (!isDragging.current) setMinimized(false); }}
            className="relative z-10 w-full h-full rounded-full flex items-center justify-center"
          >
            <Music className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[hsl(220,25%,10%)] border border-white/20 flex items-center justify-center z-20"
          >
            <X className="w-3 h-3 text-white/70" />
          </button>
        </div>
        {currentVideo && (
          <div className="mt-1 text-[9px] text-white/40 text-center max-w-14 truncate">
            🎵 Playing
          </div>
        )}
      </div>
    );
  }

  // Expanded player
  return (
    <div className="fixed z-[100] select-none" style={{ left: pos.x, top: pos.y, touchAction: "none" }}>
      <div className="w-[280px] rounded-2xl bg-[hsl(220,25%,8%)] backdrop-blur-xl border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col">
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-[hsl(220,25%,12%)] cursor-grab active:cursor-grabbing shrink-0 border-b border-white/[0.06]"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="text-[10px] text-white/50 font-medium truncate">
              🎵 {searchQuery}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setMinimized(true)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Minimize">
              <Music className="w-3 h-3 text-white/50" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Close">
              <X className="w-3 h-3 text-white/50" />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
            <span className="text-xs text-white/40 ml-2">Searching...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-xs text-white/40 mb-2">{error}</p>
            <button onClick={onClose} className="text-[10px] text-destructive hover:underline">Close</button>
          </div>
        ) : currentVideo ? (
          <>
            {/* YouTube Embed */}
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              <iframe
                key={currentVideo.videoId}
                src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={currentVideo.title}
              />
            </div>

            {/* Track info + controls */}
            <div className="px-3 py-2 space-y-2">
              <p className="text-[11px] text-white/70 font-medium truncate" title={currentVideo.title}>
                {currentVideo.title}
              </p>
              <p className="text-[9px] text-white/30 truncate">{currentVideo.channelTitle}</p>
              
              <div className="flex items-center justify-center gap-4 py-1">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-20"
                >
                  <SkipBack className="w-4 h-4 text-white/60" />
                </button>
                <span className="text-[9px] text-white/30">
                  {currentIndex + 1} / {videos.length}
                </span>
                <button
                  onClick={() => setCurrentIndex(Math.min(videos.length - 1, currentIndex + 1))}
                  disabled={currentIndex >= videos.length - 1}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-20"
                >
                  <SkipForward className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
