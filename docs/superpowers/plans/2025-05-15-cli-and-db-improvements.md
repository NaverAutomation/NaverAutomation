# Task 2 Database and CLI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve database robustness by enabling foreign keys and adding error handling, and enhance CLI by using central configuration.

**Architecture:** Centralized configuration usage and improved error logging for database operations.

**Tech Stack:** Node.js, SQLite3

---

### Task 1: Improve Database Robustness

**Files:**
- Modify: `src/server/db/database.js`

- [ ] **Step 1: Enable Foreign Key enforcement and add error callbacks to db.run**

```javascript
import sqlite3Lib from 'sqlite3';
import { CONFIG } from '../config.js';

const sqlite3 = sqlite3Lib.verbose();

const db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    // Enable Foreign Key enforcement
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        console.error('Error enabling foreign keys:', err.message);
      }
    });
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
    )`, (err) => {
      if (err) console.error('Error creating accounts table:', err.message);
    });

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
    )`, (err) => {
      if (err) console.error('Error creating posts table:', err.message);
    });

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, (err) => {
      if (err) console.error('Error creating settings table:', err.message);
    });
  });
}

export default db;
```

- [ ] **Step 2: Verify changes in `src/server/db/database.js`**

Run: `node src/server/db/database.js` (to check for syntax errors, it might fail if index.js is not present but should at least be syntactically correct)

### Task 2: Improve CLI Robustness

**Files:**
- Modify: `bin/cli.js`

- [ ] **Step 1: Import CONFIG and use CONFIG.PORT**

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import open from 'open';
import { CONFIG } from '../src/server/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Naver Auto 시작 중...');

const serverPath = path.join(__dirname, '../src/server/index.js');
const server = spawn('node', [serverPath], { stdio: 'inherit' });

server.on('error', (err) => {
    console.error('서버 프로세스 시작 실패:', err);
    process.exit(1);
});

setTimeout(async () => {
    const url = `http://localhost:${CONFIG.PORT}`;
    console.log(`대시보드를 엽니다: ${url}`);
    try {
        await open(url);
    } catch (err) {
        console.error('브라우저를 여는 데 실패했습니다:', err);
    }
}, 2000);
```

- [ ] **Step 2: Verify changes in `bin/cli.js`**

Run: `node bin/cli.js` (Check if it prints the correct port from CONFIG)
