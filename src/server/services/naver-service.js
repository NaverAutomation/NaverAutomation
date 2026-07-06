import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import db from '../db/database.js';

// 분할된 모듈로부터 필요한 헬퍼 함수들을 가져옵니다.
import {
  closeEditorPopups,
  fillEditorContent,
  fillEditorTitle,
  publishPostAction,
  removeStrikethrough,
} from './naver/naver-editor.js';
// 로그인 및 포스트 플로우 모듈 추가
import { loginToNaver, updateAccountStatusOnFailure } from './naver/naver-login.js';
import {
  enterBlogEditor,
  handleContentImages,
  handleRepresentativeImages,
} from './naver/naver-post-flow.js';
import { installPlaywrightChromium } from './naver/naver-utils.js';

/**
 * 네이버 블로그 자동 포스팅의 전체 워크플로우를 처리하는 메인 서비스 함수입니다.
 * 브라우저 인스턴스 기동 및 설치 대행, 로그인, 에디터 진입, 팝업 처리, 제목/대표이미지/본문/본문이미지/AI이미지 생성/태그 입력 및 최종 발행 등 전 과정을 제어합니다.
 * 크리티컬한 로그인 실패 감색 시 데이터베이스 내 계정 상태를 'paused'로 동기식 업데이트 처리합니다.
 *
 * @param {object} account - 네이버 계정 정보 객체
 * @param {string} account.naver_id - 네이버 아이디
 * @param {string} account.naver_pw - 네이버 비밀번호 (암호화되어 있어 내부에서 복호화해 사용)
 * @param {object} post - 포스팅할 내용에 대한 메타데이터 및 콘텐츠 객체
 * @param {string} [post.user_id] - 시스템 사용자 식별 ID (대표 이미지 순환 및 API 설정 키 조회에 필수)
 * @param {string} post.title - 포스트 글 제목
 * @param {string} post.content - 포스트 글 본문 내용 (마크다운 기호는 내부에서 필터링됨)
 * @param {string} [post.image_url] - 이미지 업로드를 위한 JSON 형식 스트링 혹은 단일 URL 주소
 * @param {string} [post.tags] - 수동 지정 태그 목록 (없을 경우 명사 빈도로 자동 추출)
 * @param {string} [post.keyword] - 포스트 핵심 키워드 (본문 이미지가 없고 AI가 보완할 때 AI 이미지 프롬프트로 활용)
 * @param {object} [options={}] - 포스팅 제어 및 알림 옵션
 * @param {boolean} [options.headless] - 브라우저 창을 띄우지 않는 백그라운드 구동 여부 (개발 환경에서는 항상 false)
 * @param {function} [options.onProgress] - 작업 단계마다 상태 변화 로그를 클라이언트에 중계하는 콜백 함수 `(type, message) => void`
 * @returns {Promise<{success: boolean, message: string}>} 작업 처리 결과 상태 및 메시지 반환 객체
 */
