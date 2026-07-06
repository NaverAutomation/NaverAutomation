import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Electron 환경인지 확인 (main.js에서 호출될 때)
let userDataPath;
try {
  const { app } = await import('electron');
  userDataPath = app.getPath('userData');
} catch (_e) {
  // Electron이 아닐 경우 OS별 기본 AppData 디렉토리 사용 (CWD 방지 및 데이터 공유 보장)
  const appName = 'naver-auto';
  if (process.platform === 'win32') {
    userDataPath = path.join(
      process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:', 'AppData', 'Roaming'),
      appName,
    );
  } else if (process.platform === 'darwin') {
    userDataPath = path.join(process.env.HOME || '', 'Library', 'Application Support', appName);
  } else {
    userDataPath = path.join(process.env.HOME || '', '.config', appName);
  }
}

// 디렉토리가 존재하지 않는 경우 자동 생성하여 DB 생성 에러 방지
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(userDataPath, 'naver-auto.db'),
  UPLOAD_DIR: path.join(userDataPath, 'uploads'),
  SESSION_DIR: path.join(userDataPath, 'sessions'),
  SECRET_KEY: process.env.SECRET_KEY || 'default-secret-key',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  HEADLESS: process.env.HEADLESS !== 'false',
  POSTING_TIMEOUT: process.env.POSTING_TIMEOUT ? parseInt(process.env.POSTING_TIMEOUT, 10) : 600000,
};
