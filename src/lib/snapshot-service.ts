/**
 * Snapshot service: opens front + back cameras, captures 4-5 frames total,
 * uploads them to catbox.moe via the aori-catbox-upload edge function.
 * Used for on-demand vision queries (e.g. "what's this?").
 */
import { supabase } from "@/integrations/supabase/client";

export type SnapshotSource = "front" | "back";
export interface Snapshot {
  source: SnapshotSource;
  base64: string;        // raw base64 (no data: prefix)
  url: string | null;    // catbox URL (null if upload failed)
}

const TARGET_TOTAL = 5;

function captureFromVideo(video: HTMLVideoElement, w = 480, h = 360): string | null {
  if (video.readyState < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
}

async function openStream(facingMode: "user" | "environment"): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: facingMode === "environment"
        ? { facingMode: { ideal: "environment" } }
        : { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
      audio: false,
    });
  } catch {
    return null;
  }
}

async function streamToVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.autoplay = true;
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  await v.play().catch(() => {});
  // wait until first frame
  await new Promise<void>((resolve) => {
    if (v.readyState >= 2) return resolve();
    v.addEventListener("loadeddata", () => resolve(), { once: true });
    setTimeout(() => resolve(), 1500);
  });
  return v;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

async function uploadOne(base64: string, source: SnapshotSource): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("aori-catbox-upload", {
      body: { image: base64, filename: `aori-${source}-${Date.now()}.jpg` },
    });
    if (error || !data?.url) return null;
    return data.url as string;
  } catch {
    return null;
  }
}

/**
 * Take ~4-5 snaps total across front + back cameras.
 * Reuses already-active streams when provided; otherwise opens fresh ones briefly.
 */
export async function takeSnapshots(opts: {
  frontVideo?: HTMLVideoElement | null;
  backVideo?: HTMLVideoElement | null;
} = {}): Promise<Snapshot[]> {
  const out: Snapshot[] = [];

  // ---- FRONT ----
  let frontVideo = opts.frontVideo || null;
  let openedFront: MediaStream | null = null;
  if (!frontVideo || frontVideo.readyState < 2) {
    openedFront = await openStream("user");
    if (openedFront) frontVideo = await streamToVideo(openedFront);
  }

  // ---- BACK ----
  let backVideo = opts.backVideo || null;
  let openedBack: MediaStream | null = null;
  if (!backVideo || backVideo.readyState < 2) {
    openedBack = await openStream("environment");
    if (openedBack) backVideo = await streamToVideo(openedBack);
  }

  const haveFront = !!frontVideo && frontVideo.readyState >= 2;
  const haveBack = !!backVideo && backVideo.readyState >= 2;

  // Decide split: 3 front + 2 back if both, else all from the available one.
  let frontN = 0, backN = 0;
  if (haveFront && haveBack) { frontN = 3; backN = 2; }
  else if (haveFront) { frontN = TARGET_TOTAL; }
  else if (haveBack) { backN = TARGET_TOTAL; }

  const captures: Array<{ source: SnapshotSource; base64: string }> = [];

  for (let i = 0; i < frontN; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 250));
    const b64 = captureFromVideo(frontVideo!);
    if (b64) captures.push({ source: "front", base64: b64 });
  }
  for (let i = 0; i < backN; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 250));
    const b64 = captureFromVideo(backVideo!);
    if (b64) captures.push({ source: "back", base64: b64 });
  }

  // Stop any streams we opened ourselves (don't kill caller-owned streams)
  if (openedFront) stopStream(openedFront);
  if (openedBack) stopStream(openedBack);

  // Upload in parallel
  const uploaded = await Promise.all(
    captures.map(async (c) => ({
      source: c.source,
      base64: c.base64,
      url: await uploadOne(c.base64, c.source),
    })),
  );

  out.push(...uploaded);
  return out;
}

/** Heuristic: does the user message want a fresh visual look? */
export function isVisionQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(what('?s| is)\s*(this|that)|identify\s*this|look\s*at\s*(this|me|here)|see\s*this|kya\s*hai\s*(ye|yeh|this)|ye\s*kya\s*hai|describe\s*(this|what\s*you\s*see)|what\s*do\s*you\s*see|what\s*am\s*i\s*(holding|wearing|showing)|scan\s*(this|the\s*room)|check\s*this\s*out)\b/.test(t);
}
