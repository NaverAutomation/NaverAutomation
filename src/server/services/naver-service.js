import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * URL에서 이미지를 다운로드하여 임시 경로에 저장합니다.
 */
async function downloadImage(url, dest) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

/**
 * [Helper] 네이버 로그인 절차 및 에러 검증
 */
async function loginToNaver(page, account) {
  console.log('Navigating to Naver login page...');
  // networkidle 대신 domcontentloaded 사용으로 불필요한 무한 로딩 대기 방지
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('Entering ID/PW using anti-captcha evasion technique...');
  await page.evaluate((id) => {
    const el = document.querySelector('#id');
    if (el) {
      el.value = id;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, account.naver_id);
  
  await page.waitForTimeout(Math.random() * 200 + 100);

  await page.evaluate((pw) => {
    const el = document.querySelector('#pw');
    if (el) {
      el.value = pw;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, account.naver_pw);

  await page.waitForTimeout(Math.random() * 200 + 100);
  await page.click('.btn_login');
  
  // 로그인 완료(페이지 이동) 또는 에러 메시지 출력 대기
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }),
      page.waitForFunction(() => {
        const errEl = document.querySelector('.error_message');
        return errEl && errEl.style.display !== 'none' && errEl.innerText.trim().length > 0;
      }, { timeout: 8000 })
    ]);
  } catch (e) {
    console.log('Navigation or error wait timeout, checking current state...');
  }

  // 로그인 페이지에 계속 머물러 있는 경우 실패로 간주하고 원인 파악
  let currentUrl = page.url();
  if (currentUrl.includes('nidlogin.login')) {
    let errorMsg = null;
    let hasCaptcha = false;

    try {
      errorMsg = await page.evaluate(() => {
        const errEl = document.querySelector('.error_message');
        if (errEl && errEl.style.display !== 'none') {
          let text = errEl.innerText.trim();
          text = text.replace(/\n/g, ' ')
                     .replace(/Caps Lock이 켜져 있습니다\.?/g, '')
                     .replace(/\s+/g, ' ')
                     .trim();
          return text || '로그인 정보를 확인해주세요.';
        }
        return null;
      });
    } catch (e) {
      console.log('Context destroyed during error check, assuming successful navigation.');
    }

    if (errorMsg) {
      throw new Error(`자동 로그인 실패: ${errorMsg}`);
    }
    
    try {
      const captchaImg = await page.$('#captcha_image, #chptcha');
      if (captchaImg) hasCaptcha = true;
    } catch (e) {
      console.log('Context destroyed during captcha check, assuming successful navigation.');
    }

    if (hasCaptcha) {
      throw new Error('자동 로그인 실패: 캡차(보안문자) 인증이 발생했습니다. 직접 브라우저에서 로그인하여 해제해야 할 수 있습니다.');
    }

    // 최종 확인 (미세 타이밍 극복)
    await page.waitForTimeout(1000);
    if (page.url().includes('nidlogin.login')) {
      throw new Error('자동 로그인 실패: 원인을 알 수 없는 이유로 로그인 페이지를 벗어나지 못했습니다.');
    }
  }
}

/**
 * [Helper] 에디터 로딩 시 뜨는 팝업들(임시저장, 도움말 등) 처리
 */
async function closeEditorPopups(page) {
  // 에디터 렌더링 및 팝업 애니메이션이 끝날 때까지 넉넉히 대기
  console.log('Waiting for editor popups to render...');
  await page.waitForTimeout(2500);

  // 1차 방어: ESC 키를 여러 번 눌러 열려있는 팝업이나 도움말을 닫도록 유도
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');

  try {
    const cancelBtn = page.locator('button:has-text("취소")');
    if (await cancelBtn.isVisible({ timeout: 1000 })) {
      await cancelBtn.click({ force: true });
      console.log('Closed draft popup.');
    }
  } catch (e) {}

  try {
    // 2차 방어: 도움말 닫기 버튼 텍스트 기반 또는 클래스 기반 클릭
    const helpSelectors = [
      'button:has-text("도움말 닫기")',
      'button[title="도움말 닫기"]',
      '.se-help-panel-close-button'
    ];
    
    for (const selector of helpSelectors) {
      const helpBtn = page.locator(selector).first();
      if (await helpBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await helpBtn.click({ force: true });
        console.log(`Closed help panel using selector: ${selector}`);
        break;
      }
    }
  } catch (e) {}

  console.log('Cleared overlay popups.');
}

