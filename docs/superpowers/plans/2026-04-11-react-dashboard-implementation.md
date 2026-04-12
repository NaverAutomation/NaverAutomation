# React Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a React frontend dashboard with Tailwind CSS for managing Naver blog automation.

**Architecture:** A Vite-powered React application that proxies API requests to the Express backend. It features account management, AI content generation, and posting status tracking.

**Tech Stack:** React, Vite, Tailwind CSS (via CDN), Fetch API.

---

### Task 1: Project Configuration

**Files:**
- Modify: `package.json`
- Create: `vite.config.js`

- [ ] **Step 1: Update package.json to include React dependencies**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    ...
  }
}
```
Run: `npm install`

- [ ] **Step 2: Create vite.config.js**
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Commit configuration**
```bash
git add package.json vite.config.js
git commit -m "chore: setup vite and react dependencies"
```

---

### Task 2: HTML Entry Point

**Files:**
- Create: `src/client/index.html`

- [ ] **Step 1: Write src/client/index.html**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Naver Blog Auto Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100">
  <div id="root"></div>
  <script type="module" src="/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Commit index.html**
```bash
git add src/client/index.html
git commit -m "feat: add html entry point"
```

---

### Task 3: React Entry Point

**Files:**
- Create: `src/client/main.jsx`

- [ ] **Step 1: Write src/client/main.jsx**
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Commit main.jsx**
```bash
git add src/client/main.jsx
git commit -m "feat: add react entry point"
```

---

### Task 4: Main Dashboard Component

**Files:**
- Create: `src/client/App.jsx`

- [ ] **Step 1: Implement App.jsx with State and Effects**
(Detailed implementation including Account List, Content Generator, and Posting Status sections using Tailwind CSS).

- [ ] **Step 2: Verify Syntax**
Run: `npx tsc src/client/App.jsx --noEmit --jsx react-jsx` (if possible) or visually inspect for common JSX errors.

- [ ] **Step 3: Commit App.jsx**
```bash
git add src/client/App.jsx
git commit -m "feat: implement main dashboard component"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Build the project**
Run: `npm run client:build`
Expected: `dist` folder created with bundled files.
