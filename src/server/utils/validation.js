import { z } from 'zod';

/**
 * 수기 즉시 발행 API (POST /api/post) 검증 스키마
 */
export const createPostSchema = z.object({
  title: z.string().min(1, '제목은 필수 입력 사항입니다.'),
  content: z.string().min(1, '본문은 필수 입력 사항입니다.'),
  image_url: z.string().nullable().optional(),
  tags: z.string().optional(),
  headless: z.boolean().optional(),
  account_id: z.number().nullable().optional(),
});

/**
 * 타이머 예약 API (POST /api/posts/schedule) 검증 스키마
 */
export const schedulePostSchema = z.object({
  title: z.string().min(1, '제목은 필수 입력 사항입니다.'),
  content: z.string().min(1, '본문은 필수 입력 사항입니다.'),
  image_url: z.string().nullable().optional(),
  tags: z.string().optional(),
  headless: z.boolean().optional(),
  account_id: z.number().nullable().optional(),
  scheduled_at: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), {
      message: '올바른 날짜 형식이 아닙니다.',
    })
    .optional(),
});

/**
 * 자동 키워드 일괄 예약 API (POST /api/posts/schedule-keywords) 검증 스키마
 */
export const scheduleKeywordsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1, '최소 1개 이상의 키워드가 필요합니다.'),
  start_time: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
    message: '올바른 시작 예약 시간 형식이 아닙니다.',
  }),
  interval_hours: z.number().min(0).optional().default(0),
  interval_minutes: z.number().min(0).max(59).optional().default(0),
  account_id: z.number().nullable().optional(),
  use_round_robin: z.boolean().optional().default(true),
  headless: z.boolean().optional(),
  engine: z.string().optional().default('gemini'),
  image_url: z.string().optional(),
  split_rep_images: z.boolean().optional(),
  image_keywords: z.string().optional(),
  tags: z.string().optional(),
});
