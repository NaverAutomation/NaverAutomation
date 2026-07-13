import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadImage, mutateImageViaCanvas } from './naver-utils.js';

/**
 * 네이버 글쓰기 스마트에디터(SmartEditor ONE) 진입 시 로딩되는 방해 요소들(기존 임시저장 본문 호출 여부, 초보용 도움말 안내 팝업창 등)의 레이아웃을 확인하여, 키보드 Escape 전송 및 취소/닫기 엘리먼트 강제 클릭 이벤트를 트리거하여 신속하고 무결하게 정리합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @returns {Promise<void>}
 */
export async function closeEditorPopups(page) {
  console.log('Waiting for editor popups to render...');
  await page.waitForTimeout(2500);

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
 * 네이버 에디터의 제목 영역을 대상으로 마크다운 헤더 기호 및 불필요한 줄바꿈 문자를 필터링한 클린 텍스트 제목을 안전하게 타이핑합니다.
 * 포커스 대기가 실패할 시 1차 Fallback 셀렉터를 시도해 강제 작성합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string} title - 블로그 게시글 타이틀 본명 텍스트
 * @returns {Promise<void>}
 */
export async function fillEditorTitle(page, title) {
  const cleanTitle = title
    .replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '')
    .replace(/\n/g, ' ')
    .trim();
  console.log(`Typing title: ${cleanTitle.substring(0, 20)}...`);
  try {
    const titleArea = page.locator('.se-documentTitle').first();
    await titleArea.waitFor({ state: 'visible', timeout: 10000 });
    await titleArea.click();
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
 * 이미지 원격 파일 다운로드 처리 후 파일 탐색기 모달 팝업 가로채기(File Chooser)를 열어 대상 이미지를 업로드합니다.
 * `shouldMutate` 옵션 설정 시 이미지 가공 변조 함수를 호출해 유사 문서 필터링을 회피하며, 업로드 이후 에디터 툴바를 호출하여 "문서 너비(최대 사이즈)" 정렬 버튼을 강제 적용합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string} imageUrl - 웹 이미지 링크 주소 또는 로컬 이미지 파일 경로
 * @param {boolean} [shouldMutate=false] - 캔버스 기반 노이즈 및 왜곡 기법을 활용한 유사 방지 이미지 가공 처리 여부
 * @returns {Promise<void>}
 */
export async function uploadImageToEditor(page, imageUrl, shouldMutate = false) {
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
    } else {
      imagePath = imageUrl;
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
        await page.waitForTimeout(800);

        const sizeBtn = page
          .locator('button[title="문서 너비"], button[title="문서너비"], button[title="옆트임"]')
          .first();
        if (await sizeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await sizeBtn.click({ force: true });
          console.log('Successfully set image alignment to document width.');
          await page.waitForTimeout(400);
        } else {
          console.warn('Could not find the "Document Width" button in editor toolbar.');
        }
      } else {
        console.warn('Could not find the uploaded image element in editor DOM.');
      }
    } catch (alignErr) {
      console.warn('Failed to align image to document width:', alignErr.message);
    }
  } catch (err) {
    console.error('Image upload failed:', err.message);
  } finally {
    if (isTemp && imagePath && fs.existsSync(imagePath) && imagePath !== imageUrl) {
      fs.unlinkSync(imagePath);
    }
    if (mutatedPath && fs.existsSync(mutatedPath)) {
      fs.unlinkSync(mutatedPath);
    }
  }
}

/**
 * 에디터의 가장 마지막 내용 입력 문단 블록을 활성화한 후, 마크다운 특수문자가 여과된 본문을 타이핑합니다.
 * 이미지 바로 밑에 글씨가 덧씌워지는 렌더링 꼬임을 막기 위해 화살표 및 엔터를 선입력하며, 상단 서식 툴바의 활성화된 속성(굵게, 이탤릭 등) 토글들을 순회 해제하여 기본 서식으로 리셋 후 작성합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string} content - 본문 글 데이터 텍스트
 * @returns {Promise<void>}
 */
