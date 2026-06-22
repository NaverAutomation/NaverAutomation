import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import db from '../db/database.js';
import { decrypt } from '../utils/crypto.js';
import { getGlobalSetting } from '../utils/supabase.js';
import { generateImageWithGemini } from './ai-service.js';

// 분할된 모듈로부터 필요한 헬퍼 함수들을 가져옵니다.
import {
  closeEditorPopups,
  fillEditorContent,
  fillEditorTitle,
  publishPostAction,
  removeStrikethrough,
  uploadImageToEditor,
} from './naver/naver-editor.js';
import {
  extractTagsFromContent,
  getNextRepresentativeImage,
  installPlaywrightChromium,
} from './naver/naver-utils.js';

/**
 * 네이버 로그인 페이지로 이동하여 로그인 절차를 밟고, 오류 상태 검증 및 최종 실제 블로그 ID를 반환합니다.
 * 비밀번호 오류, 캡차(보안문자) 노출, 계정 보호조치 등 각 실패 케이스를 세부적으로 분석하여 명시적인 예외를 발생시킵니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {object} account - 네이버 계정 정보 객체
 * @param {string} account.naver_id - 네이버 아이디
 * @param {string} account.naver_pw - 네이버 비밀번호 (복호화된 상태)
 * @returns {Promise<string>} 성공 시 추출된 실제 블로그 ID
 * @throws {Error} 로그인 실패 사유(비밀번호 오류, 캡차 요구, 보호조치 잠금 등)에 대한 예외
 */
