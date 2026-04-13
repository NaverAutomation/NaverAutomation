import express from 'express';
import db from '../db/database.js';
import { generateContent, generateImage } from '../services/ai-service.js';
import { postToNaver } from '../services/naver-service.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { startScheduler, stopScheduler, getSchedulerStatus, processScheduledPosts } from '../services/scheduler.js';

const router = express.Router();

// ─────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────

// GET /accounts
router.get('/accounts', (req, res) => {
  db.all('SELECT id, naver_id, status, round_robin_order FROM accounts ORDER BY round_robin_order ASC, id ASC', [], (err, rows) => {
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
  db.run('INSERT INTO accounts (naver_id, naver_pw) VALUES (?, ?)', [naver_id, encryptedPw], function(err) {
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
    db.run('UPDATE posts SET account_id = NULL WHERE account_id = ?', [accountId], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: '데이터 연결 해제 실패: ' + err.message });
      }
      
      // 2. 계정 삭제
      db.run('DELETE FROM accounts WHERE id = ?', [accountId], function(err) {
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

// PATCH /accounts/:id/status  ← 신규: 계정 상태 변경
router.patch('/accounts/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused'].includes(status)) {
    return res.status(400).json({ error: 'status는 active 또는 paused여야 합니다.' });
  }
  db.run('UPDATE accounts SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, status });
  });
});

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

// GET /settings
router.get('/settings', (req, res) => {
  db.all('SELECT * FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = rows.reduce((acc, row) => {
      let value = row.value;
      const sensitiveKeys = ['openai_api_key', 'gemini_api_key'];
      if (sensitiveKeys.includes(row.key) && value) {
        if (value.length > 8) {
          value = `${value.slice(0, 3)}-****${value.slice(-4)}`;
        } else {
          value = '****';
        }
      }
      return { ...acc, [row.key]: value };
    }, {});
    res.json(settings);
  });
});

// POST /settings
router.post('/settings', (req, res) => {
  const settings = req.body;
  db.serialize(() => {
    Object.entries(settings).forEach(([key, value]) => {
      const sensitiveKeys = ['openai_api_key', 'gemini_api_key'];
      if (sensitiveKeys.includes(key)) {
        if (value && value.includes('****')) return;
        const encryptedValue = value ? encrypt(value) : value;
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, encryptedValue]);
      } else {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      }
    });
    res.json({ success: true });
  });
});

// ─────────────────────────────────────────────
// AI GENERATE
// ─────────────────────────────────────────────

// 공통: DB에서 API 키 가져오기
async function getApiKeyFromDB(keyName) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [keyName], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

