import { useState, useRef, useCallback, useEffect } from "react";
import { emotionCutouts } from "@/lib/aori-personality";

const DEFAULT_SIZE = 280;
const MIN_SIZE = 100;
const MAX_SIZE = 600;

export default function DraggableCutout() {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? (window.innerWidth - DEFAULT_SIZE) / 2 : 100,
    y: typeof window !== "undefined" ? (window.innerHeight - DEFAULT_SIZE) / 2 : 100,
  }));

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ initialDist: number; initialSize: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampPos = useCallback((x: number, y: number, s: number) => ({
    x: Math.max(-s * 0.3, Math.min(window.innerWidth - s * 0.7, x)),
    y: Math.max(-s * 0.3, Math.min(window.innerHeight - s * 0.7, y)),
  }), []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Pinch-to-zoom
    if ("touches" in e && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { initialDist: Math.hypot(dx, dy), initialSize: size };

      const handlePinchMove = (ev: TouchEvent) => {
        if (!pinchRef.current || ev.touches.length < 2) return;
        ev.preventDefault();
        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / pinchRef.current.initialDist;
        const newSize = Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, pinchRef.current.initialSize * scale)));
        setSize(newSize);
        setPos(prev => clampPos(prev.x, prev.y, newSize));
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
    dragRef.current = { startX: point.clientX, startY: point.clientY, origX: pos.x, origY: pos.y, moved: false };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const p = "touches" in ev ? ev.touches[0] : ev;
      const dx = p.clientX - dragRef.current.startX;
      const dy = p.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
      setPos(clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy, size));
    };

    const handleUp = () => {
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
  }, [pos, size, clampPos]);

  // Mouse wheel zoom (desktop)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSize(prev => Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, prev - e.deltaY * 0.8))));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] cursor-grab active:cursor-grabbing select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        touchAction: "none",
        transition: dragRef.current?.moved ? "none" : "left 0.15s ease-out, top 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out",
      }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      {/* Glow behind cutout */}
      <div
        className="absolute inset-[-10%] rounded-full opacity-40"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)",
          filter: "blur(20px)",
          animation: "pulse-glow-aura 3s ease-in-out infinite",
        }}
      />
      <img
        src={emotionCutouts.happy}
        alt="Aori"
        className="w-full h-full object-contain drop-shadow-lg"
        style={{ animation: "aori-breathe 2.5s ease-in-out infinite" }}
        draggable={false}
      />
    </div>
  );
}
