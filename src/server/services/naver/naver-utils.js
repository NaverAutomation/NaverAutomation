import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import db from '../../db/database.js';

/**
 * 지정된 웹 URL주소에서 이미지를 바이너리로 받아 지정한 로컬 임시 폴더 경로에 저장합니다.
 *
 * @param {string} url - 다운로드할 대상 이미지의 원격 HTTP/HTTPS 주소
 * @param {string} dest - 로컬에 물리적으로 파일을 내려받을 목적지 절대 경로
 * @returns {Promise<void>}
 */
export async function downloadImage(url, dest) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

/**
 * Playwright Chromium 브라우저의 HTML5 Canvas API를 이용하여 로컬 이미지를 읽고
 * 잘라내기(Crop), 해상도 조정(Resize), 임의 각도 회전(Rotate), 픽셀 노이즈 인젝션을 수행하여
 * 원본 이미지의 메타데이터(EXIF 등)를 소거하고 바이너리 구조를 재구성(유사 이미지 감지 회피)합니다.
 *
 * @param {import('playwright').Page} page - Playwright Page 객체 (브라우저 스크립트 실행용)
 * @param {string} imagePath - 변조 처리를 수행할 원본 로컬 이미지 파일 경로
 * @returns {Promise<string>} 가공 및 변조 완료 후 임시 디렉토리에 저장된 새로운 이미지 파일 절대 경로
 */
export async function mutateImageViaCanvas(page, imagePath) {
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
 * 제공받은 글 제목과 본문 데이터에서 한글/영문 단어 형태소를 기초 매칭하여
 * 흔히 쓰이는 일상 불용어를 제끼고, 가장 빈도수가 많이 관측되는 상위 5개의 핵심 키워드를 추출하여 콤마(,) 구분 태그 텍스트로 전환합니다.
 *
 * @param {string} title - 포스트 글 제목
 * @param {string} content - 포스트 글 본문 텍스트 내용
 * @returns {string} 콤마 단위로 구분된 상위 5개 키워드 태그 스트링 (예: "축구, 운동, 건강, 취미, 주말")
 */
export function extractTagsFromContent(title, content) {
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
 * 로컬 런타임 환경에 Playwright Chromium 실행 실행파일이 배포되지 않은 비정상 상태일 경우,
 * Playwright 내장 CLI 프로세스를 수동 스폰하여 정식 크롬 코어 바이너리를 호스트 PC에 강제 내려받아 활성화합니다.
 *
 * @returns {Promise<void>} 브라우저 런타임 엔진 설치가 원활하게 완결되었을 시 해소되는 Promise
 * @throws {Error} 설치 프로세스 구동 도중 커맨드 실패 또는 오류 발생 시 에러 방출
 */
export async function installPlaywrightChromium() {
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
 * 데이터베이스 설정에 기반해, 지정한 사용자(user_id)가 등록한 대표 이미지 풀(Pool) 내역을 읽어
 * 지정된 정렬 방식(순차적 로테이션 혹은 랜덤 조합)에 따른 차기 사용 후보 대표 이미지 주소를 결정하고,
 * 최종 사용 갱신 상태를 DB에 기록한 후 반환합니다.
 *
 * @param {string} userId - 대표 이미지를 사용할 주체 유저의 고유 식별 키
 * @returns {Promise<string|null>} 계산된 이미지 소스 주소 스트링 (대응하는 이미지가 존재하지 않으면 null 반환)
 */
export async function getNextRepresentativeImage(userId) {
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

        const [rotation, lastUsed] = await Promise.all([
          new Promise((resRot) => {
            db.get(
              "SELECT value FROM settings WHERE user_id = ? AND key = 'representative_image_rotation'",
              [userId],
              (_, rRow) => resRot(rRow ? rRow.value : 'sequential'),
            );
          }),
          new Promise((resLast) => {
            db.get(
              "SELECT value FROM settings WHERE user_id = ? AND key = 'last_used_representative_image'",
              [userId],
              (_, lRow) => resLast(lRow ? lRow.value : null),
            );
          }),
        ]);

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
