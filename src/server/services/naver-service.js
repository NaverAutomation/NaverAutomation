import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONFIG } from '../config.js';
import db from '../db/database.js';
import { decrypt } from '../utils/crypto.js';
import { getGlobalSetting } from '../utils/supabase.js';
import { generateImageWithGemini } from './ai-service.js';

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

  // 로그인 완료(페이지 이동) 또는 에러 메시지 출력 대기
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

  // 로그인 페이지에 계속 머물러 있는 경우 실패로 간주하고 원인 파악
  const currentUrl = page.url();
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
        '자동 로그인 실패: 캡차(보안문자) 인증이 발생했습니다. 직접 브라우저에서 로그인하여 해제해야 할 수 있습니다.',
      );
    }

    // 최종 확인 (미세 타이밍 극복)
    await page.waitForTimeout(1000);
    if (page.url().includes('nidlogin.login')) {
      throw new Error(
        '자동 로그인 실패: 원인을 알 수 없는 이유로 로그인 페이지를 벗어나지 못했습니다.',
      );
    }
  }

  // 로그인 성공 후 MyBlog.naver를 통한 진짜 블로그 ID 추출
  console.log('Navigating to MyBlog.naver to resolve real blog ID...');
  await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });

  // 리다이렉트 대기 (MyBlog.naver에서 실제 블로그 주소로 리다이렉트 될 때까지)
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
  } catch (_e) {}

  try {
    // 2차 방어: 도움말 닫기 버튼 텍스트 기반 또는 클래스 기반 클릭
    const helpSelectors = [
      'button:has-text("도움말 닫기")',
      'button[title="도움말 닫기"]',
      '.se-help-panel-close-button',
    ];

    for (const selector of helpSelectors) {
      const helpBtn = page.locator(selector).first();
      if (await helpBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await helpBtn.click({ force: true });
        console.log(`Closed help panel using selector: ${selector}`);
        break;
      }
    }
  } catch (_e) {}

  console.log('Cleared overlay popups.');
}

/**
 * [Helper] 제목 입력
 */
async function fillEditorTitle(page, title) {
  // 제목에 섞여 들어올 수 있는 마크다운 기호(**, *, # 등)와 불필요한 줄바꿈 제거
  const cleanTitle = title
    .replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '')
    .replace(/\n/g, ' ')
    .trim();
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
/**
 * [Helper] Playwright Chromium Canvas API를 이용해 이미지를 변조합니다 (유사 이미지 피하기).
 */
async function mutateImageViaCanvas(page, imagePath) {
  try {
    const base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log('Mutating image via browser Canvas to avoid duplicate image detection...');
    const mutatedDataUrl = await page.evaluate(async (srcDataUrl) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 1. Margins crop (4px) and resize to target width (900px)
            const cropPx = 4;
            const originalWidth = img.width - cropPx * 2;
            const originalHeight = img.height - cropPx * 2;

            const targetWidth = 900;
            const scale = targetWidth / Math.max(10, originalWidth);
            canvas.width = targetWidth;
            canvas.height = Math.round(originalHeight * scale);

            // 2. Rotate slightly (-0.5 to 0.5 deg)
            ctx.translate(canvas.width / 2, canvas.height / 2);
            const angle = (Math.random() * 1.0 - 0.5) * (Math.PI / 180);
            ctx.rotate(angle);

            ctx.drawImage(
              img,
              cropPx,
              cropPx,
              originalWidth,
              originalHeight,
              -canvas.width / 2,
              -canvas.height / 2,
              canvas.width,
              canvas.height,
            );

            // 3. Pixel noise injection
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
              data[i] = Math.min(255, Math.max(0, data[i] + noise));
              data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
              data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
            }
            ctx.putImageData(imgData, 0, 0);

            // Export as JPEG to strip EXIF and change structure
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          } catch (e) {
            reject(new Error(e.message));
          }
        };
        img.onerror = () => reject(new Error('Image failed to load in canvas'));
        img.src = srcDataUrl;
      });
    }, dataUrl);

    const cleanBase64 = mutatedDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const mutatedBuffer = Buffer.from(cleanBase64, 'base64');
    const mutatedPath = path.join(os.tmpdir(), `mutated_image_${Date.now()}.jpg`);
    fs.writeFileSync(mutatedPath, mutatedBuffer);
    return mutatedPath;
  } catch (err) {
    console.error('Image mutation failed, falling back to original:', err.message);
    return imagePath;
  }
}

