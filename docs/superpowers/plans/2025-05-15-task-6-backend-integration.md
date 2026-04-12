# Task 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Task 6 and backend integration, adding `created_at` to the database, implementing settings APIs, enhancing the Naver service with image uploads, and updating the frontend.

**Architecture:** 
- Database: Update `posts` table using `ALTER TABLE` and `CREATE TABLE`.
- Backend: Add `/settings` routes and update `/post` to handle `image_url`.
- Service: Use Playwright to upload downloaded images.
- Frontend: New Settings component and state management for API keys.

**Tech Stack:** Node.js, Express, SQLite, Playwright, React, TailwindCSS.

---

### Task 1: Database Update

**Files:**
- Modify: `src/server/db/database.js`
- Test: `check-columns.js`

- [ ] **Step 1: Update `database.js`**

Add `created_at` to the `posts` table and ensure it's added if the table already exists.

```javascript
// In initializeDatabase function:
    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      scheduled_at DATETIME,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- New Column
      FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`);

    // Add created_at if it doesn't exist
    db.run("ALTER TABLE posts ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
        // If it already exists, ignore error
    });
```

- [ ] **Step 2: Verify the change**

Run: `node check-columns.js`
Expected: `posts` table shows `created_at` column.

---

### Task 2: API Route Enhancements

**Files:**
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Add `/settings` routes**

```javascript
// GET /settings: Get all settings
router.get('/settings', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    res.json(settings);
  });
});

// POST /settings: Save or update settings
router.post('/settings', (req, res) => {
  const settings = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.serialize(() => {
    Object.entries(settings).forEach(([key, value]) => {
      stmt.run(key, value);
    });
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});
```

- [ ] **Step 2: Update `POST /post` to handle `image_url`**

```javascript
router.post('/post', async (req, res) => {
  const { account_id, title, content, image_url } = req.body; // Add image_url
  if (!account_id || !title || !content) {
    return res.status(400).json({ error: 'account_id, title, and content are required' });
  }

  db.get('SELECT * FROM accounts WHERE id = ?', [account_id], async (err, account) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    try {
      const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
      const result = await postToNaver(decryptedAccount, { title, content, image_url }); // Pass image_url
      
      const sql = 'INSERT INTO posts (account_id, title, content, image_url, status) VALUES (?, ?, ?, ?, ?)';
      const status = result.success ? 'published' : 'failed';
      db.run(sql, [account_id, title, content, image_url, status], function(err) {
        if (err) console.error('Error saving post to DB:', err.message);
      });

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({ success: false, message: result.message });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});
```

---

### Task 3: Naver Service Update (Image Upload)

**Files:**
- Modify: `src/server/services/naver-service.js`

- [ ] **Step 1: Import dependencies and implement image download**

```javascript
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper function to download image
async function downloadImage(url, dest) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}
```

- [ ] **Step 2: Update `postToNaver` to handle image upload**

Before clicking publish, if `image_url` exists:
1. Download to `tempPath`.
2. Locate the file input in the Naver editor.
3. Upload the file.
4. Clean up.

```javascript
    // In postToNaver:
    if (post.image_url) {
      console.log('Uploading image...');
      const tempPath = path.join(os.tmpdir(), `naver_blog_image_${Date.now()}.png`);
      try {
        await downloadImage(post.image_url, tempPath);
        
        // Naver Smart Editor ONE file upload button (usually an <input type="file">)
        const fileInput = await frame.waitForSelector('.se-file-input', { timeout: 5000 });
        await fileInput.setInputFiles(tempPath);
        
        // Wait for upload to complete
        await page.waitForTimeout(3000); 
      } catch (err) {
        console.error('Image upload failed:', err);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
```

---

### Task 4: Frontend Updates

**Files:**
- Modify: `src/client/App.jsx`

- [ ] **Step 1: Add state for settings and fetch on load**

- [ ] **Step 2: Add Settings UI section**

- [ ] **Step 3: Update `handlePost` and `handleGenerate`**

- [ ] **Step 4: Improve account selection and history display**

---

### Task 5: Final Verification

- [ ] **Step 1: Run all backend checks**
- [ ] **Step 2: Verify linting and build**
- [ ] **Step 3: Manual check of UI**
