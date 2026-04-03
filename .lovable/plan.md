

## Fix Puter.ai Vision for Academic Image Solving

### Problem
The puter.ai vision integration is not working for image analysis (including homework/math solving). Two likely issues:

1. **Wrong model name**: The code uses `gpt-4o-mini` which is outdated. Puter.ai docs show `gpt-5.4-nano` as the current vision-capable model.
2. **Base64 data URL may not be accepted**: The code passes `data:image/jpeg;base64,...` as the image parameter. Puter.ai expects either a regular HTTPS URL or a `File` object. Base64 data URLs are not shown as supported in their docs.
3. **JSON parsing fragility**: If the model doesn't return clean JSON, the fallback silently drops the solution.

### Plan

**Step 1: Fix the image format for puter.ai**
- Convert the base64 image data to a `File` or `Blob` object before passing to `puter.ai.chat()`, since the API accepts `File` objects as the second parameter.
- Apply this fix to all 5 puter.ai.chat calls: general image analysis, webcam observation, face recognition, environment analysis, and periodic observations.

```typescript
// Convert base64 to File object
const byteString = atob(base64);
const ab = new ArrayBuffer(byteString.length);
const ia = new Uint8Array(ab);
for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
const file = new File([ab], "image.jpg", { type: mimeType });

const rawReply = await puter.ai.chat(visionPrompt, file, { model: "gpt-5.4-nano" });
```

**Step 2: Update model name across all vision calls**
- Replace `gpt-4o-mini` with `gpt-5.4-nano` (or another supported vision model from Puter.ai docs) in all puter.ai.chat invocations.

**Step 3: Improve JSON parsing resilience**
- Add fallback parsing that handles cases where the model returns text wrapped in markdown code blocks, or plain text without JSON.
- If JSON parsing fails, attempt to extract academic content from raw text.

**Step 4: Update TypeScript types**
- Update `src/types/puter.d.ts` to accept `Blob` in addition to `string | File`.

### Files to modify
- `src/components/AoriChat.tsx` — fix all 5 puter.ai.chat calls (image format + model name + parsing)
- `src/types/puter.d.ts` — add Blob to accepted types