export async function postToNaver(account, post, options = {}) {
  let context;
  let postTimeoutId;
  let isLoginFailure = false;
  const { onProgress } = options;

  // CONFIG.SESSION_DIR 누락 대비 방어적 Fallback 설정
  const sessionDir = CONFIG.SESSION_DIR || path.join(process.cwd(), 'sessions');
  const userProfileDir = path.join(sessionDir, account.naver_id);

  if (!post.tags || post.tags.trim() === '') {
    post.tags = '';
  }

  try {
    const mainAction = async () => {
      let effectiveHeadless =
        typeof options.headless === 'boolean' ? options.headless : CONFIG.HEADLESS;

      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[개발 모드] 브라우저 화면 표시를 위해 헤드리스 모드를 자동으로 비활성화합니다.',
        );
        effectiveHeadless = false;
      }

      // 세션 저장 디렉토리 생성 보장
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const launchOptions = {
        headless: effectiveHeadless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
      };

      if (onProgress) onProgress('info', '브라우저를 실행하는 중...');

      try {
        context = await chromium.launchPersistentContext(userProfileDir, launchOptions);
      } catch (launchError) {
        if (
          launchError?.message?.includes("Executable doesn't exist") ||
          launchError?.message?.includes('looks like Playwright was upgraded')
        ) {
          if (onProgress) onProgress('info', '브라우저 엔진 설치 시도 중...');
          console.log('크로미움 브라우저 실행 실패. Playwright 크로미움을 자동으로 설치합니다...');
          try {
            await installPlaywrightChromium();
            context = await chromium.launchPersistentContext(userProfileDir, launchOptions);
          } catch (installErr) {
            console.error('Playwright 크로미움 자동 설치 실패:', installErr);
            throw new Error(
              `Playwright 브라우저 자동 설치에 실패했습니다. (에러: ${installErr.message}). 프로그램 재시작 또는 인터넷 연결 확인을 해주세요.`,
            );
          }
        } else {
          throw launchError;
        }
      }

      const page = context.pages()[0] || (await context.newPage());

      if (onProgress) onProgress('info', '네이버 로그인 상태 확인 중...');

      let realBlogId;
      let needLogin = true;

      try {
        console.log(`${account.naver_id} 계정의 세션 유효성을 검사하는 중...`);

        // MyBlog.naver로 이동해 로그인 상태 검사
        await page.goto('https://blog.naver.com/MyBlog.naver', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        const currentUrl = page.url();

        if (!currentUrl.includes('nidlogin.login')) {
          let checkCount = 0;
          while (page.url().includes('MyBlog.naver') && checkCount < 10) {
            await page.waitForTimeout(500);
            checkCount++;
          }
          const finalUrl = page.url();
          const match = finalUrl.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
          if (match?.[1]) {
            realBlogId = match[1];
            needLogin = false;
            console.log(`로그인 세션 검증 성공. 블로그 ID: ${realBlogId}`);
            if (onProgress) onProgress('info', '기존 로그인 세션이 유효하여 로그인을 생략합니다.');
          }
        } else {
          console.log(
            '세션이 만료되었거나 로그인되어 있지 않습니다. 로그인 페이지로 이동합니다...',
          );
        }
      } catch (sessionErr) {
        console.warn('세션 유효성 검증 실패:', sessionErr.message);
      }

      if (needLogin) {
        if (onProgress) onProgress('info', '네이버 로그인 시도 중...');
        realBlogId = await loginToNaver(page, account);
      }

      // 로그인 성공 시 실패 횟수 초기화
      try {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE accounts SET login_fail_count = 0 WHERE naver_id = ? AND user_id = ?',
            [account.naver_id, account.user_id || post.user_id],
            (dbErr) => {
              if (dbErr) reject(dbErr);
              else resolve();
            },
          );
        });
      } catch (dbErr) {
        console.error('로그인 실패 횟수(login_fail_count) 초기화 실패:', dbErr.message);
      }

      // 블로그 에디터 페이지 진입 및 대기
      await enterBlogEditor(page, realBlogId);

      if (onProgress) onProgress('info', '에디터 방해 팝업 제거 중...');
      await closeEditorPopups(page);

      if (onProgress) onProgress('info', '제목 작성 중...');
      await fillEditorTitle(page, post.title);

      // 대표 이미지 및 본문 이미지 업로드 처리
      const contentImages = await handleRepresentativeImages(page, post, onProgress);
      await handleContentImages(page, post, contentImages, onProgress);

      if (onProgress) onProgress('info', '본문 내용 작성 중...');
      await fillEditorContent(page, post.content);

      await removeStrikethrough(page);

      if (onProgress) onProgress('info', '최종 발행 프로세스 진행 중...');
      await publishPostAction(page, post.tags);

      return { success: true, message: 'Successfully posted to Naver Blog' };
    };

    const timeoutPromise = new Promise((_, reject) => {
      const timeoutMs = CONFIG.POSTING_TIMEOUT || 600000;
      const timeoutMinutes = Math.round(timeoutMs / 60000);
      postTimeoutId = setTimeout(() => {
        reject(
          new Error(
            `전체 포스팅 타임아웃(${timeoutMinutes}분 초과). 좀비 프로세스 방지를 위해 브라우저를 강제 종료합니다.`,
          ),
        );
      }, timeoutMs);
    });

    const result = await Promise.race([mainAction(), timeoutPromise]);
    return result;
  } catch (error) {
    console.error('네이버 포스팅 오류:', error);

    isLoginFailure =
      error.message?.includes('자동 로그인 실패') || error.message?.includes('보호조치(잠금)');

    if (isLoginFailure) {
      const newCount = await updateAccountStatusOnFailure(account, post, error, onProgress);

      return {
        success: false,
        message: error.message,
        isLoginFailure: true,
        failCount: newCount,
      };
    }

    return { success: false, message: error.message, isLoginFailure: false };
  } finally {
    if (postTimeoutId) {
      clearTimeout(postTimeoutId);
    }
    if (context) {
      await context.close();
    }

    // 브라우저 컨텍스트가 완전히 닫히고 잠금이 해제된 후, 세션 폴더를 안전하게 삭제합니다.
    if (isLoginFailure && fs.existsSync(userProfileDir)) {
      try {
        fs.rmSync(userProfileDir, { recursive: true, force: true });
        console.log(`유효하지 않은 세션 디렉토리를 삭제했습니다: ${userProfileDir}`);
      } catch (rmErr) {
        console.error('유효하지 않은 세션 디렉토리 삭제 실패:', rmErr.message);
      }
    }
  }
}
