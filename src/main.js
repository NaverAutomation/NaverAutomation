import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import pkgUpdater from 'electron-updater';
const { autoUpdater } = pkgUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createServer() {
  // src/server/index.js를 실행하는 자식 프로세스 생성
  const serverPath = path.join(__dirname, 'server/index.js');
  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit'
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.ico')
  });

  // 서버가 뜰 때까지 잠시 대기 후 로드 (간단하게 2초)
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 자동 업데이트 설정 및 강화
function setupAutoUpdater() {
  // 업데이트 로그 설정
  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;

  // 업데이트 상태 확인
  autoUpdater.checkForUpdatesAndNotify();

  // 업데이트를 찾고 있을 때
  autoUpdater.on('checking-for-update', () => {
    console.log('[Auto-Updater] 업데이트 확인 중...');
  });

  // 새로운 버전 발견
  autoUpdater.on('update-available', (info) => {
    console.log('[Auto-Updater] 새로운 버전 발견:', info.version);
    dialog.showMessageBox({
      type: 'info',
      title: '새로운 업데이트',
      message: `새로운 버전(${info.version})이 출시되었습니다. 자동으로 다운로드를 시작합니다.`,
      buttons: ['확인']
    });
  });

  // 업데이트가 없을 때
  autoUpdater.on('update-not-available', (info) => {
    console.log('[Auto-Updater] 현재 최신 버전입니다.');
  });

  // 다운로드 진행 상황 (대용량 파일 대비)
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = `다운로드 속도: ${progressObj.bytesPerSecond}`;
    log_message = `${log_message} - 현재 ${progressObj.percent}% 완료`;
    log_message = `${log_message} (${progressObj.transferred}/${progressObj.total})`;
    console.log(`[Auto-Updater] ${log_message}`);
  });

  // 다운로드 완료 시 설치 제안
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Auto-Updater] 다운로드 완료. 설치 준비 중...');
    dialog.showMessageBox({
      type: 'question',
      buttons: ['지금 설치 후 재시작', '나중에'],
      defaultId: 0,
      title: '업데이트 완료',
      message: '새로운 버전 다운로드가 완료되었습니다. 지금 재시작하여 설치하시겠습니까?',
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // 업데이트 중 오류 발생
  autoUpdater.on('error', (err) => {
    console.error('[Auto-Updater] 오류 발생:', err);
    // 사용자에게 중대한 오류가 아니면 방해하지 않음
  });
}

app.whenReady().then(() => {
  createServer();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});
