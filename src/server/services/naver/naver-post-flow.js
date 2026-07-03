import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db from '../../db/database.js';
import { decrypt } from '../../utils/crypto.js';
import { getGlobalSetting } from '../../utils/supabase.js';
import { generateImageWithGemini } from '../ai-service.js';
import { uploadImageToEditor } from './naver-editor.js';
import { getNextRepresentativeImage } from './naver-utils.js';

/**
 * 블로그 에디터 페이지에 진입하고 iframe 및 에디터 렌더링 상태를 확인합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {string} realBlogId - 확인된 네이버 블로그 실 ID
 */
export async function enterBlogEditor(page, realBlogId) {
  console.log(`${realBlogId} 블로그 글쓰기 페이지로 이동 중...`);
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
      console.log(`에디터 iframe URL로 직접 이동 중: ${absoluteIframeUrl}`);
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
    console.log('에디터가 성공적으로 로드되었습니다.');
  } catch (_e) {
    console.warn(
      '빈 화면이 감지되었거나 에디터 렌더링에 실패했습니다. 페이지 새로고침을 트리거합니다...',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }
}

/**
 * 대표 이미지를 파싱하고 매칭한 뒤 에디터에 업로드하며 본문 이미지 배열을 반환합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {object} post - 포스트 정보 객체
 * @param {function} [onProgress] - 단계별 진행 상태 피드백 콜백
 * @returns {Promise<string[]>} 본문에 업로드할 본문 이미지 배열
 */
export async function handleRepresentativeImages(page, post, onProgress) {
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
      if (onProgress) {
        onProgress('info', '설정된 대표 이미지 풀에서 이미지를 매칭하여 자동 적용했습니다.');
      }
    }
  }

  if (representativeImages.length > 0) {
    if (onProgress) {
      onProgress('info', `대표 사진 업로드 중 (${representativeImages.length}개)...`);
    }
    for (const imgUrl of representativeImages) {
      await uploadImageToEditor(page, imgUrl, false);
    }
  }

  return contentImages;
}

/**
 * 본문 이미지들을 업로드하거나, 이미지가 없을 때 AI 이미지를 동적 생성하여 업로드합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체
 * @param {object} post - 포스트 정보 객체
 * @param {string[]} contentImages - 본문 이미지 주소 배열
 * @param {function} [onProgress] - 단계별 진행 상태 피드백 콜백
 */
export async function handleContentImages(page, post, contentImages, onProgress) {
  if (contentImages.length > 0) {
    if (onProgress) {
      onProgress('info', `본문 사진 업로드 중 (${contentImages.length}개, AI 자동 변조)...`);
    }
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
      console.warn('AI 이미지 생성 실패:', e.message);
    }
  }
}
