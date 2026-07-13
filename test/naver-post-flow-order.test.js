import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postToNaver } from '../src/server/services/naver-service.js';

// Playwright chromium 모킹
vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://blog.naver.com/test_blog_id'),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      pressSequentially: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      first: vi.fn().mockReturnThis(),
      last: vi.fn().mockReturnThis(),
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn().mockReturnThis(),
      isVisible: vi.fn().mockResolvedValue(true),
      getAttribute: vi.fn().mockResolvedValue(null),
    }),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    evaluate: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    pages: vi.fn().mockReturnValue([mockPage]),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
    },
  };
});

// database 모킹
vi.mock('../src/server/db/database.js', () => {
  return {
    default: {
      get: vi.fn((sql, _params, callback) => {
        if (sql.includes('settings')) {
          callback(null, { value: 'false' }); // disable_headless = false
        } else {
          callback(null, null);
        }
      }),
      run: vi.fn((_sql, _params, callback) => {
        if (callback) callback(null);
      }),
    },
  };
});

// utils/crypto 모킹
vi.mock('../src/server/utils/crypto.js', () => ({
  decrypt: vi.fn((val) => val),
}));

// utils/supabase 모킹
vi.mock('../src/server/utils/supabase.js', () => ({
  getGlobalSetting: vi.fn().mockResolvedValue('MOCK_API_KEY'),
}));

// naver-editor와 naver-post-flow의 함수들을 가로채어 호출 순서를 기록합니다.
const callOrder = [];

vi.mock('../src/server/services/naver/naver-editor.js', () => ({
  closeEditorPopups: vi.fn().mockImplementation(async () => {
    callOrder.push('closeEditorPopups');
  }),
  fillEditorTitle: vi.fn().mockImplementation(async () => {
    callOrder.push('fillEditorTitle');
  }),
  fillEditorContent: vi.fn().mockImplementation(async () => {
    callOrder.push('fillEditorContent');
  }),
  removeStrikethrough: vi.fn().mockImplementation(async () => {
    callOrder.push('removeStrikethrough');
  }),
  publishPostAction: vi.fn().mockImplementation(async () => {
    callOrder.push('publishPostAction');
  }),
  uploadImageToEditor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/server/services/naver/naver-post-flow.js', () => ({
  enterBlogEditor: vi.fn().mockImplementation(async () => {
    callOrder.push('enterBlogEditor');
  }),
  handleRepresentativeImages: vi.fn().mockImplementation(async () => {
    callOrder.push('handleRepresentativeImages');
    return ['content_img1.jpg', 'content_img2.jpg']; // 본문 이미지 목록 리턴
  }),
  handleContentImages: vi.fn().mockImplementation(async () => {
    callOrder.push('handleContentImages');
  }),
}));

describe('Naver Blog Posting Flow Order Test', () => {
  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
  });

  it('해야 하는 포스팅 단계가 기대하는 순서([대표사진] -> [본문내용] -> [이외사진])대로 올바르게 수행되는지 검증한다', async () => {
    const account = {
      naver_id: 'test_user',
      naver_pw: 'encrypted_password',
      user_id: 1,
    };

    const post = {
      title: '테스트 블로그 제목',
      content: '테스트 블로그 본문 내용',
      image_url: JSON.stringify({
        representative: ['rep_img.jpg'],
        content: ['content_img1.jpg', 'content_img2.jpg'],
      }),
      tags: '태그1, 태그2',
      user_id: 1,
    };

    const result = await postToNaver(account, post, { headless: true });

    expect(result.success).toBe(true);

    // 기대하는 호출 순서 검증
    expect(callOrder).toEqual([
      'enterBlogEditor',
      'closeEditorPopups',
      'fillEditorTitle',
      'handleRepresentativeImages',
      'fillEditorContent',
      'handleContentImages',
      'removeStrikethrough',
      'publishPostAction',
    ]);

    // 핵심 레이아웃 구조 검증: 대표사진 -> 본문 텍스트 -> 이외사진
    const repImgIdx = callOrder.indexOf('handleRepresentativeImages');
    const contentTextIdx = callOrder.indexOf('fillEditorContent');
    const contentImgIdx = callOrder.indexOf('handleContentImages');

    expect(repImgIdx).toBeLessThan(contentTextIdx); // 대표사진이 본문 내용보다 먼저
    expect(contentTextIdx).toBeLessThan(contentImgIdx); // 본문 내용이 이외사진보다 먼저
  });
});
