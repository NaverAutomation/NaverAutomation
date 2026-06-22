/**
 * Pexels API 서비스
 */

/**
 * 픽셀스 이미지 검색 함수
 * @param {string} apiKey Pexels API Key
 * @param {string} query 검색어 (키워드)
 * @param {number} perPage 검색할 이미지 수 (기본 4장)
 * @returns {Promise<string[]>} 이미지 URL 배열
 */
export async function searchPexelsImages(apiKey, query, perPage = 4) {
  if (!apiKey || apiKey === 'YOUR_KEY_HERE') {
    console.warn('[Pexels] API Key가 유효하지 않습니다.');
    return [];
  }

  if (!query) {
    return [];
  }

  // 1회 호출 시 넉넉하게 40개에서 최대 80개의 이미지를 조회하도록 쿼리 개수 조정
  const apiPerPage = Math.min(80, Math.max(perPage * 10, 40));
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${apiPerPage}`;

  // 8초 타임아웃 설정을 위한 AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log(`[Pexels] Searching images for query: "${query}" (perPage: ${perPage}, API perPage: ${apiPerPage})`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Pexels API HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.photos)) {
      // 1. 가져온 이미지 목록을 무작위로 셔플
      const shuffledPhotos = shuffleArray([...data.photos]);
      // 2. 요청된 perPage 개수만큼 선택
      const selectedPhotos = shuffledPhotos.slice(0, perPage);
      // 3. 블로그 게시글 본문에 적합한 'large' 크기 이미지 URL을 추출
      const urls = selectedPhotos
        .map((photo) => photo.src?.large || photo.src?.medium || photo.src?.original)
        .filter(Boolean);
      console.log(`[Pexels] Selected ${urls.length} diverse images out of ${data.photos.length} found.`);
      return urls;
    }

    return [];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[Pexels] API Request Timeout (8s reached).');
    } else {
      console.error('[Pexels] Search failed:', error.message);
    }
    // 호출 실패 시 크래시 방지를 위해 빈 배열 반환
    return [];
  }
}

/**
 * 배열을 무작위로 섞는 Fisher-Yates 셔플 함수
 * @param {Array} array 
 * @returns {Array} 섞인 배열
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
