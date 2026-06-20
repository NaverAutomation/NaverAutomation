import { describe, it, expect, vi, beforeAll } from 'vitest';
import db from '../src/server/db/database.js';

// ai-service 모킹
vi.mock('../src/server/services/ai-service.js', () => ({
  generateContent: vi.fn().mockResolvedValue({
    title: '테스트용 AI 제목',
    content: '테스트용 AI 본문 내용입니다.',
  }),
  generateTagsWithGemini: vi.fn().mockResolvedValue('테스트,태그'),
  generateNextKeyword: vi.fn().mockResolvedValue('테스트 연관 키워드'),
}));

// openai-service 모킹
vi.mock('../src/server/services/openai-service.js', () => ({
  generateContent: vi.fn().mockResolvedValue({
    title: '테스트용 AI 제목',
    content: '테스트용 AI 본문 내용입니다.',
  }),
}));

// supabase 모킹
vi.mock('../src/server/utils/supabase.js', () => ({
  getGlobalSetting: vi.fn().mockResolvedValue('MOCK_GEMINI_KEY'),
}));

// api.js 모듈 로드
import apiRouter from '../src/server/routes/api.js';

describe('자동 키워드 일괄 예약 등록 (5개 일괄 생성) API 테스트', () => {
  let handler;

  beforeAll(() => {
    // router에서 /posts/schedule-keywords 포스트 핸들러 추출
    const route = apiRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/posts/schedule-keywords',
    );
    if (!route) {
      throw new Error('schedule-keywords route not found');
    }
    // validateBody 미들웨어 다음에 실제 핸들러가 있으므로 stack의 마지막 요소 호출
    const lastLayer = route.route.stack[route.route.stack.length - 1];
    handler = lastLayer.handle;
  });

  it('키워드 1개 입력 시, 즉시 5개의 예약 포스트가 생성되어야 한다', async () => {
    const mockReq = {
      user: { id: 'test_user_id' },
      token: 'mock_token',
      body: {
        keywords: ['아이폰 18 테스트 키워드'],
        start_time: new Date().toISOString(),
        interval_hours: 1,
        interval_minutes: 0,
        use_round_robin: true,
        headless: true,
        engine: 'gemini',
        split_rep_images: true,
      },
    };

    let responseData = null;
    const mockRes = {
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        responseData = data;
        return this;
      },
    };

    // 핸들러 실행
    await handler(mockReq, mockRes);

    // 검증
    expect(responseData).toBeDefined();
    expect(responseData.success).toBe(true);
    expect(responseData.results.length).toBe(5); // 5개 회차가 들어있어야 함

    // DB 조회 검증
    const rows = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM posts WHERE user_id = ? AND keyword = ? ORDER BY scheduled_at ASC',
        ['test_user_id', '아이폰 18 테스트 키워드'],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });

    expect(rows.length).toBe(5);

    // 1시간(3600000ms) 간격으로 예약 시간이 지정되었는지 확인
    const timeDiffs = [];
    for (let i = 1; i < rows.length; i++) {
      const prevTime = new Date(rows[i - 1].scheduled_at).getTime();
      const currTime = new Date(rows[i].scheduled_at).getTime();
      timeDiffs.push(currTime - prevTime);
    }

    // 1분 ~ 2분 사이의 랜덤 오차가 추가되므로 차이는 약 1시간 근방이어야 함 (예: 55분 ~ 65분 사이)
    for (const diff of timeDiffs) {
      expect(diff).toBeGreaterThanOrEqual(3500000); // 58분 이상
      expect(diff).toBeLessThanOrEqual(3700000); // 61분 이하
    }

    // republish_interval_ms가 null로 들어갔는지 검증 (중복 발행 방지)
    for (const row of rows) {
      expect(row.republish_interval_ms).toBeNull();
      expect(row.post_type).toBe('keyword');
    }

    // 회차(republish_count)가 1부터 5까지 순서대로 기록되었는지 확인
    const steps = rows.map((r) => r.republish_count);
    expect(steps).toEqual([1, 2, 3, 4, 5]);

    // 클린업
    await new Promise((resolve) => {
      db.run(
        'DELETE FROM posts WHERE user_id = ? AND keyword = ?',
        ['test_user_id', '아이폰 18 테스트 키워드'],
        () => resolve(),
      );
    });
  });

  it('키워드 2개 입력 시, 즉시 10개의 예약 포스트가 라운드 로빈 시간으로 생성되어야 한다', async () => {
    const mockReq = {
      user: { id: 'test_user_id' },
      token: 'mock_token',
      body: {
        keywords: ['키워드A', '키워드B'],
        start_time: new Date().toISOString(),
        interval_hours: 1,
        interval_minutes: 0,
        use_round_robin: true,
        headless: true,
        engine: 'gemini',
        split_rep_images: true,
      },
    };

    let responseData = null;
    const mockRes = {
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        responseData = data;
        return this;
      },
    };

    // 핸들러 실행
    await handler(mockReq, mockRes);

    // 검증
    expect(responseData).toBeDefined();
    expect(responseData.success).toBe(true);
    expect(responseData.results.length).toBe(10); // 2개 키워드 * 5 = 10개 회차

    // DB 조회 검증
    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM posts WHERE user_id = ? AND keyword IN ('키워드A', '키워드B') ORDER BY scheduled_at ASC",
        ['test_user_id'],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });

    expect(rows.length).toBe(10);

    // 라운드 로빈 배치 검증 (A -> B -> A -> B ...)
    const keywordsSequence = rows.map((r) => r.keyword);
    expect(keywordsSequence[0]).toBe('키워드A');
    expect(keywordsSequence[1]).toBe('키워드B');
    expect(keywordsSequence[2]).toBe('키워드A');
    expect(keywordsSequence[3]).toBe('키워드B');

    // 시간 간격이 1시간씩 균등하게 늘어나는지 확인
    const timeDiffs = [];
    for (let i = 1; i < rows.length; i++) {
      const prevTime = new Date(rows[i - 1].scheduled_at).getTime();
      const currTime = new Date(rows[i].scheduled_at).getTime();
      timeDiffs.push(currTime - prevTime);
    }

    for (const diff of timeDiffs) {
      expect(diff).toBeGreaterThanOrEqual(3500000); // 58분 이상
      expect(diff).toBeLessThanOrEqual(3700000); // 61분 이하
    }

    // 클린업
    await new Promise((resolve) => {
      db.run(
        "DELETE FROM posts WHERE user_id = ? AND keyword IN ('키워드A', '키워드B')",
        ['test_user_id'],
        () => resolve(),
      );
    });
  });
});
