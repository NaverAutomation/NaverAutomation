import db from '../../db/database.js';

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
export async function loginToNaver(page, account) {
  console.log('네이버 로그인 페이지로 이동 중...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('ID/PW 입력 시뮬레이션 중...');
  await page.locator('#id').fill(account.naver_id);
  await page.waitForTimeout(Math.random() * 200 + 100);
  await page.locator('#pw').fill(account.naver_pw);
  await page.waitForTimeout(Math.random() * 200 + 100);

  // 로그인 상태 유지 체크박스 클릭 및 검증
  const keepLoginEl = page.locator('div#keep');
  if (await keepLoginEl.isVisible()) {
    console.log('로그인 상태 유지 체크박스 클릭 시도 중...');
    await keepLoginEl.click({ delay: 50 + Math.random() * 50 });
    await page.waitForTimeout(200); // UI 반영 대기

    // 검증
    const isChecked = await keepLoginEl.getAttribute('aria-checked');
    const classList = await keepLoginEl.getAttribute('class');
    if (isChecked === 'true' && classList.includes('check')) {
      console.log('로그인 상태 유지 설정이 정상적으로 체크되었습니다.');
    } else {
      console.warn('DOM을 통한 체크 상태 검증 실패. 재클릭을 시도합니다...');
      try {
        await keepLoginEl.click({ delay: 50 });
      } catch (err) {
        console.error('재클릭 시도 실패:', err.message);
      }
    }
  }

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
    console.log('네비게이션 또는 에러 대기 시간 초과, 현재 상태를 검증합니다...');
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
      console.log('에러 확인 중 컨텍스트 소멸, 페이지 이동 성공으로 간주합니다.');
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
      console.log('캡차 확인 중 컨텍스트 소멸, 페이지 이동 성공으로 간주합니다.');
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

  console.log('실제 블로그 ID 확인을 위해 MyBlog.naver로 이동 중...');
  await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });

  let checkCount = 0;
  while (page.url().includes('MyBlog.naver') && checkCount < 10) {
    await page.waitForTimeout(500);
    checkCount++;
  }

  const finalUrl = page.url();
  console.log(`최종 확인된 블로그 URL: ${finalUrl}`);

  const match = finalUrl.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1]) {
    throw new Error(`실제 블로그 ID를 추출하지 못했습니다. (최종 URL: ${finalUrl})`);
  }

  const realBlogId = match[1];
  console.log(`실제 블로그 ID 조회 완료: ${realBlogId}`);
  return realBlogId;
}

/**
 * 로그인 실패 시 실패 횟수 DB 업데이트 및 연속 5회 이상 실패 시 계정 정지(paused) 처리를 진행합니다.
 *
 * @param {object} account - 계정 객체
 * @param {object} post - 포스트 객체
 * @param {Error} error - 발생한 에러 객체
 * @param {function} [onProgress] - 단계별 진행 상태 피드백 콜백
 * @returns {Promise<number>} 업데이트된 최종 실패 횟수
 */
export async function updateAccountStatusOnFailure(account, post, error, onProgress) {
  try {
    // 1. 현재 실패 횟수 조회
    const currentCount = await new Promise((resolve) => {
      db.get(
        'SELECT login_fail_count FROM accounts WHERE naver_id = ? AND user_id = ?',
        [account.naver_id, account.user_id || post.user_id],
        (dbErr, row) => {
          if (dbErr || !row) resolve(0);
          else resolve(row.login_fail_count || 0);
        },
      );
    });

    const newCount = currentCount + 1;

    // 2. 실패 횟수 업데이트
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE accounts SET login_fail_count = ? WHERE naver_id = ? AND user_id = ?',
        [newCount, account.naver_id, post.user_id],
        (dbErr) => {
          if (dbErr) reject(dbErr);
          else resolve();
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

    if (newCount >= 5) {
      // 3. 5회 연속 실패 시 계정 일시정지
      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE accounts SET status = 'paused' WHERE naver_id = ? AND user_id = ?",
          [account.naver_id, post.user_id],
          (dbErr) => {
            if (dbErr) reject(dbErr);
            else resolve();
          },
        );
      });

      if (onProgress) {
        onProgress(
          'warn',
          `[계정 일시정지] ${reason} 5회 연속 발생으로 계정(${account.naver_id})을 일시정지 처리했습니다.`,
        );
      }
    } else {
      if (onProgress) {
        onProgress(
          'warn',
          `[로그인 실패] ${reason} 발생 (누적 실패: ${newCount}/5). 계정을 활성 상태로 유지합니다.`,
        );
      }
    }

    return newCount;
  } catch (dbErr) {
    console.error('로그인 실패 처리에 실패했습니다(DB 오류):', dbErr.message);
    return 0;
  }
}