/**
 * [Helper] 제목 입력
 */
async function fillEditorTitle(page, title) {
  // 제목에 섞여 들어올 수 있는 마크다운 기호(**, *, # 등)와 불필요한 줄바꿈 제거
  const cleanTitle = title.replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '').replace(/\n/g, ' ').trim();
  console.log(`Typing title: ${cleanTitle.substring(0, 20)}...`);
  try {
    // 텍스트 노드가 비어있으면 크기가 0이라 클릭이 안 먹힐 수 있습니다.
    // 에디터의 제목 겉 컨테이너를 클릭해서 에디터 자체가 자연스럽게 커서를 넣도록 유도합니다.
    const titleArea = page.locator('.se-documentTitle').first();
    await titleArea.waitFor({ state: 'visible', timeout: 10000 });
    
    // 부드럽게 중앙 클릭
    await titleArea.click();
    
    // 포커스가 잡히고 커서가 깜빡일 때까지 대기
    await page.waitForTimeout(500);
    
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    
    await page.keyboard.type(cleanTitle, { delay: 30 });
    console.log('Title input completed.');
  } catch (e) {
    console.warn('Title input failed, trying fallback...', e.message);
    try {
      const titleAreaFallback = page.locator('.se-component-content').nth(0);
      await titleAreaFallback.click({ force: true });
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(title, { delay: 30 });
    } catch (e2) {
      console.error('Title input critical failure:', e2.message);
    }
  }
}

/**
 * [Helper] 이미지 업로드
 */
async function uploadImageToEditor(page, imageUrl) {
  if (!imageUrl) return;

  console.log('Uploading image to Naver Blog...');
  let imagePath = null;
  let isTemp = false;

  try {
    if (imageUrl.startsWith('http')) {
      const urlExt = path.extname(new URL(imageUrl).pathname) || '.png';
      imagePath = path.join(os.tmpdir(), `naver_blog_image_${Date.now()}${urlExt}`);
      await downloadImage(imageUrl, imagePath);
      isTemp = true;
    }

    if (!imagePath || !fs.existsSync(imagePath)) {
      console.warn('Image file not found, skipping image upload.');
      return;
    }

    // 상단 툴바의 사진 버튼과 본문 인서트 메뉴의 사진 버튼이 중복 검색되어 strict mode violation 에러가 발생하는 것을 방지하기 위해 .first()를 사용합니다.
    const imageBtn = page.locator('button[data-name="image"]').first();
    await imageBtn.waitFor({ state: 'visible', timeout: 5000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      imageBtn.click({ force: true }),
    ]);
    
    await fileChooser.setFiles(imagePath);
    console.log('Image file set via filechooser. Waiting for upload to complete...');
    
    // 네이버 에디터 내 업로드 완료 대기 (명시적인 슬립 대신 넉넉하게 기다림)
    await page.waitForTimeout(4000);
    console.log('Image upload completed.');
    
  } catch (err) {
    console.error('Image upload failed:', err.message);
  } finally {
    if (isTemp && imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
}

/**
 * [Helper] 본문 입력 및 서식 초기화
 */
async function fillEditorContent(page, content) {
  const cleanContent = content.replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '');
  console.log('Typing content...');

  try {
    const contentCount = await page.locator('.se-component-content').count();
    const contentArea = page.locator('.se-component-content').nth(contentCount - 1);
    
    await contentArea.waitFor({ state: 'visible', timeout: 5000 });
    await contentArea.click({ force: true });
    
    // 이미지 덮어쓰기 방지: 커서를 아래 문단으로 이동
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // 서식 초기화
    await page.evaluate(() => {
      const activeToggles = document.querySelectorAll('button.se-is-selected[data-type="toggle"]');
      activeToggles.forEach(btn => btn.click());
    });

    await page.keyboard.type(cleanContent, { delay: 10 });
    console.log('Content input completed.');
  } catch (e) {
    console.warn('Content input failed, trying fallback (Tab)...', e.message);
    await page.keyboard.press('Tab');
    await page.keyboard.type(cleanContent, { delay: 10 });
  }
}

/**
 * [Helper] 의도치 않은 취소선 버그 제거
 */
async function removeStrikethrough(page) {
  console.log('Verifying and removing any unexpected strikethrough formatting...');
  await page.evaluate(() => {
    const elements = document.querySelectorAll('strike, s, span, p, div');
    elements.forEach(el => {
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'strike' || tagName === 's') {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      } else if (el.style && el.style.textDecoration && el.style.textDecoration.includes('line-through')) {
        el.style.textDecoration = el.style.textDecoration.replace('line-through', '').trim();
      }
    });
  });
}

