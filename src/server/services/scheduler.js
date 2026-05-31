import { CONFIG } from '../config.js';
import db from '../db/database.js';
import { decrypt } from '../utils/crypto.js';
import { getCachedGlobalSetting, getGlobalSetting } from '../utils/supabase.js';
import { generateRewriteWithGemini } from './ai-service.js';
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
 * 단일 워커 작업 프로세스
 */
export async function performTask(campaign) {
  activeWorkers++;
  emitTaskStatus();

  const userId = campaign.user_id;
  try {
    // 1. 계정 선택
    const account = await getAvailableAccount(userId);
    if (!account) {
      emitLog('warn', `활성화된 계정 중 오늘 포스팅 한도(15회)가 남은 계정이 없습니다.`, userId);
      return;
    }

    // 2. API 키 확인 (캐시 우선, 없으면 Supabase anon 시도)
    let masterKey = getCachedGlobalSetting('master_gemini_api_key');
    if (!masterKey) {
      masterKey = await getGlobalSetting('master_gemini_api_key');
    }
    if (!masterKey || masterKey === 'YOUR_KEY_HERE') {
      emitLog(
        'error',
        `Gemini API 키를 가져올 수 없습니다. 먼저 "글 생성" 탭에서 초안 뽑기를 1회 실행하여 API 키를 활성화해주세요.`,
        userId,
      );
      return;
    }
    const apiKey = masterKey;

    emitLog(
      'info',
      `계정 ${account.naver_id}로 포스팅을 시작합니다. (오늘 ${account.daily_post_count + 1}회째)`,
      userId,
    );

    // 3. AI 원고 생성 (Rewrite)
    const aiResult = await generateRewriteWithGemini(apiKey, campaign.title, campaign.content);

    // 4. 네이버 블로그 포스팅
    const decryptedAccount = { ...account, naver_pw: decrypt(account.naver_pw) };
    const postResult = await postToNaver(
      decryptedAccount,
      {
        title: aiResult.title,
        content: aiResult.content,
        image_url: campaign.image_url,
      },
      { 
        headless: CONFIG.HEADLESS,
        onProgress: (level, msg) => emitLog(level, msg, userId)
      },
    );

    if (postResult.success) {
      // 5. 성공 시 계정 카운트 및 순서 업데이트
      db.run(
        'UPDATE accounts SET daily_post_count = daily_post_count + 1, round_robin_order = round_robin_order + 1, last_post_date = ? WHERE id = ?',
        [new Date().toISOString().split('T')[0], account.id],
      );

      // 발행 기록 저장
      db.run(
        'INSERT INTO posts (user_id, account_id, title, content, image_url, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, account.id, aiResult.title, aiResult.content, campaign.image_url, 'published'],
      );
      cleanupOldPublishedPosts(userId);
      emitLog('success', `성공적으로 포스팅되었습니다: ${aiResult.title}`, userId);
    } else {
      emitLog('error', `포스팅 실패: ${postResult.message}`, userId);
      // 실패 기록 저장
      db.run(
        'INSERT INTO posts (user_id, account_id, title, content, image_url, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, account.id, aiResult.title, aiResult.content, campaign.image_url, 'failed'],
      );
    }
  } catch (error) {
    emitLog('error', `작업 수행 중 오류 발생: ${error.message}`, userId);
  } finally {
    activeWorkers--;
    emitTaskStatus();
  }
}

