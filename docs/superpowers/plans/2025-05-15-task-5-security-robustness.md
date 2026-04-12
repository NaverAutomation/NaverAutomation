# Task 5 Security and Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Task 5 security by hardening key derivation, enhancing privacy by filtering account data in API responses, and increasing robustness by adding a human-like delay to typing in Naver service.

**Architecture:**
- Use SHA-256 for secure key derivation from `CONFIG.SECRET_KEY`.
- Modify API endpoint to select only necessary fields from the database.
- Update Playwright keyboard interaction to include a delay.

**Tech Stack:** Node.js, Express, SQLite, Playwright, crypto

---

### Task 1: Security - Key Derivation in `crypto.js`

**Files:**
- Modify: `src/server/utils/crypto.js`

- [ ] **Step 1: Update `encrypt` and `decrypt` functions to use SHA-256 for key derivation.**

```javascript
// src/server/utils/crypto.js

// Replace the current derivation logic:
// Buffer.from(CONFIG.SECRET_KEY.padEnd(32).slice(0, 32))
// With:
// crypto.createHash('sha256').update(CONFIG.SECRET_KEY).digest()

// Implementation change in encrypt:
const key = crypto.createHash('sha256').update(CONFIG.SECRET_KEY).digest();
const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

// Implementation change in decrypt:
const key = crypto.createHash('sha256').update(CONFIG.SECRET_KEY).digest();
const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
```

- [ ] **Step 2: Create a verification script `verify-crypto.js` to ensure encryption and decryption still work.**

```javascript
import { encrypt, decrypt } from './src/server/utils/crypto.js';

const testText = "Hello World";
const encrypted = encrypt(testText);
const decrypted = decrypt(encrypted);

if (testText === decrypted) {
  console.log("SUCCESS: Encryption/Decryption works with SHA-256 key derivation.");
} else {
  console.error("FAILURE: Decryption failed.");
  process.exit(1);
}
```

- [ ] **Step 3: Run the verification script.**

Run: `node verify-crypto.js`
Expected: "SUCCESS: Encryption/Decryption works with SHA-256 key derivation."

- [ ] **Step 4: Cleanup and Commit.**

Run: `rm verify-crypto.js`
Run: `git add src/server/utils/crypto.js`
Run: `git commit -m "security: use SHA-256 for key derivation in crypto utils"`

---

### Task 2: Privacy - Filter Account Data in `api.js`

**Files:**
- Modify: `src/server/routes/api.js`

- [ ] **Step 1: Update `GET /accounts` to return only `id`, `naver_id`, and `status`.**

```javascript
// src/server/routes/api.js

// Update the SQL query in the GET /accounts endpoint
router.get('/accounts', (req, res) => {
  db.all('SELECT id, naver_id, status FROM accounts', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});
```

- [ ] **Step 2: Verify the API response.**

I'll use a temporary test script `verify-api.js`.

```javascript
import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/accounts');
  const data = await res.json();
  if (data.length > 0) {
    const hasPw = data[0].hasOwnProperty('naver_pw');
    if (!hasPw) {
      console.log("SUCCESS: naver_pw is excluded from API response.");
    } else {
      console.error("FAILURE: naver_pw is present in API response.");
      process.exit(1);
    }
  } else {
    console.log("No accounts found to test, but checking SQL query manually is enough.");
  }
}
// Note: This requires the server to be running.
```

Alternatively, I can just trust the SQL query change if I cannot easily run the server. I will use `curl` or a manual check of the code.

- [ ] **Step 3: Commit.**

Run: `git add src/server/routes/api.js`
Run: `git commit -m "privacy: exclude naver_pw from GET /accounts response"`

---

### Task 3: Robustness - Human-like Typing in `naver-service.js`

**Files:**
- Modify: `src/server/services/naver-service.js`

- [ ] **Step 1: Add a delay to `keyboard.type` calls in `naver-service.js`.**

```javascript
// src/server/services/naver-service.js

// Update the keyboard.type calls:
await page.keyboard.type(post.title, { delay: 100 });
await page.keyboard.type(post.content, { delay: 100 });
```

- [ ] **Step 2: Verify the change by reading the file.**

- [ ] **Step 3: Commit.**

Run: `git add src/server/services/naver-service.js`
Run: `git commit -m "robustness: add typing delay to Naver service"`
