import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * URL에서 이미지를 다운로드하여 임시 경로에 저장합니다.
 * @param {string} url 이미지 URL
 * @param {string} dest 저장할 경로
 */
async function downloadImage(url, dest) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

/**
 * 네이버 블로그에 포스팅을 게시합니다.
 * @param {object} account 네이버 계정 정보 (naver_id, naver_pw)
 * @param {object} post 포스팅 내용 (title, content, image_url)
 * @param {object} options 실행 옵션
 * @param {boolean} options.headless 브라우저를 백그라운드(headless)로 실행할지 여부
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function postToNaver(account, post, options = {}) {
  let browser;
  try {
    const effectiveHeadless = typeof options.headless === 'boolean' ? options.headless : CONFIG.HEADLESS;

    // 요청별 옵션 또는 기본 설정에 따라 브라우저 동작 제어
    browser = await chromium.launch({ 
      headless: effectiveHeadless,
      args: ['--disable-blink-features=AutomationControlled'] // 자동화 탐지 방지 시도
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to Naver login page...');
    await page.goto('https://nid.naver.com/nidlogin.login');

    // 로그인 정보 입력
    await page.fill('#id', account.naver_id);
    await page.fill('#pw', account.naver_pw);
    await page.click('.btn_login');
    
    // 로그인 완료 및 메인/블로그 이동 대기
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    console.log(`Navigating to blog write page for ${account.naver_id}...`);
    await page.goto(`https://blog.naver.com/${account.naver_id}/postwrite`, { waitUntil: 'networkidle' });

    // 1. 프레임 로드 대기 (네이버 블로그 에디터에 따라 프레임이 없을 수 있음)
    console.log('Checking for editor context...');
    // 프레임이 없는 경우(page)를 기본으로 하되, 변수명은 유지하여 하위 로직 호환성 확보
    const frame = page;
    console.log('Using main page context for editor.');
    
    // "작성 중인 글이 있습니다" 팝업 처리 (프레임 내부)
    try {
      const cancelBtn = frame.locator('button:has-text("취소")');
      if (await cancelBtn.isVisible({ timeout: 5000 })) {
        await cancelBtn.click({ force: true });
        console.log('Closed draft popup.');
        await page.waitForTimeout(1000);
      }
    } catch (e) {}

    // 도움말 패널 등이 떠있으면 닫기 (유저 제공 셀렉터 .se-help-panel-close-button 적용)
    try {
      const helpCloseSelector = '.se-help-panel-close-button';
      const helpBtn = frame.locator(helpCloseSelector);
      if (await helpBtn.isVisible({ timeout: 3000 })) {
        await helpBtn.click({ force: true });
        console.log('Closed helper panel using user-provided selector.');
        await page.waitForTimeout(1000);
      }
    } catch (e) {}

    // 3. 제목 입력 (유저 제공 셀렉터 .se-section-documentTitle 적용)
    console.log(`Typing title: ${post.title.substring(0, 20)}...`);
    try {
      // 1) 제목 영역 찾기
      const titleSelector = '.se-section-documentTitle';
      const titleArea = frame.locator(titleSelector);
      await titleArea.waitFor({ state: 'visible', timeout: 10000 });
      
      // 2) 확실한 포커스를 위해 클릭
      await titleArea.click({ force: true });
      await page.waitForTimeout(500);
      
      // 3) 기존 텍스트 전체 선택 후 삭제 (안전장치)
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
      
      // 4) 타이핑
      await page.keyboard.type(post.title, { delay: 50 });
      console.log('Title input completed.');
    } catch (e) {
      console.warn('Title input failed, trying fallback...', e.message);
      // Fallback: 인덱스 기반 시도
      try {
        const titleAreaFallback = frame.locator('.se-component-content').nth(0);
        await titleAreaFallback.click({ force: true });
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(post.title, { delay: 50 });
      } catch (e2) {
        console.error('Title input critical failure:', e2.message);
      }
    }

    // 4. 본문 입력 전 이미지 업로드 처리
    if (post.image_url) {
      console.log('Uploading image to Naver Blog...');
      const tempPath = path.join(os.tmpdir(), `naver_blog_image_${Date.now()}.png`);
      try {
        await downloadImage(post.image_url, tempPath);
        // 파일 업로드 버튼 대기
        const fileInput = await frame.waitForSelector('.se-file-input', { timeout: 10000 });
        await fileInput.setInputFiles(tempPath);
        
        // 업로드 중 로딩 바가 사라질 때까지 대기 (네이버 특유의 업로드 시간 고려)
        await page.waitForTimeout(5000); 
        console.log('Image upload request sent.');
      } catch (err) {
        console.error('Image upload failed:', err);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    // Markdown 기호 제거
    const cleanContent = post.content.replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '');

    // 본문 입력 (인덱스 기반 셀렉터 적용)
    console.log('Typing content...');
    try {
      // 두 번째 .se-component-content가 본문 (이미지가 추가되면 인덱스가 밀릴 수 있으므로 유연하게 대처)
      // 보통 제목이 0번, 본문이 1번 혹은 이미지 뒤의 텍스트가 본문
      const contentCount = await frame.locator('.se-component-content').count();
      const contentArea = frame.locator('.se-component-content').nth(contentCount - 1);
      
      await contentArea.waitFor({ state: 'visible', timeout: 5000 });
      await contentArea.click({ clickCount: 1, force: true });
      await page.waitForTimeout(1000);
      
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      
      // 혹시라도 에디터 상단 툴바에 취소선, 볼드 등이 켜져있다면 강제로 꺼서 서식 초기화
      await frame.evaluate(() => {
        const activeToggles = document.querySelectorAll('button.se-is-selected[data-type="toggle"]');
        activeToggles.forEach(btn => btn.click());
      });

      await page.keyboard.type(cleanContent, { delay: 10 });
      console.log('Content input completed.');
    } catch (e) {
      console.warn('Content input failed, trying fallback (Tab)...', e.message);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await page.keyboard.type(cleanContent, { delay: 10 });
    }

    // 본문 입력 후 에디터 내부에 잘못 적용된 취소선(strike, s, line-through) 강제 제거
    console.log('Verifying and removing any unexpected strikethrough formatting...');
    await frame.evaluate(() => {
      const elements = document.querySelectorAll('strike, s, span, p, div');
      elements.forEach(el => {
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'strike' || tagName === 's') {
          // unwrap element
          const parent = el.parentNode;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        } else if (el.style && el.style.textDecoration && el.style.textDecoration.includes('line-through')) {
          // remove line-through inline style
          el.style.textDecoration = el.style.textDecoration.replace('line-through', '').trim();
        }
      });
    });

    console.log('Publishing post... waiting a moment before clicking.');
    await page.waitForTimeout(1000);
    
    // 발행 버튼 클릭 (상단 우측 발행 버튼)
    console.log('Clicking the first publish button...');
    const publishBtn = frame.locator('.publish_btn__m9KHH, button[data-click-area="tpb.publish"]').first();
    await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
    await publishBtn.click({ force: true });
    
    // 최종 발행 확인 버튼 대기 및 클릭 (팝업 내 발행 버튼)
    console.log('Waiting for final publish confirmation button...');
    await page.waitForTimeout(1200); // Wait for modal animation to settle

    const finalPublishSelectors = [
      'button[data-testid="seOnePublishBtn"]',
      'button[data-click-area="tpb*i.publish"]',
      '.confirm_btn__WEaBq',
      '[role="dialog"] button:has-text("발행")',
      '.ReactModal__Content button:has-text("발행")',
    ];

    let finalClicked = false;
    for (const selector of finalPublishSelectors) {
      const candidate = page.locator(selector).last();
      const visible = await candidate.isVisible({ timeout: 4000 }).catch(() => false);
      if (!visible) continue;

      await candidate.click({ force: true });
      finalClicked = true;
      console.log(`Clicked final publish button using selector: ${selector}`);
      break;
    }

    // Fallback: visible "발행" 버튼 중 마지막(대개 팝업 확인 버튼) 클릭
    if (!finalClicked) {
      const publishTextButtons = page.locator('button:has-text("발행")');
      const btnCount = await publishTextButtons.count();
      for (let i = btnCount - 1; i >= 0; i--) {
        const button = publishTextButtons.nth(i);
        const visible = await button.isVisible().catch(() => false);
        if (!visible) continue;

        await button.click({ force: true });
        finalClicked = true;
        console.log('Clicked final publish button using text fallback.');
        break;
      }
    }

    if (!finalClicked) {
      throw new Error('Final publish confirmation button was not found after the first publish click.');
    }

    // 발행 완료 후 잠시 대기
    await page.waitForTimeout(5000);

    return { success: true, message: 'Successfully posted to Naver Blog' };
  } catch (error) {
    console.error('Naver posting error:', error);
    if (error?.message?.includes("Executable doesn't exist")) {
      return {
        success: false,
        message: 'Playwright 브라우저가 설치되지 않았습니다. 프로젝트 루트에서 "npx playwright install chromium" 또는 "npm run playwright:install"을 1회 실행해 주세요.',
      };
    }
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