export async function processAutomation() {
  if (!isRunning) return;
  if (activeWorkers >= MAX_WORKERS) return;

  // 활성화된 캠페인 가져오기
  db.all("SELECT * FROM campaigns WHERE status = 'active'", [], async (err, campaigns) => {
    if (err) {
      emitLog('error', `캠페인 로드 실패: ${err.message}`);
      return;
    }

    if (!campaigns || campaigns.length === 0) return;

    // 유저별로 캠페인 그룹화 (유저별 일일 한도 및 간격을 각각 체크)
    const userCampaigns = {};
    campaigns.forEach((c) => {
      if (!userCampaigns[c.user_id]) userCampaigns[c.user_id] = [];
      userCampaigns[c.user_id].push(c);
    });

    for (const userId of Object.keys(userCampaigns)) {
      if (activeWorkers >= MAX_WORKERS) break;
      if (!isRunning) break;

      // A. 오늘 이미 발행 완료된 이 유저의 캠페인 수 조회 (scheduled_at IS NULL인 포스트)
      const count = await new Promise((resolve) => {
        db.get(
          `SELECT COUNT(*) as count FROM posts 
             WHERE user_id = ? 
               AND status = 'published' 
               AND scheduled_at IS NULL 
               AND date(created_at) = date('now')`,
          [userId],
          (_err, row) => {
            resolve(row ? row.count : 0);
          },
        );
      });

      if (count >= 15) {
        // 일일 최대 발행 수 15개 제한 도달
        continue;
      }

      // B. 가장 최근에 성공한 이 유저의 캠페인 포스트의 발행 시간 조회
      const lastCampaignPost = await new Promise((resolve) => {
        db.get(
          `SELECT created_at FROM posts 
             WHERE user_id = ? 
               AND status = 'published' 
               AND scheduled_at IS NULL 
             ORDER BY id DESC LIMIT 1`,
          [userId],
          (_err, row) => {
            resolve(row || null);
          },
        );
      });

      if (lastCampaignPost) {
        // SQLite의 UTC 문자열을 로컬 밀리초 단위 타임스탬프로 해석
        const lastTime = new Date(`${lastCampaignPost.created_at.replace(' ', 'T')}Z`).getTime();
        const nowTime = Date.now();

        // 일일 15개 제한 분배: 24시간 / 15 = 1.6시간 = 96분
        // 발행 시 특정 시간이 아닌 5분 ~ 10분 정도의 랜덤 오차 추가
        const randomOffsetMinutes = 5 + Math.random() * 5; // 5분 ~ 10분 오차
        const minIntervalMs = (96 + randomOffsetMinutes) * 60 * 1000;

        if (nowTime - lastTime < minIntervalMs) {
          // 주기 미달
          continue;
        }
      }

      // C. 모든 조건이 충족되면 활성 캠페인 중 무작위로 1개를 선택하여 발행
      const list = userCampaigns[userId];
      const selectedCampaign = list[Math.floor(Math.random() * list.length)];

      performTask(selectedCampaign);
    }
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
  emitLog('success', '24시간 무한 루프 자동화가 시작되었습니다.');
  emitTaskStatus();

  // 즉시 실행 및 5분 간격 체크 (네이버 제재 방지를 위해 간격 유지)
  processAutomation();
  processScheduledPosts();
  schedulerInterval = setInterval(
    () => {
      processAutomation();
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
          let finalTitle = post.title;
          let finalContent = post.content;

          try {
            let masterKey = getCachedGlobalSetting('master_gemini_api_key');
            if (!masterKey) {
              masterKey = await getGlobalSetting('master_gemini_api_key');
            }
            if (masterKey && masterKey !== 'YOUR_KEY_HERE') {
              emitLog(
                'info',
                `예약글 [${post.title}]에 대한 유사 문서 방지 AI 재작성을 시작합니다.`,
                post.user_id,
              );
              const aiResult = await generateRewriteWithGemini(masterKey, post.title, post.content);
              if (aiResult?.title && aiResult?.content) {
                finalTitle = aiResult.title;
                finalContent = aiResult.content;
                emitLog(
                  'success',
                  `예약글 AI 재작성 완료. 새로운 제목: ${finalTitle}`,
                  post.user_id,
                );
              }
            }
          } catch (rewriteError) {
            emitLog(
              'warn',
              `예약글 AI 재작성 실패 (원본 내용으로 발행 진행): ${rewriteError.message}`,
              post.user_id,
            );
          }

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
              onProgress: (level, msg) => emitLog(level, msg, post.user_id)
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
