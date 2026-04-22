import express from 'express';
import db from '../db/database.js';
import { CONFIG } from '../config.js';
import { generateContent } from '../services/ai-service.js';
import { postToNaver } from '../services/naver-service.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { startScheduler, stopScheduler, getSchedulerStatus, processScheduledPosts } from '../services/scheduler.js';

const router = express.Router();

// ─────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────

// GET /accounts
router.get('/accounts', (req, res) => {
  db.all('SELECT id, naver_id, status, round_robin_order FROM accounts WHERE user_id = ? ORDER BY round_robin_order ASC, id ASC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /accounts
router.post('/accounts', (req, res) => {
  const { naver_id, naver_pw } = req.body;
  if (!naver_id || !naver_pw) {
    return res.status(400).json({ error: 'naver_id와 naver_pw가 필요합니다.' });
  }
  const encryptedPw = encrypt(naver_pw);
  db.run('INSERT INTO accounts (user_id, naver_id, naver_pw) VALUES (?, ?, ?)', [req.user.id, naver_id, encryptedPw], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, naver_id, status: 'active' });
  });
});

// DELETE /accounts/:id
router.delete('/accounts/:id', (req, res) => {
  const accountId = req.params.id;
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 1. 연결된 포스트의 account_id를 NULL로 변경 (데이터 보존)
    db.run('UPDATE posts SET account_id = NULL WHERE account_id = ? AND user_id = ?', [accountId, req.user.id], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: '데이터 연결 해제 실패: ' + err.message });
      }
      
      // 2. 계정 삭제
      db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: '계정 삭제 실패: ' + err.message });
        }
        
        db.run('COMMIT', (err) => {
          if (err) return res.status(500).json({ error: '트랜잭션 완료 실패: ' + err.message });
          res.json({ message: '계정이 삭제되었으며, 기존 포스팅 기록은 보존되었습니다.', changes: this.changes });
        });
      });
    });
  });
});

// PATCH /accounts/:id/status
router.patch('/accounts/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused'].includes(status)) {
    return res.status(400).json({ error: 'status는 active 또는 paused여야 합니다.' });
  }
  db.run('UPDATE accounts SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, status });
  });
});

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

// GET /settings
router.get('/settings', (req, res) => {
  db.all('SELECT * FROM settings WHERE user_id = ?', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = rows.reduce((acc, row) => {
      return { ...acc, [row.key]: row.value };
    }, {});
    res.json(settings);
  });
});

