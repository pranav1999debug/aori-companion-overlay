import { useState, useRef, useCallback, useEffect } from "react";
import { emotionCutouts } from "@/lib/aori-personality";
import AoriChat from "./AoriChat";

const HEAD_SIZE = 60;
const SNAP_THRESHOLD = 20; // px from edge to snap
const LONG_PRESS_MS = 500;

export default function FloatingAoriHead() {
  const [expanded, setExpanded] = useState(false);
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth - HEAD_SIZE - 16 : 300,
    y: typeof window !== "undefined" ? window.innerHeight * 0.6 : 400,
  }));

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressFired = useRef(false);

  // Snap to nearest horizontal edge
  const snapToEdge = useCallback((x: number, y: number) => {
    const midX = window.innerWidth / 2;
    const snappedX = x + HEAD_SIZE / 2 < midX ? 8 : window.innerWidth - HEAD_SIZE - 8;
    const snappedY = Math.max(8, Math.min(window.innerHeight - HEAD_SIZE - 8, y));
    return { x: snappedX, y: snappedY };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (expanded) return;
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

      // Start long press timer
      longPressTimer.current = setTimeout(() => {
        if (dragRef.current && !dragRef.current.moved) {
          longPressFired.current = true;
          setVoiceActivated(true);
          setExpanded(true);
          // Clean up
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
          // Cancel long press if user is dragging
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
        setPos({
          x: dragRef.current.origX + dx,
          y: dragRef.current.origY + dy,
        });
      };

      const handleUp = () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }

        if (dragRef.current) {
          // Snap to edge
          setPos((prev) => snapToEdge(prev.x, prev.y));

          // Short tap (no drag, no long press)
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
    [expanded, pos, snapToEdge]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // Re-snap on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => snapToEdge(prev.x, prev.y));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [snapToEdge]);

  return (
    <>
      {/* Floating head bubble */}
      {!expanded && (
        <div
          className="fixed z-[9999] cursor-grab active:cursor-grabbing select-none"
          style={{
            left: pos.x,
            top: pos.y,
            width: HEAD_SIZE,
            height: HEAD_SIZE,
            touchAction: "none",
            transition: dragRef.current?.moved ? "none" : "left 0.3s ease-out, top 0.3s ease-out",
          }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          {/* Glow ring */}
          <div
            className="absolute inset-[-4px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)",
              filter: "blur(6px)",
              animation: "pulse-glow-aura 3s ease-in-out infinite",
            }}
          />
          {/* Avatar circle */}
          <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-primary/60 shadow-lg shadow-primary/20 bg-card">
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

      {/* Expanded full Aori chat overlay */}
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
