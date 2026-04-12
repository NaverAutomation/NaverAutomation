# Spec - Final Security Fix for Task 7

## Goal
Enhance security by ensuring `openai_api_key` is encrypted in the database and masked when sent to the UI.

## Changes

### 1. `src/server/routes/api.js`

#### `GET /settings`
- Iterate through settings rows.
- If the key is `openai_api_key` and has a value, replace it with a masked version (e.g., `sk-****` + last 4 characters).
- Return the settings object with the masked key.

#### `POST /settings`
- Receive settings from the request body.
- For each entry:
    - If the key is `openai_api_key`:
        - If the value contains `****` (masked placeholder), skip updating this specific key to avoid overwriting the real key with the mask.
        - Otherwise, encrypt the value using `encrypt()` from `../utils/crypto.js` before saving.
    - Save/Update other keys as usual.

#### `POST /generate`
- Check `apiKey` from the request body.
- If `apiKey` is missing or contains `****`:
    - Retrieve the encrypted key from the `settings` table.
- Use `decrypt()` from `../utils/crypto.js` on the obtained key.
- Pass the decrypted key to `generateContent` and `generateImage`.

## Verification Plan

### Automated/Manual Verification
1. **Encryption Check**:
   - Save a test API key via the UI or `curl`.
   - Use `sqlite3` to check the `settings` table: `SELECT value FROM settings WHERE key = 'openai_api_key';`.
   - Verify it is in `iv:authTag:encrypted` format.
2. **Masking Check**:
   - Call `GET /api/settings`.
   - Verify `openai_api_key` is returned as `sk-****xxxx`.
3. **Functionality Check**:
   - Call `POST /api/generate` with a valid keyword.
   - Verify it successfully generates content using the encrypted key from the database.
4. **No Regression**:
   - Verify Naver accounts still work (they already use encryption).