// POST /settings
router.post('/settings', (req, res) => {
  const settings = req.body;
  db.serialize(() => {
    Object.entries(settings).forEach(([key, value]) => {
      db.run('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)', [req.user.id, key, value]);
    });
    res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// AI GENERATE
// ─────────────────────────────────────────────

// 공통: DB에서 설정 가져오기
async function getSettingFromDB(userId, keyName) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE user_id = ? AND key = ?', [userId, keyName], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

// POST /generate  (원고 생성)
router.post('/generate', async (req, res) => {
  const { keyword, engine = 'gemini' } = req.body;
  if (!keyword) return res.status(400).json({ error: '키워드를 입력해주세요.' });

  try {
    let aiConfig;
    if (engine === 'ollama') {
      const endpoint = (await getSettingFromDB(req.user.id, 'ollama_endpoint')) || 'http://localhost:11434';
      const model = (await getSettingFromDB(req.user.id, 'ollama_model')) || 'llama3';
      aiConfig = { endpoint, model };
    } else {
      if (!CONFIG.GEMINI_API_KEY) return res.status(500).json({ error: `서버에 AI API 키가 설정되지 않았습니다. 관리자에게 문의하세요.` });
      
      const apiKey = CONFIG.GEMINI_API_KEY;
      const model = (await getSettingFromDB(req.user.id, 'gemini_model')) || 'auto';
      aiConfig = { apiKey, model };
    }

    const content = await generateContent(engine, aiConfig, keyword);
    res.json({ ...content, imageUrl: '' }); // OpenAI 제거로 이미지 생성 비활성화
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /generate/edit  ← 신규: 기존 글 AI로 수정
router.post('/generate/edit', async (req, res) => {
  const { content, instruction = '블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요.', engine = 'gemini' } = req.body;
  if (!content) return res.status(400).json({ error: '수정할 내용을 입력해주세요.' });

  try {
    let editedContent;
    if (engine === 'ollama') {
      const endpoint = (await getSettingFromDB(req.user.id, 'ollama_endpoint')) || 'http://localhost:11434';
      const model = (await getSettingFromDB(req.user.id, 'ollama_model')) || 'gemma4:e4b';
      
      let baseUrl = endpoint.trim();
      if (baseUrl.endsWith('/api/generate')) {
        baseUrl = baseUrl.replace(/\/api\/generate$/, '');
      } else if (baseUrl.endsWith('/api/generate/')) {
        baseUrl = baseUrl.replace(/\/api\/generate\/$/, '');
      }
      
      const url = baseUrl.endsWith('/') ? `${baseUrl}api/generate` : `${baseUrl}/api/generate`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'gemma4:e4b',
          prompt: `당신은 블로그 글 교정 전문가입니다. 다음 글을 수정해주세요.\n지시사항: ${instruction}\n\n원문:\n${content}`,
          stream: false,
        }),
      });
      const data = await response.json();
      editedContent = data.response;
    } else {
      if (!CONFIG.GEMINI_API_KEY) return res.status(500).json({ error: `서버에 AI API 키가 설정되지 않았습니다. 관리자에게 문의하세요.` });
      
      const apiKey = CONFIG.GEMINI_API_KEY;
      const geminiModelPreference = (await getSettingFromDB(req.user.id, 'gemini_model')) || 'auto';
      
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      
      let modelName = geminiModelPreference;
      if (modelName === 'auto') {
        modelName = 'gemini-2.5-flash-lite';
      }

      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(`다음 글을 수정해주세요.\n지시사항: ${instruction}\n\n원문:\n${content}`);
      editedContent = result.response.text();
    }

    res.json({ editedContent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// CAMPAIGNS (24/7 무한 루프)
// ─────────────────────────────────────────────

// GET /campaigns
router.get('/campaigns', (req, res) => {
  db.all('SELECT * FROM campaigns WHERE user_id = ? ORDER BY id DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /campaigns
router.post('/campaigns', (req, res) => {
  const { title, content, image_url } = req.body;
  if (!title || !content) return res.status(400).json({ error: '제목과 본문은 필수입니다.' });

  db.run(
    'INSERT INTO campaigns (user_id, title, content, image_url) VALUES (?, ?, ?)',
    [req.user.id, title, content, image_url || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// PATCH /campaigns/:id/status
router.patch('/campaigns/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused'].includes(status)) {
    return res.status(400).json({ error: 'status는 active 또는 paused여야 합니다.' });
  }
  db.run(
    'UPDATE campaigns SET status = ? WHERE id = ? AND user_id = ?',
    [status, req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, status });
    }
  );
});

// DELETE /campaigns/:id
router.delete('/campaigns/:id', (req, res) => {
  db.run('DELETE FROM campaigns WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────

// GET /posts (발행 히스토리)
router.get('/posts', (req, res) => {
  db.all("SELECT p.*, a.naver_id FROM posts p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.user_id = ? AND p.status IN ('published', 'failed') ORDER BY p.id DESC LIMIT 50", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /posts/scheduled
router.get('/posts/scheduled', (req, res) => {
  db.all("SELECT p.*, a.naver_id FROM posts p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.user_id = ? AND p.status IN ('scheduled', 'pending', 'processing') ORDER BY p.scheduled_at ASC NULLS LAST, p.id DESC", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /posts/:id/retry
router.post('/posts/:id/retry', (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE posts SET status = 'scheduled', scheduled_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'failed'",
    [id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '실패 상태인 포스트를 찾을 수 없거나 이미 처리되었습니다.' });
      res.json({ success: true, message: '포스트가 예약 목록으로 이동되었습니다.' });
    }
  );
});

// POST /posts/schedule
router.post('/posts/schedule', (req, res) => {
  const { account_id, title, content, image_url, scheduled_at, headless } = req.body;
  if (!title || !content) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });

  const status = scheduled_at ? 'scheduled' : 'pending';
  const sql = 'INSERT INTO posts (user_id, account_id, title, content, image_url, headless, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [req.user.id, account_id || null, title, content, image_url || null, headless ? 1 : 0, scheduled_at || null, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, status });
  });
});

// DELETE /posts/scheduled/:id
router.delete('/posts/scheduled/:id', (req, res) => {
  db.run("DELETE FROM posts WHERE id = ? AND user_id = ? AND status IN ('scheduled', 'pending', 'processing', 'failed')", [req.params.id, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// POST /posts/:id/publish-now
router.post('/posts/:id/publish-now', (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE posts SET status = 'scheduled', scheduled_at = datetime('now') WHERE id = ? AND user_id = ? AND status IN ('scheduled', 'pending', 'processing', 'failed')",
    [id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      processScheduledPosts();
      res.json({ success: true });
    }
  );
});

// POST /post (즉시 발행)
router.post('/post', async (req, res) => {
  const { account_id, title, content, image_url, headless } = req.body;
  if (!account_id || !title || !content) {
    return res.status(400).json({ error: 'account_id, title, content는 필수입니다.' });
  }

  db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [account_id, req.user.id], async (err, account) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!account) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });

    try {
      const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
      const result = await postToNaver(decryptedAccount, { title, content, image_url }, { headless });

      const status = result.success ? 'published' : 'failed';
      db.run(
        'INSERT INTO posts (user_id, account_id, title, content, image_url, headless, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, account_id, title, content, image_url || null, headless ? 1 : 0, status]
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// ─────────────────────────────────────────────
// TASK CONTROL (작업 시작/정지)
// ─────────────────────────────────────────────

// POST /task/start
router.post('/task/start', (req, res) => {
  const result = startScheduler();
  res.json({ success: result, status: getSchedulerStatus() });
});

// POST /task/stop
router.post('/task/stop', (req, res) => {
  const result = stopScheduler();
  res.json({ success: result, status: getSchedulerStatus() });
});

// GET /task/status
router.get('/task/status', (req, res) => {
  res.json(getSchedulerStatus());
});

// ─────────────────────────────────────────────
// LOGS
// ─────────────────────────────────────────────

// GET /logs
router.get('/logs', (req, res) => {
  const limit = req.query.limit || 100;
  db.all('SELECT * FROM logs WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC LIMIT ?', [req.user.id, limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.reverse());
  });
});

// DELETE /logs
router.delete('/logs', (req, res) => {
  db.run('DELETE FROM logs WHERE user_id = ?', [req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

export default router;
