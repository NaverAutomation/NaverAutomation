import db from '../db/database.js';
import { generateRewriteWithGemini } from './ai-service.js';
import { postToNaver } from './naver-service.js';
import { decrypt } from '../utils/crypto.js';
import { CONFIG } from '../config.js';
import { getGlobalSetting } from '../utils/supabase.js';

// 스케줄러 상태
let schedulerInterval = null;
let isRunning = false;
let activeWorkers = 0;
const MAX_WORKERS = 3;
let io = null; // Socket.io 인스턴스

/**
 * Socket.io 인스턴스 설정
 */
export function setIO(socketIO) {
  io = socketIO;
}

/**
 * 실시간 로그 emit + DB 저장
 */
function emitLog(level, message, userId = null) {
  const log = { 
    level, 
    message, 
    user_id: userId,
    created_at: new Date().toISOString() 
  };
  console.log(`[${level.toUpperCase()}]${userId ? ` [User:${userId.slice(0, 8)}]` : ''} ${message}`);
  
  if (io) {
    io.emit('log', log);
  }

  db.run(
    'INSERT INTO logs (user_id, level, message) VALUES (?, ?, ?)',
    [userId, level, message],
    (err) => { if (err) console.error('Log save error:', err.message); }
  );
}

/**
 * 작업 상태 emit
 */
function emitTaskStatus() {
  if (io) {
    io.emit('task-status', {
      isRunning,
      activeWorkers,
    });
  }
}

/**
 * 유저별 사용 가능한 계정 조회 (1일 3회 한도 체크 포함)
 */
async function getAvailableAccount(userId) {
  const today = new Date().toISOString().split('T')[0];
  
  return new Promise((resolve, reject) => {
    // 1. 오늘 날짜가 아니면 카운트 리셋
    db.run(
      "UPDATE accounts SET daily_post_count = 0, last_post_date = ? WHERE user_id = ? AND (last_post_date != ? OR last_post_date IS NULL)",
      [today, userId, today],
      (err) => {
        if (err) return reject(err);
        
        // 2. 한도가 남은 계정 중 가장 오랫동안 안 쓴 계정 선택
        db.get(
          "SELECT * FROM accounts WHERE user_id = ? AND status = 'active' AND daily_post_count < 3 ORDER BY round_robin_order ASC LIMIT 1",
          [userId],
          (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
          }
        );
      }
    );
  });
}

/**
 * 단일 워커 작업 프로세스
 */
async function performTask(campaign) {
  activeWorkers++;
  emitTaskStatus();

  const userId = campaign.user_id;
  try {
    // 1. 계정 선택
    const account = await getAvailableAccount(userId);
    if (!account) {
      emitLog('warn', `활성화된 계정 중 오늘 포스팅 한도(3회)가 남은 계정이 없습니다.`, userId);
      return;
    }

    // 2. API 키 확인 (공용 키 사용)
    const masterKey = await getGlobalSetting('master_gemini_api_key');
    if (!masterKey || masterKey === 'YOUR_KEY_HERE') {
      emitLog('error', `API 호출에 실패했습니다. 관리자에게 문의하세요.`, userId);
      return;
    }
    const apiKey = masterKey;

    emitLog('info', `계정 ${account.naver_id}로 포스팅을 시작합니다. (오늘 ${account.daily_post_count + 1}회째)`, userId);

    // 3. AI 원고 생성 (Rewrite)
    const aiResult = await generateRewriteWithGemini(apiKey, campaign.title, campaign.content);
    
    // 4. 네이버 블로그 포스팅
    const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
    const postResult = await postToNaver(decryptedAccount, {
      title: aiResult.title,
      content: aiResult.content,
      image_url: campaign.image_url,
    }, { headless: true });

    if (postResult.success) {
      // 5. 성공 시 계정 카운트 및 순서 업데이트
      db.run(
        "UPDATE accounts SET daily_post_count = daily_post_count + 1, round_robin_order = round_robin_order + 1, last_post_date = ? WHERE id = ?",
        [new Date().toISOString().split('T')[0], account.id]
      );
      
      // 발행 기록 저장
      db.run(
        "INSERT INTO posts (user_id, account_id, title, content, image_url, status) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, account.id, aiResult.title, aiResult.content, campaign.image_url, 'published']
      );

      emitLog('success', `성공적으로 포스팅되었습니다: ${aiResult.title}`, userId);
    } else {
      emitLog('error', `포스팅 실패: ${postResult.message}`, userId);
      // 실패 기록 저장
      db.run(
        "INSERT INTO posts (user_id, account_id, title, content, image_url, status) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, account.id, aiResult.title, aiResult.content, campaign.image_url, 'failed']
      );
    }

  } catch (error) {
    emitLog('error', `작업 수행 중 오류 발생: ${error.message}`, userId);
  } finally {
    activeWorkers--;
    emitTaskStatus();
  }
}

/**
 * 전체 스케줄링 메인 루프
 */
export async function processAutomation() {
  if (!isRunning) return;
  if (activeWorkers >= MAX_WORKERS) return;

  // 활성화된 캠페인 가져오기 (랜덤하게 섞어서 유저간 공평성 유지)
  db.all(
    "SELECT * FROM campaigns WHERE status = 'active' ORDER BY RANDOM()",
    [],
    async (err, campaigns) => {
      if (err) {
        emitLog('error', `캠페인 로드 실패: ${err.message}`);
        return;
      }

      for (const campaign of campaigns) {
        if (activeWorkers >= MAX_WORKERS) break;
        if (!isRunning) break;

        // 비동기로 워커 실행 (기다리지 않음)
        performTask(campaign);
      }
    }
  );
}

/**
 * 자동화 작업 시작
 */
export function startScheduler() {
  if (isRunning) {
    emitLog('warn', '스케줄러가 이미 실행 중입니다.');
    return false;
  }

  isRunning = true;
  emitLog('success', '24시간 무한 루프 자동화가 시작되었습니다.');
  emitTaskStatus();

  // 즉시 실행 및 5분 간격 체크 (네이버 제재 방지를 위해 간격 유지)
  processAutomation();
  schedulerInterval = setInterval(processAutomation, 5 * 60 * 1000);
  return true;
}

/**
 * 자동화 작업 정지
 */
export function stopScheduler() {
  if (!isRunning) {
    emitLog('warn', '스케줄러가 이미 정지되어 있습니다.');
    return false;
  }

  isRunning = false;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  emitLog('info', '자동화가 정지되었습니다.');
  emitTaskStatus();
  return true;
}

/**
 * 현재 스케줄러 상태 반환
 */
export function getSchedulerStatus() {
  return {
    isRunning,
    activeWorkers,
    maxWorkers: MAX_WORKERS
  };
}

// 구버전 호환용 (사용되지 않을 수 있음)
export async function processScheduledPosts() {
  // 새 루프에서 통합 처리되므로 구현 생략 가능하거나 새 루프 호출
  processAutomation();
}
