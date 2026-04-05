

## Voice-First Aori: Remove Buttons + Auto-Features + Enhanced Weather

### What Changes

**1. Remove all sidebar buttons from home screen**
The right-side button panel (lines 2366-2461) with ~13 buttons (camera, weather, music, settings, profile, etc.) will be removed entirely. All functionality will be accessible only through voice commands or chat text.

**2. Auto-start camera on launch**
When AoriChat mounts, automatically request front camera permission and start the webcam. Aori will immediately begin observing the user without needing any button press.

**3. Auto-enable weather on launch**
Instead of requiring the CloudSun button, weather will auto-fetch using `navigator.geolocation` on component mount. The `weatherEnabled` state will default to `true`.

**4. Enhanced weather data**
Expand the Open-Meteo API call to include more parameters: `rain`, `showers`, `snowfall`, `cloud_cover`, `relative_humidity_2m`, `precipitation`, `surface_pressure`, `pressure_msl`, `wind_direction_10m`, `wind_gusts_10m`. The summary string injected into Aori's system prompt will be richer.

Note: We will NOT use the `openmeteo` npm package (`fetchWeatherApi`) because it uses Protocol Buffers which adds complexity. The existing plain JSON fetch from `api.open-meteo.com` already supports all these parameters natively by adding them to the URL query string.

**5. Add voice/chat commands for everything buttons did**
Extend the existing voice command regex detection (already has camera commands) to also handle:
- "enable/disable weather" or "what's the weather"
- "open settings" / "open profile" / "open character studio"
- "mute/unmute" voice
- "detect music" / "stop music detection"
- "clear chat" / "delete messages"

These same commands will also work when typed in the chat input.

### Technical Details

**Files to modify:**
- `src/components/AoriChat.tsx`
  - Remove the entire right-side button panel div (lines 2366-2461)
  - Change `weatherEnabled` default to `true` and auto-call `syncWeatherContext` on mount
  - Change `webcamEnabled` to auto-start: add a `useEffect` that calls `toggleWebcam()` after profile loads
  - Expand the Open-Meteo fetch URL with additional current parameters
  - Build a richer weather summary string with humidity, rain, cloud cover, etc.
  - Add new voice command regex patterns for settings/profile/mute/weather/music in the `handleVoiceResult` callback
  - Add the same command detection in `sendMessageCore` for typed commands
  - Keep only: bottom input bar, chat overlay panel, avatar, voice transcript overlay, webcam preview thumbnail, music indicator

**What stays on screen:**
- Aori's avatar (draggable)
- Bottom text input bar with send/image/paint buttons
- Webcam preview thumbnail (top-left, auto-visible)
- Chat overlay (opens when user taps input or types)
- Voice transcript overlay (when voice mode active via "hey aori" or voice command)

**Voice mode activation:** Users say "start voice mode" or type it. The existing voice mode toggle logic stays but is triggered by command instead of button.

