import sqlite3Lib from 'sqlite3';
import { CONFIG } from '../config.js';

const sqlite3 = sqlite3Lib.verbose();

const db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) console.error('Error enabling foreign keys:', err.message);
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
      status TEXT DEFAULT 'active',
      round_robin_order INTEGER DEFAULT 0
    )`, (err) => {
      if (err) console.error('Error creating accounts table:', err.message);
      else {
        // 기존 DB에 컬럼 추가 (없을 경우)
        db.run("ALTER TABLE accounts ADD COLUMN round_robin_order INTEGER DEFAULT 0", () => {});
      }
    });

    // Posts table (scheduled_at 포함)
    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      headless INTEGER,
      scheduled_at DATETIME,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating posts table:', err.message);
      } else {
        // 기존 DB에 컬럼 추가 (없을 경우)
        db.run("ALTER TABLE posts ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", () => {});
        db.run("ALTER TABLE posts ADD COLUMN scheduled_at DATETIME", () => {});
        db.run("ALTER TABLE posts ADD COLUMN headless INTEGER", () => {});
      }
    });

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, (err) => {
      if (err) console.error('Error creating settings table:', err.message);
    });

    // Logs table (실시간 로그 저장)
    db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('Error creating logs table:', err.message);
    });
  });
}

export default db;