/**
 * [Helper] 이미지 업로드
 */
async function uploadImageToEditor(page, imageUrl, shouldMutate = false) {
  if (!imageUrl) return;

  console.log(`Uploading image to Naver Blog (shouldMutate: ${shouldMutate})...`);
  let imagePath = null;
  let isTemp = false;
  let mutatedPath = null;

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

    let uploadPath = imagePath;
    if (shouldMutate) {
      mutatedPath = await mutateImageViaCanvas(page, imagePath);
      uploadPath = mutatedPath;
    }

    const imageBtn = page.locator('button.se-image-toolbar-button').first();
    await imageBtn.waitFor({ state: 'visible', timeout: 5000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      imageBtn.click({ force: true }),
    ]);

    await fileChooser.setFiles(uploadPath);
    console.log('Image file set via filechooser. Waiting for upload to complete...');

    await page.waitForTimeout(4000);
    console.log('Image upload completed.');

    // ──────────────── 이미지 레이아웃 가로 최대 (문서 너비) 설정 ────────────────
    console.log('Applying "document width" formatting to the uploaded image...');
    try {
      const lastImage = page.locator('.se-image-container img, .se-module-image img').last();
      if ((await lastImage.count()) > 0) {
        await lastImage.click({ force: true });
        await page.waitForTimeout(800); // 툴바 노출 애니메이션 대기

        const sizeBtn = page
          .locator('button[title="문서 너비"], button[title="문서너비"], button[title="옆트임"]')
          .first();
        if (await sizeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sizeBtn.click({ force: true });
          console.log('Successfully set image alignment to document width.');
          await page.waitForTimeout(400); // 레이아웃 적용 완료 안전 대기
        } else {
          console.warn('Could not find the "Document Width" button in editor toolbar.');
        }
      } else {
        console.warn('Could not find the uploaded image element in editor DOM.');
      }
    } catch (alignErr) {
      console.warn('Failed to align image to document width:', alignErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────────
  } catch (err) {
    console.error('Image upload failed:', err.message);
  } finally {
    if (isTemp && imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    if (mutatedPath && fs.existsSync(mutatedPath)) {
      fs.unlinkSync(mutatedPath);
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
      activeToggles.forEach((btn) => {
        btn.click();
      });
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
    elements.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'strike' || tagName === 's') {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      } else if (el.style?.textDecoration?.includes('line-through')) {
        el.style.textDecoration = el.style.textDecoration.replace('line-through', '').trim();
      }
    });
  });
}

/**
 * [Helper] 제목과 본문 내용에서 빈도수가 높은 명사/단어 5개를 추출하여 태그 문자열로 반환
 */
function extractTagsFromContent(title, content) {
  const text = `${title || ''} ${content || ''}`;
  // 한글/영문/숫자 단어만 추출 (2글자 이상)
  const words = text.match(/[가-힣a-zA-Z0-9]{2,10}/g) || [];

  // 의미가 적거나 자주 쓰이는 조사/부사 등 필터링을 위한 불용어 사전
  const stopWords = new Set([
    '오늘',
    '이번',
    '정말',
    '너무',
    '진짜',
    '아주',
    '매우',
    '그냥',
    '그리고',
    '하지만',
    '그래서',
    '때문',
    '통해',
    '함께',
    '직접',
    '다양한',
    '추천',
    '소개',
    '방법',
    '정보',
    '이후',
    '지금',
    '다시',
    '자주',
    '하루',
    '하루종일',
    '생각',
    '준비',
    '시작',
    '이용',
    '사용',
    '경우',
    '정도',
    '이름',
    '모습',
    '시간',
    '하루',
    '우리',
    '너의',
    '그들의',
    '그것',
    '이것',
    '저것',
    '하나',
    '두개',
    '세개',
    '가지',
    '블로그',
    '포스팅',
    '네이버',
  ]);

  const freq = {};
  for (const word of words) {
    const lowerWord = word.toLowerCase();
    if (stopWords.has(lowerWord)) continue;
    freq[lowerWord] = (freq[lowerWord] || 0) + 1;
  }

  // 빈도수 높은 단어 상위 5개 정렬 및 추출
  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  const extracted = sorted.slice(0, 5);

  console.log(`[Tag Extractor] Extracted tags based on frequency: ${extracted.join(', ')}`);
  return extracted.join(', ');
}

