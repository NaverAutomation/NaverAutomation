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
