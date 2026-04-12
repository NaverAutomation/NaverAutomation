# Database and Environment Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the SQLite database with schemas for accounts, posts, and settings, and create a shared configuration file.

**Architecture:** Initialize a SQLite database connection with specific tables and create a central configuration module using environment variables.

**Tech Stack:** Node.js, `sqlite3`, `dotenv`

---

### Task 1: Environment Configuration

**Files:**
- Create: `src/server/config.js`

- [ ] **Step 1: Create `src/server/config.js`**

```javascript
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(process.cwd(), 'naver-auto.db'),
};
```

- [ ] **Step 2: Verify `src/server/config.js`**
Run: `node -e "import { CONFIG } from './src/server/config.js'; console.log(CONFIG)"`
Expected: CONFIG object printed with PORT and DB_PATH.

### Task 2: Database Initialization

**Files:**
- Create: `src/server/db/database.js`

- [ ] **Step 1: Create `src/server/db/database.js`**

```javascript
import sqlite3 from 'sqlite3';
import { CONFIG } from '../config.js';
import path from 'path';

const db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Accounts table
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naver_id TEXT NOT NULL UNIQUE,
      naver_pw TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    )`);

    // Posts table
    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      scheduled_at DATETIME,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);
  });
}

export default db;
```

- [ ] **Step 2: Verify database initialization**
Run: `node -e "import db from './src/server/db/database.js'; setTimeout(() => { db.all(\"SELECT name FROM sqlite_master WHERE type='table'\", [], (err, rows) => { console.log(rows); db.close(); }); }, 1000)"`
Expected: List of tables (accounts, posts, settings, sqlite_sequence) printed.

- [ ] **Step 3: Verify syntax and existence**
Run: `ls src/server/db/database.js src/server/config.js`
Expected: Both files exist.