// POST /generate  (원고 + 이미지 생성)
router.post('/generate', async (req, res) => {
  const { keyword, engine = 'openai' } = req.body;
  if (!keyword) return res.status(400).json({ error: '키워드를 입력해주세요.' });

  try {
    let aiConfig;
    if (engine === 'ollama') {
      const endpoint = (await getApiKeyFromDB('ollama_endpoint')) || 'http://localhost:11434';
      const model = (await getApiKeyFromDB('ollama_model')) || 'llama3';
      aiConfig = { endpoint, model };
    } else {
      const settingsKey = engine === 'gemini' ? 'gemini_api_key' : 'openai_api_key';
      const encApiKey = await getApiKeyFromDB(settingsKey);
      if (!encApiKey) return res.status(400).json({ error: `${engine.toUpperCase()} API 키가 설정되지 않았습니다.` });
      
      const apiKey = decrypt(encApiKey);
      if (engine === 'gemini') {
        const model = (await getApiKeyFromDB('gemini_model')) || 'auto';
        aiConfig = { apiKey, model };
      } else {
        aiConfig = apiKey;
      }
    }

    const content = await generateContent(engine, aiConfig, keyword);

    let imageUrl = '';
    try {
      if (engine === 'ollama') {
        // Ollama는 이미지 생성을 지원하지 않으므로 OpenAI 키가 있으면 그것 사용
        const imgEncKey = await getApiKeyFromDB('openai_api_key');
        if (imgEncKey) {
          const imgApiKey = decrypt(imgEncKey);
          imageUrl = await generateImage(imgApiKey, `${keyword} 주제의 블로그 포스팅용 고품질 사진`);
        }
      } else {
        const settingsKey = engine === 'gemini' ? 'openai_api_key' : engine === 'openai' ? (engine === 'openai' ? 'openai_api_key' : 'gemini_api_key') : 'openai_api_key'; // Logic error in original but I'll fix it
        const imgEncKey = await getApiKeyFromDB('openai_api_key');
        if (imgEncKey) {
          const imgApiKey = decrypt(imgEncKey);
          imageUrl = await generateImage(imgApiKey, `${keyword} 주제의 블로그 포스팅용 고품질 사진`);
        }
      }
    } catch (imgErr) {
      console.warn('이미지 생성 스킵:', imgErr.message);
    }

    res.json({ ...content, imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /generate/edit  ← 신규: 기존 글 AI로 수정
router.post('/generate/edit', async (req, res) => {
  const { content, instruction = '블로그 글을 더 자연스럽고 SEO에 최적화된 형태로 다듬어주세요.', engine = 'openai' } = req.body;
  if (!content) return res.status(400).json({ error: '수정할 내용을 입력해주세요.' });

  try {
    let editedContent;
    if (engine === 'ollama') {
      const endpoint = (await getApiKeyFromDB('ollama_endpoint')) || 'http://localhost:11434';
      const model = (await getApiKeyFromDB('ollama_model')) || 'gemma4:e4b';
      
      // 사용자가 입력한 엔드포인트 정제
      let baseUrl = endpoint.trim();
      if (baseUrl.endsWith('/api/generate')) {
        baseUrl = baseUrl.replace(/\/api\/generate$/, '');
      } else if (baseUrl.endsWith('/api/generate/')) {
        baseUrl = baseUrl.replace(/\/api\/generate\/$/, '');
      }
      
      const url = baseUrl.endsWith('/') ? `${baseUrl}api/generate` : `${baseUrl}/api/generate`;
      console.log(`[Ollama/Edit] Requesting URL: ${url} (Model: ${model || 'gemma4:e4b'})`);

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
    } else if (engine === 'gemini') {
      const settingsKey = 'gemini_api_key';
      const encApiKey = await getApiKeyFromDB(settingsKey);
      if (!encApiKey) return res.status(400).json({ error: `GEMINI API 키가 설정되지 않았습니다.` });
      const apiKey = decrypt(encApiKey);
      const geminiModelPreference = (await getApiKeyFromDB('gemini_model')) || 'auto';
      
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // 글 수정 시에도 무조건 무료 모델(Lite) 우선
      let modelName = geminiModelPreference;
      if (modelName === 'auto') {
        modelName = content.length > 2000 ? 'gemini-3-flash' : 'gemini-3.1-flash-lite';
      }
      
      // 구버전 보정
      if (modelName.includes('1.5') || modelName.includes('2.5')) modelName = 'gemini-3.1-flash-lite';

      console.log(`[Gemini/Edit] Using model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(`다음 글을 수정해주세요.\n지시사항: ${instruction}\n\n원문:\n${content}`);
      editedContent = result.response.text();
    } else {
      const settingsKey = 'openai_api_key';
      const encApiKey = await getApiKeyFromDB(settingsKey);
      if (!encApiKey) return res.status(400).json({ error: `OPENAI API 키가 설정되지 않았습니다.` });
      const apiKey = decrypt(encApiKey);
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: '당신은 블로그 글 교정 전문가입니다.' },
          { role: 'user', content: `다음 글을 수정해주세요.\n지시사항: ${instruction}\n\n원문:\n${content}` },
        ],
        max_tokens: 3000,
      });
      editedContent = response.choices[0].message.content;
    }

    res.json({ editedContent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────

// GET /posts (발행 히스토리)
router.get('/posts', (req, res) => {
  db.all("SELECT p.*, a.naver_id FROM posts p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.status IN ('published', 'failed') ORDER BY p.id DESC LIMIT 50", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /posts/scheduled  ← 신규: 예약된 포스트 목록
router.get('/posts/scheduled', (req, res) => {
  db.all("SELECT p.*, a.naver_id FROM posts p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.status IN ('scheduled', 'pending', 'processing') ORDER BY p.scheduled_at ASC NULLS LAST, p.id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST /posts/:id/retry ← 신규: 실패한 포스트 재도전
router.post('/posts/:id/retry', (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE posts SET status = 'scheduled', scheduled_at = datetime('now') WHERE id = ? AND status = 'failed'",
    [id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '실패 상태인 포스트를 찾을 수 없거나 이미 처리되었습니다.' });
      res.json({ success: true, message: '포스트가 예약 목록으로 이동되었습니다. 잠시 후 재발행됩니다.' });
    }
  );
});

// POST /posts/schedule  ← 신규: 예약 포스팅 저장
router.post('/posts/schedule', (req, res) => {
  const { account_id, title, content, image_url, scheduled_at, headless } = req.body;
  if (!title || !content) return res.status(400).json({ error: '제목과 내용은 필수입니다.' });
  if (headless !== undefined && typeof headless !== 'boolean') {
    return res.status(400).json({ error: 'headless는 boolean 타입이어야 합니다.' });
  }

  const status = scheduled_at ? 'scheduled' : 'pending';
  const sql = 'INSERT INTO posts (account_id, title, content, image_url, headless, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [account_id || null, title, content, image_url || null, headless === undefined ? null : (headless ? 1 : 0), scheduled_at || null, status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, status, message: scheduled_at ? `${scheduled_at}에 발행 예약되었습니다.` : '대기열에 추가되었습니다.' });
  });
});

// DELETE /posts/scheduled/:id  ← 신규: 예약 취소
router.delete('/posts/scheduled/:id', (req, res) => {
  db.run("DELETE FROM posts WHERE id = ? AND status IN ('scheduled', 'pending', 'processing', 'failed')", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '취소 가능한 포스트가 없습니다.' });
    res.json({ message: '예약이 취소되었습니다.' });
  });
});

// POST /api/posts/:id/publish-now ← 신규: 즉시 발행 트리거
router.post('/posts/:id/publish-now', (req, res) => {
  const { id } = req.params;
  db.run(
    "UPDATE posts SET status = 'scheduled', scheduled_at = datetime('now') WHERE id = ? AND status IN ('scheduled', 'pending', 'processing', 'failed')",
    [id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: '발행 가능한 포스트를 찾을 수 없거나 이미 처리되었습니다.' });
      
      // 스케줄러가 실행 중이면 즉시 프로세스 트리거
      processScheduledPosts();
      
      res.json({ success: true, message: '즉시 발행이 시작되었습니다. 로그를 확인하세요.' });
    }
  );
});

// POST /post (즉시 발행)
router.post('/post', async (req, res) => {
  const { account_id, title, content, image_url, headless } = req.body;
  if (!account_id || !title || !content) {
    return res.status(400).json({ error: 'account_id, title, content는 필수입니다.' });
  }
  if (headless !== undefined && typeof headless !== 'boolean') {
    return res.status(400).json({ error: 'headless는 boolean 타입이어야 합니다.' });
  }

  db.get('SELECT * FROM accounts WHERE id = ?', [account_id], async (err, account) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!account) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });

    try {
      const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
      const result = await postToNaver(
        decryptedAccount,
        { title, content, image_url },
        { headless }
      );

      const status = result.success ? 'published' : 'failed';
      db.run(
        'INSERT INTO posts (account_id, title, content, image_url, headless, status) VALUES (?, ?, ?, ?, ?, ?)',
        [account_id, title, content, image_url || null, headless === undefined ? null : (headless ? 1 : 0), status],
        (err) => { if (err) console.error('포스트 저장 오류:', err.message); }
      );

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

// ─────────────────────────────────────────────
// TASK CONTROL (작업 시작/정지)
// ─────────────────────────────────────────────

// POST /task/start  ← 신규
router.post('/task/start', (req, res) => {
  const result = startScheduler();
  res.json({ success: result, status: getSchedulerStatus() });
});

// POST /task/stop  ← 신규
router.post('/task/stop', (req, res) => {
  const result = stopScheduler();
  res.json({ success: result, status: getSchedulerStatus() });
});

// GET /task/status  ← 신규
router.get('/task/status', (req, res) => {
  res.json(getSchedulerStatus());
});

// ─────────────────────────────────────────────
// LOGS
// ─────────────────────────────────────────────

// GET /logs  ← 신규: 로그 조회
router.get('/logs', (req, res) => {
  const limit = req.query.limit || 100;
  db.all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.reverse());
  });
});

// DELETE /logs  ← 신규: 로그 초기화
router.delete('/logs', (req, res) => {
  db.run('DELETE FROM logs', [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '로그가 초기화되었습니다.' });
  });
});

export default router;