export async function fillEditorContent(page, content) {
  const cleanContent = content.replace(/(\*\*|\*|__|_|~~|~|#|`|>)/g, '');
  console.log('Typing content...');

  try {
    const contentCount = await page.locator('.se-component-content').count();
    const contentArea = page.locator('.se-component-content').nth(contentCount - 1);

    await contentArea.waitFor({ state: 'visible', timeout: 5000 });
    await contentArea.click({ force: true });

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

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
 * 외부 AI 원고나 타 서식 복제 중 본문에 예기치 않게 묻어 들어올 수 있는 HTML 취소선 엘리먼트(`strike`, `s`) 및
 * CSS 인라인 취소선 장식(`text-decoration: line-through`)을 DOM 전체에서 전수 조사하여 제거 처리합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @returns {Promise<void>}
 */
export async function removeStrikethrough(page) {
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
 * 지정된 태그 배열 또는 문자열을 포스팅 설정 팝업의 태그 영역(#tag-input)에 순차 타이핑하고
 * 스페이스바 및 엔터를 쳐 최종 태그 칩 엘리먼트로 주입 및 확정합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string[]|string} tags - 등록할 태그들의 배열 또는 콤마로 나열된 문자열
 * @returns {Promise<void>}
 */
export async function inputTags(page, tags) {
  if (!tags) return;
  const tagList = Array.isArray(tags)
    ? tags
    : tags
        .replace(/#/g, ' ')
        .replace(/,/g, ' ')
        .split(/\s+/)
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
      await tagInput.pressSequentially(tag, { delay: 50 });
      await page.waitForTimeout(150);
      await tagInput.press('Space');
      await page.waitForTimeout(100);
      await tagInput.press('Enter');
      await page.waitForTimeout(300);
    }
    console.log('Tags input completed.');
  } catch (e) {
    console.warn('Tag input failed:', e.message);
  }
}

/**
 * 에디터 상단 우측의 1차 발행 트리거 버튼을 클릭한 뒤, 모달이 나타나면 `inputTags` 헬퍼로 해시태그를 주입하고,
 * 모달 하단의 2차 최종 승인 발행 버튼(다양한 네이버 클래스 셀렉터 대비)을 순차 탐색 클릭하여 최종 발행 처리를 완성합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string[]|string} [tags=[]] - 모달 팝업 내부 태그 란에 전달해줄 글 해시태그 목록
 * @returns {Promise<void>}
 * @throws {Error} 최종 발행 버튼 클릭 처리 및 레이아웃 감지가 완전히 불가능할 때 발생하는 예외
 */
export async function publishPostAction(page, tags = []) {
  console.log('Publishing post...');
  await page.waitForTimeout(1000);

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

  await page.waitForTimeout(1000);

  await inputTags(page, tags);

  const finalPublishSelectors = [
    'button[data-testid="seOnePublishBtn"]',
    'button[data-click-area="tpb*i.publish"]',
    '.confirm_btn__WEaBq',
    '[role="dialog"] button:has-text("발행")',
    '.ReactModal__Content button:has-text("발행")',
  ];

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

  // 최종 발행 버튼 클릭 후, 에디터 페이지를 탈출하여 실제 블로그 글 상세/목록 페이지로 리다이렉트될 때까지 대기
  console.log('Waiting for redirect to final post URL...');
  try {
    await page.waitForURL(
      (url) => {
        const urlStr = url.toString();
        return (
          urlStr.includes('blog.naver.com') &&
          !urlStr.includes('editor.blog.naver.com') &&
          !urlStr.includes('Redirect=Write') &&
          !urlStr.includes('Write.naver')
        );
      },
      { timeout: 20000 }, // 20초 대기
    );
    console.log('Successfully redirected to:', page.url());
  } catch (_redirectErr) {
    console.error('Redirect failed. Actual publishing might have failed.');
    throw new Error('최종 발행 후 리다이렉트 대기 시간 초과. 발행 실패 가능성');
  }
}