/**
 * [Helper] 최종 발행 프로세스
 */
async function publishPostAction(page) {
  console.log('Publishing post...');
  await page.waitForTimeout(1000); // 렌더링 안정화
  
  // 1차 발행 버튼 (에디터 상단 우측)
  const publishBtn = page.locator('.publish_btn__m9KHH, button[data-click-area="tpb.publish"]').first();
  await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
  await publishBtn.click({ force: true });
  
  // 모달 애니메이션 대기
  await page.waitForTimeout(1000); 

  // 2차 최종 발행 버튼 (팝업 내부)
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
    const visible = await candidate.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) continue;

    await candidate.click({ force: true });
    finalClicked = true;
    console.log(`Clicked final publish button using selector: ${selector}`);
    break;
  }

  // Fallback: 텍스트 기반 탐색
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
    throw new Error('최종 발행 버튼을 찾을 수 없습니다.');
  }

  // 발행 완료 후 API 통신 시간 대기
  await page.waitForTimeout(4000);
}

/**
 * 네이버 블로그 포스팅 메인 함수
 * @param {object} account 네이버 계정 정보 (naver_id, naver_pw)
 * @param {object} post 포스팅 내용 (title, content, image_url)
 * @param {object} options 실행 옵션 (headless)
 */
export async function postToNaver(account, post, options = {}) {
  let browser;
  try {
    let effectiveHeadless = typeof options.headless === 'boolean' ? options.headless : CONFIG.HEADLESS;
    if (process.env.NODE_ENV === 'development' || !effectiveHeadless) {
      console.log('[Dev Mode] Auto-disabling headless mode to display browser window.');
      effectiveHeadless = false;
    }

    browser = await chromium.launch({ 
      headless: effectiveHeadless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    
    const page = await context.newPage();

    // 1. 로그인
    await loginToNaver(page, account);

    // 2. 글쓰기 에디터 진입
    console.log(`Navigating to blog write page for ${account.naver_id}...`);
    await page.goto(`https://blog.naver.com/${account.naver_id}/postwrite`, { waitUntil: 'domcontentloaded' });
    
    // 2-1. 흰 화면 버그(에디터 렌더링 실패) 방어 로직: 에디터 컨테이너가 5초 내에 안 뜨면 새로고침
    try {
      const editorWrap = page.locator('.se-documentTitle').first();
      await editorWrap.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Editor loaded successfully on first try.');
    } catch (e) {
      console.warn('Blank screen detected or editor failed to render. Triggering page reload...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      // 리로드 후 에디터가 뜰 때까지 조금 더 기다려줍니다.
      await page.waitForTimeout(3000);
    }
    
    // 3. 에디터 팝업 정리
    await closeEditorPopups(page);

    // 4. 제목 입력
    await fillEditorTitle(page, post.title);

    // 5. 이미지 업로드
    await uploadImageToEditor(page, post.image_url);

    // 6. 본문 입력
    await fillEditorContent(page, post.content);

    // 7. 의도치 않은 서식 제거
    await removeStrikethrough(page);

    // 8. 발행 처리
    await publishPostAction(page);

    return { success: true, message: 'Successfully posted to Naver Blog' };
  } catch (error) {
    console.error('Naver posting error:', error);
    if (error?.message?.includes("Executable doesn't exist")) {
      return {
        success: false,
        message: 'Playwright 브라우저가 설치되지 않았습니다. 프로젝트 루트에서 "npx playwright install chromium" 을 1회 실행해 주세요.',
      };
    }
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
