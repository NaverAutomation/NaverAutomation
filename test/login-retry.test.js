import { beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../src/server/db/database.js';
import { postToNaver } from '../src/server/services/naver-service.js';
import { getSchedulerStatus, processScheduledPosts } from '../src/server/services/scheduler.js';

// naver-service 모킹
vi.mock('../src/server/services/naver-service.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    postToNaver: vi.fn(),
  };
});

// ai-service 모킹 (scheduler 내부에서 호출될 수 있으므로)
vi.mock('../src/server/services/ai-service.js', () => ({
  generateContent: vi.fn().mockResolvedValue({
    title: '테스트 AI 제목',
    content: '테스트 AI 본문',
  }),
  generateTagsWithGemini: vi.fn().mockResolvedValue('태그'),
  generateNextKeyword: vi.fn().mockResolvedValue('다음 키워드'),
}));

// supabase 모킹
vi.mock('../src/server/utils/supabase.js', () => ({
  getGlobalSetting: vi.fn().mockResolvedValue('MOCK_KEY'),
}));

// 스케줄러 처리 대기 헬퍼
async function waitForScheduler() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const status = getSchedulerStatus();
    if (status.activeWorkers === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Scheduler timed out');
}

describe('로그인 실패 시 재시도 및 계정 일시정지 통합 테스트', () => {
  const userId = 'retry_test_user';
  let accountId;
  let postId;
  let mockPostResult = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPostResult = null;

    // DB 초기화
    await new Promise((resolve) => {
      db.run('DELETE FROM posts WHERE user_id = ?', [userId], () => {
        db.run('DELETE FROM accounts WHERE user_id = ?', [userId], () => resolve());
      });
    });

    // 테스트 계정 추가 (status: active, login_fail_count: 0)
    accountId = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO accounts (user_id, naver_id, naver_pw, status, login_fail_count) VALUES (?, 'retry_naver_id', 'retry_pw', 'active', 0)",
        [userId],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        },
      );
    });

    // postToNaver의 실제 DB 업데이트 동작을 모사하는 mock 구현
    vi.mocked(postToNaver).mockImplementation(async (account, post, options) => {
      if (mockPostResult) {
        if (mockPostResult.isLoginFailure) {
          const currentCount = await new Promise((resolve) => {
            db.get('SELECT login_fail_count FROM accounts WHERE id = ?', [account.id], (err, row) =>
              resolve(row ? row.login_fail_count || 0 : 0),
            );
          });
          const newCount = currentCount + 1;
          await new Promise((resolve) => {
            db.run(
              'UPDATE accounts SET login_fail_count = ? WHERE id = ?',
              [newCount, account.id],
              () => resolve(),
            );
          });
          if (newCount >= 5) {
            await new Promise((resolve) => {
              db.run("UPDATE accounts SET status = 'paused' WHERE id = ?", [account.id], () =>
                resolve(),
              );
            });
          }
          return {
            ...mockPostResult,
            failCount: newCount,
          };
        }
        return mockPostResult;
      }
      return { success: true };
    });
  });

  it('로그인 실패가 5회 미만인 경우, 포스트를 3분 뒤로 재일정하고 계정을 유지해야 한다', async () => {
    const initialTime = new Date(Date.now() - 1000).toISOString();

    // 1. 포스트 등록
    postId = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO posts (user_id, account_id, title, content, status, scheduled_at) VALUES (?, ?, '테스트 글', '테스트 본문', 'scheduled', ?)",
        [userId, accountId, initialTime],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        },
      );
    });

    // 2. 로그인 실패 결과 반환하도록 모사 설정
    mockPostResult = {
      success: false,
      message: '자동 로그인 실패(캡차 요구)',
      isLoginFailure: true,
    };

    // 3. 스케줄러 실행 및 완료 대기
    await processScheduledPosts();
    await waitForScheduler();

    // 4. 검증: 포스트가 다시 scheduled 상태이며 scheduled_at이 미래 시점(약 3분 뒤)이어야 함
    const post = await new Promise((resolve) => {
      db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, row) => resolve(row));
    });
    expect(post.status).toBe('scheduled');

    const initialTimeMs = new Date(initialTime).getTime();
    const scheduledTimeMs = new Date(post.scheduled_at).getTime();
    expect(scheduledTimeMs).toBeGreaterThan(initialTimeMs + 2 * 60 * 1000);

    // 5. 검증: 계정 상태가 여전히 active이며 실패 횟수가 1인지 확인
    const account = await new Promise((resolve) => {
      db.get('SELECT * FROM accounts WHERE id = ?', [accountId], (err, row) => resolve(row));
    });
    expect(account.status).toBe('active');
    expect(account.login_fail_count).toBe(1);
  });

  it('로그인 실패가 5회에 도달하는 경우, 포스트를 실패 처리하고 계정을 paused 상태로 변경해야 한다', async () => {
    // 계정의 누적 실패 횟수를 4회로 세팅
    await new Promise((resolve) => {
      db.run('UPDATE accounts SET login_fail_count = 4 WHERE id = ?', [accountId], () => resolve());
    });

    const initialTime = new Date(Date.now() - 1000).toISOString();

    // 1. 포스트 등록
    postId = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO posts (user_id, account_id, title, content, status, scheduled_at) VALUES (?, ?, '테스트 글', '테스트 본문', 'scheduled', ?)",
        [userId, accountId, initialTime],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        },
      );
    });

    // 2. 로그인 실패 결과 반환하도록 모사 설정
    mockPostResult = {
      success: false,
      message: '자동 로그인 실패(비밀번호 오류)',
      isLoginFailure: true,
    };

    // 3. 스케줄러 실행 및 완료 대기
    await processScheduledPosts();
    await waitForScheduler();

    // 4. 검증: 포스트가 failed 상태여야 함
    const post = await new Promise((resolve) => {
      db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, row) => resolve(row));
    });
    expect(post.status).toBe('failed');

    // 5. 검증: 계정이 paused 상태이며 실패 횟수가 5인지 확인
    const account = await new Promise((resolve) => {
      db.get('SELECT * FROM accounts WHERE id = ?', [accountId], (err, row) => resolve(row));
    });
    expect(account.status).toBe('paused');
    expect(account.login_fail_count).toBe(5);
  });
});
