import { useState, useRef, useCallback, useEffect } from "react";
import { emotionCutouts } from "@/lib/aori-personality";
import AoriChat from "./AoriChat";
import { KeepAwake } from "@capacitor-community/keep-awake";

const DEFAULT_SIZE = 60;
const MIN_SIZE = 40;
const MAX_SIZE = 200;
const LONG_PRESS_MS = 500;

export default function FloatingAoriHead() {
  const [expanded, setExpanded] = useState(false);
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [headSize, setHeadSize] = useState(DEFAULT_SIZE);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth - DEFAULT_SIZE - 16 : 300,
    y: typeof window !== "undefined" ? window.innerHeight * 0.6 : 400,
  }));

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ initialDist: number; initialSize: number } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressFired = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp position within viewport
  const clampPos = useCallback((x: number, y: number, size: number) => ({
    x: Math.max(0, Math.min(window.innerWidth - size, x)),
    y: Math.max(0, Math.min(window.innerHeight - size, y)),
  }), []);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (expanded) return;

      // Pinch-to-zoom: two fingers
      if ("touches" in e && e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = {
          initialDist: Math.hypot(dx, dy),
          initialSize: headSize,
        };

        const handlePinchMove = (ev: TouchEvent) => {
          if (!pinchRef.current || ev.touches.length < 2) return;
          ev.preventDefault();
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const scale = dist / pinchRef.current.initialDist;
          const newSize = Math.round(
            Math.max(MIN_SIZE, Math.min(MAX_SIZE, pinchRef.current.initialSize * scale))
          );
          setHeadSize(newSize);
          setPos((prev) => clampPos(prev.x, prev.y, newSize));
        };

        const handlePinchEnd = () => {
          pinchRef.current = null;
          window.removeEventListener("touchmove", handlePinchMove);
          window.removeEventListener("touchend", handlePinchEnd);
        };

        window.addEventListener("touchmove", handlePinchMove, { passive: false });
        window.addEventListener("touchend", handlePinchEnd);
        return;
      }

      e.preventDefault();
      const point = "touches" in e ? e.touches[0] : e;
      dragRef.current = {
        startX: point.clientX,
        startY: point.clientY,
        origX: pos.x,
        origY: pos.y,
        moved: false,
      };
      longPressFired.current = false;

      // Long press timer
      longPressTimer.current = setTimeout(() => {
        if (dragRef.current && !dragRef.current.moved) {
          longPressFired.current = true;
          setVoiceActivated(true);
          setExpanded(true);
          dragRef.current = null;
        }
      }, LONG_PRESS_MS);

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        if (!dragRef.current) return;
        const p = "touches" in ev ? ev.touches[0] : ev;
        const dx = p.clientX - dragRef.current.startX;
        const dy = p.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          dragRef.current.moved = true;
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
        setPos(clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy, headSize));
      };

      const handleUp = () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }

        if (dragRef.current) {
          // Short tap → open chat
          if (!dragRef.current.moved && !longPressFired.current) {
            setExpanded(true);
            setVoiceActivated(false);
          }
        }

        dragRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("touchend", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleUp);
    },
    [expanded, pos, headSize, clampPos]
  );

  // Mouse wheel zoom (desktop)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || expanded) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setHeadSize((prev) => {
        const next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, prev - e.deltaY * 0.5));
        return Math.round(next);
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [expanded]);

  // Keep screen awake while chat is expanded
  useEffect(() => {
    if (expanded) {
      KeepAwake.keepAwake().catch(() => {});
    } else {
      KeepAwake.allowSleep().catch(() => {});
    }
    return () => { KeepAwake.allowSleep().catch(() => {}); };
  }, [expanded]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return (
    <>
      {!expanded && (
        <div
          ref={containerRef}
          className="fixed z-[9999] cursor-grab active:cursor-grabbing select-none"
          style={{
            left: pos.x,
            top: pos.y,
            width: headSize,
            height: headSize,
            touchAction: "none",
            transition: dragRef.current?.moved ? "none" : "left 0.3s ease-out, top 0.3s ease-out, width 0.15s ease-out, height 0.15s ease-out",
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          {/* Glow ring */}
          <div
            className="absolute inset-[-4px] rounded-full"
            style={{
              background: "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)",
              filter: "blur(6px)",
              animation: "pulse-glow-aura 3s ease-in-out infinite",
            }}
          />
          {/* Avatar circle */}
          <div
            className="w-full h-full rounded-full overflow-hidden ring-2 ring-primary/60 shadow-lg shadow-primary/20 bg-card"
            style={{ animation: "aori-breathe 2.5s ease-in-out infinite" }}
          >
            <img
              src={emotionCutouts.smirk}
              alt="Aori"
              className="w-full h-full object-cover object-top"
              draggable={false}
            />
          </div>
          {/* Online indicator dot */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-accent ring-2 ring-card" />
          </span>
        </div>
      )}

      {expanded && (
        <div className="fixed inset-0 z-[9998]">
          <AoriChat
            onClose={() => {
              setExpanded(false);
              setVoiceActivated(false);
            }}
            autoVoiceMode={voiceActivated}
          />
        </div>
      )}
    </>
  );
}
