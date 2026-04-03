

## Fix Puter.ai Vision for Webcam & Image Analysis

### Problem
All `puter.ai.chat()` calls pass **base64 data URLs** (`data:image/jpeg;base64,...`) as the image parameter. Puter.ai likely expects either a proper HTTPS URL or a `File`/`Blob` object — not a data URI string. The model name `gpt-4o-mini` may also be outdated.

### Plan

**Step 1: Create a helper to convert base64 to File**
Add a utility function in `AoriChat.tsx`:
```typescript
function base64ToFile(base64: string, mime = "image/jpeg"): File {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new File([ab], "capture.jpg", { type: mime });
}
```

**Step 2: Replace all 5 puter.ai.chat image calls**
Change from:
```typescript
const imageDataUrl = `data:image/jpeg;base64,${image}`;
puter.ai.chat(prompt, imageDataUrl, { model: "gpt-4o-mini" });
```
To:
```typescript
const imageFile = base64ToFile(image);
puter.ai.chat(prompt, imageFile, { model: "gpt-5-nano" });
```

Affected locations (~5 calls):
1. `analyzeFrame` — periodic webcam observation (line ~1851)
2. Image upload analysis (line ~1509)
3. Face recognition (line ~1908)
4. Environment analysis (line ~1940)
5. "What am I doing" full context (line ~2009)

**Step 3: Update TypeScript types**
Update `src/types/puter.d.ts` to accept `Blob` in addition to `string | File`.

### Files to modify
- `src/components/AoriChat.tsx` — add helper, update all 5 calls
- `src/types/puter.d.ts` — broaden type signature

