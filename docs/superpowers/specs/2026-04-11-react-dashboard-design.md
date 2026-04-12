# Spec: React Frontend Dashboard for Naver Blog Automation

## Overview
Implement a React-based frontend dashboard for managing Naver blog automation. The dashboard will allow users to manage Naver accounts, generate blog content using AI, and track posting status.

## Architecture
- **Frontend Framework:** React (using Vite as the build tool).
- **Styling:** Tailwind CSS (via CDN for simplicity in this prototype).
- **API Communication:** Standard `fetch` API for interacting with the Express backend.
- **Proxy:** Vite will be configured to proxy `/api` requests to `http://localhost:3000`.

## UI Components & Sections

### 1. Account Management
- **List Accounts:** Display Naver IDs and their current status.
- **Add Account:** Form to input Naver ID and Password.
- **Delete Account:** Button to remove an account from the system.

### 2. Content Generator
- **Keyword Input:** Field to specify the topic for AI content generation.
- **API Key Input:** Field to provide an OpenAI API key (Note: Backend expects an "apiKey" in `req.body`, but use of `decrypt` in `/generate` suggests it might need to be encrypted or the backend logic needs checking. For now, we follow the backend's expected structure).
- **Generate Button:** Triggers the content generation process.
- **Result Display/Edit:** Show generated Title, Content, and Image URL. Allow users to edit before posting.

### 3. Posting Status
- **Post Action:** Button to post generated content to a selected Naver account.
- **Status List:** Table or list showing past posts, their titles, and current status (e.g., published, failed).

## Data Flow
1. **Initial Load:** Dashboard fetches the list of accounts and past posts from the backend.
2. **Account Creation:** User submits the form; frontend POSTs to `/api/accounts`.
3. **Content Generation:** User provides a keyword and API key; frontend POSTs to `/api/generate`.
4. **Posting:** User selects an account and clicks 'Post'; frontend POSTs to `/api/post`.
5. **Updates:** The dashboard refreshes state after actions to show the latest data.

## File Structure
- `vite.config.js`: Proxy and build configuration.
- `src/client/index.html`: Entry point for the browser.
- `src/client/main.jsx`: React root mounting logic.
- `src/client/App.jsx`: Main dashboard logic and UI components.

## Success Criteria
- All requested files are created with valid JSX/JS.
- The dashboard is functional and communicates with the existing backend endpoints.
- Tailwind CSS is correctly applied for a modern look.
