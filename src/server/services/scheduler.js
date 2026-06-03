import db from '../db/database.js';
import { decrypt } from '../utils/crypto.js';
import { postToNaver } from './naver-service.js';

function cleanupOldPublishedPosts(userId) {
  db.run(
    `DELETE FROM posts WHERE user_id = ? AND status = 'published' AND id NOT IN (
      SELECT id FROM posts WHERE user_id = ? AND status = 'published' ORDER BY id DESC LIMIT 50
    )`,
    [userId, userId],
    (err) => {
      if (err) console.error('[Cleanup] 발행이력 정리 실패:', err.message);
    },
  );
}

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
export function emitLog(level, message, userId = null) {
  const log = {
    level,
    message,
    user_id: userId,
    created_at: new Date().toISOString(),
  };
  console.log(
    `[${level.toUpperCase()}]${userId ? ` [User:${userId.slice(0, 8)}]` : ''} ${message}`,
  );

  if (io) {
    io.emit('log', log);
  }

  db.run(
    'INSERT INTO logs (user_id, level, message) VALUES (?, ?, ?)',
    [userId, level, message],
    (err) => {
      if (err) console.error('Log save error:', err.message);
    },
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
 * 유저별 사용 가능한 계정 조회 (1일 15회 한도 체크 포함)
 */
export async function getAvailableAccount(userId) {
  const today = new Date().toISOString().split('T')[0];

  return new Promise((resolve, reject) => {
    // 1. 오늘 날짜가 아니면 카운트 리셋
    db.run(
      'UPDATE accounts SET daily_post_count = 0, last_post_date = ? WHERE user_id = ? AND (last_post_date != ? OR last_post_date IS NULL)',
      [today, userId, today],
      (err) => {
        if (err) return reject(err);

        // 2. 한도가 남은 계정 중 가장 오랫동안 안 쓴 계정 선택
        db.get(
          "SELECT * FROM accounts WHERE user_id = ? AND status = 'active' AND daily_post_count < 15 ORDER BY round_robin_order ASC LIMIT 1",
          [userId],
          (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
          },
        );
      },
    );
  });
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
  emitLog('success', '스케줄러 자동화가 시작되었습니다.');
  emitTaskStatus();

  // 서버 시작 시/스케줄러 시작 시 stuck processing posts 복구
  db.run("UPDATE posts SET status = 'scheduled' WHERE status = 'processing'");

  // 즉시 실행 및 5분 간격 체크
  processScheduledPosts();
  schedulerInterval = setInterval(
    () => {
      processScheduledPosts();
    },
    5 * 60 * 1000,
  );
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
    maxWorkers: MAX_WORKERS,
  };
}

export async function processScheduledPosts() {
  if (activeWorkers >= MAX_WORKERS) return;

  const today = new Date().toISOString().split('T')[0];
  await new Promise((resolve) => {
    db.run(
      'UPDATE accounts SET daily_post_count = 0, last_post_date = ? WHERE last_post_date != ? OR last_post_date IS NULL',
      [today, today],
      () => resolve(),
    );
  });

  db.all(
    "SELECT * FROM posts WHERE status IN ('scheduled', 'pending') AND (scheduled_at IS NULL OR datetime(scheduled_at) <= datetime('now'))",
    [],
    async (err, posts) => {
      if (err) {
        emitLog('error', `예약 포스트 조회 실패: ${err.message}`);
        return;
      }

      for (const post of posts) {
        if (activeWorkers >= MAX_WORKERS) break;

        activeWorkers++;
        emitTaskStatus();

        try {
          // 상태를 processing으로 변경하여 중복 실행 방지
          await new Promise((resolve, reject) => {
            db.run("UPDATE posts SET status = 'processing' WHERE id = ?", [post.id], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // 1. 계정 확인
          let account = null;
          if (post.account_id) {
            account = await new Promise((resolve, reject) => {
              db.get('SELECT * FROM accounts WHERE id = ?', [post.account_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            });
            if (account) {
              if (account.status !== 'active') {
                emitLog(
                  'warn',
                  `예약 발행 실패: 선택된 계정(${account.naver_id})이 비활성화 상태입니다. (게시글: ${post.title})`,
                  post.user_id,
                );
                account = null;
              } else if (account.daily_post_count >= 15) {
                emitLog(
                  'warn',
                  `예약 발행 실패: 선택된 계정(${account.naver_id})의 일일 발행 한도(15회)를 초과했습니다. (게시글: ${post.title})`,
                  post.user_id,
                );
                account = null;
              }
            }
          } else {
            account = await getAvailableAccount(post.user_id);
          }

          if (!account) {
            emitLog(
              'warn',
              `예약 발행 실패: 사용 가능한 네이버 계정이 없습니다. (게시글: ${post.title})`,
              post.user_id,
            );
            db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
            continue;
          }

          emitLog(
            'info',
            `예약 포스트 [${post.title}] 발행을 시작합니다. (계정: ${account.naver_id})`,
            post.user_id,
          );

          // AI 원고 생성 (Rewrite) - 유사 문서 방지를 위한 자동 재작성 적용
          const finalTitle = post.title;
          const finalContent = post.content;

          // 2. 네이버 블로그 포스팅
          const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
          const postResult = await postToNaver(
            decryptedAccount,
            {
              title: finalTitle,
              content: finalContent,
              image_url: post.image_url,
            },
            {
              headless: post.headless === 1,
              onProgress: (level, msg) => emitLog(level, msg, post.user_id),
            },
          );

          if (postResult.success) {
            // 성공 시 상태 업데이트 및 계정 카운트/순서 업데이트
            db.run("UPDATE posts SET status = 'published', account_id = ? WHERE id = ?", [
              account.id,
              post.id,
            ]);
            db.run(
              'UPDATE accounts SET daily_post_count = daily_post_count + 1, round_robin_order = round_robin_order + 1, last_post_date = ? WHERE id = ?',
              [new Date().toISOString().split('T')[0], account.id],
            );
            cleanupOldPublishedPosts(post.user_id);
            emitLog('success', `예약 포스팅 성공: ${post.title}`, post.user_id);
          } else {
            db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
            emitLog('error', `예약 포스팅 실패: ${postResult.message}`, post.user_id);
          }
        } catch (error) {
          db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
          emitLog('error', `예약 발행 중 오류 발생: ${error.message}`, post.user_id);
        } finally {
          activeWorkers--;
          emitTaskStatus();
        }
      }
    },
  );
}