/**
 * [Helper] 태그 입력
 */
async function inputTags(page, tags) {
  if (!tags) return;
  const tagList = Array.isArray(tags)
    ? tags
    : tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  if (tagList.length === 0) return;

  console.log('Inputting tags...');
  try {
    const tagInput = page.locator('#tag-input');
    await tagInput.waitFor({ state: 'visible', timeout: 5000 });

    for (const tag of tagList) {
      await tagInput.click();
      await page.waitForTimeout(150);
      // 순수하게 태그 단어만 입력합니다.
      await tagInput.pressSequentially(tag, { delay: 50 });
      await page.waitForTimeout(150);
      // 스페이스바를 입력하여 단어 조합을 끝내고 태그로 확정합니다.
      await tagInput.press('Space');
      await page.waitForTimeout(100);
      // 엔터(Enter) 키도 추가로 입력하여 완벽하게 태그 칩으로 등록 처리합니다.
      await tagInput.press('Enter');
      await page.waitForTimeout(300); // 태그가 칩 형태로 등록 완료될 때까지 안전 대기
    }
    console.log('Tags input completed.');
  } catch (e) {
    console.warn('Tag input failed:', e.message);
  }
}

/**
 * [Helper] 최종 발행 프로세스
 */
async function publishPostAction(page, tags = []) {
  console.log('Publishing post...');
  await page.waitForTimeout(1000); // 렌더링 안정화

  // 1차 발행 버튼 (에디터 상단 우측)
  const firstPublishSelectors = [
    '.publish_btn__m9KHH',
    'button[data-click-area="tpb.publish"]',
    'button[class*="publish_btn"]',
    'button:has-text("발행")',
  ];

  let firstClicked = false;
  for (const selector of firstPublishSelectors) {
    const candidate = page.locator(selector).first();
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;

    await candidate.click({ force: true });
    firstClicked = true;
    console.log(`Clicked 1st publish button using selector: ${selector}`);
    break;
  }

  if (!firstClicked) {
    console.log('No first publish button immediately visible, waiting for default...');
    const publishBtn = page
      .locator('.publish_btn__m9KHH, button[data-click-area="tpb.publish"]')
      .first();
    await publishBtn.waitFor({ state: 'visible', timeout: 8000 });
    await publishBtn.click({ force: true });
  }

  // 모달 애니메이션 대기
  await page.waitForTimeout(1000);

  // 태그 입력
  await inputTags(page, tags);

  // 2차 최종 발행 버튼 (팝업 내부)
  // 발행 버튼 클릭 후 태그 입력이 끝나면 "발행" 버튼이 활성화됨
  const finalPublishSelectors = [
    'button[data-testid="seOnePublishBtn"]',
    'button[data-click-area="tpb*i.publish"]',
    '.confirm_btn__WEaBq',
    '[role="dialog"] button:has-text("발행")',
    '.ReactModal__Content button:has-text("발행")',
  ];

  // 최종 발행 버튼이 모달에 렌더링되고 활성화될 때까지 대기
  console.log('Waiting for final publish dialog/button to appear...');
  const combinedSelector = finalPublishSelectors.join(', ');
  try {
    await page.locator(combinedSelector).last().waitFor({ state: 'visible', timeout: 5000 });
  } catch (err) {
    console.warn(
      'Timeout waiting for final publish button to be visible, attempting to proceed anyway...',
      err.message,
    );
  }

  let finalClicked = false;
  for (const selector of finalPublishSelectors) {
    const candidate = page.locator(selector).last();
    const visible = await candidate.isVisible().catch(() => false);
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
/**
 * Playwright의 Chromium 브라우저를 백그라운드에서 자동으로 다운로드 및 설치합니다.
 */
async function installPlaywrightChromium() {
  console.log('Playwright Chromium is missing. Starting automatic installation...');
  return new Promise((resolve, reject) => {
    try {
      const require = createRequire(import.meta.url);
      const packageJsonPath = require.resolve('playwright-core/package.json');
      const cliPath = path.join(path.dirname(packageJsonPath), 'cli.js');

      console.log(`Using Playwright CLI path: ${cliPath}`);
      console.log(`Using node executable: ${process.execPath}`);

      const child = spawn(process.execPath, [cliPath, 'install', 'chromium'], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      });

      child.stdout.on('data', (data) => {
        console.log(`[Playwright Install] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        console.error(`[Playwright Install Error] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('Playwright Chromium installed successfully.');
          resolve();
        } else {
          reject(new Error(`Playwright install process exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 네이버 블로그 포스팅 메인 함수
 * @param {object} account 네이버 계정 정보 (naver_id, naver_pw)
 * @param {object} post 포스팅 내용 (title, content, image_url)
 * @param {object} options 실행 옵션 (headless, onProgress)
 */
/**
 * [Helper] 설정된 대표 이미지 풀(Pool)에서 순환하며 다음 대표 이미지를 반환합니다.
 */
async function getNextRepresentativeImage(userId) {
  return new Promise((resolve) => {
    db.get(
      "SELECT value FROM settings WHERE user_id = ? AND key = 'representative_images'",
      [userId],
      async (err, row) => {
        if (err || !row || !row.value) return resolve(null);

        let images = [];
        try {
          images = JSON.parse(row.value);
        } catch {
          return resolve(null);
        }

        if (!Array.isArray(images) || images.length === 0) return resolve(null);
        if (images.length === 1) return resolve(images[0]);

        const rotation = await new Promise((resRot) => {
          db.get(
            "SELECT value FROM settings WHERE user_id = ? AND key = 'representative_image_rotation'",
            [userId],
            (_, rRow) => resRot(rRow ? rRow.value : 'sequential'),
          );
        });

        const lastUsed = await new Promise((resLast) => {
          db.get(
            "SELECT value FROM settings WHERE user_id = ? AND key = 'last_used_representative_image'",
            [userId],
            (_, lRow) => resLast(lRow ? lRow.value : null),
          );
        });

        let selected = null;
        if (rotation === 'random') {
          const candidates = images.filter((img) => img !== lastUsed);
          selected = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
          let nextIndex = 0;
          if (lastUsed) {
            const lastIndex = images.indexOf(lastUsed);
            if (lastIndex !== -1) {
              nextIndex = (lastIndex + 1) % images.length;
            }
          }
          selected = images[nextIndex];
        }

        if (selected) {
          db.run(
            "INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, 'last_used_representative_image', ?)",
            [userId, selected],
          );
        }
        resolve(selected);
      },
    );
  });
}

/**
 * 네이버 블로그 포스팅 메인 함수
 * @param {object} account 네이버 계정 정보 (naver_id, naver_pw)
 * @param {object} post 포스팅 내용 (title, content, image_url)
 * @param {object} options 실행 옵션 (headless, onProgress)
 */
export async function postToNaver(account, post, options = {}) {
  let browser;
  let postTimeoutId;
  const { onProgress } = options;

  // 태그가 비어있거나 누락되었을 경우 본문에서 5개 태그 자동 추출
  if (!post.tags || post.tags.trim() === '') {
    post.tags = extractTagsFromContent(post.title, post.content);
    if (onProgress && post.tags) {
      onProgress(
        'info',
        `[태그 자동 생성] 본문과 관련된 단어 5개를 태그로 자동 적용했습니다: ${post.tags}`,
      );
    }
  }

  try {
    const mainAction = async () => {
      let effectiveHeadless =
        typeof options.headless === 'boolean' ? options.headless : CONFIG.HEADLESS;

      // 개발 환경일 경우에는 디버깅 및 시각적 모니터링이 쉽도록 스케줄러 여부와 관계없이 브라우저 창을 무조건 표시합니다.
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
            // 브라우저 다시 시작 시도
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

      // 1. 로그인
      if (onProgress) onProgress('info', '네이버 로그인 시도 중...');
      const realBlogId = await loginToNaver(page, account);

      // 2. 글쓰기 에디터 진입
      if (onProgress) onProgress('info', '블로그 글쓰기 페이지 진입 중...');
      console.log(`Navigating to blog write page for ${realBlogId}...`);
      await page.goto(`https://blog.naver.com/${realBlogId}?Redirect=Write`, {
        waitUntil: 'domcontentloaded',
      });

      // 2-1. iframe 내부 주소 추출하여 다이렉트 이동 (탑레벨 에뮬레이션 호환 및 봇 감지 회피)
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

      // 2-1. 흰 화면 버그(에디터 렌더링 실패) 방어 로직: 에디터 컨테이너가 5초 내에 안 뜨면 새로고침
      try {
        const editorWrap = page.locator('.se-documentTitle').first();
        await editorWrap.waitFor({ state: 'visible', timeout: 5000 });
        console.log('Editor loaded successfully on first try.');
      } catch (_e) {
        console.warn('Blank screen detected or editor failed to render. Triggering page reload...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        // 리로드 후 에디터가 뜰 때까지 조금 더 기다려줍니다.
        await page.waitForTimeout(3000);
      }

      // 3. 에디터 팝업 정리
      if (onProgress) onProgress('info', '에디터 방해 팝업 제거 중...');
      await closeEditorPopups(page);

      // 4. 제목 입력
      if (onProgress) onProgress('info', '제목 작성 중...');
      await fillEditorTitle(page, post.title);

      // Parse image_url for multiple images JSON support
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

      // 대표 이미지가 비어있는 경우 순환 이미지 풀에서 가져오기 적용
      if (representativeImages.length === 0) {
        const nextRepImage = await getNextRepresentativeImage(post.user_id);
        if (nextRepImage) {
          representativeImages = [nextRepImage];
          if (onProgress)
            onProgress('info', '설정된 대표 이미지 풀에서 이미지를 매칭하여 자동 적용했습니다.');
        }
      }

      // 5. 대표 이미지 업로드 (원본 그대로)
      if (representativeImages.length > 0) {
        if (onProgress)
          onProgress('info', `대표 사진 업로드 중 (${representativeImages.length}개)...`);
        for (const imgUrl of representativeImages) {
          await uploadImageToEditor(page, imgUrl, false);
        }
      }

      // 6. 본문 입력
      if (onProgress) onProgress('info', '본문 내용 작성 중...');
      await fillEditorContent(page, post.content);

      // 7. 본문 하단 이미지 업로드 (AI 자동 변형)
      if (contentImages.length > 0) {
        if (onProgress)
          onProgress('info', `본문 사진 업로드 중 (${contentImages.length}개, AI 자동 변조)...`);
        for (const imgUrl of contentImages) {
          await uploadImageToEditor(page, imgUrl, true);
        }
      } else {
        // 본문 이미지가 없을 경우 AI 이미지 생성 시도
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

      // 7. 의도치 않은 서식 제거
      await removeStrikethrough(page);

      // 8. 발행 처리
      if (onProgress) onProgress('info', '최종 발행 프로세스 진행 중...');
      await publishPostAction(page, post.tags);

      return { success: true, message: 'Successfully posted to Naver Blog' };
    };

    // 3분 강제 타임아웃 레이스 조건 설정
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

    // 자동 로그인 실패 시 해당 계정의 status를 paused로 변경하여 무한 차단 방지
    if (error.message?.includes('자동 로그인 실패')) {
      try {
        db.run("UPDATE accounts SET status = 'paused' WHERE naver_id = ? AND user_id = ?", [
          account.naver_id,
          post.user_id,
        ]);
        if (onProgress)
          onProgress(
            'warn',
            `[계정 일시정지] 로그인 에러 감지로 계정(${account.naver_id})을 일시정지 처리했습니다.`,
          );
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
