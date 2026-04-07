## Fully Local AI: Transformers.js + face-api.js + Groq

### 1. Install Dependencies
- `@huggingface/transformers` (Transformers.js v3)
- `face-api.js` (browser face detection/recognition)

### 2. Create Local Vision Service (`src/lib/local-ai.ts`)
- Initialize Transformers.js pipeline for **image-to-text** (model: `Xenova/vit-gpt2-image-captioning`) — describes what the camera sees
- Initialize **object-detection** pipeline (model: `Xenova/detr-resnet-50`) — detects objects with bounding boxes
- For academic/homework solving: Use Transformers.js **OCR** (`Xenova/trocr-base-handwritten`) to extract text, then send extracted text to Groq for solving
- All models load once and are cached in browser IndexedDB
- Show loading progress bar on first use

### 3. Create Face Recognition Service (`src/lib/face-service.ts`)
- Load face-api.js models (tinyFaceDetector, faceLandmark68, faceRecognition, faceExpression)
- Host model weights in `public/models/face-api/` 
- Detect faces, extract descriptors, match against saved known faces
- Replace current Puter.ai face analysis calls

### 4. Update AoriChat.tsx — Replace ALL Puter Vision Calls
- **Periodic webcam observation**: Use local image-to-text + object-detection instead of `puter.ai.chat()`
- **Image analysis (sent photos)**: Use local captioning + OCR, then Groq for interpretation
- **Face recognition**: Use face-api.js instead of Puter
- **Environment analysis**: Use local object-detection
- **"What am I doing" context**: Combine local detections

### 5. Update CharacterStudio.tsx — Use Groq for Search
- Replace `puter.ai.chat()` character lookup with Groq API call via `aori-chat` edge function or a new lightweight edge function
- Groq will return character metadata (name, anime, personality, appearance)

### 6. Local Image Generation
- Use Transformers.js with `Xenova/stable-diffusion-v1-5` or lighter model
- Show progress indicator (will be slow, especially on mobile)
- Provide clear "generating locally..." UI feedback
- WebGPU acceleration where available, WASM fallback

### Files to Create
- `src/lib/local-ai.ts` — Transformers.js vision pipelines
- `src/lib/face-service.ts` — face-api.js wrapper

### Files to Modify  
- `src/components/AoriChat.tsx` — replace all puter.ai vision calls
- `src/pages/CharacterStudio.tsx` — use Groq for search
- `src/types/puter.d.ts` — can keep for non-vision puter uses