/**
 * Local AI service using Transformers.js for browser-based vision.
 * No cloud APIs — everything runs locally in the browser via WebAssembly/WebGPU.
 */
import { pipeline, env, type PipelineType } from "@huggingface/transformers";

// Configure Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface LocalAIState {
  captioner: any;
  detector: any;
  captionerStatus: LoadStatus;
  detectorStatus: LoadStatus;
  loadProgress: number;
}

const state: LocalAIState = {
  captioner: null,
  detector: null,
  captionerStatus: "idle",
  detectorStatus: "idle",
  loadProgress: 0,
};

const listeners = new Set<(progress: number, status: string) => void>();

export function onLocalAIProgress(cb: (progress: number, status: string) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notify(progress: number, status: string) {
  state.loadProgress = progress;
  listeners.forEach((cb) => cb(progress, status));
}

/** Initialize the image-to-text (captioning) pipeline */
export async function initCaptioner(): Promise<void> {
  if (state.captioner || state.captionerStatus === "loading") return;
  state.captionerStatus = "loading";
  notify(5, "Loading image captioning model...");
  try {
    state.captioner = await pipeline("image-to-text", "Xenova/vit-gpt2-image-captioning", {
      progress_callback: (p: any) => {
        if (p?.progress) notify(Math.min(45, p.progress * 0.45), `Captioner: ${Math.round(p.progress)}%`);
      },
    });
    state.captionerStatus = "ready";
    notify(50, "Captioner ready!");
  } catch (e) {
    state.captionerStatus = "error";
    console.error("Failed to load captioner:", e);
    throw e;
  }
}

/** Initialize the object-detection pipeline */
export async function initDetector(): Promise<void> {
  if (state.detector || state.detectorStatus === "loading") return;
  state.detectorStatus = "loading";
  notify(55, "Loading object detection model...");
  try {
    state.detector = await pipeline("object-detection", "Xenova/detr-resnet-50", {
      progress_callback: (p: any) => {
        if (p?.progress) notify(50 + Math.min(45, p.progress * 0.45), `Detector: ${Math.round(p.progress)}%`);
      },
    });
    state.detectorStatus = "ready";
    notify(100, "All models ready!");
  } catch (e) {
    state.detectorStatus = "error";
    console.error("Failed to load detector:", e);
    throw e;
  }
}

/** Load all models at once — failures are swallowed so app stays responsive */
export async function initAllModels(): Promise<void> {
  await Promise.allSettled([initCaptioner(), initDetector()]);
}

/** Check if models are loaded */
export function isReady(): boolean {
  return state.captionerStatus === "ready" && state.detectorStatus === "ready";
}

export function getLoadProgress(): number {
  return state.loadProgress;
}

/** Convert base64 to a data URL that Transformers.js can consume */
function base64ToDataUrl(base64: string, mime = "image/jpeg"): string {
  if (base64.startsWith("data:")) return base64;
  return `data:${mime};base64,${base64}`;
}

/** Describe an image using the captioning model */
export async function captionImage(imageBase64: string): Promise<string> {
  if (!state.captioner && state.captionerStatus !== "error") await initCaptioner();
  if (!state.captioner) return ""; // disabled — fail silently, no retry
  try {
    const dataUrl = base64ToDataUrl(imageBase64);
    const result = await state.captioner(dataUrl);
    return result?.[0]?.generated_text || "";
  } catch (e) {
    console.warn("captionImage failed:", e);
    return "";
  }
}

/** Detect objects in an image */
export async function detectObjects(imageBase64: string, threshold = 0.7): Promise<Array<{ label: string; score: number }>> {
  if (!state.detector && state.detectorStatus !== "error") await initDetector();
  if (!state.detector) return [];
  try {
    const dataUrl = base64ToDataUrl(imageBase64);
    const results = await state.detector(dataUrl, { threshold });
    return (results || []).map((r: any) => ({
      label: r.label,
      score: Math.round(r.score * 100) / 100,
    }));
  } catch (e) {
    console.warn("detectObjects failed:", e);
    return [];
  }
}

/** Combined analysis: caption + objects for a rich description */
export async function analyzeImage(imageBase64: string): Promise<{
  caption: string;
  objects: Array<{ label: string; score: number }>;
  summary: string;
}> {
  const [caption, objects] = await Promise.all([
    captionImage(imageBase64),
    detectObjects(imageBase64),
  ]);

  const objectLabels = [...new Set(objects.map((o) => o.label))];
  const summary = objectLabels.length > 0
    ? `${caption}. Detected objects: ${objectLabels.join(", ")}.`
    : caption;

  return { caption, objects, summary };
}

/** Generate a local image using canvas (stylized placeholder since true local SD is too heavy) */
export async function generateImageLocal(prompt: string): Promise<string> {
  // Use Transformers.js text-to-image if available in the future.
  // For now, create a styled canvas placeholder with the prompt text.
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Gradient background based on prompt keywords
  const colors = getPromptColors(prompt);
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.5, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Add some visual noise/texture
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  // Draw prompt text
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  const words = prompt.split(" ");
  let line = "";
  let y = 220;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > 440) {
      ctx.fillText(line, 256, y);
      line = word + " ";
      y += 24;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 256, y);

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("🎨 Generated locally", 256, 490);

  return canvas.toDataURL("image/png");
}

function getPromptColors(prompt: string): [string, string, string] {
  const lower = prompt.toLowerCase();
  if (/sunset|warm|fire|red|orange/.test(lower)) return ["#ff6b35", "#e63946", "#ffb703"];
  if (/ocean|water|blue|sea|ice/.test(lower)) return ["#0077b6", "#00b4d8", "#90e0ef"];
  if (/forest|green|nature|tree/.test(lower)) return ["#2d6a4f", "#40916c", "#95d5b2"];
  if (/night|dark|space|galaxy/.test(lower)) return ["#0d1b2a", "#1b263b", "#415a77"];
  if (/pink|love|heart|sakura/.test(lower)) return ["#ff69b4", "#ff85c0", "#ffc2d1"];
  if (/gold|yellow|sun|bright/.test(lower)) return ["#ffd60a", "#ffb703", "#fb8500"];
  return ["#6c63ff", "#4361ee", "#7209b7"]; // default purple
}
