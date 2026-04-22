import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pkgUpdater from 'electron-updater';
import fs from 'fs';

const { autoUpdater } = pkgUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 파일 설정 (앱 시작 즉시 실행)
const logPath = path.join(app.getPath('userData'), 'logs.txt');
function log(msg) {
  const timestamp = new Date().toISOString();
  const fullMsg = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(logPath, fullMsg); } catch (e) {}
}

// 초기화 전역 에러 핸들러
process.on('uncaughtException', (err) => {
  log(`[CRASH] Uncaught Exception: ${err.message}\n${err.stack}`);
});

log('[Main] App starting...');

let mainWindow;
let server;
let serverPort = 3000;
let lastUpdaterStatus = {
  status: 'idle',
  message: '업데이트 대기 중',
  timestamp: new Date().toISOString(),
};

async function initBackend() {
  log('[Main] Backend initializing...');
  try {
    // 백엔드를 동적으로 분리하여 로드 (네이티브 모듈 크래시 방지용)
    const { startServer } = await import('./server/index.js');
    const result = await startServer();
    server = result.server;
    serverPort = result.port;
    log(`[Main] Backend started successfully on port ${serverPort}`);
  } catch (err) {
    log(`[Main] Backend failed: ${err.message}`);
    log(`[Main] Error Stack: ${err.stack}`);
    dialog.showErrorBox('서버 시작 실패', '백엔드 서버를 시작하지 못했습니다: ' + err.message);
  }
}

function createWindow() {
  log('[Main] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  const targetURL = `http://localhost:${serverPort}`;
  let retryCount = 0;

  const loadApp = () => {
    log(`[Main] Loading URL: ${targetURL} (Try: ${retryCount + 1})`);
    mainWindow.loadURL(targetURL).catch((err) => {
      log(`[Main] Load URL failed: ${err.message}`);
      if (retryCount < 5) {
        retryCount++;
        setTimeout(loadApp, 1000);
      } else {
        log('[Main] Max retries reached. Opening DevTools for diagnosis.');
        mainWindow.webContents.openDevTools();
        dialog.showMessageBox({
          type: 'error',
          title: '페이지 로드 실패',
          message: '서버와 연결할 수 없습니다. 로그 파일을 확인하거나 개발자 도구의 에러 메시지를 확인해 주세요.',
          buttons: ['확인']
        });
      }
    });
  };

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendUpdaterStatus(status, message, extra = {}) {
  lastUpdaterStatus = {
    status,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  log(`[Auto-Updater Status] ${message}`);

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('updater:status', lastUpdaterStatus);
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:getLastStatus', () => {
    return lastUpdaterStatus;
  });

  ipcMain.handle('updater:checkForUpdates', async () => {
    if (!app.isPackaged) {
      const message = '개발 모드에서는 자동 업데이트를 확인하지 않습니다.';
      sendUpdaterStatus('dev-mode', message);
      return { ok: false, reason: 'dev-mode', message };
    }

    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      const message = `업데이트 확인 실패: ${err.message}`;
      sendUpdaterStatus('error', message);
      return { ok: false, reason: 'check-failed', message };
    }
  });
}

// 자동 업데이트 설정 및 강화
function setupAutoUpdater() {
  // 업데이트 로그 설정
  autoUpdater.logger = {
    info: (msg) => log(`[Auto-Updater] ${msg}`),
    warn: (msg) => log(`[Auto-Updater] WARN: ${msg}`),
    error: (msg) => log(`[Auto-Updater] ERROR: ${msg}`),
  };
  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;

  log(`[Auto-Updater] Current app version: ${app.getVersion()}`);

  if (!app.isPackaged) {
    sendUpdaterStatus('dev-mode', '개발 모드에서는 자동 업데이트를 확인하지 않습니다.');
    return;
  }

  // 업데이트 상태 확인
  autoUpdater.checkForUpdatesAndNotify();

  // 업데이트를 찾고 있을 때
  autoUpdater.on('checking-for-update', () => {
    sendUpdaterStatus('checking-for-update', '업데이트 확인 중...');
  });

  // 새로운 버전 발견
  autoUpdater.on('update-available', (info) => {
    sendUpdaterStatus('update-available', `새로운 버전 발견: ${info.version}`, {
      newVersion: info.version,
    });
    dialog.showMessageBox({
      type: 'info',
      title: '새로운 업데이트',
      message: `새로운 버전(${info.version})이 출시되었습니다. 자동으로 다운로드를 시작합니다.`,
      buttons: ['확인']
    });
  });

  // 업데이트가 없을 때
  autoUpdater.on('update-not-available', (_info) => {
    sendUpdaterStatus('update-not-available', '현재 최신 버전입니다.', {
      currentVersion: app.getVersion(),
    });
  });

  // 다운로드 진행 상황 (대용량 파일 대비)
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = `다운로드 속도: ${progressObj.bytesPerSecond}`;
    log_message = `${log_message} - 현재 ${Math.round(progressObj.percent)}% 완료`;
    log_message = `${log_message} (${progressObj.transferred}/${progressObj.total})`;
    sendUpdaterStatus('download-progress', log_message, {
      percent: Math.round(progressObj.percent),
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  // 다운로드 완료 시 설치 제안
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterStatus('update-downloaded', '다운로드 완료. 설치 준비 중...', {
      downloadedVersion: info.version,
    });
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
    log(`[Auto-Updater Error] ${err}`);
    sendUpdaterStatus('error', `오류 발생: ${err.message}`);
  });
}

app.whenReady().then(async () => {
  await initBackend();
  createWindow();
  registerIpcHandlers();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (server && server.close) {
    server.close();
  }
});
