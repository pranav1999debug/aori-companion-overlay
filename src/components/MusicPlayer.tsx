import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, SkipBack, SkipForward, GripHorizontal, Music, Loader2 } from "lucide-react";

interface Video {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

interface MusicPlayerProps {
  videos: Video[];
  onClose: () => void;
  initialIndex?: number;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let ytApiLoaded = false;
let ytApiLoading = false;
const ytApiCallbacks: (() => void)[] = [];

function loadYTApi(): Promise<void> {
  if (ytApiLoaded && window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      ytApiCallbacks.forEach((cb) => cb());
      ytApiCallbacks.length = 0;
    };
  });
}

export default function MusicPlayer({ videos, onClose, initialIndex = 0 }: MusicPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [pos, setPos] = useState({ x: 16, y: 60 });

  const current = videos[currentIndex];

  // Load YouTube IFrame API and create player
  useEffect(() => {
    let destroyed = false;

    const init = async () => {
      await loadYTApi();
      if (destroyed || !iframeContainerRef.current) return;

      // Clear previous
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
      iframeContainerRef.current.innerHTML = "";
      const div = document.createElement("div");
      div.id = "yt-music-player";
      iframeContainerRef.current.appendChild(div);

      setIsReady(false);
      setIsPlaying(false);
      setProgress(0);

      playerRef.current = new window.YT.Player("yt-music-player", {
        height: "1",
        width: "1",
        videoId: current.videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            setIsReady(true);
            setIsPlaying(true);
            setDuration(playerRef.current?.getDuration?.() || 0);
          },
          onStateChange: (event: any) => {
            if (destroyed) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(playerRef.current?.getDuration?.() || 0);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              // Auto-play next
              if (currentIndex < videos.length - 1) {
                setCurrentIndex((i) => i + 1);
              } else {
                setIsPlaying(false);
              }
            }
          },
        },
      });
    };

    init();

    return () => {
      destroyed = true;
      if (progressInterval.current) clearInterval(progressInterval.current);
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
    };
  }, [current.videoId, currentIndex, videos.length]);

  // Progress tracking
  useEffect(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (isPlaying && playerRef.current) {
      progressInterval.current = setInterval(() => {
        const t = playerRef.current?.getCurrentTime?.() || 0;
        setProgress(t);
      }, 500);
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  }, [isPlaying]);

  const playPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const playNext = useCallback(() => {
    if (currentIndex < videos.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, videos.length]);

  // Drag handling
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = "touches" in e ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const p = "touches" in ev ? ev.touches[0] : ev;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 260, dragRef.current.origX + (p.clientX - dragRef.current.startX))),
        y: Math.max(0, Math.min(window.innerHeight - 120, dragRef.current.origY + (p.clientY - dragRef.current.startY))),
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] select-none"
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
    >
      {/* Hidden YouTube iframe */}
      <div ref={iframeContainerRef} className="absolute" style={{ width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }} />

      {/* Player UI */}
      <div className="w-[260px] rounded-2xl bg-[hsl(220,25%,10%)]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Drag handle + close */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-1.5">
            <GripHorizontal className="w-3.5 h-3.5 text-white/30" />
            <Music className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-white/40 font-medium">NOW PLAYING</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* Thumbnail + Info */}
        <div className="px-3 pb-2 flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-white/5">
            {current.thumbnail ? (
              <img src={current.thumbnail} alt={current.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-4 h-4 text-white/20" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white font-medium truncate" title={current.title}>
              {current.title?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")}
            </p>
            <p className="text-[10px] text-white/40 truncate">{current.channelTitle}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-1">
          <div
            className="w-full h-1 rounded-full bg-white/10 cursor-pointer relative"
            onClick={(e) => {
              if (!playerRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              playerRef.current.seekTo(pct * duration, true);
              setProgress(pct * duration);
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300"
              style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-white/30">{formatTime(progress)}</span>
            <span className="text-[9px] text-white/30">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 px-3 pb-3">
          <button
            onClick={playPrev}
            disabled={currentIndex === 0}
            className="p-1.5 rounded-full text-white/60 hover:text-white disabled:text-white/20 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!isReady}
            className="p-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-all"
          >
            {!isReady ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
          <button
            onClick={playNext}
            disabled={currentIndex >= videos.length - 1}
            className="p-1.5 rounded-full text-white/60 hover:text-white disabled:text-white/20 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Track list indicator */}
        <div className="px-3 pb-2 text-center">
          <span className="text-[9px] text-white/25">
            {currentIndex + 1} / {videos.length} tracks
          </span>
        </div>
      </div>
    </div>
  );
}
