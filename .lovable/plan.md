
# Fix Google OAuth Integration

## Root Cause

The `aori-google-oauth` edge function is **not listed in `supabase/config.toml`**. By default, Supabase enforces JWT verification at the gateway level. Since the function handles authentication internally (checking the Authorization header itself), the gateway is silently rejecting or blocking requests before they reach the function code. This explains why edge function logs show zero processed requests.

## Additional Issues

1. **Missing `aori-gmail`, `aori-calendar`, `aori-youtube` from config.toml** -- these also need `verify_jwt = false` if they handle auth internally.
2. **Redirect URI mismatch risk** -- if you test from the Lovable preview URL (which differs from the published URL `aori-companion-overlay.lovable.app`), Google will reject the redirect since only the published URL is authorized.

## Plan

### 1. Add missing edge functions to `supabase/config.toml`

Add entries for all edge functions that handle authentication internally:

```toml
[functions.aori-google-oauth]
verify_jwt = false

[functions.aori-gmail]
verify_jwt = false

[functions.aori-calendar]
verify_jwt = false

[functions.aori-youtube]
verify_jwt = false
```

### 2. Remove debug UI from GoogleCallback

Once the fix is confirmed working, remove the `<pre>` debug block from `GoogleCallback.tsx` to clean up the UI.

## Testing

After implementation, test from the **published URL** (`https://aori-companion-overlay.lovable.app`), not the preview URL, since only the published URL is registered in Google Cloud Console as an authorized redirect URI.
