import db from '../db/database.js';
import { generateContent } from './ai-service.js';
import { postToNaver } from './naver-service.js';
import { decrypt } from '../utils/crypto.js';

// 스케줄러 상태
let schedulerInterval = null;
let isRunning = false;
let taskQueue = [];
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
function emitLog(level, message) {
  const log = { level, message, created_at: new Date().toISOString() };
  console.log(`[${level.toUpperCase()}] ${message}`);
  
  if (io) {
    io.emit('log', log);
  }

  db.run(
    'INSERT INTO logs (level, message) VALUES (?, ?)',
    [level, message],
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
      queueLength: taskQueue.length,
    });
  }
}

/**
 * 라운드로빈으로 다음 활성 계정 선택
 */
async function getNextActiveAccount() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM accounts WHERE status = 'active' ORDER BY round_robin_order ASC, id ASC",
      [],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);

        const account = rows[0];
        // round_robin_order 업데이트 (순환)
        const maxOrder = rows.length - 1;
        const nextOrder = account.round_robin_order >= maxOrder
          ? 0
          : account.round_robin_order + 1;

        // 현재 계정을 뒤로 보내기
        db.run(
          'UPDATE accounts SET round_robin_order = ? WHERE id = ?',
          [rows.length, account.id],
          () => {}
        );
        // 나머지 계정 순서 당기기
        db.run(
          'UPDATE accounts SET round_robin_order = round_robin_order - 1 WHERE status = "active" AND id != ? AND round_robin_order > 0',
          [account.id],
          () => {}
        );

        resolve(account);
      }
    );
  });
}

/**
 * 예약된 포스트 확인 및 자동 발행
 */
export async function processScheduledPosts() {
  if (!isRunning) return;

  const now = new Date().toISOString();

  db.all(
    "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC",
    [now],
    async (err, posts) => {
      if (err) {
        emitLog('error', `예약 포스트 조회 오류: ${err.message}`);
        return;
      }
      if (!posts || posts.length === 0) return;

      emitLog('info', `예약 포스트 ${posts.length}개 발행 시작...`);

      for (const post of posts) {
        if (!isRunning) {
          emitLog('info', '작업이 정지되어 예약 발행을 중단합니다.');
          break;
        }

        // 상태를 'processing'으로 변경
        db.run("UPDATE posts SET status = 'processing' WHERE id = ?", [post.id]);

        try {
          let account;
          if (post.account_id) {
            // 지정된 계정 사용
            account = await new Promise((resolve, reject) => {
              db.get('SELECT * FROM accounts WHERE id = ?', [post.account_id], (err, row) => {
                if (err) reject(err); else resolve(row);
              });
            });
          } else {
            // 라운드로빈으로 계정 선택
            account = await getNextActiveAccount();
          }

          if (!account) {
            emitLog('error', `포스트 #${post.id}: 사용 가능한 계정이 없습니다.`);
            db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
            continue;
          }

          const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
          emitLog('info', `포스트 #${post.id} "${post.title}" → ${decryptedAccount.naver_id} 계정으로 발행 시도...`);

          const result = await postToNaver(decryptedAccount, {
            title: post.title,
            content: post.content,
            image_url: post.image_url,
          });

          const newStatus = result.success ? 'published' : 'failed';
          db.run("UPDATE posts SET status = ? WHERE id = ?", [newStatus, post.id]);

          if (result.success) {
            emitLog('success', `포스트 #${post.id} "${post.title}" 발행 완료!`);
          } else {
            emitLog('error', `포스트 #${post.id} 발행 실패: ${result.message}`);
          }
        } catch (error) {
          emitLog('error', `포스트 #${post.id} 처리 오류: ${error.message}`);
          db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
        }
      }

      emitTaskStatus();
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
  emitLog('success', '자동화 작업이 시작되었습니다. 예약 포스트를 1분마다 확인합니다.');
  emitTaskStatus();

  // 즉시 한 번 실행 후 1분마다 반복
  processScheduledPosts();
  schedulerInterval = setInterval(processScheduledPosts, 60 * 1000);
  return true;
}

/**
 * 자동화 작업 정지
 */
export function stopScheduler() {
  if (!isRunning) {
    emitLog('warn', '스케줄러가 이미 정지 상태입니다.');
    return false;
  }

  isRunning = false;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  emitLog('info', '자동화 작업이 정지되었습니다.');
  emitTaskStatus();
  return true;
}

/**
 * 현재 스케줄러 상태 반환
 */
export function getSchedulerStatus() {
  return {
    isRunning,
    queueLength: taskQueue.length,
  };
}
