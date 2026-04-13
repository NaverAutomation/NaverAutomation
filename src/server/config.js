import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Electron 환경인지 확인 (main.js에서 호출될 때)
let userDataPath;
try {
  const { app } = await import('electron');
  userDataPath = app.getPath('userData');
} catch (e) {
  userDataPath = process.cwd();
}

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(userDataPath, 'naver-auto.db'),
  SECRET_KEY: process.env.SECRET_KEY || 'default-secret-key',
  HEADLESS: process.env.HEADLESS !== 'false',
};
