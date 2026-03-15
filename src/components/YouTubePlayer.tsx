import { useState, useRef, useCallback, useEffect } from "react";
import { X, Music, SkipBack, SkipForward, Loader2, Play, RefreshCw, Link } from "lucide-react";
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
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [readyToPlay, setReadyToPlay] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const isDragging = useRef(false);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let accessToken: string | undefined;
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: tokenData } = await supabase
          .from("user_google_tokens")
          .select("access_token, token_expires_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (tokenData) {
          setIsGoogleConnected(true);
          const isExpired = new Date(tokenData.token_expires_at) <= new Date();

          if (isExpired) {
            const { data: refreshData, error: refreshError } = await supabase.functions.invoke("aori-google-oauth", {
              method: "POST",
              body: { action: "refresh" },
            });

            if (!refreshError && refreshData?.access_token) {
              accessToken = refreshData.access_token;
            } else {
              console.warn("Google token refresh failed; falling back to stored token", refreshError?.message || refreshData?.error);
              accessToken = tokenData.access_token;
            }
          } else {
            accessToken = tokenData.access_token;
          }
        } else {
          setIsGoogleConnected(false);
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke("aori-youtube-search", {
        body: { query: searchQuery, accessToken, maxResults: 10 },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const validVideos = (data?.videos || []).filter((v: VideoItem) => v.videoId);
      if (!validVideos.length) throw new Error("No playable videos found");

      setVideos(validVideos);
      setCurrentIndex(0);
      setReadyToPlay(false);
      setPlayNonce(0);
    } catch (e: unknown) {
      console.error("YouTube search error:", e);
      const message = e instanceof Error ? e.message : "Failed to search";
      setError(message);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    setReadyToPlay(false);
  }, [currentIndex]);

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
      const maxY = window.innerHeight - (minimized ? 56 : 340);
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

  if (minimized) {
    return (
      <div className="fixed z-[100] select-none" style={{ left: pos.x, top: pos.y, touchAction: "none" }}>
        <div
          className="relative w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl cursor-grab active:cursor-grabbing flex items-center justify-center border border-border"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping" style={{ animationDuration: "2s" }} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isDragging.current) setMinimized(false);
            }}
            className="relative z-10 w-full h-full rounded-full flex items-center justify-center"
            aria-label="Expand player"
          >
            <Music className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground border border-border flex items-center justify-center z-20"
            aria-label="Close player"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed z-[100] select-none" style={{ left: pos.x, top: pos.y, touchAction: "none" }}>
      <div className="w-[280px] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col">
        <div
          className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-grab active:cursor-grabbing shrink-0 border-b border-border"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-[10px] text-foreground/70 font-medium truncate">🎵 {searchQuery}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={fetchVideos} className="p-1.5 rounded-full hover:bg-muted transition-colors" title="Refresh songs">
              <RefreshCw className="w-3 h-3 text-foreground/60" />
            </button>
            <button onClick={() => setMinimized(true)} className="p-1.5 rounded-full hover:bg-muted transition-colors" title="Minimize">
              <Music className="w-3 h-3 text-foreground/60" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors" title="Close">
              <X className="w-3 h-3 text-foreground/60" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-foreground/40 animate-spin" />
            <span className="text-xs text-foreground/50 ml-2">Searching...</span>
          </div>
        ) : error ? (
          <div className="p-4 space-y-3 text-center">
            <p className="text-xs text-destructive">{error}</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={fetchVideos} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/80">
                Retry
              </button>
              <button
                onClick={() => {
                  window.location.href = "/setup";
                }}
                className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1"
              >
                <Link className="w-3 h-3" />
                Connect Google
              </button>
            </div>
            {!isGoogleConnected && <p className="text-[10px] text-foreground/50">Tip: connect Google once for a more reliable music feed.</p>}
          </div>
        ) : currentVideo ? (
          <>
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              <iframe
                key={`${currentVideo.videoId}-${playNonce}`}
                src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=${readyToPlay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title={currentVideo.title}
              />

              {!readyToPlay && (
                <button
                  onClick={() => {
                    setReadyToPlay(true);
                    setPlayNonce((v) => v + 1);
                  }}
                  className="absolute inset-0 bg-background/70 backdrop-blur-[1px] flex items-center justify-center"
                >
                  <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    <Play className="w-3 h-3" />
                    Tap to play audio
                  </span>
                </button>
              )}
            </div>

            <div className="px-3 py-2 space-y-2">
              <p className="text-[11px] text-foreground/80 font-medium truncate" title={currentVideo.title}>
                {currentVideo.title}
              </p>
              <p className="text-[9px] text-muted-foreground truncate">{currentVideo.channelTitle}</p>

              <div className="flex items-center justify-center gap-4 py-1">
                <button
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-20"
                >
                  <SkipBack className="w-4 h-4 text-foreground/70" />
                </button>
                <span className="text-[9px] text-muted-foreground">
                  {currentIndex + 1} / {videos.length}
                </span>
                <button
                  onClick={() => setCurrentIndex((prev) => Math.min(videos.length - 1, prev + 1))}
                  disabled={currentIndex >= videos.length - 1}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-20"
                >
                  <SkipForward className="w-4 h-4 text-foreground/70" />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
