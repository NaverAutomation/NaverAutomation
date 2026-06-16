import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  scheduleKeywordsSchema,
  schedulePostSchema,
} from '../src/server/utils/validation.js';

describe('Zod validation schema tests', () => {
  describe('createPostSchema (수기 즉시 발행)', () => {
    it('정상적인 포스트 데이터를 성공적으로 통과시켜야 합니다.', () => {
      const validData = {
        title: '성수동 카페 후기',
        content: '여기는 진짜 커피가 맛있습니다.',
        image_url: 'http://localhost/uploads/test.png',
        tags: '맛집,카페',
        headless: true,
        account_id: 1,
      };
      const result = createPostSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('제목이 누락되었을 때 검증에 실패해야 합니다.', () => {
      const invalidData = {
        content: '본문 내용만 있음',
      };
      const result = createPostSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('title');
      }
    });

    it('본문이 누락되었을 때 검증에 실패해야 합니다.', () => {
      const invalidData = {
        title: '제목만 있음',
      };
      const result = createPostSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('content');
      }
    });
  });

  describe('schedulePostSchema (타이머 예약 발행)', () => {
    it('정상적인 예약 포스트 데이터를 성공적으로 통과시켜야 합니다.', () => {
      const validData = {
        title: '예약 포스트',
        content: '내일 발행될 예약 본문 내용',
        scheduled_at: new Date().toISOString(),
      };
      const result = schedulePostSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('예약 발행일시(scheduled_at)가 올바르지 않은 날짜 포맷일 때 검증에 실패해야 합니다.', () => {
      const invalidData = {
        title: '예약 포스트',
        content: '본문 내용',
        scheduled_at: 'invalid-date-string-test',
      };
      const result = schedulePostSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('올바른 날짜 형식이 아닙니다.');
      }
    });
  });

  describe('scheduleKeywordsSchema (자동 키워드 일괄 예약)', () => {
    it('정상적인 키워드 예약 설정 데이터를 성공적으로 통과시키고 기본값을 매핑해야 합니다.', () => {
      const validData = {
        keywords: ['갤럭시 S26 울트라', '아이폰 17 Pro'],
        start_time: new Date().toISOString(),
        interval_hours: 3,
        interval_minutes: 0,
      };
      const result = scheduleKeywordsSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.engine).toBe('gemini'); // 기본값
        expect(result.data.use_round_robin).toBe(true); // 기본값
      }
    });

    it('키워드 목록이 비어있을 때 검증에 실패해야 합니다.', () => {
      const invalidData = {
        keywords: [],
        start_time: new Date().toISOString(),
      };
      const result = scheduleKeywordsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('시작 예약 시간(start_time)이 누락되었을 때 검증에 실패해야 합니다.', () => {
      const invalidData = {
        keywords: ['테스트'],
      };
      const result = scheduleKeywordsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
