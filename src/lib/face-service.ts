/**
 * Local face detection & recognition using face-api.js.
 * Runs entirely in the browser — no cloud APIs.
 */
import * as faceapi from "face-api.js";

let modelsLoaded = false;
let loading = false;

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

/** Load all face-api.js models */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded || loading) return;
  loading = true;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log("face-api.js models loaded successfully");
  } catch (e) {
    console.error("Failed to load face-api.js models:", e);
    throw e;
  } finally {
    loading = false;
  }
}

export function isModelsLoaded(): boolean {
  return modelsLoaded;
}

export interface FaceDetection {
  descriptor: Float32Array;
  expressions: Record<string, number>;
  dominantExpression: string;
  landmarks: faceapi.FaceLandmarks68;
  box: { x: number; y: number; width: number; height: number };
}

/** Detect faces in a video element or image element */
export async function detectFaces(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetection[]> {
  if (!modelsLoaded) await loadFaceModels();

  const detections = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();

  return detections.map((d) => {
    const expEntries = Object.entries(d.expressions) as [string, number][];
    const dominant = expEntries.reduce((a, b) => (b[1] > a[1] ? b : a), expEntries[0]);

    return {
      descriptor: d.descriptor,
      expressions: Object.fromEntries(expEntries),
      dominantExpression: dominant[0],
      landmarks: d.landmarks,
      box: {
        x: d.detection.box.x,
        y: d.detection.box.y,
        width: d.detection.box.width,
        height: d.detection.box.height,
      },
    };
  });
}

/** Compare a face descriptor against a set of known face descriptors */
export function matchFace(
  descriptor: Float32Array,
  knownFaces: Array<{ name: string; descriptor: Float32Array }>,
  threshold = 0.6
): { name: string; distance: number } | null {
  let bestMatch: { name: string; distance: number } | null = null;

  for (const known of knownFaces) {
    const distance = faceapi.euclideanDistance(descriptor, known.descriptor);
    if (distance < threshold && (!bestMatch || distance < bestMatch.distance)) {
      bestMatch = { name: known.name, distance };
    }
  }

  return bestMatch;
}

/** Convert face expression from face-api.js to Aori emotion */
export function expressionToAoriEmotion(expression: string): string {
  const map: Record<string, string> = {
    happy: "happy",
    sad: "sad",
    angry: "angry",
    fearful: "shock",
    disgusted: "angry",
    surprised: "shock",
    neutral: "smirk",
  };
  return map[expression] || "smirk";
}

/** Get face position relative to frame center (for eye tracking) */
export function getFacePosition(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  return {
    x: (centerX / frameWidth - 0.5) * 2, // -1 to 1
    y: (centerY / frameHeight - 0.5) * 2, // -1 to 1
  };
}

/** Describe a face based on face-api.js detection for saving */
export function describeFace(detection: FaceDetection): string {
  const { dominantExpression, box } = detection;
  const size = box.width * box.height;
  const sizeLabel = size > 20000 ? "close to camera" : size > 8000 ? "at medium distance" : "far from camera";

  return `Face detected ${sizeLabel}. Expression: ${dominantExpression}. Face area: ${Math.round(box.width)}x${Math.round(box.height)}px.`;
}
