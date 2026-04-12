# Naver Blog Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Playwright-based service to automate Naver Blog login and posting.

**Architecture:** A standalone service module `naver-service.js` that uses Playwright's `chromium` to navigate Naver's login and blog editor pages. It handles the Smart Editor ONE iframe and common popups.

**Tech Stack:** Playwright (Chromium), Node.js.

---

### Task 1: Create Naver Service Module

**Files:**
- Create: `src/server/services/naver-service.js`

- [ ] **Step 1: Write the initial implementation of `naver-service.js`**

```javascript
import { chromium } from 'playwright';

/**
 * 네이버 블로그에 포스팅을 게시합니다.
 * @param {object} account 네이버 계정 정보 (naver_id, naver_pw 등)
 * @param {object} post 포스팅 내용 (title, content)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function postToNaver(account, post) {
  let browser;
  try {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. 로그인 페이지 이동
    await page.goto('https://nid.naver.com/nidlogin.login');

    // 2. 로그인 정보 입력 (직접 입력 방식은 캡차 유발 가능성이 높으나 요구사항에 따름)
    // 실제 환경에서는 캡차 회피를 위해 evaluate를 통한 값 주입 등을 고려해야 함
    await page.fill('#id', account.naver_id);
    await page.fill('#pw', account.naver_pw);
    await page.click('.btn_login');
    
    // 로그인 처리 대기 (메인 페이지나 블로그 페이지로 이동할 때까지)
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    // 3. 글쓰기 페이지 이동
    await page.goto(`https://blog.naver.com/${account.naver_id}/postwrite`);

    // 4. 스마트 에디터 ONE 프레임 처리 및 내용 입력
    // Naver Blog Editor는 보통 iframe 내부에 존재함
    const editorFrame = page.frame({ url: /PostWriteForm/ });
    if (editorFrame) {
      // 제목 입력
      await editorFrame.fill('.se-placeholder.__se_placeholder.se-ff-nanumgothic', post.title);
      
      // 본문 입력 (상세 셀렉터는 에디터 버전에 따라 다를 수 있음)
      await editorFrame.click('.se-content-placeholder');
      await editorFrame.keyboard.type(post.content);
    } else {
      // 프레임이 없는 경우 직접 시도
      await page.fill('.se-placeholder.__se_placeholder.se-ff-nanumgothic', post.title);
      await page.click('.se-content-placeholder');
      await page.keyboard.type(post.content);
    }

    // 5. 발행 버튼 클릭
    await page.click('.btn_publish');
    
    // 발행 설정 팝업 처리 (필요시)
    // await page.click('.btn_confirm'); 

    return { success: true, message: 'Successfully posted to Naver Blog' };
  } catch (error) {
    console.error('Naver posting error:', error);
    return { success: false, message: error.message };
  } finally {
    if (browser) {
      // 실습이나 확인을 위해 잠시 대기 후 종료하거나, 호출부에서 결정
      // await browser.close();
    }
  }
}
```

- [ ] **Step 2: Refine iframe and selector logic based on actual Naver Blog structure**

Naver's Smart Editor ONE uses specific classes like `.se-title-text` or placeholders. The logic needs to be robust against "Discard draft" popups.

```javascript
// Updated logic for content entry and publishing
    // ... inside postToNaver ...
    
    // "작성 중인 글이 있습니다" 팝업 처리
    try {
      const dialog = page.getByText('취소', { exact: true });
      if (await dialog.isVisible()) {
        await dialog.click();
      }
    } catch (e) {
      // 팝업이 없으면 통과
    }

    // 에디터 진입 대기
    await page.waitForSelector('.se-help-panel-close-button', { timeout: 5000 }).then(el => el.click()).catch(() => {});

    // 제목 입력
    await page.click('.se-placeholder.__se_placeholder.se-ff-nanumgothic'); // 제목 영역 클릭
    await page.keyboard.type(post.title);

    // 본문 입력
    await page.click('.se-component-placeholder.se-ff-nanumgothic'); // 본문 영역 클릭
    await page.keyboard.type(post.content);

    // 발행 버튼
    await page.click('.publish_btn_area button');
    await page.waitForSelector('.button_publish');
    await page.click('.button_publish');
```

- [ ] **Step 3: Finalize `src/server/services/naver-service.js`**

Combine the steps into a clean, exported function.

---

### Task 2: Verification

- [ ] **Step 1: Verify syntax**

Run: `node --check src/server/services/naver-service.js`
Expected: No output (success).

- [ ] **Step 2: Verify file existence**

Run: `ls src/server/services/naver-service.js`
Expected: File exists.
