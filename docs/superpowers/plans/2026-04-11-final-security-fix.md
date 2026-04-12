# Final Security Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt `openai_api_key` in the database and mask it in the UI to enhance security.

**Architecture:** Use existing `encrypt`/`decrypt` utilities. Mask the key in `GET /settings` and handle masked values in `POST /settings` and `POST /generate`.

**Tech Stack:** Node.js, Express, SQLite3, Crypto.

---

### Task 1: Update `GET /settings` to mask the API key

**Files:**
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Modify `GET /settings` to mask `openai_api_key`**

```javascript
// In src/server/routes/api.js

// GET /settings: Get all settings
router.get('/settings', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const settings = rows.reduce((acc, row) => {
      let value = row.value;
      if (row.key === 'openai_api_key' && value) {
        // Mask the key: sk-**** followed by last 4 characters if long enough
        if (value.length > 8) {
          value = `sk-****${value.slice(-4)}`;
        } else {
          value = 'sk-****';
        }
      }
      return { ...acc, [row.key]: value };
    }, {});
    res.json(settings);
  });
});
```

- [ ] **Step 2: Verify with `curl` (assuming a key exists)**

Run: `curl http://localhost:3000/api/settings`
Expected: `{"openai_api_key": "sk-****..."}` (if set)

---

### Task 2: Update `POST /settings` to encrypt the API key

**Files:**
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Modify `POST /settings` to encrypt `openai_api_key`**

```javascript
// In src/server/routes/api.js

// POST /settings: Save or update settings
router.post('/settings', (req, res) => {
  const settings = req.body;
  
  db.serialize(() => {
    Object.entries(settings).forEach(([key, value]) => {
      if (key === 'openai_api_key') {
        // Skip if value is masked (contains ****)
        if (value && value.includes('****')) {
          return;
        }
        // Encrypt if not empty
        const encryptedValue = value ? encrypt(value) : value;
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, encryptedValue]);
      } else {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      }
    });
    res.json({ success: true });
  });
});
```

- [ ] **Step 2: Verify encryption in DB**

1. Send a new key: `curl -X POST -H "Content-Type: application/json" -d '{"openai_api_key": "sk-new-test-key-12345678"}' http://localhost:3000/api/settings`
2. Check DB: `node -e "const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('./naver-auto.db'); db.get('SELECT value FROM settings WHERE key = ?', ['openai_api_key'], (err, row) => console.log(row.value))"`
Expected: Encrypted string (e.g., `iv:authTag:encrypted`)

---

### Task 3: Update `POST /generate` to robustly handle the API key

**Files:**
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Modify `POST /generate` to decrypt the key and handle masked values**

```javascript
// In src/server/routes/api.js

// POST /generate: Generate blog content and an image
router.post('/generate', async (req, res) => {
  const { keyword, apiKey } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  try {
    let openaiApiKey = apiKey;
    
    // If apiKey is not provided in body or is masked, try to get it from settings
    if (!openaiApiKey || openaiApiKey.includes('****')) {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ?', ['openai_api_key'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (row) openaiApiKey = row.value;
    }

    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API Key is required (either in body or settings)' });
    }

    // Decrypt the key (decrypt returns as-is if not in encrypted format)
    const decryptedApiKey = decrypt(openaiApiKey);
    
    // Verification: ensure it's not still masked
    if (decryptedApiKey.includes('****')) {
        throw new Error('Invalid API Key format (still masked)');
    }

    const content = await generateContent(decryptedApiKey, keyword);
    const imageUrl = await generateImage(decryptedApiKey, `Blog image for: ${keyword}`);
    res.json({ ...content, imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 2: Verify functionality**

Run: `curl -X POST -H "Content-Type: application/json" -d '{"keyword": "test"}' http://localhost:3000/api/generate`
Expected: 200 OK with content (if key is valid) or 500 with OpenAI error (if key is dummy but correctly decrypted).

---

### Task 4: Final Cleanup and Verification

- [ ] **Step 1: Verify all changes**
- [ ] **Step 2: Commit**

```bash
git add src/server/routes/api.js
git commit -m "security: encrypt openai_api_key in DB and mask in UI"
```
