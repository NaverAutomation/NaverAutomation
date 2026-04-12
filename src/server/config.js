import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(process.cwd(), 'naver-auto.db'),
  SECRET_KEY: process.env.SECRET_KEY || 'default-secret-key',
  HEADLESS: false,
};
