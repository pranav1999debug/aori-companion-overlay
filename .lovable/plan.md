
## Multi-Feature Update Plan

### 1. Onboarding Command Hints + Voice Mode Default
- Add a dismissible tooltip/overlay showing available voice/chat commands on first visit
- Set voice mode to auto-start by default on mount

### 2. Use Puter.ai for Image Generation in Chat
- Replace the Lovable AI gateway image gen edge function call with client-side `puter.ai.chat()` using an image-generation capable model
- Display generated images inline in chat

### 3. Use Puter.ai for Character Studio
- Replace `aori-character-lookup` edge function with client-side `puter.ai.chat()` for character metadata lookup
- Replace `aori-generate-expressions` edge function with `puter.ai.chat()` for generating expression images

### 4. Face Tracking (Head Movement → Aori Eye Contact)
- Use the existing webcam feed to detect face position (left/right/up/down tilt)
- Apply CSS transforms to Aori's avatar so she appears to "look at" the user — mirroring their head position
- Use simple canvas-based face position detection (center of face relative to frame) rather than heavy MediaPipe library
- Creates an illusion of eye contact and reactive movement

### 5. Auto-inject City, Time, Weather into System Prompt
- Use the existing geolocation + reverse geocoding (via Open-Meteo's timezone info or a free reverse geocoding API) to get the user's city name
- Append a context block like `"Good evening from Danapur! 22°C, partly cloudy"` into the system prompt sent to the chat edge function
- The weather data is already fetched; we just need to add city name resolution and format it into the prompt

### 6. Wikipedia SSE Stream + Live Feed Panel
- Connect to `https://stream.wikimedia.org/v2/stream/recentchange` via EventSource
- Create a small glassmorphism side panel showing recent Wikipedia edits filtered by user's city or current chat topic
- Add on-demand Wikipedia summary fetching via `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`
- Show a "Wiki Verified ✓" badge on messages where Aori references factual Wikipedia data

### Files to modify
- `src/components/AoriChat.tsx` — commands tooltip, voice default, face tracking, context injection, puter image gen, wiki integration
- `src/pages/CharacterStudio.tsx` — switch to puter.ai for character lookup and expression generation
- `src/types/puter.d.ts` — add txt2img if needed

### Note
- Face tracking will use simple canvas position detection (no external library) — lightweight but effective for basic "look at user" behavior
- Wikipedia SSE is a nice ambient feature but may generate a lot of traffic; we'll add a toggle