async function loginToNaver(page, account) {
  console.log('Navigating to Naver login page...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('Entering ID/PW using anti-captcha evasion technique...');
  await page.locator('#id').click();
  await page.evaluate((id) => {
    const el = document.querySelector('#id');
    if (el) {
      el.focus();
      document.execCommand('insertText', false, id);
    }
  }, account.naver_id);

  await page.waitForTimeout(Math.random() * 200 + 100);

  await page.locator('#pw').click();
  await page.evaluate((pw) => {
    const el = document.querySelector('#pw');
    if (el) {
      el.focus();
      document.execCommand('insertText', false, pw);
    }
  }, account.naver_pw);

  await page.waitForTimeout(Math.random() * 200 + 100);
  await page.click('.btn_login');

  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }),
      page.waitForFunction(
        () => {
          const errEl = document.querySelector('.error_message');
          return errEl && errEl.style.display !== 'none' && errEl.innerText.trim().length > 0;
        },
        { timeout: 8000 },
      ),
    ]);
  } catch (_e) {
    console.log('Navigation or error wait timeout, checking current state...');
  }

  const currentUrl = page.url();

  if (currentUrl.includes('nid.naver.com/user2/')) {
    throw new Error(
      '자동 로그인 실패: 네이버 계정이 보호조치(잠금) 또는 본인확인 요구 상태에 있습니다. 직접 브라우저에서 로그인하여 해제해 주세요.',
    );
  }

  if (currentUrl.includes('nidlogin.login')) {
    let errorMsg = null;
    let hasCaptcha = false;

    try {
      errorMsg = await page.evaluate(() => {
        const errEl = document.querySelector('.error_message');
        if (errEl && errEl.style.display !== 'none') {
          let text = errEl.innerText.trim();
          text = text
            .replace(/\n/g, ' ')
            .replace(/Caps Lock이 켜져 있습니다\.?/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          return text || '로그인 정보를 확인해주세요.';
        }
        return null;
      });
    } catch (_e) {
      console.log('Context destroyed during error check, assuming successful navigation.');
    }

    if (errorMsg) {
      if (
        errorMsg.includes('잘못 입력') ||
        errorMsg.includes('잘못 되었습니다') ||
        errorMsg.includes('정확히 입력') ||
        errorMsg.includes('확인해')
      ) {
        throw new Error(`자동 로그인 실패(비밀번호 오류): ${errorMsg}`);
      }
      if (errorMsg.includes('보안문자') || errorMsg.includes('캡차')) {
        throw new Error(`자동 로그인 실패(캡차 요구): ${errorMsg}`);
      }
      throw new Error(`자동 로그인 실패: ${errorMsg}`);
    }

    try {
      const captchaImg = await page.$('#captcha_image, #chptcha');
      if (captchaImg) hasCaptcha = true;
    } catch (_e) {
      console.log('Context destroyed during captcha check, assuming successful navigation.');
    }

    if (hasCaptcha) {
      throw new Error(
        '자동 로그인 실패(캡차 요구): 캡차(보안문자) 인증이 발생했습니다. 직접 브라우저에서 로그인하여 해제해야 할 수 있습니다.',
      );
    }

    await page.waitForTimeout(1000);
    const finalUrl = page.url();
    if (finalUrl.includes('nid.naver.com/user2/')) {
      throw new Error(
        '자동 로그인 실패: 네이버 계정이 보호조치(잠금) 또는 본인확인 요구 상태에 있습니다. 직접 브라우저에서 로그인하여 해제해 주세요.',
      );
    }
    if (finalUrl.includes('nidlogin.login')) {
      throw new Error(
        '자동 로그인 실패: 원인을 알 수 없는 이유로 로그인 페이지를 벗어나지 못했습니다.',
      );
    }
  }

  console.log('Navigating to MyBlog.naver to resolve real blog ID...');
  await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });

  let checkCount = 0;
  while (page.url().includes('MyBlog.naver') && checkCount < 10) {
    await page.waitForTimeout(500);
    checkCount++;
  }

  const finalUrl = page.url();
  console.log(`Resolved final blog URL: ${finalUrl}`);

  const match = finalUrl.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1]) {
    throw new Error(`실제 블로그 ID를 추출하지 못했습니다. (최종 URL: ${finalUrl})`);
  }

  const realBlogId = match[1];
  console.log(`Successfully resolved real blog ID: ${realBlogId}`);
  return realBlogId;
}

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
  let browser;
  let postTimeoutId;
  const { onProgress } = options;

  if (!post.tags || post.tags.trim() === '') {
    // [비활성화] 네이버 포스팅 시 본문에서 단어를 추출하여 태그 5개를 자동 생성하는 기능 주석 처리
    // post.tags = extractTagsFromContent(post.title, post.content);
    // if (onProgress && post.tags) {
    //   onProgress(
    //     'info',
    //     `[태그 자동 생성] 본문과 관련된 단어 5개를 태그로 자동 적용했습니다: ${post.tags}`,
    //   );
    // }
    post.tags = '';
  }

  try {
    const mainAction = async () => {
      let effectiveHeadless =
        typeof options.headless === 'boolean' ? options.headless : CONFIG.HEADLESS;

      if (process.env.NODE_ENV === 'development') {
        console.log('[Dev Mode] Auto-disabling headless mode to display browser window.');
        effectiveHeadless = false;
      }

      if (onProgress) onProgress('info', '브라우저를 실행하는 중...');

      try {
        browser = await chromium.launch({
          headless: effectiveHeadless,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
        });
      } catch (launchError) {
        if (
          launchError?.message?.includes("Executable doesn't exist") ||
          launchError?.message?.includes('looks like Playwright was upgraded')
        ) {
          if (onProgress) onProgress('info', '브라우저 엔진 설치 시도 중...');
          console.log(
            'Chromium launch failed. Attempting to install Playwright Chromium automatically...',
          );
          try {
            await installPlaywrightChromium();
            browser = await chromium.launch({
              headless: effectiveHeadless,
              args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
              ],
            });
          } catch (installErr) {
            console.error('Failed to automatically install Playwright Chromium:', installErr);
            throw new Error(
              `Playwright 브라우저 자동 설치에 실패했습니다. (에러: ${installErr.message}). 프로그램 재시작 또는 인터넷 연결 확인을 해주세요.`,
            );
          }
        } else {
          throw launchError;
        }
      }

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
      });

      const page = await context.newPage();

      if (onProgress) onProgress('info', '네이버 로그인 시도 중...');
      const realBlogId = await loginToNaver(page, account);

      if (onProgress) onProgress('info', '블로그 글쓰기 페이지 진입 중...');
      console.log(`Navigating to blog write page for ${realBlogId}...`);
      await page.goto(`https://blog.naver.com/${realBlogId}?Redirect=Write`, {
        waitUntil: 'domcontentloaded',
      });

      try {
        const mainFrame = page.locator('#mainFrame');
        await mainFrame.waitFor({ state: 'attached', timeout: 5000 });
        const iframeSrc = await mainFrame.getAttribute('src');
        if (iframeSrc) {
          const absoluteIframeUrl = iframeSrc.startsWith('http')
            ? iframeSrc
            : `https://blog.naver.com${iframeSrc}`;
          console.log(`Navigating directly to editor iframe URL: ${absoluteIframeUrl}`);
          await page.goto(absoluteIframeUrl, { waitUntil: 'domcontentloaded' });
        }
      } catch (iframeErr) {
        console.warn(
          'Failed to resolve iframe src, trying to proceed with current URL...',
          iframeErr.message,
        );
      }

      try {
        const editorWrap = page.locator('.se-documentTitle').first();
        await editorWrap.waitFor({ state: 'visible', timeout: 5000 });
        console.log('Editor loaded successfully on first try.');
      } catch (_e) {
        console.warn('Blank screen detected or editor failed to render. Triggering page reload...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
      }

      if (onProgress) onProgress('info', '에디터 방해 팝업 제거 중...');
      await closeEditorPopups(page);

      if (onProgress) onProgress('info', '제목 작성 중...');
      await fillEditorTitle(page, post.title);

      let representativeImages = [];
      let contentImages = [];
      if (post.image_url) {
        try {
          const parsed = JSON.parse(post.image_url);
          if (parsed && typeof parsed === 'object') {
            representativeImages = parsed.representative || [];
            contentImages = parsed.content || [];
          } else {
            representativeImages = [post.image_url];
          }
        } catch {
          representativeImages = [post.image_url];
        }
      }

      if (representativeImages.length === 0) {
        const nextRepImage = await getNextRepresentativeImage(post.user_id);
        if (nextRepImage) {
          representativeImages = [nextRepImage];
          if (onProgress)
            onProgress('info', '설정된 대표 이미지 풀에서 이미지를 매칭하여 자동 적용했습니다.');
        }
      }

      if (representativeImages.length > 0) {
        if (onProgress)
          onProgress('info', `대표 사진 업로드 중 (${representativeImages.length}개)...`);
        for (const imgUrl of representativeImages) {
          await uploadImageToEditor(page, imgUrl, false);
        }
      }

      if (onProgress) onProgress('info', '본문 내용 작성 중...');
      await fillEditorContent(page, post.content);

      if (contentImages.length > 0) {
        if (onProgress)
          onProgress('info', `본문 사진 업로드 중 (${contentImages.length}개, AI 자동 변조)...`);
        for (const imgUrl of contentImages) {
          await uploadImageToEditor(page, imgUrl, true);
        }
      } else {
        try {
          if (onProgress) onProgress('info', '본문 사진이 없어 AI에게 생성 요청 중...');

          let apiKey = await getGlobalSetting('master_gemini_api_key');
          if (!apiKey || apiKey === 'YOUR_KEY_HERE') {
            apiKey = null;
            await new Promise((resolve) => {
              db.get(
                "SELECT value FROM settings WHERE (user_id = ? OR user_id IS NULL) AND key = 'gemini_api_key' ORDER BY user_id DESC LIMIT 1",
                [post.user_id || null],
                (err, row) => {
                  if (!err && row && row.value) {
                    try {
                      apiKey = decrypt(row.value);
                    } catch {}
                  }
                  resolve();
                },
              );
            });
          }

          if (apiKey && apiKey !== 'YOUR_KEY_HERE') {
            const base64Image = await generateImageWithGemini(
              apiKey,
              post.keyword || post.title,
              post.title,
              post.content,
            );
            if (base64Image) {
              const tempImgPath = path.join(os.tmpdir(), `ai_gen_${Date.now()}.png`);
              fs.writeFileSync(tempImgPath, Buffer.from(base64Image, 'base64'));
              if (onProgress) onProgress('info', 'AI 사진이 생성되어 업로드합니다...');
              await uploadImageToEditor(page, tempImgPath, true);
              if (fs.existsSync(tempImgPath)) {
                fs.unlinkSync(tempImgPath);
              }
            }
          }
        } catch (e) {
          console.warn('AI image generation failed:', e.message);
        }
      }

      await removeStrikethrough(page);

      if (onProgress) onProgress('info', '최종 발행 프로세스 진행 중...');
      await publishPostAction(page, post.tags);

      return { success: true, message: 'Successfully posted to Naver Blog' };
    };

    const timeoutPromise = new Promise((_, reject) => {
      postTimeoutId = setTimeout(() => {
        reject(
          new Error(
            '전체 포스팅 타임아웃(3분 초과). 좀비 프로세스 방지를 위해 브라우저를 강제 종료합니다.',
          ),
        );
      }, 180000);
    });

    const result = await Promise.race([mainAction(), timeoutPromise]);
    return result;
  } catch (error) {
    console.error('Naver posting error:', error);

    const isCriticalLoginFailure =
      error.message?.includes('자동 로그인 실패(비밀번호 오류)') ||
      error.message?.includes('자동 로그인 실패(캡차 요구)') ||
      error.message?.includes('보호조치(잠금)');

    if (isCriticalLoginFailure) {
      try {
        await new Promise((resolve, reject) => {
          db.run(
            "UPDATE accounts SET status = 'paused' WHERE naver_id = ? AND user_id = ?",
            [account.naver_id, post.user_id],
            (dbErr) => {
              if (dbErr) {
                reject(dbErr);
              } else {
                resolve();
              }
            },
          );
        });

        let reason = '로그인 오류 감지';
        if (error.message.includes('비밀번호 오류')) {
          reason = '로그인 정보 불일치';
        } else if (error.message.includes('캡차 요구')) {
          reason = '캡차(보안문자) 인증 요구';
        } else if (error.message.includes('보호조치(잠금)')) {
          reason = '계정 보호조치(잠금)';
        }

        if (onProgress) {
          onProgress(
            'warn',
            `[계정 일시정지] ${reason} 감지로 계정(${account.naver_id})을 일시정지 처리했습니다.`,
          );
        }
      } catch (dbErr) {
        console.error('Failed to update account status to paused:', dbErr.message);
      }
    }

    return { success: false, message: error.message };
  } finally {
    if (postTimeoutId) {
      clearTimeout(postTimeoutId);
    }
    if (browser) {
      await browser.close();
    }
  }
}
