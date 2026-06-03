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
    db.run(
      `CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      naver_id TEXT NOT NULL UNIQUE,
      naver_pw TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      round_robin_order INTEGER DEFAULT 0,
      daily_post_count INTEGER DEFAULT 0,
      last_post_date DATE
    )`,
      (err) => {
        if (err) console.error('Error creating accounts table:', err.message);
        else {
          // 기존 DB에 컬럼 추가 (없을 경우)
          db.run('ALTER TABLE accounts ADD COLUMN round_robin_order INTEGER DEFAULT 0', () => {});
          db.run('ALTER TABLE accounts ADD COLUMN user_id TEXT', () => {});
          db.run('ALTER TABLE accounts ADD COLUMN daily_post_count INTEGER DEFAULT 0', () => {});
          db.run('ALTER TABLE accounts ADD COLUMN last_post_date DATE', () => {});
        }
      },
    );

    // Posts table (scheduled_at 포함)
    db.run(
      `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      account_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      headless INTEGER,
      scheduled_at DATETIME,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      post_type TEXT DEFAULT 'manual',
      campaign_id INTEGER,
      keyword TEXT,
      tags TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`,
      (err) => {
        if (err) {
          console.error('Error creating posts table:', err.message);
        } else {
          // 기존 DB에 컬럼 추가 (없을 경우)
          addColumnIfNotExists('posts', 'user_id', 'TEXT');
          addColumnIfNotExists('posts', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
          addColumnIfNotExists('posts', 'scheduled_at', 'DATETIME');
          addColumnIfNotExists('posts', 'headless', 'INTEGER');
          addColumnIfNotExists('posts', 'post_type', "TEXT DEFAULT 'manual'");
          addColumnIfNotExists('posts', 'campaign_id', 'INTEGER');
          addColumnIfNotExists('posts', 'keyword', 'TEXT');
          addColumnIfNotExists('posts', 'tags', 'TEXT');
          addColumnIfNotExists('posts', 'republish_interval_ms', 'INTEGER');
        }
      },
    );

    // Settings table (유저별 설정 가능하도록 user_id 추가)
    db.run(
      `CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT,
      key TEXT,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )`,
      (err) => {
        if (err) console.error('Error creating settings table:', err.message);

        // 이미 존재하는 경우 user_id 컬럼 추가 시도 (없으면 추가됨, 있으면 무시됨)
        db.run('ALTER TABLE settings ADD COLUMN user_id TEXT', () => {});
      },
    );

    // Logs table (실시간 로그 저장)
    db.run(
      `CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
      (err) => {
        if (err) console.error('Error creating logs table:', err.message);
        else {
          db.run('ALTER TABLE logs ADD COLUMN user_id TEXT', () => {});
        }
      },
    );
  });
}

function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
    if (err) {
      console.error(`Error checking columns for ${tableName}:`, err.message);
      return;
    }
    const exists = rows.some((row) => row.name === columnName);
    if (!exists) {
      db.run(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
        (alterErr) => {
          if (alterErr) {
            console.error(`Error adding column ${columnName} to ${tableName}:`, alterErr.message);
          } else {
            console.log(`Column ${columnName} successfully added to ${tableName}.`);
          }
        },
      );
    }
  });
}

export default db;
