import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from '../src/server/db/database.js';
import { checkAndExtendKeywordQueue } from '../src/server/services/scheduler.js';
import * as aiService from '../src/server/services/ai-service.js';

// ai-service 모킹
vi.mock('../src/server/services/ai-service.js', () => ({
  generateContent: vi.fn().mockImplementation(async (engine, config, keyword) => ({
    title: `AI 제목: ${keyword}`,
    content: `AI 본문: ${keyword} 에 대한 내용입니다.`,
  })),
  generateTagsWithGemini: vi.fn().mockResolvedValue('태그1,태그2'),
  generateNextKeyword: vi.fn().mockImplementation(async (engine, config, title, content) => {
    // 단순 모킹: 'AI 제목: ' 뒷부분을 가져와 연관 키워드인 것처럼 처리
    return title.replace('AI 제목: ', '') + ' 연관';
  }),
}));

// supabase 모킹
vi.mock('../src/server/utils/supabase.js', () => ({
  getGlobalSetting: vi.fn().mockResolvedValue('MOCK_GEMINI_KEY'),
}));

describe('자동 꼬리물기 대기열 연장 기능 테스트', () => {
  const userId = 'extend_test_user';

  beforeEach(async () => {
    // 테스트 실행 전 posts 테이블 클린업
    await new Promise((resolve) => {
      db.run('DELETE FROM posts WHERE user_id = ?', [userId], () => resolve());
    });
  });

  it('남은 예약이 2개 이상이고 시간 여유가 충분한 경우 대기열을 연장하지 않는다', async () => {
    // 2개의 예약 건 삽입 (하나는 15시간 뒤, 하나는 22시간 뒤)
    const futureTime1 = new Date(Date.now() + 15 * 60 * 60 * 1000).toISOString();
    const futureTime2 = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString();

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO posts (user_id, title, content, scheduled_at, status, post_type, keyword, tags, campaign_id) VALUES (?, '제목1', '본문1', ?, 'scheduled', 'keyword', '소액결제 팁', '소액결제 팁, 금융', 12345)",
        [userId, futureTime1],
        (err) => {
          if (err) console.error('INSERT ERROR 1:', err);
          resolve();
        }
      );
    });

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO posts (user_id, title, content, scheduled_at, status, post_type, keyword, tags, campaign_id) VALUES (?, '제목2', '본문2', ?, 'scheduled', 'keyword', '소액결제 팁', '소액결제 팁, 금융', 12345)",
        [userId, futureTime2],
        (err) => {
          if (err) console.error('INSERT ERROR 2:', err);
          resolve();
        }
      );
    });

    // 실행
    await checkAndExtendKeywordQueue(userId);

    // DB 검증: 추가 생성된 건이 없어야 함 (총 2개 유지)
    const rows = await new Promise((resolve) => {
      db.all('SELECT * FROM posts WHERE user_id = ?', [userId], (err, rows) => resolve(rows));
    });

    expect(rows.length).toBe(2);
  });

  it('남은 예약이 1개 이하인 경우 3개의 포스트가 7시간 간격으로 자동 연장 생성되어야 한다', async () => {
    // 1개의 만료 예정 예약 건 삽입 (20시간 뒤 발행 예정 - 개수가 1개이므로 트리거됨)
    const futureTime = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO posts (user_id, title, content, scheduled_at, status, post_type, keyword, tags, campaign_id) VALUES (?, '제목1', '본문1', ?, 'scheduled', 'keyword', '소액결제 팁', '소액결제 팁, 금융', 12345)",
        [userId, futureTime],
        (err) => {
          if (err) console.error('INSERT ERROR 3:', err);
          resolve();
        }
      );
    });

    // 실행
    await checkAndExtendKeywordQueue(userId);

    // DB 검증: 기존 1개 + 신규 3개 = 총 4개여야 함
    const rows = await new Promise((resolve) => {
      db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY scheduled_at ASC', [userId], (err, rows) => {
        if (err) console.error('SELECT ERROR 1:', err);
        resolve(rows);
      });
    });

    expect(rows.length).toBe(4);

    // 신규 생성된 글들 검증 (index 1, 2, 3)
    const baseTime = new Date(futureTime).getTime();
    const intervalMs = 7 * 60 * 60 * 1000;

    // 1회차: 고정 키워드 (tags의 첫 번째 요소인 '소액결제 팁')로 생성되었는지 검증
    expect(rows[1].keyword).toBe('소액결제 팁');
    expect(new Date(rows[1].scheduled_at).getTime()).toBe(baseTime + intervalMs);
    expect(rows[1].title).toBe('AI 제목: 소액결제 팁');

    // 2회차: 1회차 글을 기반으로 AI 추출 연관 키워드로 생성되었는지 검증
    // ai-service.js 모킹에 의해 '소액결제 팁' -> '소액결제 팁 연관' 이 되어야 함
    expect(rows[2].keyword).toBe('소액결제 팁 연관');
    expect(new Date(rows[2].scheduled_at).getTime()).toBe(baseTime + intervalMs * 2);
    expect(rows[2].title).toBe('AI 제목: 소액결제 팁 연관');

    // 3회차: 2회차 글을 기반으로 AI 추출 연관 키워드로 생성되었는지 검증
    expect(rows[3].keyword).toBe('소액결제 팁 연관 연관');
    expect(new Date(rows[3].scheduled_at).getTime()).toBe(baseTime + intervalMs * 3);
    expect(rows[3].title).toBe('AI 제목: 소액결제 팁 연관 연관');

    // campaign_id 및 tags가 상속되었는지 검증
    for (let i = 1; i <= 3; i++) {
      expect(rows[i].campaign_id).toBe(12345);
      expect(rows[i].tags).toBe('태그1,태그2'); // generateTagsWithGemini 가 반환한 값 상속
    }
  });

  it('마지막 예약 건의 남은 시간이 12시간 이내로 임박한 경우에도 연장 생성된다', async () => {
    // 2개의 예약이 있으나, 마지막 예약 시간이 5시간 뒤인 경우 (시간 긴급 조건 만족)
    const futureTime1 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const futureTime2 = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO posts (user_id, title, content, scheduled_at, status, post_type, keyword, tags, campaign_id) VALUES (?, '제목1', '본문1', ?, 'scheduled', 'keyword', '소액결제 팁', '소액결제 팁, 금융', 12345)",
        [userId, futureTime1],
        (err) => {
          if (err) console.error('INSERT ERROR 4:', err);
          resolve();
        }
      );
    });

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO posts (user_id, title, content, scheduled_at, status, post_type, keyword, tags, campaign_id) VALUES (?, '제목2', '본문2', ?, 'scheduled', 'keyword', '소액결제 팁', '소액결제 팁, 금융', 12345)",
        [userId, futureTime2],
        (err) => {
          if (err) console.error('INSERT ERROR 5:', err);
          resolve();
        }
      );
    });

    // 실행
    await checkAndExtendKeywordQueue(userId);

    // DB 검증: 기존 2개 + 신규 3개 = 총 5개여야 함
    const rows = await new Promise((resolve) => {
      db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY scheduled_at ASC', [userId], (err, rows) => resolve(rows));
    });

    expect(rows.length).toBe(5);
  });
});
