# Task 6: Backend Integration Design

This document outlines the changes required to complete Task 6 and integrate the backend features.

## 1. Database Update
- **File:** `src/server/db/database.js`
- **Change:** Add `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` to the `posts` table.
- **Migration Strategy:** Since the project is in development, I will update the `CREATE TABLE` statement and add an `ALTER TABLE` statement wrapped in a try-catch to ensure existing databases are updated without errors.

## 2. API Route Enhancements
- **File:** `src/server/routes/api.js`
- **Changes:**
  - Add `GET /settings`: Retrieve stored settings (e.g., `openai_api_key`).
  - Add `POST /settings`: Save or update settings.
  - Update `POST /post`:
    - Accept `image_url` from the request body.
    - Save `image_url` to the `posts` table.
    - Pass `image_url` to the `postToNaver` service.

## 3. Naver Blog Image Upload
- **File:** `src/server/services/naver-service.js`
- **Changes:**
  - Import `fs`, `path`, and `os`.
  - Update `postToNaver` to handle `post.image_url`.
  - If `image_url` exists:
    - Download the image to a temporary file.
    - Use Playwright to upload the image to the Naver Blog editor.
    - Clean up the temporary file after upload.

## 4. Frontend Improvements
- **File:** `src/client/App.jsx`
- **Changes:**
  - Add a "Settings" section for the OpenAI API key.
  - Fetch and save settings via the new API endpoints.
  - Auto-select the first account upon loading (already implemented but will be verified).
  - Pass `image_url` when calling `handlePost`.
  - Ensure `created_at` is correctly displayed in the history table.

## 5. Verification Plan
- Verify DB schema changes using `check-columns.js`.
- Test settings endpoints using manual verification or a small script.
- Verify `postToNaver` logic for image handling (log checks).
- Verify UI updates by inspecting the JSX and state management.
