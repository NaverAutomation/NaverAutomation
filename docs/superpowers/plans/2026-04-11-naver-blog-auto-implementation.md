# 네이버 블로그 자동화 솔루션 (npx-naver-auto) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 `npx naver-auto` 명령으로 실행하여 GPT/DALL-E 기반 원고 생성 및 네이버 블로그 자동 포스팅을 관리할 수 있는 로컬 웹 앱을 구축합니다.

**Architecture:** Node.js Express 서버가 백엔드를 담당하며 Playwright를 이용해 로컬 브라우저를 제어합니다. SQLite로 데이터를 영속화하고, React 기반 대시보드로 사용자 인터페이스를 제공합니다.

**Tech Stack:** Node.js, Express, Playwright, SQLite3, OpenAI API, React, Tailwind CSS.

---

### Task 1: 프로젝트 초기화 및 CLI 엔트리 포인트 설정

**Files:**
- Create: `package.json`
- Create: `bin/cli.js`

- [ ] **Step 1: package.json 초기 설정**

```json
{
  "name": "naver-auto",
  "version": "1.0.0",
  "description": "Naver Blog Automation with AI",
  "main": "src/server/index.js",
  "bin": {
    "naver-auto": "bin/cli.js"
  },
  "scripts": {
    "start": "node src/server/index.js",
    "client:dev": "vite src/client",
    "client:build": "vite build src/client"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "playwright": "^1.42.1",
    "openai": "^4.28.0",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5",
    "socket.io": "^4.7.4",
    "open": "^10.0.3"
  },
  "devDependencies": {
    "vite": "^5.1.4",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1"
  }
}
```

- [ ] **Step 2: CLI 엔트리 포인트 작성**

```javascript
#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const open = require('open');

console.log('Naver Auto 시작 중...');

const serverPath = path.join(__dirname, '../src/server/index.js');
const server = spawn('node', [serverPath], { stdio: 'inherit' });

setTimeout(async () => {
    console.log('대시보드를 엽니다: http://localhost:3000');
    await open('http://localhost:3000');
}, 2000);
```

- [ ] **Step 3: 실행 권한 부여 및 확인**

Run: `chmod +x bin/cli.js` (Windows에서는 생략 가능하지만 파일 구조 확인용)

- [ ] **Step 4: Commit**

```bash
git add package.json bin/cli.js
git commit -m "chore: 프로젝트 초기화 및 CLI 설정"
```

---

### Task 2: 데이터베이스(SQLite) 및 환경 설정

**Files:**
- Create: `src/server/db/database.js`
- Create: `src/server/config.js`

- [ ] **Step 1: 데이터베이스 스키마 정의 및 초기화**

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(process.cwd(), 'naver-auto.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 계정 테이블
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    naver_id TEXT UNIQUE,
    naver_pw TEXT,
    status TEXT DEFAULT 'active'
  )`);

  // 포스팅 테이블
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    title TEXT,
    content TEXT,
    image_url TEXT,
    scheduled_at DATETIME,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(account_id) REFERENCES accounts(id)
  )`);

  // 설정 테이블 (API Key 등)
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

module.exports = db;
```

- [ ] **Step 2: 테스트 데이터 삽입 스크립트 작성 및 실행**

Run: `node -e "require('./src/server/db/database.js')"`

- [ ] **Step 3: Commit**

```bash
git add src/server/db/database.js
git commit -m "feat: SQLite 데이터베이스 스키마 설정"
```

---

### Task 3: OpenAI 서비스 구현 (GPT/DALL-E)

**Files:**
- Create: `src/server/services/openai-service.js`

- [ ] **Step 1: OpenAI 클라이언트 초기화 및 텍스트 생성 로직**

```javascript
const OpenAI = require('openai');

async function generateContent(apiKey, keyword) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "당신은 블로그 포스팅 전문가입니다." },
      { role: "user", content: `${keyword} 주제로 블로그 포스팅 원고를 작성해줘. 제목과 본문을 구분해줘.` }
    ],
  });
  return response.choices[0].message.content;
}

async function generateImage(apiKey, prompt) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
  });
  return response.data[0].url;
}

module.exports = { generateContent, generateImage };
```

- [ ] **Step 2: 간단한 테스트 코드 작성 및 실행**

(API Key가 필요하므로 구조적 확인만 수행하거나 가짜 응답 테스트)

- [ ] **Step 3: Commit**

```bash
git add src/server/services/openai-service.js
git commit -m "feat: OpenAI 서비스 (GPT, DALL-E) 구현"
```

---

### Task 4: Playwright 기반 네이버 자동화 엔진

**Files:**
- Create: `src/server/services/naver-service.js`

- [ ] **Step 1: 네이버 로그인 및 포스팅 함수 작성**

```javascript
const { chromium } = require('playwright');

async function postToNaver(account, post) {
  const browser = await chromium.launch({ headless: false }); // 사용자 확인을 위해 headless: false
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 로그인 페이지 이동
    await page.goto('https://nid.naver.com/nidlogin.login');
    await page.fill('#id', account.naver_id);
    await page.fill('#pw', account.naver_pw);
    await page.click('.btn_login');
    await page.waitForNavigation();

    // 2. 블로그 글쓰기 페이지 이동
    await page.goto(`https://blog.naver.com/${account.naver_id}/postwrite`);
    
    // 에디터 로딩 대기 및 작성 로직 (네이버 에디터 선택자 필요)
    // 실제 구현 시 iframe 처리 및 Smart Editor ONE 구조 대응 필수
    
    console.log('포스팅 완료:', post.title);
  } catch (error) {
    console.error('포스팅 실패:', error);
  } finally {
    // await browser.close(); // 필요 시 유지
  }
}

module.exports = { postToNaver };
```

- [ ] **Step 2: Commit**

```bash
git add src/server/services/naver-service.js
git commit -m "feat: Playwright 네이버 포스팅 기본 엔진 구현"
```

---

### Task 5: Express 서버 및 API 엔드포인트

**Files:**
- Create: `src/server/index.js`

- [ ] **Step 1: 기본 서버 설정 및 API 라우팅**

```javascript
const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const { generateContent } = require('./services/openai-service');

const app = express();
app.use(express.json());
app.use(cors());

// 계정 조회
app.get('/api/accounts', (req, res) => {
  db.all('SELECT * FROM accounts', [], (err, rows) => {
    res.json(rows);
  });
});

// 원고 생성 API
app.post('/api/generate', async (req, res) => {
  const { apiKey, keyword } = req.body;
  try {
    const content = await generateContent(apiKey, keyword);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/index.js
git commit -m "feat: Express 서버 및 기본 API 엔드포인트 구축"
```

---

### Task 6: React 프론트엔드 대시보드 구축

**Files:**
- Create: `src/client/index.html`
- Create: `src/client/App.jsx`
- Create: `src/client/main.jsx`

- [ ] **Step 1: 기본 UI 레이아웃 및 대시보드 화면 작성**

(React, Tailwind CSS를 사용한 심플한 관리 화면)

- [ ] **Step 2: Commit**

```bash
git add src/client/
git commit -m "feat: React 기반 대시보드 UI 구현"
```

---

### Task 7: 최종 테스트 및 npx 배포 설정 확인

- [ ] **Step 1: 전체 연동 테스트**
- [ ] **Step 2: `npm link`를 통한 로컬 npx 실행 테스트**
- [ ] **Step 3: README 작성 및 마무리**
- [ ] **Step 4: Commit**

```bash
git commit -m "docs: 프로젝트 완료 및 사용 가이드 추가"
```
